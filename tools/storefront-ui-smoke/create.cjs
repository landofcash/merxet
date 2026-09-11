async (page) => {
  await page.getByRole('button', {name: 'Create storefront', exact: true}).first().click();
  await page.getByLabel('Shop name', {exact: true}).fill('The Everyday Pantry');
  await page.getByLabel('Short description', {exact: true}).fill('Good ingredients and little discoveries for the everyday table.');
  await page.getByLabel('Design brief').fill('A warm, minimal pantry with cream backgrounds and generous product photos.');
  await page.getByRole('button', {name: 'Create and open workspace'}).click();
  await page.getByRole('button', {name: 'Generate storefront', exact: true}).waitFor();
  await page.screenshot({path: 'output/playwright/phase5-before-generation.png'});
  await page.getByRole('button', {name: 'Generate storefront', exact: true}).click();
  await page.getByText('Creating design', {exact: true}).waitFor();
  await page.screenshot({path: 'output/playwright/phase5-generating.png'});
}
