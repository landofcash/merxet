async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const selector = page.getByRole('combobox', {name: 'Preview revision'}), firstId = await selector.locator('option').first().getAttribute('value');
  await selector.selectOption(firstId); await page.getByText('Based on Draft 1', {exact: true}).waitFor();
  await page.frameLocator('iframe').locator('.shop-product-card').first().waitFor();
  const frame = page.frames().find(value => value.url().includes(':4183/'));
  await frame.evaluate(() => { window.__phase5Marker = 'older-draft'; });
  const posts = [];
  await page.route('http://127.0.0.1:4182/api/v1/testnet/shops/*/jobs', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts.push({key: route.request().headers()['idempotency-key'], body: route.request().postData()});
    const response = await route.fetch();
    if (posts.length === 1) return route.abort('failed'); // Accepted on server; simulate lost response.
    return route.fulfill({response});
  });
  await page.getByRole('textbox', {name: 'What would you like to change?'}).fill('Refine the spacing from the first draft.');
  await page.getByRole('button', {name: 'Generate revision', exact: true}).click();
  await page.getByRole('button', {name: 'Retry request', exact: true}).waitFor();
  check(await page.getByRole('textbox', {name: 'What would you like to change?'}).isDisabled(), 'Ambiguous request must retain its payload');
  await page.getByRole('button', {name: 'Retry request', exact: true}).click();
  await page.getByRole('button', {name: 'Draft 3 ready — View'}).waitFor({timeout: 30000});
  check(posts.length === 2 && posts[0].key === posts[1].key && posts[0].body === posts[1].body, 'Retry must reuse the exact request and key');
  check(JSON.parse(posts[0].body).baseRevisionId === firstId, 'An older draft must be the requested base');
  check(await page.locator('.storefront-request').count() === 3, 'Lost response must not create a duplicate job');
  check(await selector.inputValue() === firstId, 'Selected old draft must stay selected');
  check(await frame.evaluate(() => window.__phase5Marker) === 'older-draft', 'Older preview must remain mounted');
  await page.unroute('http://127.0.0.1:4182/api/v1/testnet/shops/*/jobs');
  await page.getByRole('textbox', {name: 'What would you like to change?'}).fill('Please fail this fixture build.');
  await page.getByRole('button', {name: 'Generate revision', exact: true}).click();
  await page.getByText('Generation failed', {exact: true}).waitFor({timeout: 30000});
  check(await frame.evaluate(() => window.__phase5Marker) === 'older-draft', 'Failure must retain the current preview');
  await page.getByRole('button', {name: 'Retry generation', exact: true}).click();
  await page.getByRole('button', {name: 'Cancel', exact: true}).waitFor();
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByText('Canceled', {exact: true}).waitFor();
  await page.screenshot({path: 'output/playwright/phase5-failure-retry.png'});
  console.log('Recovery checks passed: exact idempotent retry, older draft base, no duplicate job, failure retention, retry and cancellation.');
}
