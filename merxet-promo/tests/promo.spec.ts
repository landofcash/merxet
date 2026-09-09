import {test, expect} from '@playwright/test';
import {mockCatalog, pantry} from './catalogMocks';

test('existing promo seed/query URLs, catalog descriptor and about page still work', async ({page}, info) => {
  await mockCatalog(page);
  for (const url of [`/${pantry.catalogSeed}?n=testnet`, `/?seed=${pantry.catalogSeed}&network=testnet`]) {
    await page.goto(url);
    await expect(page.locator('.promo-catalogue')).toBeVisible();
    await expect(page.locator('#merxet-catalog-data')).toHaveAttribute('href', `https://sync.merxet.com/api/v1/t/catalogs/seed/${pantry.catalogSeed}`);
    await expect(page.locator('.shop-root')).toHaveCount(0);
  }
  await page.screenshot({path: `output/playwright/promo-${info.project.name}.png`, fullPage: true});
  await page.goto('/about');
  await expect(page.locator('#merxet-ai-ordering')).toBeHidden();
});
