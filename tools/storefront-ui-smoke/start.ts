/** Isolated local acceptance fixture. No .env, Bunny, Railway, OpenAI or funded wallet access. */
import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createServer} from '../../merxet-seller/node_modules/vite/dist/node/index.js';
import {loadConfig} from '../../merxet-storefront-builder/src/config.ts';
import {createApp} from '../../merxet-storefront-builder/src/api/app.ts';
import {Journal} from '../../merxet-storefront-builder/src/storage/journal.ts';
import {BuildAttemptSchema, RevisionManifestSchema, type GenerationJob} from '../../merxet-storefront-builder/src/domain/records.ts';
import {stageRevision, commitRevision} from '../../merxet-storefront-builder/src/storage/revisions.ts';
import {sha256, jsonBytes} from '../../merxet-storefront-builder/src/storage/bunny.ts';
import {MemoryStore, TestIdentity} from '../../merxet-storefront-builder/tests/helpers.ts';

const config = loadConfig({PORT: '4182', PREVIEW_PORT: '4183', BUILDER_PREVIEW_ORIGIN: 'http://127.0.0.1:4183', BUILDER_PUBLIC_ORIGIN: 'http://127.0.0.1:4185', PUBLIC_PORT: '4185', BUILDER_ORIGINS: 'http://127.0.0.1:5183', BUILDER_PREVIEW_TTL_SECONDS: '300'});
const journal = await Journal.open(new MemoryStore(), 'ui-smoke'), identity = new TestIdentity();
const publicStore = new MemoryStore();
const {app, previews, publications} = createApp({journal, identity, config, publicStore, publicReader: publicStore.get.bind(publicStore)});
const api = app.listen(4182, '127.0.0.1'), delivery = previews.app().listen(4183, '127.0.0.1');
const publicDelivery = publications!.delivery.app().listen(4185, '127.0.0.1');
publications!.start();
const sellerRoot = fileURLToPath(new URL('../../merxet-seller/', import.meta.url));
process.chdir(sellerRoot);
const vite = await createServer({root: sellerRoot, configFile: `${sellerRoot}vite.config.ts`, server: {host: '127.0.0.1', port: 5183, strictPort: true},
  resolve: {dedupe: ['react', 'react-dom']},
  define: {'import.meta.env.VITE_STOREFRONT_BUILDER_ORIGIN': JSON.stringify('http://127.0.0.1:4182')},
  plugins: [{name: 'smoke-wallet-only', enforce: 'pre', resolveId(source) { if (/(?:^|\/)context\/WalletContext(?:\.tsx)?$/.test(source)) return fileURLToPath(new URL('./wallet.tsx', import.meta.url)); }}]});
await vite.listen();
const built = new Map<string, Buffer>(), dist = new URL('../../merxet-storefront-template/dist-storefront/', import.meta.url);
async function collect(dir: URL, prefix = '') {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) await collect(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`);
    else built.set(`${prefix}${entry.name}`, await readFile(new URL(entry.name, dir)));
  }
}
await collect(dist);
const products = JSON.parse(await readFile(new URL('../../merxet-storefront-template/template/fixtures/pantry.json', import.meta.url), 'utf8')).products;
let working = false;
async function tick() {
  if (working) return;
  const job = journal.list<GenerationJob>('job', value => value.state === 'queued')[0]; if (!job) return;
  working = true;
  try {
    const attempt = BuildAttemptSchema.parse({schemaVersion: 1, kind: 'attempt', id: randomUUID(), recordVersion: 1, createdAt: job.createdAt, updatedAt: job.updatedAt,
      network: job.network, ownerAccountId: job.ownerAccountId, shopId: job.shopId, jobId: job.id, attemptNumber: 1, baseRevisionId: job.baseRevisionId,
      sandboxId: 'no-vm-browser-fixture', state: 'running', cleanup: 'pending', deadline: new Date(Date.now() + 120000).toISOString(), commandRefs: [], cancelRequested: false});
    await journal.transact(null, async () => ({changes: [attempt, {...job, recordVersion: 2, state: 'generating', attemptIds: [attempt.id], currentAttemptId: attempt.id}], result: {status: 200, data: {}}}));
    await new Promise(resolve => setTimeout(resolve, 12000));
    const current = journal.get<GenerationJob>('job', job.network, job.ownerAccountId, job.id)!;
    if (current.state === 'canceled') return;
    if (/fail/i.test(job.brief)) {
      await journal.transact(null, async () => ({changes: [{...current, recordVersion: current.recordVersion + 1, state: 'failed', errorCode: 'model_request_failed'}], result: {status: 200, data: {}}})); return;
    }
    await journal.transact(null, async () => ({changes: [{...current, recordVersion: current.recordVersion + 1, state: 'uploading'}, {...attempt, recordVersion: 2, state: 'ready', cleanup: 'destroyed'}], result: {status: 200, data: {}}}));
    const files = new Map<string, Uint8Array>();
    for (const [name, bytes] of built) {
      let content = /\.(html|js|css|svg)$/.test(name) ? Buffer.from(bytes.toString().replaceAll('/s/template/', `/s/${job.shopId}/`)) : bytes;
      if (name === 'index.html') content = Buffer.from(content.toString().replace(/(<script id="merxet-storefront-config"[^>]*>)[\s\S]*?(<\/script>)/, (_, open, close) => open + JSON.stringify(job.config).replaceAll('<', '\\u003c') + close));
      files.set(`dist/${name}`, content);
    }
    files.set('dist/storefront.json', jsonBytes(job.config)); files.set('source.tar.gz', Buffer.from('browser fixture only')); files.set('catalog-snapshot.json', jsonBytes(products));
    const timestamp = new Date().toISOString();
    const revision = RevisionManifestSchema.parse({schemaVersion: 1, kind: 'revision', id: randomUUID(), recordVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      network: job.network, ownerAccountId: job.ownerAccountId, shopId: job.shopId, jobId: job.id, attemptId: attempt.id, parentRevisionId: job.baseRevisionId, state: 'ready',
      templateVersion: '1.1.0', environmentVersion: 'browser-fixture', model: 'fixture-no-model', config: job.config,
      files: [...files].map(([path, bytes]) => ({path, size: bytes.length, sha256: sha256(bytes)})), validation: {typecheck: true, lint: true, build: true, browser: true, cleanup: 'destroyed'}});
    await stageRevision(journal, revision, files); await commitRevision(journal, revision);
  } catch (error) { console.error('Smoke fixture failed', error); }
  finally { working = false; }
}
const timer = setInterval(() => void tick(), 500);
console.log('Isolated seller smoke fixture: http://127.0.0.1:5183/storefronts');
const close = async () => { clearInterval(timer); await publications!.stop(); api.close(); delivery.close(); publicDelivery.close(); await vite.close(); };
process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
