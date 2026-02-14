import test from 'node:test';
import assert from 'node:assert/strict';

import { seedStringToBytes32 } from '../seed.js';
import { mapCatalogRowToCacheEntry, mapOrderRowToCacheEntry } from '../merxetRowMapping.js';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

test('mapCatalogRowToCacheEntry maps named ABI fields and does not require tuple indices', () => {
  const seedBytes32 = seedStringToBytes32('catalog-1');
  const row = {
    version: 1,
    seller: '0x1111111111111111111111111111111111111111',
    sellerPubKey: '0x1234',
    catalogUrl: 'ipfs://example',
  };

  const mapped = mapCatalogRowToCacheEntry(seedBytes32, row);
  assert.ok(mapped);
  assert.equal(mapped.seed, 'catalog-1');
  assert.equal(mapped.version, 1);
  assert.equal(mapped.sellerWallet, row.seller);
  assert.equal(mapped.catalogUrl, row.catalogUrl);
  assert.equal(mapped.sellerPubKey, Buffer.from('1234', 'hex').toString('base64'));
});

test('mapCatalogRowToCacheEntry returns null when seller is missing/zero', () => {
  const seedBytes32 = seedStringToBytes32('catalog-2');
  assert.equal(mapCatalogRowToCacheEntry(seedBytes32, { version: 1 }), null);
  assert.equal(mapCatalogRowToCacheEntry(seedBytes32, { seller: ZERO_ADDR }), null);
});

test('mapCatalogRowToCacheEntry does not accept legacy field names (shop/catalogueUrl)', () => {
  const seedBytes32 = seedStringToBytes32('catalog-3');
  const legacyRow = {
    version: 1,
    shop: '0x1111111111111111111111111111111111111111',
    catalogueUrl: 'ipfs://legacy',
  };
  assert.equal(mapCatalogRowToCacheEntry(seedBytes32, legacyRow), null);
});

test('mapOrderRowToCacheEntry maps named ABI fields and normalizes payer when zero', () => {
  const orderSeedBytes32 = seedStringToBytes32('order-1');
  const catalogSeedBytes32 = seedStringToBytes32('cat-seed');
  const row = {
    version: 1,
    catalogSeed: catalogSeedBytes32,
    status: 2,
    priceAmount: 123n,
    priceToken: '0x2222222222222222222222222222222222222222',
    seller: '0x3333333333333333333333333333333333333333',
    buyer: '0x4444444444444444444444444444444444444444',
    payer: ZERO_ADDR,
    buyerPubKey: '0x',
    sellerPubKey: '0x',
    encSymKeyBuyer: '0x',
    encSymKeySeller: '0x',
    symKeyHash: '0x' + '00'.repeat(32),
    payloadHashBuyer: '0x' + '11'.repeat(32),
    payloadHashSeller: '0x' + '22'.repeat(32),
    createdTs: 10n,
    updatedTs: 20n,
  };

  const mapped = mapOrderRowToCacheEntry(orderSeedBytes32, row);
  assert.ok(mapped);
  assert.equal(mapped.seed, 'order-1');
  assert.equal(mapped.buyerWallet, row.buyer);
  assert.equal(mapped.sellerWallet, row.seller);
  assert.equal(mapped.catalogSeed, 'cat-seed');
  assert.equal(mapped.priceToken, row.priceToken);
  assert.equal(mapped.price, 123n);
  assert.equal(mapped.amount, 123n);
  assert.equal(mapped.payer, '');
  assert.equal(mapped.createdDate, 10n);
  assert.equal(mapped.updatedDate, 20n);
});

test('mapOrderRowToCacheEntry returns null when buyer is missing/zero', () => {
  const orderSeedBytes32 = seedStringToBytes32('order-2');
  assert.equal(mapOrderRowToCacheEntry(orderSeedBytes32, { buyer: ZERO_ADDR }), null);
  assert.equal(mapOrderRowToCacheEntry(orderSeedBytes32, {}), null);
});

test('mapOrderRowToCacheEntry does not accept legacy field names (catalogueSeed)', () => {
  const orderSeedBytes32 = seedStringToBytes32('order-3');
  const row = {
    buyer: '0x4444444444444444444444444444444444444444',
    seller: '0x3333333333333333333333333333333333333333',
    catalogueSeed: seedStringToBytes32('legacy'),
  };
  const mapped = mapOrderRowToCacheEntry(orderSeedBytes32, row);
  assert.ok(mapped);
  assert.equal(mapped.catalogSeed, '');
});
