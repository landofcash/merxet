import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {keccak256, Transaction} from 'ethers';
import {ApiError} from '../src/domain/errors.ts';
import {loadConfig} from '../src/config.ts';
import {EnsNameSchema, type EnsName, type EnsTransaction, type Shop} from '../src/domain/records.ts';
import {recordsFor, resolverInitialization, EnsRpc, SepoliaEns, type EnsChain, type ResolvedName} from '../src/ens/chain.ts';
import {DEPLOYMENTS, resolverAbi, factoryAbi, registryAbi, resolverAdminRoles, TEXT_KEYS} from '../src/ens/contracts.ts';
import {normalizeLabel} from '../src/ens/labels.ts';
import {Journal} from '../src/storage/journal.ts';
import {assetPath, publicRevisionPath, selectionPath} from '../src/publishing/delivery.ts';
import {jsonBytes, sha256} from '../src/storage/bunny.ts';
import {aliceId, bobId, bob, alice, design, fixture, MemoryStore, seed, TestIdentity} from './helpers.ts';

class FakeChain implements EnsChain {
  prepared: EnsName[] = []; broadcasted: EnsTransaction[] = []; confirmed = new Set<string>();
  pending = false; unknown = false; revert = false; outage = false; permissionRevoked = false; taken = false; reads = 0;
  result: ResolvedName | null | undefined;
  beforeBroadcast?: (tx: EnsTransaction) => Promise<void>;
  async ready() { if (this.permissionRevoked) throw new ApiError(503, 'ens_permissions_not_ready'); return {expiry: 1883784804}; }
  async available() { if (this.outage) throw new ApiError(503, 'ens_rpc_unavailable'); return !this.taken; }
  async prepare(value: EnsName): ReturnType<EnsChain['prepare']> {
    await this.ready(); if (this.taken) throw new ApiError(409, 'ens_name_unavailable');
    this.prepared.push(structuredClone(value)); const nonce = this.prepared.length - 1;
    const raw = '0x' + (nonce + 1).toString(16).padStart(4, '0');
    return {transaction: {phase: value.transactions.some(tx => tx.phase === 'resolver' && tx.state === 'confirmed') ? 'register' : 'resolver',
      hash: keccak256(raw), raw, nonce, state: 'prepared', blockNumber: null}, resolver: '0x' + '44'.repeat(20), expiry: 1883784804};
  }
  async broadcast(tx: EnsTransaction) { await this.beforeBroadcast?.(tx); this.broadcasted.push(tx); if (this.outage) throw new ApiError(503, 'ens_rpc_unavailable'); }
  async settle(tx: EnsTransaction): ReturnType<EnsChain['settle']> {
    if (this.outage) throw new ApiError(503, 'ens_rpc_unavailable');
    if (this.unknown) return {state: 'unknown', blockNumber: null};
    if (this.pending) return {state: 'pending', blockNumber: null};
    return {state: this.revert ? 'reverted' : 'confirmed', blockNumber: 100 + tx.nonce};
  }
  async resolve(value: EnsName) { this.reads++; if (this.outage) throw new ApiError(503, 'ens_rpc_unavailable');
    return this.result === undefined ? {resolver: value.resolver!, expiry: value.expiry!, records: recordsFor(value)} : this.result; }
}

test('public buyer lookup accepts either seller identity, selects one name, and keeps seller APIs private', async () => {
  const f = await setup();
  try {
    await f.claim('zebra'); await f.advance();
    const secondShop = {...f.shop, id: randomUUID(), recordVersion: 1};
    secondShop.config = {...secondShop.config, shopId: secondShop.id};
    const secondName = {...f.state(), id: randomUUID(), shopId: secondShop.id, recordVersion: 1, label: 'alpha',
      name: `alpha.${f.config.ens.parentName}`, url: f.publications!.delivery.url(secondShop.id)};
    await f.journal.transact(null, async () => ({changes: [secondShop, secondName], result: {status: 200, data: {}}}));
    await f.store.putVerified(selectionPath(f.journal.prefix, secondShop.id), jsonBytes({schemaVersion: 1, shopId: secondShop.id, revisionId: secondShop.publishedRevisionId}));
    const path = `/public/catalogs/${seed}/ens?sellerWallet=`;
    for (const seller of [aliceId, alice.address, alice.address.toLowerCase()]) {
      const response = await f.request(path + seller, {origin: 'https://buyer.example'});
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.body.data.name.name, secondName.name);
      assert.equal(response.body.data.sellerAccountId, aliceId);
      assert.equal(response.body.data.name.shortUrl, `${f.config.publicOrigin}/alpha`);
      assert.ok(Date.parse(response.body.data.validUntil) <= f.clock.value + f.config.ens.cacheMs);
      assert.deepEqual(Object.keys(response.body.data.name).sort(), ['chainId', 'name', 'shopId', 'shortUrl']);
      assert.ok(!JSON.stringify(response.body).includes('transactions'));
    }
    assert.equal((await f.request(path + bob.address)).body.data.name, null);
    assert.equal((await f.request(path + 'bad')).status, 400);
    assert.equal((await f.request('/public/catalogs/bad/ens?sellerWallet=' + aliceId)).status, 400);
    assert.equal((await f.request(`/shops/${f.shop.id}/ens`, {origin: 'https://buyer.example'})).status, 403);
    assert.equal((await f.request(path + aliceId, {origin: ''})).status, 200);
  } finally { await f.close(); }
});

test('public ENS lookup rechecks ownership and publication and never extends expired verification during outages', async () => {
  const f = await setup();
  const path = `/public/catalogs/${seed}/ens?sellerWallet=${aliceId}`;
  try {
    await f.claim(); await f.advance();
    const first = await f.request(path);
    const expiry = first.body.data.validUntil;
    f.clock.value += 1000;
    assert.equal((await f.request(path)).body.data.validUntil, expiry);
    f.identity.catalogs.set(`testnet/${seed}`, bobId);
    assert.equal((await f.request(path)).body.data.name, null);
    f.identity.catalogs.set(`testnet/${seed}`, aliceId);
    f.chain.outage = true; f.clock.value += f.config.ens.cacheMs + 1000;
    assert.equal((await f.request(path)).status, 503);
    f.chain.outage = false;
    await f.store.putVerified(selectionPath(f.journal.prefix, f.shop.id), jsonBytes({schemaVersion: 1, shopId: f.shop.id, revisionId: randomUUID()}));
    assert.equal((await f.request(path)).status, 503);
    await f.journal.transact(null, async () => ({changes: [{...f.shop, recordVersion: f.shop.recordVersion + 1, publishedRevisionId: null}], result: {status: 200, data: {}}}));
    assert.equal((await f.request(path)).body.data.name, null);
  } finally { await f.close(); }
});

test('public lookup returns disabled without ENS and is rate limited independently of seller auth', async () => {
  const f = await fixture();
  try {
    const path = `/public/catalogs/${seed}/ens?sellerWallet=${aliceId}`;
    assert.equal((await f.request(path, {origin: 'https://buyer.example'})).body.data.enabled, false);
    for (let i = 0; i < 119; i++) assert.equal((await f.request(path)).status, 200);
    assert.equal((await f.request(path)).status, 429);
  } finally { await f.close(); }
});
async function setup(store = new MemoryStore(), chain = new FakeChain()) {
  const publicStore = new MemoryStore();
  const f = await fixture(store, new TestIdentity(), undefined, undefined, publicStore, chain);
  const token = await f.login(), otherToken = await f.login(bobId, bob);
  const shop: Shop = (await f.request('/shops', {method: 'POST', token, requestId: randomUUID(), body: {catalogSeed: seed, design}})).body.data;
  const published = {...shop, recordVersion: shop.recordVersion + 1, publishedRevisionId: randomUUID()};
  await f.journal.transact(null, async () => ({changes: [published], result: {status: 200, data: {}}}));
  await store.putVerified(selectionPath(f.journal.prefix, shop.id), jsonBytes({schemaVersion: 1, shopId: shop.id, revisionId: published.publishedRevisionId}));
  const state = () => f.journal.list<EnsName>('ens-name', value => value.shopId === shop.id)[0];
  const claim = (label = 'coffee', key = randomUUID(), credential = token) => f.request(`/shops/${shop.id}/ens`, {method: 'POST', token: credential, requestId: key, body: {label}});
  const advance = async () => { for (let i = 0; i < 6; i++) await f.ens!.tick(); };
  return {...f, publicStore, chain, token, otherToken, shop: published, state, claim, advance};
}
test('ENS configuration stays disabled by default, requires Sepolia and distinct matching keys when enabled', () => {
  assert.equal(loadConfig({}).ens.enabled, false);
  assert.equal(loadConfig({}).ens.cacheMs, 10 * 60 * 1000);
  const env = {ENS_ENABLED: 'true', ENS_RPC_URL: 'https://example.com/rpc', ENS_NAMESPACE_ADMIN_ADDRESS: alice.address,
    ENS_OPERATOR_ADDRESS: bob.address, ENS_OPERATOR_PRIVATE_KEY: bob.privateKey, ENS_SUBNAME_REGISTRY_ADDRESS: '0x' + '33'.repeat(20)};
  assert.equal(loadConfig(env).ens.enabled, true);
  for (const patch of [{ENS_CHAIN_ID: '1'}, {ENS_OPERATOR_PRIVATE_KEY: alice.privateKey}, {ENS_NAMESPACE_ADMIN_ADDRESS: bob.address}, {ENS_RPC_URL: 'http://example.com'}, {ENS_SUBNAME_REGISTRY_ADDRESS: ''}]) assert.throws(() => loadConfig({...env, ...patch}));
  assert.equal(normalizeLabel(' Coffee-Shop '), 'coffee-shop');
  for (const label of ['api', 'admin', 'me', 'a'.repeat(41), 'café', 'a--b', '-abc', 'abc-', '../coffee', 'coffee.eth', 'a_b']) assert.throws(() => normalizeLabel(label));
});
test('claim authenticates shop ownership, reserves names once and never returns signed transaction bytes', async () => {
  const f = await setup();
  try {
    assert.equal((await f.claim('coffee', randomUUID(), f.otherToken)).status, 404);
    for (const label of ['admin', 'bad.name', 'a--b']) assert.equal((await f.claim(label)).status, 400);
    const key = randomUUID(), first = await f.claim('Coffee', key);
    assert.equal(first.status, 202, JSON.stringify(first.body));
    assert.equal((await f.claim('coffee', key)).body.data.id, first.body.data.id);
    assert.equal((await f.claim('other-name')).status, 409);
    await f.advance(); assert.equal(f.state().state, 'active');
    const response = await f.request(`/shops/${f.shop.id}/ens`, {token: f.token});
    assert.ok(response.body.data.shortUrl.endsWith('/coffee'));
    assert.ok(!JSON.stringify(response.body).includes('"raw"')); assert.ok(!JSON.stringify(response.body).includes('signerAddress'));
    assert.equal(response.body.data.name.transactions.length, 2);
  } finally { await f.close(); }
});
test('separate shops racing for one label cannot both reserve it; unpublished shops cannot claim', async () => {
  const f = await setup();
  try {
    const other: Shop = (await f.request('/shops', {method: 'POST', token: f.token, requestId: randomUUID(), body: {catalogSeed: seed, design}})).body.data;
    const send = () => f.request(`/shops/${other.id}/ens`, {method: 'POST', token: f.token, requestId: randomUUID(), body: {label: 'coffee'}});
    assert.equal((await send()).status, 409);
    await f.journal.transact(null, async () => ({changes: [{...other, recordVersion: other.recordVersion + 1, publishedRevisionId: randomUUID()}], result: {status: 200, data: {}}}));
    const result = await Promise.all([f.claim(), send()]); assert.deepEqual(result.map(r => r.status).sort(), [202, 409]);
    assert.equal(f.journal.list<EnsName>('ens-name', () => true).length, 1);
  } finally { await f.close(); }
});
test('signed bytes are durable before broadcast; restart reconciles exactly the same nonce and hash', async () => {
  const f = await setup();
  try {
    await f.claim(); f.chain.pending = true;
    f.chain.beforeBroadcast = async tx => {
      const reopened = await Journal.open(f.store, f.journal.prefix);
      assert.equal(reopened.list<EnsName>('ens-name', () => true)[0].transactions[0].raw, tx.raw);
    };
    await f.ens!.tick(); await f.ens!.tick();
    assert.equal(f.chain.prepared.length, 1); assert.equal(f.chain.broadcasted[0].hash, f.chain.broadcasted[1].hash);
    f.chain.beforeBroadcast = undefined; await f.close();
    const restarted = await fixture(f.store, f.identity, f.clock, undefined, new MemoryStore(), f.chain);
    try { f.chain.pending = false; for (let i = 0; i < 5; i++) await restarted.ens!.tick();
      assert.equal(restarted.journal.list<EnsName>('ens-name', () => true)[0].state, 'active'); assert.equal(f.chain.prepared.length, 2);
    } finally { await restarted.close(); }
  } catch (error) { await f.close().catch(() => {}); throw error; }
});
test('lost storage acknowledgement prevents broadcast and recovers the prepared transaction from committed storage', async () => {
  const f = await setup();
  try {
    await f.claim(); f.store.afterPut = path => { if (path.endsWith('/commit.json')) throw Error('Acknowledgement lost'); };
    await f.ens!.tick(); assert.equal(f.journal.healthy, false); assert.equal(f.chain.broadcasted.length, 0);
    f.store.afterPut = undefined;
    const journal = await Journal.open(f.store, f.journal.prefix);
    assert.equal(journal.list<EnsName>('ens-name', () => true)[0].transactions[0].state, 'prepared');
  } finally { await f.close(); }
});
test('unknown nonce blocks other submissions from broadcasting; a later receipt resumes without another transaction', async () => {
  const f = await setup();
  try {
    await f.claim(); await f.ens!.tick(); f.chain.unknown = true;
    await f.ens!.tick(); await f.ens!.tick();
    assert.equal(f.state().state, 'reconciliation'); assert.equal(f.chain.prepared.length, 1); assert.equal(f.chain.broadcasted.length, 1);
    f.chain.unknown = false; await f.advance(); assert.equal(f.state().state, 'active'); assert.equal(f.chain.prepared.length, 2);
  } finally { await f.close(); }
});
for (const outcome of ['not broadcast', 'pending', 'unknown'] as const) {
  test(`older retries wait for a newer prepared transaction: ${outcome}`, async () => {
    const f = await setup();
    try {
      await f.claim(); await f.ens!.tick();
      f.chain.revert = true; await f.ens!.tick(); f.chain.revert = false;
      assert.equal(f.state().state, 'failed');

      const other = {...f.shop, id: randomUUID(), recordVersion: 1};
      other.config = {...other.config, shopId: other.id};
      await f.journal.transact(null, async () => ({changes: [other], result: {status: 200, data: {}}}));
      const claimed = await f.request(`/shops/${other.id}/ens`, {method: 'POST', token: f.token, requestId: randomUUID(), body: {label: 'tea'}});
      assert.equal(claimed.status, 202);
      const otherState = () => f.journal.list<EnsName>('ens-name', value => value.shopId === other.id)[0];
      if (outcome === 'not broadcast') f.chain.beforeBroadcast = async () => { throw new ApiError(503, 'ens_rpc_unavailable'); };
      await f.ens!.tick();
      f.chain.beforeBroadcast = undefined;
      const prepared = otherState().transactions[0];
      assert.equal(prepared.state, 'prepared');
      const broadcastCount = f.chain.broadcasted.length;
      f.chain.pending = true;
      f.chain.unknown = outcome === 'unknown';

      const retried = await f.request(`/shops/${f.shop.id}/ens/retry`, {method: 'POST', token: f.token, requestId: randomUUID(), body: {}});
      assert.equal(retried.status, 202);
      for (let i = 0; i < 2; i++) await f.ens!.tick();
      assert.equal(f.chain.prepared.length, 2, 'the older retry must not prepare while the newer transaction is unresolved');
      assert.equal(f.state().state, 'requested');
      if (outcome === 'unknown') {
        assert.equal(otherState().state, 'reconciliation');
        assert.equal(f.chain.broadcasted.length, broadcastCount);
      } else {
        assert.deepEqual(f.chain.broadcasted.slice(broadcastCount), [prepared, prepared]);
      }

      f.chain.pending = false; f.chain.unknown = false;
      await f.ens!.tick();
      assert.equal(otherState().transactions[0].state, 'confirmed');
      assert.equal(f.chain.prepared.length, 2);
      await f.ens!.tick();
      assert.equal(f.chain.prepared.length, 3);
      assert.equal(f.chain.prepared[2].id, f.state().id, 'the older retry resumes after settlement');
    } finally { await f.close(); }
  });
}

test('known reverted transactions can be retried, while revoked permissions never broadcast', async () => {
  const f = await setup();
  try {
    await f.claim(); f.chain.permissionRevoked = true; await f.ens!.tick();
    assert.equal(f.chain.prepared.length, 0); assert.equal(f.state().errorCode, 'ens_permissions_not_ready');
    f.chain.permissionRevoked = false; await f.ens!.tick(); f.chain.revert = true; await f.ens!.tick();
    assert.equal(f.state().state, 'failed'); assert.equal(f.state().transactions[0].state, 'reverted');
    f.chain.revert = false;
    assert.equal((await f.request(`/shops/${f.shop.id}/ens/retry`, {method: 'POST', token: f.token, requestId: randomUUID(), body: {}})).status, 202);
    await f.advance(); assert.equal(f.state().state, 'active'); assert.equal(f.chain.prepared.length, 3);
  } finally { await f.close(); }
});
test('short links use ENS records, preserve approved pages and fail closed on identity mismatch or expired cache during outage', async () => {
  const f = await setup();
  try {
    await f.claim(); await f.advance(); const value = f.state();
    assert.equal(await f.ens!.redirect('coffee', `products/${seed}`), `/s/${f.shop.id}/products/${seed}`);
    const reads = f.chain.reads; await f.ens!.redirect('coffee', 'about'); assert.equal(f.chain.reads, reads);
    f.chain.outage = true; f.clock.value += f.config.ens.cacheMs + 1000;
    await assert.rejects(f.ens!.redirect('coffee', ''), (e: any) => e.status === 503);
    f.chain.outage = false;
    const patches: Record<string, string>[] = [{'com.merxet.account': bobId}, {'com.merxet.network': 'mainnet'}, {'com.merxet.catalog': 'evil'}, {url: 'https://evil.example/'}, {'com.merxet.shopId': randomUUID()}];
    for (const patch of patches) {
      f.chain.result = {resolver: value.resolver!, expiry: value.expiry!, records: {...recordsFor(value), ...patch}}; f.clock.value += f.config.ens.cacheMs + 1000;
      await assert.rejects(f.ens!.redirect('coffee', ''), (e: any) => e.status === 404);
    }
    f.chain.result = null; f.clock.value += f.config.ens.cacheMs + 1000; await assert.rejects(f.ens!.redirect('coffee', ''), (e: any) => e.status === 404);
    for (const path of ['../api', 'assets/main.js', 'source.tar.gz', 'products/%2f%2fexample.com']) await assert.rejects(f.ens!.redirect('coffee', path));
  } finally { await f.close(); }
});
test('resolver initialization gives only URL rights to operator, admin rights to admin, and removes temporary factory authority', async () => {
  const f = await setup();
  try {
    await f.claim(); const value = f.state();
    const init = resolverAbi.decodeFunctionData('initialize', resolverInitialization(value));
    assert.equal(init[0].toLowerCase(), DEPLOYMENTS.factory); assert.equal(init[1], resolverAdminRoles);
    const calls = [...init[2]].map(data => resolverAbi.parseTransaction({data})!);
    assert.deepEqual(calls.slice(0, TEXT_KEYS.length).map(call => call.args[1]), [...TEXT_KEYS]);
    assert.equal(calls.at(-3)!.name, 'grantRootRoles'); assert.equal(calls.at(-3)!.args[1].toLowerCase(), value.admin);
    assert.equal(calls.at(-2)!.name, 'authorizeTextRoles'); assert.equal(calls.at(-2)!.args[1], 'url'); assert.equal(calls.at(-2)!.args[2].toLowerCase(), value.operator);
    assert.equal(calls.at(-1)!.name, 'revokeRootRoles'); assert.equal(calls.at(-1)!.args[0], resolverAdminRoles); assert.equal(calls.at(-1)!.args[1].toLowerCase(), DEPLOYMENTS.factory);
  } finally { await f.close(); }
});

test('a failed name that was never registered can be replaced, but an uncertain registration cannot', async () => {
  const f = await setup();
  try {
    await f.claim(); f.chain.taken = true; await f.ens!.tick(); assert.equal(f.state().state, 'failed');
    f.chain.taken = false; assert.equal((await f.claim('another-shop')).status, 202);
    assert.equal(f.journal.list<EnsName>('ens-name', value => value.state === 'abandoned').length, 1);
    await f.ens!.tick(); f.chain.unknown = true; await f.ens!.tick();
    assert.equal((await f.claim('third-shop')).status, 409);
  } finally { await f.close(); }
});

test('the HTTP short link preserves only supported queries and never reaches private or unknown routes', async () => {
  const f = await setup();
  const server = f.publications!.delivery.app(f.ens!.redirect.bind(f.ens)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('Missing listener');
  f.config.publicOrigin = `http://127.0.0.1:${address.port}`;
  try {
    await f.claim(); await f.advance();
    const response = await fetch(`${f.config.publicOrigin}/coffee/products?q=olive&sort=price&redirect=https://evil.example`, {redirect: 'manual'});
    assert.equal(response.status, 302); assert.equal(response.headers.get('location'), `/s/${f.shop.id}/products?q=olive&sort=price`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    for (const path of ['coffee/build.log', 'coffee/assets/main.js', 'coffee/products/%2f%2fevil.example', 'unknown-shop', 'api', 's/not-a-shop']) {
      assert.equal((await fetch(`${f.config.publicOrigin}/${path}`, {redirect: 'manual'})).status, 404, path);
    }
    assert.equal((await fetch(`${f.config.publicOrigin}/coffee`, {method: 'POST'})).status, 405);
    f.chain.outage = true; f.clock.value += f.config.ens.cacheMs + 1000;
    assert.equal((await fetch(`${f.config.publicOrigin}/coffee`, {redirect: 'manual'})).status, 503);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await f.close(); }
});

for (const fails of [false, true]) {
  test(`stalled deduplicated ENS lookups preserve canonical delivery and release capacity after ${fails ? 'failure' : 'success'}`, async () => {
    const f = await setup(), delivery = f.publications!.delivery;
    let release!: () => void, allEntered!: () => void, entered = 0, lookups = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const saturated = new Promise<void>(resolve => { allEntered = resolve; });
    const server = delivery.app((label, file) => {
      const result = f.ens!.redirect(label, file);
      if (++entered === 32) allEntered();
      return result;
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw Error('Missing listener');
    f.config.publicOrigin = `http://127.0.0.1:${address.port}`;
    const requests: Promise<Response>[] = [];
    const request = async (path: string) => {
      const response = await fetch(`${f.config.publicOrigin}${path}`, {redirect: 'manual', signal: AbortSignal.timeout(5000)});
      await response.arrayBuffer();
      return response;
    };
    try {
      await f.claim(); await f.advance();
      const revisionId = f.shop.publishedRevisionId!, base = publicRevisionPath(f.journal.prefix, f.shop.id, revisionId);
      const files = new Map([
        ['index.html', Buffer.from('<html>Shop</html>')], ['storefront.json', jsonBytes(f.shop.config)],
        ['assets/main.js', Buffer.from('export default "shop";')],
      ]);
      const entries = [...files].map(([path, bytes]) => ({path, size: bytes.length, sha256: sha256(bytes)}));
      for (const [path, bytes] of files) await f.publicStore.putVerified(`${base}/${path}`, bytes);
      await f.store.putVerified(`${base}/ready.json`, jsonBytes({schemaVersion: 1, shopId: f.shop.id, revisionId, files: entries}));
      await f.store.putVerified(assetPath(f.journal.prefix, f.shop.id, 'assets/main.js'),
        jsonBytes({schemaVersion: 1, shopId: f.shop.id, revisionId, ...entries[2]}));

      const resolve = f.chain.resolve.bind(f.chain);
      f.chain.resolve = async value => {
        lookups++; await gate;
        if (fails) throw new ApiError(503, 'ens_rpc_unavailable');
        return resolve(value);
      };
      for (let i = 0; i < 32; i++) requests.push(request('/coffee'));
      await saturated;
      assert.equal(lookups, 1, 'all alias requests share one ENS lookup');
      assert.equal((await request('/coffee')).status, 503, 'alias requests remain bounded');
      for (const file of ['', 'assets/main.js']) {
        const response = await request(`/s/${f.shop.id}/${file}`);
        assert.equal(response.status, 200, 'stalled ENS requests must not consume canonical delivery capacity');
        assert.equal(response.headers.get('x-merxet-revision'), revisionId);
      }
      release();
      for (const response of await Promise.all(requests)) assert.equal(response.status, fails ? 503 : 302);
      f.chain.resolve = resolve;
      assert.equal((await request('/coffee')).status, 302, 'alias capacity is released after lookup completion');
    } finally {
      release(); await Promise.allSettled(requests);
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await f.close();
    }
  });
}

test('transaction settlement requires canonical receipts and two confirmations; consumed unknown nonces are never called failed', async () => {
  class ReceiptRpc extends EnsRpc {
    receipt: any = null; head = '0x65'; blockHash = '0xabc'; nonce = '0x5';
    async request<T = any>(method: string): Promise<T> {
      return ({eth_getTransactionReceipt: this.receipt, eth_blockNumber: this.head, eth_getBlockByNumber: {hash: this.blockHash}, eth_getTransactionCount: this.nonce} as any)[method];
    }
  }
  const rpc = new ReceiptRpc(''), config = loadConfig({}).ens, chain = new SepoliaEns(config, rpc);
  const tx: EnsTransaction = {phase: 'register', raw: '0x12', hash: keccak256('0x12'), nonce: 5, state: 'prepared', blockNumber: null};
  assert.equal((await chain.settle(tx)).state, 'pending'); rpc.nonce = '0x6'; assert.equal((await chain.settle(tx)).state, 'unknown');
  rpc.receipt = {blockNumber: '0x65', blockHash: '0xabc', status: '0x1'};
  assert.equal((await chain.settle(tx)).state, 'pending'); rpc.head = '0x66'; assert.equal((await chain.settle(tx)).state, 'confirmed');
  rpc.blockHash = '0xdef'; assert.equal((await chain.settle(tx)).state, 'pending');
  rpc.blockHash = '0xabc'; rpc.receipt.status = '0x0'; assert.equal((await chain.settle(tx)).state, 'reverted');
});

test('chain preparation signs the configured Sepolia operator, explicit nonce and exact intended calls without broadcasting', async () => {
  const f = await setup();
  class PrepareRpc extends EnsRpc {
    pending = '0x7'; fee = '0x3b9aca00'; methods: string[] = [];
    async request<T = any>(method: string, params: unknown[] = []): Promise<T> {
      this.methods.push(method);
      const values: Record<string, unknown> = {eth_getTransactionCount: params[1] === 'pending' ? this.pending : '0x7',
        eth_getBlockByNumber: {baseFeePerGas: this.fee}, eth_maxPriorityFeePerGas: '0x3b9aca00', eth_estimateGas: '0x493e0',
        eth_call: factoryAbi.encodeFunctionResult('deployProxy', ['0x' + '44'.repeat(20)])};
      assert.ok(method in values, `Unexpected RPC ${method}`); return values[method] as T;
    }
  }
  try {
    await f.claim(); const value = f.state(), rpc = new PrepareRpc('');
    const chain = new SepoliaEns(f.config.ens, rpc);
    chain.ready = async () => ({expiry: 1883784804}); chain.available = async () => true;
    const first = await chain.prepare(value), transaction = Transaction.from(first.transaction.raw);
    assert.equal(transaction.chainId, 11155111n); assert.equal(transaction.nonce, 7); assert.equal(transaction.from!.toLowerCase(), f.config.ens.operator);
    assert.equal(transaction.to!.toLowerCase(), DEPLOYMENTS.factory); assert.equal(transaction.hash, first.transaction.hash);
    assert.equal(factoryAbi.parseTransaction({data: transaction.data})!.name, 'deployProxy');
    const next = await chain.prepare({...value, resolver: first.resolver, expiry: first.expiry, transactions: [{...first.transaction, state: 'confirmed'}]});
    const registration = Transaction.from(next.transaction.raw), args = registryAbi.decodeFunctionData('register', registration.data);
    assert.equal(args[0], 'coffee'); assert.equal(args[1].toLowerCase(), value.admin); assert.equal(args[3].toLowerCase(), first.resolver);
    assert.ok(!rpc.methods.includes('eth_sendRawTransaction'));
    rpc.pending = '0x8'; await assert.rejects(chain.prepare(value), (e: any) => e.code === 'ens_operator_busy');
    rpc.pending = '0x7'; rpc.fee = '0x2540be40000'; await assert.rejects(chain.prepare(value), (e: any) => e.code === 'ens_fee_limit');
  } finally { await f.close(); }
});
