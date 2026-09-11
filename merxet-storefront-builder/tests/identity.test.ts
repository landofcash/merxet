import test from 'node:test';
import assert from 'node:assert/strict';
import {MerxetIdentity} from '../src/auth/identity.ts';
import {loadConfig} from '../src/config.ts';
import {alice, aliceId, bob, seed} from './helpers.ts';

test('identity uses current ECDSA account key and network endpoint, never the immutable EVM alias', async () => {
  const config = loadConfig({});
  const calls: Array<{url: string; init?: RequestInit}> = [];
  let response: unknown = {account: aliceId, deleted: false, evm_address: bob.address, key: {_type: 'ECDSA_SECP256K1', key: alice.signingKey.compressedPublicKey.slice(2)}};
  const identity = new MerxetIdentity(config, (async (url, init) => { calls.push({url: String(url), init}); return Response.json(response); }) as typeof fetch);
  assert.equal((await identity.account('testnet', aliceId)).signerAddress, alice.address.toLowerCase());
  assert.equal(calls[0].url, `${config.mirrorOrigins.testnet}/api/v1/accounts/${aliceId}?transactions=false`);
  assert.equal(calls[0].init?.redirect, 'error');
  response = {account: aliceId, deleted: false, evm_address: alice.address, key: {_type: 'ECDSA_SECP256K1', key: bob.signingKey.compressedPublicKey.slice(2)}};
  assert.equal((await identity.account('mainnet', aliceId)).signerAddress, bob.address.toLowerCase());
  assert.match(calls[1].url, /^https:\/\/mainnet-public\.mirrornode\.hedera\.com\//);
  for (const invalid of [
    {account: aliceId, deleted: true, key: {_type: 'ECDSA_SECP256K1', key: alice.signingKey.compressedPublicKey.slice(2)}},
    {account: aliceId, deleted: false, key: {_type: 'ED25519', key: '11'.repeat(32)}},
    {account: aliceId, deleted: false, key: {_type: 'ProtobufEncoded', key: '11'.repeat(32)}},
    {account: '0.0.1002', deleted: false, key: {_type: 'ECDSA_SECP256K1', key: alice.signingKey.compressedPublicKey.slice(2)}},
    {account: aliceId, evm_address: alice.address, deleted: false, key: null},
  ]) { response = invalid; await assert.rejects(identity.account('testnet', aliceId), {code: 'unsupported_or_inactive_account'}); }
});

test('catalog ownership requires exact network, seed and account; provider errors fail closed', async () => {
  let response = Response.json({success: true, data: {catalogSeed: seed, sellerAccountId: aliceId}}), requested = '';
  const identity = new MerxetIdentity(loadConfig({}), (async url => { requested = String(url); return response; }) as typeof fetch);
  await identity.assertCatalogOwner('testnet', seed, aliceId);
  assert.equal(requested, `https://sync.merxet.com/api/v1/testnet/catalogs/seed/${seed}`);
  response = Response.json({success: true, data: {catalogSeed: seed, sellerAccountId: '0.0.1002'}});
  await assert.rejects(identity.assertCatalogOwner('testnet', seed, aliceId), {code: 'catalog_not_owned'});
  response = Response.json({success: true, data: {catalogSeed: 'wrong-seed', sellerAccountId: aliceId}});
  await assert.rejects(identity.assertCatalogOwner('testnet', seed, aliceId), {code: 'catalog_identity_invalid'});
  response = new Response('', {status: 503});
  await assert.rejects(identity.assertCatalogOwner('testnet', seed, aliceId), {code: 'identity_provider_unavailable'});
  response = new Response('x'.repeat(129 * 1024));
  await assert.rejects(identity.account('testnet', aliceId), {code: 'identity_provider_invalid_response'});
});
