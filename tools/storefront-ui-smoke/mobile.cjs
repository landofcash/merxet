async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.setViewportSize({width: 390, height: 844});
  await page.getByRole('button', {name: 'Mobile preview', exact: true}).click();
  const bounds = await page.locator('.storefront-design-panel').boundingBox();
  check(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844, 'Mobile sheet must remain in viewport');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile workspace must not overflow');
  await page.screenshot({path: 'output/playwright/phase5-mobile-panel.png'});
  await page.getByRole('button', {name: 'Collapse Design panel', exact: true}).click();
  await page.screenshot({path: 'output/playwright/phase5-mobile-preview.png'});
  await page.reload(); await page.getByRole('button', {name: 'Sign in with wallet'}).waitFor();
  await page.getByRole('button', {name: 'Sign in with wallet'}).click();
  await page.locator('.storefront-design-panel.is-collapsed').waitFor();
  await page.locator('.storefront-workspace-header').getByRole('button', {name: 'Show Design panel'}).click();
  await page.getByRole('button', {name: 'Draft 3 ready — View'}).waitFor();
  check(await page.locator('.storefront-request').count() === 5, 'Reload must restore accepted job history');
  check(await page.getByRole('combobox', {name: 'Preview revision'}).locator('option').count() === 3, 'Reload must restore revision history');
  await page.setViewportSize({width: 1100, height: 650});
  const box = await page.locator('.storefront-design-panel').boundingBox();
  check(box.x >= 0 && box.y >= 64 && box.x + box.width <= 1100 && box.y + box.height <= 650, 'Resized panel must stay reachable');
  await page.getByRole('button', {name: 'Reset panel position'}).click();
  await page.getByRole('button', {name: 'Move Design panel'}).focus();
  const before = await page.locator('.storefront-design-panel').boundingBox(); await page.keyboard.press('ArrowRight');
  const after = await page.locator('.storefront-design-panel').boundingBox(); check(after.x === before.x + 20, 'Keyboard movement must work');
  await page.getByRole('button', {name: 'Wallet menu'}).click();
  console.log('Mobile sheet, collapse persistence, authenticated reload/history restoration, resize bounds and keyboard movement passed.');
}
