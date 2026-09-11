async (page) => {
  const seed = 'AAAAAAAAAAAAAAAAAAAAAA';
  const products = [
    {ProductId: 'lIZWNPYBR6aCU0P8t0rZNA', Name: 'Extra Virgin Olive Oil', Description: 'For the everyday table.', PriceToken: '0.0.429274', Price: '1250000', Image: 'https://fixtures.merxet.test/oil.svg'},
    {ProductId: 'mzIElBYKQW2MprZU3iSVTg', Name: 'Cardo Red Wine 2023', Description: 'A bottle from our collection.', PriceToken: '0.0.0', Price: '150000000', Image: 'https://fixtures.merxet.test/wine.svg'},
    {ProductId: 'xsuTwqBDRm-z10IuScaJ2g', Name: 'Portuguese Sardines', Description: 'From the pantry.', PriceToken: '0.0.0', Price: '224000000', Image: 'https://fixtures.merxet.test/sardines.svg'},
  ];
  await page.context().route('https://sync.merxet.com/**', route => route.fulfill({json: {success: true, data: route.request().url().includes('/catalogs/seed/')
    ? {catalogSeed: seed, catalogUrl: 'https://merxet.b-cdn.net/ui-smoke/catalog.json', sellerAccountId: '0.0.1001', sellerPublicKey: 'fixture'}
    : {catalogs: [{seed, shopWallet: '0.0.1001', catalogUrl: 'https://merxet.b-cdn.net/ui-smoke/catalog.json', version: 1}]}}}));
  await page.context().route('https://merxet.b-cdn.net/ui-smoke/catalog.json', route => route.fulfill({json: products}));
  await page.context().route('https://fixtures.merxet.test/*.svg', route => route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#eeeadf"/><rect x="112" y="65" width="76" height="180" rx="12" fill="#7f9170"/><rect x="125" y="35" width="50" height="45" rx="4" fill="#29483a"/></svg>'}));
  await page.setViewportSize({width: 1440, height: 1000});
}
