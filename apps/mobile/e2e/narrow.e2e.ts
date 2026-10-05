import { expect, test, type Page } from '@playwright/test';

/** CLAUDE.md: the app must work at 320–360 px wide without sideways scrolling (412 px: a common larger phone). */
const WIDTHS = [320, 360, 412];
const TABS = ['Purchases', 'BOQ', 'Labour', 'Rates', 'Saved'];

/** Buttons, links and fields that end past the right edge, except inside rows meant to scroll sideways (filter chips). */
async function offScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrollsSideways = (el: Element) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(a).overflowX)) return true;
      }
      return false;
    };
    return [...document.querySelectorAll('button, a, input, select, textarea')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > width + 1 && !scrollsSideways(el);
      })
      .map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40));
  });
}

async function addItem(page: Page, name: string, quantity = '10', rate = '385') {
  // Below 1024 px the entry form opens from the Add button.
  const add = page.getByRole('button', { name: /^(add|add purchases|add items)$/i }).first();
  if (await add.isVisible()) await add.click();
  await page.getByRole('button', { name: /add item manually/i }).click();
  await page.getByLabel('Item name').fill(name);
  await page.getByLabel('Quantity').fill(quantity);
  const rateField = page.getByLabel('Rate', { exact: true });
  if (await rateField.count()) await rateField.fill(rate);
  await page.getByRole('button', { name: /^add to/i }).click();
  await page.getByLabel('Close manual entry').click();
  const sheet = page.getByRole('dialog', { name: /^Add/ });
  if (await sheet.isVisible()) await sheet.getByRole('button', { name: 'Close' }).click();
}

for (const width of WIDTHS) {
  test(`nothing runs off the screen at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/');
    await page.getByRole('button', { name: /skip for now/i }).click();

    for (const tab of TABS) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      expect(await offScreen(page), `${tab} tab, empty`).toEqual([]);
    }

    // With items, the header also shows the total and Save / Preview / Share / Clear.
    for (const tab of ['Purchases', 'BOQ']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      // A crore-sized total is the widest the header gets.
      await addItem(page, 'OPC Cement 53 grade', '32067', '385');
      await page.evaluate(() => window.scrollTo(0, 0));
      for (const name of ['Save', 'Preview', 'Share', 'Clear']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
      expect(await offScreen(page), `${tab} tab, with items`).toEqual([]);
      const total = page.getByTestId('header-total');
      expect(await total.evaluate((el) => el.scrollWidth <= el.clientWidth), `${tab} total fits`).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
