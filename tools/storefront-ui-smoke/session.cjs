async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.reload(); await page.getByRole('button', {name: 'Sign in with wallet'}).click();
  await page.getByRole('link', {name: 'Open preview in new tab'}).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.storefront-workspace-header').getByRole('button', {name: 'Refresh preview', exact: true}).click();
  await page.getByRole('link', {name: 'Open preview in new tab'}).waitFor();
  await page.frameLocator('iframe').locator('.shop-product-card').first().waitFor();
  const frame = page.frames().find(value => value.url().includes(':4183/'));
  check(await frame.evaluate(() => { try { void parent.document.body; return false; } catch { return true; } }), 'Generated code must not access the seller document');
  await page.setViewportSize({width: 390, height: 844});
  if (await page.locator('.storefront-design-panel.is-collapsed').count()) await page.locator('.storefront-workspace-header').getByRole('button', {name: 'Show Design panel'}).click();
  await page.screenshot({path: 'output/playwright/phase5-mobile-panel.png'});
  await page.getByRole('button', {name: 'Collapse Design panel'}).click();
  await page.screenshot({path: 'output/playwright/phase5-mobile-preview.png'});
  await page.getByRole('button', {name: 'Wallet menu'}).click();
  await page.getByRole('button', {name: 'MAINNET', exact: true}).click();
  await page.getByRole('button', {name: 'Sign in with wallet'}).waitFor();
  check(await page.locator('iframe').count() === 0, 'Network change must clear old previews');
  await page.getByRole('button', {name: 'Sign in with wallet'}).click();
  await page.getByText('Storefronts are not enabled on this network yet.', {exact: true}).waitFor();
  await page.getByRole('button', {name: 'Wallet menu'}).click();
  await page.getByRole('button', {name: 'TESTNET', exact: true}).click();
  await page.getByRole('button', {name: 'Sign in with wallet'}).click();
  await page.getByRole('link', {name: 'Open preview in new tab'}).waitFor();
  const oldPreview = await page.getByRole('link', {name: 'Open preview in new tab'}).getAttribute('href');
  await page.getByRole('button', {name: 'Wallet menu'}).click();
  await page.getByRole('button', {name: 'Disconnect', exact: true}).click(); // Fixture switches to second public test wallet.
  await page.getByRole('button', {name: 'Sign in with wallet'}).waitFor();
  check(await page.locator('iframe').count() === 0, 'Account change must clear old previews');
  await page.getByRole('button', {name: 'Sign in with wallet'}).click();
  await page.getByRole('alert').filter({hasText: 'This storefront was not found for your wallet and network.'}).waitFor();
  check((await page.request.get(oldPreview)).status() === 401, 'Account change must revoke the old preview session');
  await page.getByRole('link', {name: 'Back to Storefronts'}).click();
  await page.getByRole('heading', {name: 'A new home for your products'}).waitFor();
  check(await page.getByRole('heading', {name: 'The Everyday Pantry', exact: true}).count() === 0, 'Second seller must not see the first seller shop');
  console.log('Session checks passed: refresh, origin isolation, network reset, unsupported network, account reset, grant revocation and owner isolation.');
}
