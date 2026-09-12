import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {Wallet} from 'ethers';
import {hashSignal} from '@worldcoin/idkit-core/hashing';
import {AccountStore, Accounts, resolveAccount} from '../server/accounts.ts';
import {loadConfig} from '../server/config.ts';
import {SelfieFlow} from '../server/flow.ts';
import {createApp} from '../server/app.ts';
import type {RequestContext} from '../shared/contracts.ts';

const wallet = new Wallet('0x' + '01'.padStart(64, '0'));
const account = {network: 'testnet' as const, accountId: '0.0.12345'};
const origin = 'http://localhost:5173';
function setup(path = ':memory:', presets: unknown = []) {
  const config = loadConfig({WORLD_ENABLED: 'true', WORLD_APP_ID: 'app_test', WORLD_RP_ID: 'rp_test', WORLD_RP_SIGNING_KEY: wallet.privateKey});
  const store = new AccountStore(path, presets), accounts = new Accounts(config, store, async () => wallet.address.toLowerCase());
  const flow = new SelfieFlow(config, {verify: async () => ({httpStatus: 200, environment: 'sandbox', identifiers: ['face'], code: null})});
  flow.accounts = accounts;
  return {config, store, accounts, flow};
}
async function start(accounts: Accounts, flow: SelfieFlow) {
  const challenge = await accounts.challenge(account, origin);
  const result = await accounts.start(challenge.challengeId, await wallet.signMessage(challenge.message), origin, flow);
  const handoff = accounts.claim(new URLSearchParams(new URL(result.handoffUrl).hash.slice(1)).get('handoff')!);
  return {...handoff, result, context: handoff.session.request!.context};
}
function proof(c: RequestContext) {
  return {protocol_version: '3.0', nonce: c.rpContext.nonce, action: c.action, environment: c.environment,
    responses: [{identifier: 'face', signal_hash: hashSignal(c.signal), nullifier: '0xffffffffffffffffffffffffffffffff', merkle_root: '1', proof: '0x1234'}]};
}
test('buyer EVM addresses resolve to the same preset and never cross networks', async () => {
  const {accounts, store, config} = setup(':memory:', [account]);
  const original = globalThis.fetch;
  try {
    const alias = {...account, accountId: wallet.address};
    globalThis.fetch = async () => new Response(JSON.stringify({account: account.accountId, deleted: false, evm_address: wallet.address.toLowerCase()}));
    assert.deepEqual(await resolveAccount(alias), account);
    assert.equal((await accounts.status(alias)).source, 'preset');
    assert.equal((await accounts.status(alias)).accountId, wallet.address);
    assert.equal((await accounts.status({...alias, network: 'mainnet'})).verified, false);
    globalThis.fetch = async () => new Response(JSON.stringify({account: account.accountId, deleted: false, evm_address: '0x' + 'ab'.repeat(20)}));
    await assert.rejects(accounts.status(alias));
    config.enabled = false;
    assert.equal((await accounts.status(alias)).verified, false);
  } finally {globalThis.fetch = original; store.close();}
});
test('presets are network scoped, work without provider credentials, and global disable wins', async () => {
  const {accounts, store, config} = setup(':memory:', [account]);
  try {
    config.public.configured = false;
    const result = await accounts.status(account);
    assert.equal(result.source, 'preset'); assert.equal(result.verified, true); assert.equal(result.verifiedAt, null);
    assert.equal((await accounts.status({...account, network: 'mainnet'})).verified, false);
    store.presets.clear(); assert.equal((await accounts.status(account)).verified, false);
    config.enabled = false;
    assert.equal((await accounts.status(account)).enabled, false);
    await assert.rejects(accounts.challenge(account, origin), /disabled/);
  } finally {store.close();}
});
test('real account result persists, preset removal restores it, duplicates do not extend expiry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'merxet-world-')), path = join(dir, 'test.sqlite');
  const a = setup(path);
  try {
    const {session, context} = await start(a.accounts, a.flow);
    await a.flow.verify(session, context.id, proof(context));
    const stored = a.store.get(account)!;
    assert.equal(stored.nullifier, BigInt('0xffffffffffffffffffffffffffffffff').toString());
    await a.flow.verify(session, context.id, proof(context));
    assert.deepEqual(a.store.get(account), stored);
    a.store.close();
    const b = setup(path, [account]);
    try {
      assert.equal((await b.accounts.status(account)).source, 'preset');
      b.store.presets.clear();
      assert.equal((await b.accounts.status(account)).source, 'world');
      b.accounts.signer = async () => 'different';
      assert.equal((await b.accounts.status(account)).verified, false);
      b.accounts.signer = async () => wallet.address.toLowerCase();
      b.accounts.now = () => Date.parse(stored.expiresAt);
      assert.equal((await b.accounts.status(account)).verified, false);
    } finally {b.store.close();}
  } finally {if (a.store.db.isOpen) a.store.close(); rmSync(dir, {recursive: true, force: true});}
});
test('wrong signatures, origins and reused challenges or handoffs cannot attach a wallet', async () => {
  const {accounts, flow, store} = setup();
  try {
    const c = await accounts.challenge(account, origin);
    const bad = Wallet.createRandom();
    await assert.rejects(accounts.start(c.challengeId, await bad.signMessage(c.message), origin, flow));
    const sig = await wallet.signMessage(c.message);
    await assert.rejects(accounts.start(c.challengeId, sig, 'https://evil.example', flow));
    const result = await accounts.start(c.challengeId, sig, origin, flow);
    await assert.rejects(accounts.start(c.challengeId, sig, origin, flow));
    const token = new URLSearchParams(new URL(result.handoffUrl).hash.slice(1)).get('handoff')!;
    accounts.claim(token); assert.throws(() => accounts.claim(token));
    const expired = await accounts.challenge(account, origin);
    accounts.now = () => Date.parse(expired.expiresAt);
    await assert.rejects(accounts.start(expired.challengeId, await wallet.signMessage(expired.message), origin, flow));
  } finally {store.close();}
});
test('disabled or canceled during identity lookup cannot commit a verified record', async () => {
  for (const action of ['disable', 'cancel']) {
    const {accounts, config, flow, store} = setup();
    try {
      const {session, context} = await start(accounts, flow);
      accounts.signer = async () => {
        if (action === 'disable') config.enabled = false; else flow.cancel(session, context.id);
        return wallet.address.toLowerCase();
      };
      await assert.rejects(flow.verify(session, context.id, proof(context)));
      assert.equal(store.get(account), undefined);
    } finally {store.close();}
  }
});
test('public status requires no cookie, CORS permits only seller writes, handoff uses World cookie', async () => {
  const {accounts, flow, config, store} = setup(':memory:', [account]);
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  config.origin = url; server.on('request', createApp(flow, accounts));
  const host = new URL(config.origin).host;
  try {
    const result = await fetch(url + '/api/verifications/testnet/0.0.12345', {headers: {Host: host, Origin: 'https://shop.example'}});
    assert.equal(result.headers.get('access-control-allow-origin'), '*');
    assert.equal((await result.json()).source, 'preset');
    const denied = await fetch(url + '/api/verification-challenges', {method: 'POST', headers: {Host: host, Origin: 'https://evil.example', 'Content-Type': 'application/json'}, body: JSON.stringify(account)});
    assert.equal(denied.status, 403);
    const preflight = await fetch(url + '/api/verification-challenges', {method: 'OPTIONS', headers: {Host: host, Origin: origin}});
    assert.equal(preflight.status, 204);
    const c = await accounts.challenge(account, origin);
    const r = await accounts.start(c.challengeId, await wallet.signMessage(c.message), origin, flow);
    const token = new URLSearchParams(new URL(r.handoffUrl).hash.slice(1)).get('handoff');
    const handoff = await fetch(url + '/api/handoff', {method: 'POST', headers: {Host: host, Origin: config.origin, 'Content-Type': 'application/json'}, body: JSON.stringify({token})});
    assert.equal(handoff.status, 200); assert.match(handoff.headers.get('set-cookie')!, /HttpOnly/);
    assert.equal((await handoff.json()).status.account.accountId, account.accountId);
    const canceled = await fetch(url + '/api/verification-requests/cancel', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'}, body: JSON.stringify({token})});
    assert.equal(canceled.status, 200);
    assert.equal(flow.sessions.values().next().value!.request!.state, 'canceled');
    assert.equal(store.get(account), undefined);
  } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close();}
});
