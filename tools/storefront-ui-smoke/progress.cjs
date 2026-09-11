async (page) => {
  await page.reload(); await page.getByRole('button', {name: 'Sign in with wallet'}).click();
  await page.getByRole('link', {name: /The Everyday Pantry Good ingredients/}).click();
  await page.getByRole('link', {name: 'Open preview in new tab'}).waitFor();
  if (await page.locator('.storefront-design-panel.is-collapsed').count()) await page.locator('.storefront-workspace-header').getByRole('button', {name: 'Show Design panel'}).click();
  await page.getByRole('textbox', {name: 'What would you like to change?'}).fill('Keep this build running while I reload the workspace.');
  await page.getByRole('button', {name: 'Generate revision', exact: true}).click();
  await page.getByText('Creating design', {exact: true}).waitFor();
  await page.reload(); await page.getByRole('button', {name: 'Sign in with wallet'}).click();
  await page.getByText('Creating design', {exact: true}).waitFor();
  await page.getByRole('button', {name: 'Draft 4 ready — View'}).waitFor({timeout: 30000});
  if (await page.locator('.storefront-request').count() !== 6) throw new Error('Active job was lost or duplicated after reload');
  console.log('Active generation survived reload/sign-in and finished as the same job.');
}
