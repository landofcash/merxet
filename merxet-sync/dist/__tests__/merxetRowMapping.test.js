"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const seed_js_1 = require("../seed.js");
const merxetRowMapping_js_1 = require("../merxetRowMapping.js");
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
(0, node_test_1.default)('mapCatalogRowToCacheEntry maps named ABI fields and does not require tuple indices', () => {
    const seedBytes32 = (0, seed_js_1.seedStringToBytes32)('catalog-1');
    const row = {
        version: 1,
        seller: '0x1111111111111111111111111111111111111111',
        sellerPubKey: '0x1234',
        catalogUrl: 'ipfs://example',
    };
    const mapped = (0, merxetRowMapping_js_1.mapCatalogRowToCacheEntry)(seedBytes32, row);
    strict_1.default.ok(mapped);
    strict_1.default.equal(mapped.seed, 'catalog-1');
    strict_1.default.equal(mapped.version, 1);
    strict_1.default.equal(mapped.sellerWallet, row.seller);
    strict_1.default.equal(mapped.catalogUrl, row.catalogUrl);
    strict_1.default.equal(mapped.sellerPubKey, Buffer.from('1234', 'hex').toString('base64'));
});
(0, node_test_1.default)('mapCatalogRowToCacheEntry returns null when seller is missing/zero', () => {
    const seedBytes32 = (0, seed_js_1.seedStringToBytes32)('catalog-2');
    strict_1.default.equal((0, merxetRowMapping_js_1.mapCatalogRowToCacheEntry)(seedBytes32, { version: 1 }), null);
    strict_1.default.equal((0, merxetRowMapping_js_1.mapCatalogRowToCacheEntry)(seedBytes32, { seller: ZERO_ADDR }), null);
});
(0, node_test_1.default)('mapCatalogRowToCacheEntry does not accept legacy field names (shop/catalogueUrl)', () => {
    const seedBytes32 = (0, seed_js_1.seedStringToBytes32)('catalog-3');
    const legacyRow = {
        version: 1,
        shop: '0x1111111111111111111111111111111111111111',
        catalogueUrl: 'ipfs://legacy',
    };
    strict_1.default.equal((0, merxetRowMapping_js_1.mapCatalogRowToCacheEntry)(seedBytes32, legacyRow), null);
});
(0, node_test_1.default)('mapOrderRowToCacheEntry maps named ABI fields and normalizes payer when zero', () => {
    const orderSeedBytes32 = (0, seed_js_1.seedStringToBytes32)('order-1');
    const catalogSeedBytes32 = (0, seed_js_1.seedStringToBytes32)('cat-seed');
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
    const mapped = (0, merxetRowMapping_js_1.mapOrderRowToCacheEntry)(orderSeedBytes32, row);
    strict_1.default.ok(mapped);
    strict_1.default.equal(mapped.seed, 'order-1');
    strict_1.default.equal(mapped.buyerWallet, row.buyer);
    strict_1.default.equal(mapped.sellerWallet, row.seller);
    strict_1.default.equal(mapped.catalogSeed, 'cat-seed');
    strict_1.default.equal(mapped.priceToken, row.priceToken);
    strict_1.default.equal(mapped.price, 123n);
    strict_1.default.equal(mapped.amount, 123n);
    strict_1.default.equal(mapped.payer, '');
    strict_1.default.equal(mapped.createdDate, 10n);
    strict_1.default.equal(mapped.updatedDate, 20n);
});
(0, node_test_1.default)('mapOrderRowToCacheEntry returns null when buyer is missing/zero', () => {
    const orderSeedBytes32 = (0, seed_js_1.seedStringToBytes32)('order-2');
    strict_1.default.equal((0, merxetRowMapping_js_1.mapOrderRowToCacheEntry)(orderSeedBytes32, { buyer: ZERO_ADDR }), null);
    strict_1.default.equal((0, merxetRowMapping_js_1.mapOrderRowToCacheEntry)(orderSeedBytes32, {}), null);
});
(0, node_test_1.default)('mapOrderRowToCacheEntry does not accept legacy field names (catalogueSeed)', () => {
    const orderSeedBytes32 = (0, seed_js_1.seedStringToBytes32)('order-3');
    const row = {
        buyer: '0x4444444444444444444444444444444444444444',
        seller: '0x3333333333333333333333333333333333333333',
        catalogueSeed: (0, seed_js_1.seedStringToBytes32)('legacy'),
    };
    const mapped = (0, merxetRowMapping_js_1.mapOrderRowToCacheEntry)(orderSeedBytes32, row);
    strict_1.default.ok(mapped);
    strict_1.default.equal(mapped.catalogSeed, '');
});
//# sourceMappingURL=merxetRowMapping.test.js.map