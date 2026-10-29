import { expect, test } from '@playwright/test';

test('app shell loads with the Pixel Studio font and no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.getByText('PIXEL STUDIO', { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some(f => f.family.includes('Silkscreen') && f.status === 'loaded'); })).toBe(true);
  expect(errors).toEqual([]);
});
