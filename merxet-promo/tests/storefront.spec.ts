import {test, expect} from '@playwright/test';
import {mockCatalog, pantry} from './catalogMocks';
import studio from '../template/fixtures/studio.json' with {type: 'json'};

test('homepage, product browsing, search, collections and direct reload', async ({page}, info) => {
  const catalog = await mockCatalog(page);
  await page.goto('/storefront');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('A little discovery. Every day.');
  await expect(page.locator('.shop-product-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path: `../output/playwright/storefront-${info.project.name}.png`, fullPage: true});
  await page.getByRole('link', {name: 'View all products'}).click();
  await page.getByRole('searchbox', {name: 'Search products'}).fill('olive');
  await expect(page.locator('.shop-product-card')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('olive');
  await page.getByRole('searchbox').fill('no matching item');
  await expect(page.getByRole('heading', {name: 'No matching products'})).toBeVisible();
  await page.getByRole('button', {name: 'Clear search'}).click();
  await page.getByRole('combobox', {name: 'Collection', exact: true}).selectOption('drinks');
  await expect(page.getByRole('heading', {name: 'Drinks', exact: true})).toBeVisible();
  await expect(page.locator('.shop-product-card')).toHaveCount(1);
  await page.getByRole('link', {name: 'View Cardo Red Wine 2023'}).click();
  await page.reload();
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Cardo Red Wine 2023');
  expect(catalog.metadataRequests).toBe(3); // Initial load and two reloads; section/page navigation shares the catalog.
});

test('buyer link and accessible QR dialog preserve explicit shop identity', async ({page, context}) => {
  await mockCatalog(page);
  await page.addInitScript(() => localStorage.setItem('MerxetPromo-network', 'mainnet'));
  const id = pantry.products[0].ProductId;
  const expectedUrl = `https://app.merxet.com/#${pantry.catalogSeed}${id}2`;
  await page.goto(`/storefront/products/${id}?network=mainnet&seed=another-catalog`);
  await expect(page.getByRole('link', {name: 'Open in Merxet', exact: true})).toHaveAttribute('href', expectedUrl);
  await expect(page.locator('.shop-detail-price')).toHaveText('1.25 USDC');
  await page.getByRole('button', {name: 'Show product QR code'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img', {name: 'Product QR code'})).toHaveAttribute('data-buyer-url', expectedUrl);
  await expect(dialog.getByRole('textbox', {name: 'Product link'})).toHaveValue(expectedUrl);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await dialog.getByRole('button', {name: 'Copy link'}).click();
  await expect(dialog.getByRole('status')).toHaveText('Link copied');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', {name: 'Show product QR code'})).toBeFocused();
});

test('mobile top navigation supports keyboard dismissal and links', async ({page}, info) => {
  test.skip(info.project.name !== 'mobile', 'Mobile menu is used at the narrow viewport');
  await mockCatalog(page);
  await page.goto('/storefront');
  const trigger = page.getByRole('button', {name: 'Open navigation'});
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('navigation', {name: 'Mobile navigation'}).getByRole('link', {name: 'The pantry'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', {name: 'The pantry', exact: true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('catalog failures can be retried and refreshed products replace snapshots', async ({page}) => {
  let fail = true;
  let products = pantry.products;
  await mockCatalog(page, {failMetadata: () => fail, getProducts: () => products});
  await page.goto('/storefront/products');
  await expect(page.getByRole('alert')).toContainText('Products are unavailable');
  fail = false;
  await page.getByRole('button', {name: 'Try again'}).click();
  await expect(page.locator('.shop-product-card')).toHaveCount(3);
  products = [{...pantry.products[0], Price: '2500000'}, {...pantry.products[1], ProductId: 'FFFFFFFFFFFFFFFFFFFFFF', Name: 'New catalog product'}];
  await page.getByRole('button', {name: 'Refresh products'}).click();
  await expect(page.locator('.shop-product-card')).toHaveCount(2);
  await expect(page.getByText('2.5 USDC', {exact: true})).toBeVisible();
  await expect(page.getByRole('link', {name: 'View New catalog product'})).toBeVisible();
  await page.goto(`/storefront/products/${pantry.products[2].ProductId}`);
  await expect(page.getByRole('heading', {name: 'Product unavailable'})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Open in Merxet', exact: true})).toHaveCount(0);
});

test('contrasting shop config, missing images and unknown routes', async ({page}) => {
  await page.route('**/storefront.json', route => route.fulfill({json: studio.config}));
  await mockCatalog(page, {seed: studio.config.catalogSeed, getProducts: () => studio.products});
  await page.goto('/storefront');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Wear it your way.');
  await page.goto('/storefront/products/EEEEEEEEEEEEEEEEEEEEEE');
  await expect(page.getByRole('img', {name: 'Image unavailable for Canvas Tote'})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Open in Merxet', exact: true})).toHaveAttribute('href', `https://app.merxet.com/#${studio.config.catalogSeed}EEEEEEEEEEEEEEEEEEEEEE2`);
  await page.goto('/storefront/collections/missing');
  await expect(page.getByRole('heading', {name: 'Page not found'})).toBeVisible();
  await page.goto('/storefront/unknown/page');
  await expect(page.getByRole('heading', {name: 'Page not found'})).toBeVisible();
});

test('invalid config, malformed catalog and failed images have usable states', async ({page}) => {
  await page.route('**/storefront.json', route => route.fulfill({json: {schemaVersion: 1}}));
  await page.goto('/storefront');
  await expect(page.getByRole('heading', {name: 'Shop unavailable'})).toBeVisible();
  await page.unroute('**/storefront.json');
  await mockCatalog(page, {getProducts: () => [{...pantry.products[0], Price: 'invalid'}]});
  await page.getByRole('button', {name: 'Try again'}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.route('https://fixtures.merxet.test/catalog.json', route => route.fulfill({json: pantry.products}));
  await page.route('https://fixtures.merxet.test/oil.svg', route => route.fulfill({status: 404}));
  await page.goto(`/storefront/products/${pantry.products[0].ProductId}`);
  await expect(page.getByRole('img', {name: 'Image unavailable for Extra Virgin Olive Oil'})).toBeVisible();
});

test('empty live catalog is explicit and existing promo seed/query URLs still work', async ({page}) => {
  let products = [] as typeof pantry.products;
  await mockCatalog(page, {getProducts: () => products});
  await page.goto('/storefront/products');
  await expect(page.getByRole('heading', {name: 'No products here yet'})).toBeVisible();
  products = pantry.products;
  for (const url of [`/${pantry.catalogSeed}?n=testnet`, `/?seed=${pantry.catalogSeed}&network=testnet`]) {
    await page.goto(url);
    await expect(page.locator('.promo-catalogue')).toBeVisible();
    await expect(page.locator('#merxet-catalog-data')).toHaveAttribute('href', `https://sync.merxet.com/api/v1/t/catalogs/seed/${pantry.catalogSeed}`);
    await expect(page.locator('.shop-root')).toHaveCount(0);
  }
  await page.goto('/about');
  await expect(page.locator('#merxet-ai-ordering')).toBeHidden();
});
