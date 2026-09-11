import {loadConfig} from './config.ts';
import {BunnyStorage} from './storage/bunny.ts';
import {Journal} from './storage/journal.ts';
import {MerxetIdentity} from './auth/identity.ts';
import {createApp} from './api/app.ts';
import {Coordinator} from './worker/coordinator.ts';
import {RailwayProvider} from './worker/provider.ts';
import {GenerationEngine} from './worker/engine.ts';
import {readHttp} from './publishing/delivery.ts';
import {assertDeploymentVolume} from './deployment.ts';

async function main() {
  const config = loadConfig();
  await assertDeploymentVolume(config);
  const publicationConfigured = !!(config.publicStorage.key || config.publicBaseUrl);
  if (publicationConfigured && (!config.publicStorage.key || !config.publicStorage.zone || !config.publicBaseUrl || config.publicStorage.zone === config.storage.zone)) throw new Error('Configure separate public Bunny storage and its CDN URL');
  if ([config.previewPort, config.publicPort].includes(config.port) || config.previewPort === config.publicPort) throw new Error('API, preview and public listeners need separate ports');
  const publicStore = publicationConfigured ? new BunnyStorage(config.publicStorage) : undefined;
  const journal = await Journal.open(new BunnyStorage(config.storage), config.prefix, config.maxOperations, config.maxPendingWrites);
  const worker = config.workerEnabled ? new Coordinator(journal, config, new RailwayProvider(config.prefix), new GenerationEngine(journal, config)) : undefined;
  let ready = false;
  const {app, previews, publications} = createApp({journal, config, identity: new MerxetIdentity(config), ready: () => ready,
    publicStore, publicReader: publicStore ? (file, maxBytes) => readHttp(`${config.publicBaseUrl}/${file}`, maxBytes) : undefined});
  // Bind the listener before scheduling/writing. A second local start on the same
  // address must fail before it can provision work from a stale journal snapshot.
  const server = app.listen(config.port, config.host);
  let previewServer: ReturnType<typeof app.listen> | undefined;
  let publicServer: ReturnType<typeof app.listen> | undefined;
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    previewServer = previews.app().listen(config.previewPort, config.host);
    await new Promise<void>((resolve, reject) => { previewServer!.once('listening', resolve); previewServer!.once('error', reject); });
    if (publications) {
      publicServer = publications.delivery.app().listen(config.publicPort, config.host);
      await new Promise<void>((resolve, reject) => { publicServer!.once('listening', resolve); publicServer!.once('error', reject); });
    }
    await worker?.start(); ready = true;
    publications?.start();
    console.log(`Storefront builder listening on ${config.host}:${config.port}`);
    console.log(`Private preview listener on ${config.host}:${config.previewPort}`);
    if (publicServer) console.log(`Public shop listener on ${config.host}:${config.publicPort}`);
  } catch (error) { server.close(); previewServer?.close(); publicServer?.close(); await worker?.stop(); await publications?.stop(); throw error; }
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  previewServer.requestTimeout = 30000; previewServer.headersTimeout = 10000;
  if (publicServer) { publicServer.requestTimeout = 30000; publicServer.headersTimeout = 10000; }
  let stopping = false;
  const shutdown = () => {
    if (stopping) return; stopping = true; ready = false;
    const deadline = setTimeout(() => process.exit(1), 120000); deadline.unref();
    const closed = Promise.all([server, previewServer!].map(listener => new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))));
    void (async () => {
      // Keep delivery available until an in-flight publication has finished its HTTP checks.
      await Promise.all([closed, worker?.stop(), publications?.stop()]);
      await new Promise<void>((resolve, reject) => publicServer ? publicServer.close(error => error ? reject(error) : resolve()) : resolve());
      await journal.drain(); clearTimeout(deadline);
    })().catch(() => { process.exitCode = 1; });
  };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
main().catch(() => { console.error('Builder startup failed. Check configuration and private storage integrity.'); process.exitCode = 1; });
