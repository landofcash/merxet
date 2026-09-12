import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {hashSignal} from '@worldcoin/idkit-core/hashing';
import {loadConfig} from '../server/config.ts';
import {SelfieFlow} from '../server/flow.ts';
import {FlowError, Uint256, WorldVerifier} from '../server/world.ts';
import {createApp} from '../server/app.ts';
import type {ProviderObservation, RequestContext} from '../shared/contracts.ts';

// Synthetic fixtures only. This public test key has no registered World RP.
const config = () => loadConfig({WORLD_ENABLED: 'true', WORLD_APP_ID: 'app_test', WORLD_RP_ID: 'rp_test', WORLD_RP_SIGNING_KEY: '01'.padStart(64, '0')});
const observation: ProviderObservation = {httpStatus: 200, environment: 'sandbox', identifiers: ['face'], code: null};
const nullifier = '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1';
function payload(context: RequestContext) {
  return {protocol_version: '3.0', nonce: context.rpContext.nonce, action: context.action, environment: context.environment,
    responses: [{identifier: 'face', signal_hash: hashSignal(context.signal), nullifier, merkle_root: '0x01', proof: '0x1234'}],
    integrity_bundle: {synthetic: 'preserve-complete-input'}};
}
function response(context: RequestContext) {
  return {success: true, action: context.action, environment: context.environment,
    results: [{identifier: 'face', success: true, nullifier: BigInt(nullifier).toString()}]};
}
function setup(verifier: Pick<WorldVerifier, 'verify'> = {verify: async () => observation}, now = Date.now) {
  const flow = new SelfieFlow(config(), verifier, now), {session, token} = flow.session(undefined, true);
  const context = flow.start(session, randomUUID()); return {flow, session, token, context};
}
const code = (expected: string) => (error: unknown) => error instanceof FlowError && error.code === expected;

test('missing configuration starts in setup mode; invalid configuration never exposes values', () => {
  const disabled = loadConfig({WORLD_ENABLED: 'true'});
  assert.equal(disabled.public.configured, false);
  assert.equal(disabled.environment, 'sandbox');
  assert.equal(disabled.public.missing.length, 3);
  const flow = new SelfieFlow(disabled), {session} = flow.session(undefined, true);
  assert.throws(() => flow.start(session, randomUUID()), code('not_configured'));
  assert.throws(() => loadConfig({WORLD_ENVIRONMENT: 'staging'}));
  assert.throws(() => loadConfig({APP_ORIGIN: 'http://public.example'}));
  assert.throws(() => loadConfig({WORLD_RP_SIGNING_KEY: 'secret-invalid'}), error => !String(error).includes('secret-invalid'));
});

test('real SDK signing returns a short-lived server-selected context, and start retries reuse it', () => {
  const {flow, session, context} = setup();
  assert.equal(context.rpContext.rp_id, 'rp_test');
  assert.equal(context.rpContext.signature.length, 132);
  assert.equal(context.rpContext.expires_at - context.rpContext.created_at, 300);
  assert.deepEqual(flow.start(session, context.id), context);
  assert.equal(JSON.stringify(context).includes(config().signingKey), false);
});

test('verification binds browser session and rejects a copied proof under a new context', async () => {
  let calls = 0;
  const {flow, session, context} = setup({verify: async () => {calls++; return observation;}});
  const other = flow.session(undefined, true).session;
  await assert.rejects(flow.verify(other, context.id, payload(context)), code('request_not_found'));
  const next = flow.start(other, randomUUID());
  await assert.rejects(flow.verify(other, next.id, payload(context)), code('request_mismatch'));
  assert.equal(calls, 0);
  assert.equal((await flow.verify(session, context.id, payload(context))).verification?.credential, 'face');
});

test('mismatched nonce, action, environment, signal, protocol, and credential never reach World', async () => {
  let calls = 0;
  const {flow, session, context} = setup({verify: async () => {calls++; return observation;}});
  for (const change of [
    {nonce: '0x01'}, {action: 'other'}, {environment: 'production'}, {protocol_version: '4.0'},
    {responses: [{...payload(context).responses[0], identifier: 'orb'}]},
    {responses: [{...payload(context).responses[0], signal_hash: '0x01'}]},
    {responses: [...payload(context).responses, ...payload(context).responses]},
  ]) await assert.rejects(flow.verify(session, context.id, {...payload(context), ...change}), error => error instanceof FlowError && error.status === 400);
  assert.equal(calls, 0);
});

test('provider receives complete result at server-selected RP and large nullifiers compare losslessly', async () => {
  const {context} = setup(); let calls = 0;
  const verifier = new WorldVerifier(config(), (async (url, options) => {
    calls++; assert.equal(url, 'https://developer.world.org/api/v4/verify/rp_test');
    assert.deepEqual(JSON.parse(options!.body as string), payload(context));
    assert.equal(options!.redirect, 'error'); assert.ok(options!.signal);
    return Response.json(response(context));
  }) as typeof fetch);
  assert.deepEqual(await verifier.verify(payload(context), context), observation);
  assert.equal(calls, 1);
  assert.equal(Uint256.safeParse((1n << 256n).toString()).success, false);
  assert.equal(Uint256.safeParse(nullifier).success, true);
  for (const invalid of ['invalid', '0x', '', '-1', '1e9']) assert.equal(Uint256.safeParse(invalid).success, false);
});

test('HTTP 200 or top-level success cannot substitute for matching verified face result', async () => {
  const {context} = setup();
  for (const body of [
    {success: true}, {...response(context), environment: 'production'}, {...response(context), environment: 'staging'},
    {...response(context), action: 'other'},
    {...response(context), results: [{identifier: 'orb', success: true, nullifier}]},
    {...response(context), results: [{identifier: 'face', success: false, nullifier}]},
    {...response(context), results: [{identifier: 'face', success: true, nullifier: '1'}]},
  ]) {
    const verifier = new WorldVerifier(config(), (async () => Response.json(body)) as typeof fetch);
    await assert.rejects(verifier.verify(payload(context), context), code('provider_contract_mismatch'));
  }
});

test('provider refusal, network failures, invalid JSON and oversized bodies fail without leaking proof data', async () => {
  const {context} = setup();
  const transports = [
    async () => Response.json({code: 'already_verified', proof: 'DO_NOT_LEAK'}, {status: 400}),
    async () => {throw new Error('DO_NOT_LEAK');},
    async () => new Response('DO_NOT_LEAK', {status: 502}),
    async () => new Response('x'.repeat(70000)),
  ];
  for (const transport of transports) {
    const verifier = new WorldVerifier(config(), transport as typeof fetch);
    await assert.rejects(verifier.verify(payload(context), context), error => error instanceof FlowError &&
      !JSON.stringify(error).includes('DO_NOT_LEAK') && !error.message.includes('DO_NOT_LEAK'));
  }
});

test('concurrent proof delivery and lost-response retries call the provider once', async () => {
  let calls = 0, finish!: (value: ProviderObservation) => void;
  const {flow, session, context} = setup({verify: async () => {calls++; return new Promise(resolve => {finish = resolve;});}});
  const first = flow.verify(session, context.id, payload(context));
  const duplicate = flow.verify(session, context.id, payload(context));
  assert.equal(calls, 1); finish(observation);
  const accepted = await first; assert.deepEqual(await duplicate, accepted);
  assert.deepEqual(await flow.verify(session, context.id, payload(context)), accepted);
  assert.equal(calls, 1);
  assert.deepEqual(flow.status(session).verification, accepted.verification);
  await assert.rejects(flow.verify(session, context.id, {...payload(context), responses: [{...payload(context).responses[0], nullifier: '123'}]}), code('proof_changed'));
});

test('cancel during provider verification prevents late acceptance; closing after success preserves result', async () => {
  let finish!: (value: ProviderObservation) => void;
  const {flow, session, context} = setup({verify: async () => new Promise(resolve => {finish = resolve;})});
  const pending = flow.verify(session, context.id, payload(context));
  flow.cancel(session, context.id); finish(observation);
  await assert.rejects(pending, code('request_finished'));
  assert.equal(flow.status(session).verification, null);
  const accepted = setup(); await accepted.flow.verify(accepted.session, accepted.context.id, payload(accepted.context));
  assert.equal(accepted.flow.cancel(accepted.session, accepted.context.id).verification?.credential, 'face');
});

test('expired request, expiry during verification, and server restart cannot produce an accepted result', async () => {
  let time = Date.now(), finish!: (value: ProviderObservation) => void;
  const {flow, session, context, token} = setup({verify: async () => new Promise(resolve => {finish = resolve;})}, () => time);
  const pending = flow.verify(session, context.id, payload(context));
  time += 301000; finish(observation);
  await assert.rejects(pending, code('request_finished'));
  await assert.rejects(flow.verify(session, context.id, payload(context)), code('request_finished'));
  assert.equal(flow.status(session).request?.state, 'expired');
  assert.throws(() => new SelfieFlow(config()).session(token), code('session_expired'));
  time += 3600000; assert.throws(() => flow.session(token), code('session_expired'));
});

test('a failed repeat check keeps the previous accepted result and cannot silently retry an uncertain provider outcome', async () => {
  const {flow, session, context} = setup();
  await flow.verify(session, context.id, payload(context));
  const next = flow.start(session, randomUUID()); let calls = 0;
  flow.verifier = {verify: async () => {calls++; throw new FlowError(503, 'provider_unavailable', 'Unavailable');}};
  await assert.rejects(flow.verify(session, next.id, payload(next)), code('provider_unavailable'));
  await assert.rejects(flow.verify(session, next.id, payload(next)), code('request_finished'));
  assert.equal(calls, 1);
  assert.equal(flow.status(session).verification?.requestId, context.id);
});

test('HTTP API isolates sessions, enforces origin, limits payload size and keeps private data out of status', async t => {
  const flow = new SelfieFlow(config(), {verify: async () => observation}), server = createServer().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => {server.close(); server.closeAllConnections();});
  const address = server.address() as {port: number}, url = `http://127.0.0.1:${address.port}`;
  flow.config.origin = url; server.on('request', createApp(flow));
  const headers: Record<string, string> = {'Origin': url, 'Content-Type': 'application/json'};
  assert.equal((await fetch(`${url}/api/session`, {headers})).status, 401);
  assert.equal((await fetch(`${url}/api/session`, {method: 'POST', headers: {...headers, Origin: 'https://other.example'}, body: '{}'})).status, 403);
  const sessionResponse = await fetch(`${url}/api/session`, {method: 'POST', headers, body: '{}'});
  const cookie = sessionResponse.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  assert.equal(sessionResponse.headers.get('cache-control'), 'no-store');
  headers.Cookie = cookie.split(';')[0];
  const request = await fetch(`${url}/api/requests`, {method: 'POST', headers, body: JSON.stringify({id: randomUUID()})});
  const context = await request.json() as RequestContext; assert.equal(request.status, 201);
  assert.equal((await fetch(`${url}/api/requests/${context.id}/verify`, {method: 'POST', headers, body: JSON.stringify(payload(context))})).status, 200);
  const statusText = await (await fetch(`${url}/api/session`, {headers})).text();
  for (const privateValue of [config().signingKey, context.signal, context.rpContext.nonce, nullifier, 'integrity_bundle']) assert.equal(statusText.includes(privateValue), false);
  assert.equal((await fetch(`${url}/api/requests`, {method: 'POST', headers, body: JSON.stringify({id: 'x'.repeat(70000)})})).status, 413);
});
