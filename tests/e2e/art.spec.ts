// The Art workspace, exercised the same way tests/legacy-baseline/*.cjs exercises the original
// Pixel Studio (same steps, same selectors), plus checks for behavior that changed on purpose.
import { expect, test, type Page } from '@playwright/test';

const CREAM = [0xf2, 0xec, 0xd8];

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('div[title="Double-click to rename"]')).toHaveCount(5);
  return errors;
}
const layerNames = (p: Page) => p.evaluate(() => [...document.querySelectorAll('div[title="Double-click to rename"]')].map(d => (d as HTMLElement).innerText.trim()));
const px = (p: Page, x: number, y: number) => p.evaluate(([x, y]) => [...document.querySelectorAll('canvas')[0].getContext('2d')!.getImageData(x, y, 1, 1).data], [x, y]);
const btn = (p: Page, t: string) => p.locator('button', { hasText: new RegExp('^\\s*' + t + '\\s*$') }).first();
async function at(p: Page) {
  const bb = (await p.locator('canvas').nth(2).boundingBox())!, z = bb.width / 320;
  return (x: number, y: number): [number, number] => [bb.x + (x + 0.5) * z, bb.y + (y + 0.5) * z];
}
const setRange = (p: Page, idx: number, v: number) => p.evaluate(([idx, v]) => {
  const i = document.querySelectorAll('input[type=range]')[idx] as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, String(v));
  i.dispatchEvent(new Event('input', { bubbles: true }));
}, [idx, v]);
const ranges = (p: Page) => p.evaluate(() => [...document.querySelectorAll('input[type=range]')].map(i => (i as HTMLInputElement).min + '..' + (i as HTMLInputElement).max + '=' + (i as HTMLInputElement).value));
const hash = (p: Page) => p.evaluate(() => { const d = document.querySelectorAll('canvas')[0].getContext('2d')!.getImageData(0, 0, 320, 200).data; let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) | 0; return h; });
const uniq = (p: Page) => p.evaluate(() => { const d = document.querySelectorAll('canvas')[0].getContext('2d')!.getImageData(0, 0, 320, 200).data; const s = new Set<number>(); for (let i = 0; i < d.length; i += 4) s.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]); return s.size; });
const pngOf = (p: Page, w: number, h: number, noise = false) => p.evaluate(([w, h, noise]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!;
  if (noise) { const id = x.createImageData(w, h); for (let i = 0; i < id.data.length; i++) id.data[i] = (i % 4 === 3) ? 255 : (Math.random() * 256) | 0; x.putImageData(id, 0, 0); }
  else { x.fillStyle = '#00ff00'; x.fillRect(0, 0, w, h); x.fillStyle = '#0000ff'; x.fillRect(4, 4, w - 8, h - 8); }
  return c.toDataURL().split(',')[1];
}, [w, h, noise] as const).then(b64 => Buffer.from(b64, 'base64'));
/** Sets the pencil color without leaving keyboard focus in the color input (shortcuts ignore inputs). */
const setColor = (p: Page, c: string) => p.evaluate(c => {
  const i = document.querySelector('input[type=color]') as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, c);
  i.dispatchEvent(new Event('input', { bubbles: true }));
}, c);
const saved = (p: Page) => expect(p.getByRole('status')).toHaveText('SAVED', { timeout: 10000 });

test('core workflows match the original', async ({ page }) => {
  const errors = await open(page);
  const A = await at(page);
  await btn(page, '\\+ NEW LAYER').click();
  expect(await layerNames(page)).toHaveLength(6);

  await page.keyboard.press('b');
  await page.mouse.move(...A(10, 10)); await page.mouse.down(); await page.mouse.move(...A(40, 10), { steps: 10 }); await page.mouse.up();
  expect((await px(page, 25, 10)).slice(0, 3)).toEqual(CREAM);
  await expect(page.getByText('RECENT', { exact: true })).toBeVisible();
  await expect(page.locator('button[title="#f2ecd8"]').first()).toBeVisible(); // the RECENT row only renders when it has colors
  await page.keyboard.press('Control+z');
  expect((await px(page, 25, 10)).slice(0, 3)).not.toEqual(CREAM);
  await page.keyboard.press('Control+Shift+z');
  expect((await px(page, 25, 10)).slice(0, 3)).toEqual(CREAM);

  await page.keyboard.press(']'); await page.keyboard.press(']');
  await expect(page.getByText('3 PX', { exact: true })).toBeVisible();

  await page.keyboard.press('e'); await page.mouse.click(...A(25, 10));
  expect((await px(page, 25, 10)).slice(0, 3)).not.toEqual(CREAM);

  await setColor(page, '#ff0000');
  await page.keyboard.press('g'); await page.mouse.click(...A(200, 150));
  expect(await px(page, 200, 150)).toEqual([255, 0, 0, 255]);

  await page.locator('button[aria-label="Toggle visibility"]').first().click();
  expect(await px(page, 200, 150)).not.toEqual([255, 0, 0, 255]);
  await page.locator('button[aria-label="Toggle visibility"]').first().click();

  await setColor(page, '#123456');
  await page.keyboard.press('b'); await page.keyboard.down('Alt'); await page.mouse.click(...A(200, 150)); await page.keyboard.up('Alt');
  await expect(page.getByText('#FF0000', { exact: true })).toBeVisible();

  await page.locator('button[aria-label="Zoom in"]').click();
  await expect(page.locator('.ps-zoom')).not.toHaveText('3×');
  await page.locator('button[aria-label="Zoom out"]').click();

  await btn(page, 'DEL').click();
  expect(await layerNames(page)).toHaveLength(5);

  await btn(page, 'CLIP').click();
  const B = await at(page);
  await page.mouse.move(...B(150, 150)); await page.mouse.down(); await page.mouse.move(...B(200, 170), { steps: 8 }); await page.mouse.up();
  await btn(page, 'COPY TO NEW LAYER').click();
  const names = await layerNames(page);
  expect(names).toHaveLength(6); expect(names.some(n => /copy/.test(n))).toBe(true);
  await btn(page, 'PAINT').click();

  await page.keyboard.press('m'); await page.keyboard.press('ArrowRight');
  await btn(page, 'MERGE').click();
  expect(await layerNames(page)).toHaveLength(5);

  const sprite = await pngOf(page, 24, 16);
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'test-sprite.png', mimeType: 'image/png', buffer: sprite });
  await expect.poll(() => layerNames(page)).toHaveLength(6);
  expect((await layerNames(page)).some(n => /test-sprite/.test(n))).toBe(true);
  expect(await px(page, 10, 8)).toEqual([0, 0, 255, 255]);
  expect((await px(page, 1, 1)).slice(0, 3)).not.toEqual([0, 255, 0]); // green border removed

  await page.locator('input[type=file]').nth(0).setInputFiles({ name: 'test-sprite.png', mimeType: 'image/png', buffer: sprite });
  await expect.poll(() => layerNames(page)).toHaveLength(7);

  await page.locator('button', { hasText: 'EXPORT PNG' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, 'IMAGE').click()]);
  expect(dl.suggestedFilename()).toBe('pixel-studio-1280x800.png');

  await saved(page);
  await page.reload();
  await expect(page.locator('div[title="Double-click to rename"]')).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('tuning, opacity and move match the original', async ({ page }) => {
  const errors = await open(page);
  const h0 = await hash(page);
  let r = await ranges(page);
  const opIdx = r.findIndex(x => x.startsWith('0..100=100'));
  await setRange(page, opIdx, 40); expect(await hash(page)).not.toBe(h0);
  await setRange(page, opIdx, 100);

  await page.locator('button', { hasText: 'IMAGE TUNING' }).click();
  r = await ranges(page);
  const u0 = await uniq(page), tIdx = r.findIndex((x, i) => i > opIdx && x.startsWith('0..100=100'));
  await setRange(page, tIdx, 10);
  await expect.poll(() => uniq(page)).toBeLessThan(u0);
  await expect(page.getByText(/ADJUSTING: DOCK/)).toBeVisible();

  await page.locator('button', { hasText: 'RECOLOR RANGES' }).click();
  const swatches = page.locator('button[title*="shift-click to multi-select"]');
  expect(await swatches.count()).toBeGreaterThan(0);
  await swatches.first().click();
  r = await ranges(page);
  const hb = await hash(page); await setRange(page, r.findIndex(x => x.startsWith('-180..180')), 90);
  await expect.poll(() => hash(page)).not.toBe(hb);

  await page.keyboard.press('Control+z');
  await expect.poll(() => uniq(page)).toBeGreaterThanOrEqual(u0 - 2);

  await page.keyboard.press('m');
  const A = await at(page), h1 = await hash(page);
  await page.mouse.move(...A(160, 150)); await page.mouse.down(); await page.mouse.move(...A(170, 140), { steps: 5 }); await page.mouse.up();
  expect(await hash(page)).not.toBe(h1);
  expect(errors).toEqual([]);
});

test('FIXED: a project too big for localStorage still saves and reloads', async ({ page }) => {
  await open(page);
  const big = await pngOf(page, 1400, 1400, true);
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'big-noise.png', mimeType: 'image/png', buffer: big });
  await expect(page.getByText(/PLACED 1400 × 1400 PNG — EXTENDS PAST CANVAS/)).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(page.locator('div[title="Double-click to rename"]')).toHaveCount(6);
  // The off-canvas part survived: hide everything else, slide the image 300 px left, and the
  // area that used to be off-canvas is still full of opaque pixels.
  expect((await layerNames(page))[0]).toMatch(/big-noise$/);
  const eyes = page.locator('button[aria-label="Toggle visibility"]');
  for (let i = 1; i < 6; i++) await eyes.nth(i).click();
  await page.keyboard.press('m');
  for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+ArrowLeft');
  expect((await px(page, 100, 50))[3]).toBe(255);
  expect((await px(page, 300, 50))[3]).toBe(255);
});

test('NEW: save failures are shown instead of swallowed', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a: Parameters<typeof put>) {
      if ((window as unknown as { __failSaves?: boolean }).__failSaves) throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, a);
    };
  });
  await open(page);
  await page.evaluate(() => { (window as unknown as { __failSaves: boolean }).__failSaves = true; });
  await btn(page, '\\+ NEW LAYER').click();
  await expect(page.getByRole('status')).toHaveText('NOT SAVED: BROWSER STORAGE IS FULL', { timeout: 10000 });
});

test('controls the original only had in code: rename, reorder, resize handles, cut, select ops', async ({ page }) => {
  await open(page);
  await page.locator('div[title="Double-click to rename"]').first().dblclick();
  await page.getByLabel('Layer name').fill('Pier');
  await page.getByLabel('Layer name').press('Enter');
  expect((await layerNames(page))[0]).toMatch(/Pier$/);

  await btn(page, 'DOWN').click();
  expect((await layerNames(page))[1]).toMatch(/Pier$/);
  await btn(page, 'UP').click();
  expect((await layerNames(page))[0]).toMatch(/Pier$/);

  // Resize from the bottom-right handle with Shift (keeps ratio). The sprite's blue core sits at
  // x 4–19, y 4–11 once its green border is removed, so that handle is at canvas (20, 12).
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'sprite.png', mimeType: 'image/png', buffer: await pngOf(page, 24, 16) });
  await expect.poll(() => layerNames(page)).toHaveLength(6);
  await page.keyboard.press('m');
  const A = await at(page);
  await page.mouse.move(...A(19.5, 11.5)); await page.mouse.down(); await page.keyboard.down('Shift');
  await page.mouse.move(...A(35.5, 15.5), { steps: 6 });
  await expect(page.getByText('X 4  Y 4  ·  32 × 16 PX')).toBeVisible();
  await page.mouse.up(); await page.keyboard.up('Shift');
  expect(await px(page, 35, 19)).toEqual([0, 0, 255, 255]);
  await page.keyboard.press('Control+z');
  await btn(page, 'DEL').click();

  // Cut: the pixels leave the source layer.
  await btn(page, 'CLIP').click();
  await btn(page, 'LAYER').click();
  await expect(page.getByText(/^\d+ PX$/).first()).toBeVisible();
  await btn(page, 'INVERT').click();
  await btn(page, 'CLEAR').click();
  await expect(page.getByText('NONE', { exact: true })).toBeVisible();
  const B = await at(page);
  await page.mouse.move(...B(150, 180)); await page.mouse.down(); await page.mouse.move(...B(170, 190), { steps: 4 }); await page.mouse.up();
  await btn(page, 'CLIP TO NEW LAYER').click();
  await expect(page.getByText(/CLIPPED \d+ PX TO NEW LAYER/)).toBeVisible();
  expect((await layerNames(page))[0]).toMatch(/clip$/);
});

test('REMOVED (D-015): there is no 2× pixel-grid import option', async ({ page }) => {
  await open(page);
  await expect(page.getByText('PIXEL GRID')).toHaveCount(0);
  await expect(page.getByText(/GAME GRID/)).toHaveCount(0);
});
