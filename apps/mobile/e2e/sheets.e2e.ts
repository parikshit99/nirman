import { expect, test, type Locator, type Page } from '@playwright/test';

/** A sheet fits the screen and nothing covers it (so one opened from another sheet is on top). */
async function expectOnTop(page: Page, sheet: Locator) {
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(300); // let it finish sliding in
  const box = (await sheet.boundingBox())!;
  const { width, height } = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
  const covered = await sheet.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 40));
    return !hit || !el.contains(hit);
  });
  expect(covered, 'sheet is covered by something else').toBe(false);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: /skip for now/i }).click();
});

test('sheets open on top and fit at 320 px', async ({ page }) => {
  await page.getByRole('button', { name: /add item manually/i }).click();
  await page.getByLabel('Item name').fill('OPC Cement 53 grade');
  await page.getByLabel('Quantity').fill('50');
  await page.getByLabel('Rate').fill('385');
  await page.getByRole('button', { name: /^add to/i }).click();
  await page.getByLabel('Close manual entry').click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectOnTop(page, page.getByRole('dialog'));
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expectOnTop(page, page.getByRole('dialog', { name: 'Share purchase list' }));
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Clearing asks first: the confirmation is on top.
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expectOnTop(page, page.getByRole('dialog'));
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
});

test('a sheet opened from another covers the screen', async ({ page }) => {
  await page.getByRole('button', { name: 'Labour', exact: true }).click();
  await page.getByRole('button', { name: /new contract/i }).click();
  await page.getByLabel('Contractor', { exact: true }).fill('Ramesh');
  await page.getByRole('dialog').getByRole('textbox', { name: 'Rate' }).fill('45');
  await page.getByRole('button', { name: /add contract/i }).click();

  const contract = page.getByRole('dialog', { name: 'Ramesh' });
  await expectOnTop(page, contract);
  await contract.getByRole('button', { name: /statement/i }).click();
  await expectOnTop(page, page.getByRole('dialog', { name: 'Statement' }));
});
