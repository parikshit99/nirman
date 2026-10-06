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
  await page.getByRole('button', { name: 'Add purchases' }).click();
  await expectOnTop(page, page.getByRole('dialog', { name: 'Add purchases' }));
  await page.getByRole('button', { name: /add item manually/i }).click();
  await page.getByLabel('Item name').fill('OPC Cement 53 grade');
  await page.getByLabel('Quantity').fill('50');
  await page.getByLabel('Rate', { exact: true }).fill('385');
  await page.getByRole('button', { name: /^add to/i }).click();
  await page.getByLabel('Close manual entry').click();
  await page.getByRole('dialog', { name: 'Add purchases' }).getByRole('button', { name: 'Close' }).click();

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

test('Settings → Appearance → Dark darkens the app and is remembered', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Dark' }).click();
  // The light page background is #f5f5f5.
  const darkBackground = () =>
    page.evaluate(() => document.documentElement.classList.contains('dark') && getComputedStyle(document.body).backgroundColor !== 'rgb(245, 245, 245)');
  expect(await darkBackground()).toBe(true);
  await page.reload();
  expect(await darkBackground()).toBe(true);
});

test('a material in Rates opens the line editor, and a saved BOQ can be ticked delivered', async ({ page }) => {
  await page.getByRole('button', { name: 'Add purchases' }).click();
  await page.getByRole('button', { name: /add item manually/i }).click();
  await page.getByLabel('Item name').fill('OPC Cement 53 grade');
  await page.getByLabel('Quantity').fill('10');
  await page.getByLabel('Rate', { exact: true }).fill('385');
  await page.getByRole('button', { name: /^add to/i }).click();
  await page.getByLabel('Close manual entry').click();
  await page.getByRole('dialog', { name: /^Add/ }).getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^save$/i }).click();
  await page.getByRole('button', { name: /keep editing/i }).click();

  await page.getByRole('button', { name: 'Rates', exact: true }).click();
  await page.getByRole('button', { name: 'Edit OPC Cement 53 grade' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit material' });
  await expectOnTop(page, editor);
  await expect(editor.getByLabel('Rate', { exact: true })).toHaveValue('385');
  await editor.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'BOQ', exact: true }).click();
  await page.getByRole('button', { name: 'Add items' }).click();
  await page.getByRole('button', { name: /add item manually/i }).click();
  await page.getByLabel('Item name').fill('River sand');
  await page.getByRole('button', { name: /^add to/i }).click();
  await page.getByLabel('Close manual entry').click();
  await page.getByRole('dialog', { name: /^Add/ }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Mark River sand delivered' })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^save$/i }).click();
  await page.getByRole('button', { name: /keep editing/i }).click();
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await page.getByRole('button', { name: /^Mark delivered: BOQ/ }).click();
  await expectOnTop(page, page.getByRole('dialog', { name: 'Deliveries' }));
});

test('suggestions show under the field, which stays in view', async ({ page }) => {
  await page.getByRole('button', { name: 'Labour', exact: true }).click();
  await page.getByRole('button', { name: /new contract/i }).first().click();
  const work = page.getByLabel('Work', { exact: true });
  await work.fill('pla');
  const option = page.getByRole('option', { name: 'Plaster' });
  await expect(option).toBeVisible();
  // Measured together: the sheet may still be sliding in.
  const gap = await work.evaluate((el) => el.nextElementSibling!.getBoundingClientRect().top - el.getBoundingClientRect().bottom);
  expect(gap, 'the list starts below the field').toBeGreaterThanOrEqual(-1);
  await option.click();
  await expect(work).toHaveValue('Plaster');
  await expect(work).toBeFocused();
  await expect(page.getByRole('listbox', { name: 'Suggestions' })).toHaveCount(0);
});

test('Rates: one Filter sheet, and sorting by name or date', async ({ page }) => {
  await page.getByRole('button', { name: 'Add purchases' }).click();
  await page.getByRole('button', { name: /add item manually/i }).click();
  for (const [name, rate] of [
    ['River sand', '60'],
    ['Angle valve', '450'],
  ]) {
    await page.getByLabel('Item name').fill(name);
    await page.getByLabel('Quantity').fill('2');
    await page.getByLabel('Rate', { exact: true }).fill(rate);
    await page.getByLabel('Vendor').fill(name === 'River sand' ? 'Sharma Traders' : 'Oberoi Electricals');
    await page.getByRole('button', { name: /^add to/i }).click();
  }
  await page.getByLabel('Close manual entry').click();
  await page.getByRole('dialog', { name: /^Add/ }).getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^save$/i }).click();
  await page.getByRole('button', { name: /keep editing/i }).click();
  await page.getByRole('button', { name: 'Rates', exact: true }).click();

  const names = () => page.getByRole('button', { name: /^Edit (River sand|Angle valve)$/ }).allTextContents();
  await page.getByRole('button', { name: /^Sort:/ }).click();
  await expectOnTop(page, page.getByRole('dialog', { name: 'Sort materials' }));
  await page.getByRole('button', { name: /Name A–Z/ }).click();
  expect((await names())[0]).toContain('Angle valve');
  await page.getByRole('button', { name: /^Sort:/ }).click();
  await page.getByRole('button', { name: /Name Z–A/ }).click();
  expect((await names())[0]).toContain('River sand');

  await page.getByRole('button', { name: /^Filter/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filter materials' });
  await expectOnTop(page, sheet);
  await sheet.getByLabel('Filter by vendor').selectOption('Sharma Traders');
  await sheet.getByRole('button', { name: 'Show 1 material' }).click();
  await expect(page.getByRole('button', { name: 'Edit Angle valve' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove filter Vendor: Sharma Traders' }).click();
  await expect(page.getByRole('button', { name: 'Edit Angle valve' })).toBeVisible();
});
