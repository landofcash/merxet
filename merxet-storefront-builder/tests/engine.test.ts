import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {loadConfig} from '../src/config.ts';
import {GenerationJobSchema, RevisionManifestSchema} from '../src/domain/records.ts';
import {Journal} from '../src/storage/journal.ts';
import {sha256} from '../src/storage/bunny.ts';
import {revisionPath} from '../src/storage/revisions.ts';
import {GenerationEngine, loadCheckpoint} from '../src/worker/engine.ts';
import {packSource, unpackSource} from '../src/worker/archive.ts';
import {MemoryStore, aliceId, design, seed} from './helpers.ts';

test('generation starts from the selected immutable source, pins the new config, and detects damaged base artifacts', async () => {
  const priorKey = process.env.OPENAI_API_KEY, priorModel = process.env.OPENAI_MODEL, priorEnvironment = process.env.RAILWAY_SANDBOX_ENVIRONMENT_ID;
  process.env.OPENAI_API_KEY = 'test-key-never-invoked'; process.env.OPENAI_MODEL = 'test-model';
  try {
    process.env.RAILWAY_SANDBOX_ENVIRONMENT_ID = JSON.parse(await fs.readFile(new URL('../build-assets/environment.json', import.meta.url), 'utf8')).environmentId;
    const journal = await Journal.open(new MemoryStore(), 'base-test'), now = new Date().toISOString(), shopId = randomUUID(), revisionId = randomUUID();
    const source = unpackSource(await fs.readFile(new URL('../build-assets/template.tar.gz', import.meta.url)));
    source.set('src/storefront/theme.css', Buffer.from('/* selected draft */\n:root { --color-accent: #123456; }'));
    const archive = packSource(source);
    const config = {...design, schemaVersion: 1, shopId, network: 'testnet', catalogSeed: seed};
    const revision = RevisionManifestSchema.parse({schemaVersion: 1, kind: 'revision', id: revisionId, recordVersion: 1, createdAt: now, updatedAt: now,
      network: 'testnet', ownerAccountId: aliceId, shopId, jobId: randomUUID(), attemptId: randomUUID(), parentRevisionId: null, state: 'ready',
      templateVersion: JSON.parse(source.get('template/template-manifest.json')!.toString()).templateVersion, environmentVersion: 'old-clean-checkpoint', model: 'old-model', config,
      files: [{path: 'source.tar.gz', size: archive.length, sha256: sha256(archive)}], validation: {typecheck: true, lint: true, build: true, browser: true, cleanup: 'destroyed'}});
    await journal.store.putVerified(`${revisionPath(journal, revision)}/source.tar.gz`, archive);
    await journal.transact(null, async () => ({changes: [revision], result: {status: 201, data: {}}}));
    const job = GenerationJobSchema.parse({schemaVersion: 1, kind: 'job', id: randomUUID(), recordVersion: 1, createdAt: now, updatedAt: now,
      network: 'testnet', ownerAccountId: aliceId, shopId, catalogSeed: seed, config, state: 'queued', brief: 'Refine the selected draft', baseRevisionId: revisionId, attemptIds: [], revisionId: null});
    const engine = new GenerationEngine(journal, loadConfig({WORLD_ENABLED: 'true', WORLD_API_URL: 'https://world.example'}), async () => ({config: job.config, brief: job.brief,
      products: [{ProductId: seed, Price: '123', PriceToken: '0.0.0', Name: 'Current product', Description: '', Image: ''}]}));
    const pin = await engine.pin(job, new AbortController().signal), pinned = unpackSource(Buffer.from(pin.source, 'base64'));
    assert.equal(pinned.get('src/storefront/theme.css')!.toString(), source.get('src/storefront/theme.css')!.toString());
    assert.deepEqual(JSON.parse(pinned.get('public/storefront.json')!.toString()), job.config);
    assert.equal(pin.model.model, 'test-model'); assert.equal(pin.prompt.instructions.includes('No cart or checkout'), true);
    assert.deepEqual(pin.world, {enabled: true, url: 'https://world.example'});
    await journal.store.putVerified(`${revisionPath(journal, revision)}/source.tar.gz`, Buffer.from('damaged'));
    await assert.rejects(engine.pin(job, new AbortController().signal), /base_revision_integrity/);
  } finally {
    if (priorKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = priorKey;
    if (priorModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = priorModel;
    if (priorEnvironment === undefined) delete process.env.RAILWAY_SANDBOX_ENVIRONMENT_ID; else process.env.RAILWAY_SANDBOX_ENVIRONMENT_ID = priorEnvironment;
  }
});

test('checkpoint metadata must match the configured sandbox environment before generation', async () => {
  const metadata = JSON.parse(await fs.readFile(new URL('../build-assets/environment.json', import.meta.url), 'utf8'));
  assert.equal((await loadCheckpoint({RAILWAY_SANDBOX_ENVIRONMENT_ID: metadata.environmentId})).checkpointName, metadata.checkpointName);
  await assert.rejects(loadCheckpoint({RAILWAY_SANDBOX_ENVIRONMENT_ID: randomUUID()}), /checkpoint_environment_mismatch/);
  await assert.rejects(loadCheckpoint({}), /RAILWAY_SANDBOX_ENVIRONMENT_ID/);
});
