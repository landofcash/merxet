import type {Page} from '@playwright/test';
import pantry from '../template/fixtures/pantry.json' with {type: 'json'};

export {pantry};
export async function mockCatalog(page: Page, options: {seed?: string; getProducts?: () => unknown; failMetadata?: () => boolean} = {}) {
  let metadataRequests = 0;
  const seed = options.seed || pantry.catalogSeed;
  await page.route('https://sync.merxet.com/**/catalogs/seed/**', route => {
    metadataRequests++;
    if (!route.request().url().endsWith('/' + seed)) return route.fulfill({status: 404, json: {success: false}});
    if (options.failMetadata?.()) return route.fulfill({status: 503, json: {success: false}});
    return route.fulfill({json: {success: true, data: {catalogSeed: seed, catalogUrl: 'https://fixtures.merxet.test/catalog.json', sellerAccountId: '0.0.8305575', sellerPublicKey: 'public-fixture'}}});
  });
  await page.route('https://fixtures.merxet.test/catalog.json', route => route.fulfill({json: options.getProducts?.() ?? pantry.products}));
  await page.route('https://fixtures.merxet.test/*.svg', route => route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#eeeadf"/><rect x="112" y="65" width="76" height="180" rx="12" fill="#7f9170"/><rect x="125" y="35" width="50" height="45" rx="4" fill="#29483a"/><rect x="119" y="140" width="62" height="60" fill="#faf5e4"/></svg>'}));
  await page.route('https://*.mirrornode.hedera.com/api/v1/accounts/*', route => route.fulfill({json: {account: '0.0.8305575', evm_address: '0x00000000000000000000000000000000007ebc27'}}));
  return {get metadataRequests() { return metadataRequests; }};
}
