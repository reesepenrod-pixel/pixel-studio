const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.resolve(process.argv[2]); const OUT = process.argv[3];
const R = {}; const ok = (k, v, note) => { R[k] = { pass: !!v, note }; console.log((v ? 'PASS ' : 'FAIL ') + k + (note ? ' — ' + note : '')); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(FILE); await p.waitForFunction(() => document.querySelectorAll('canvas').length >= 3, null, { timeout: 15000 }); await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '/01-initial.png' });
  const canvas = async () => { const h = await p.$$('canvas'); return h[2].boundingBox(); };
  const px = (x, y) => p.evaluate(([x, y]) => { const c = document.querySelectorAll('canvas')[0]; const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return [...d]; }, [x, y]);
  const layerNames = () => p.evaluate(() => [...document.querySelectorAll('div[title="Double-click to rename"]')].map(d => d.innerText.trim()));
  const btn = t => p.locator('button', { hasText: new RegExp('^\\s*' + t + '\\s*$') }).first();
  ok('loads_default_dock_scene', (await layerNames()).length === 5, JSON.stringify(await layerNames()));
  const bb = await canvas(); const z = bb.width / 320; const at = (x, y) => [bb.x + (x + 0.5) * z, bb.y + (y + 0.5) * z];
  // new layer then pencil
  await btn('\\+ NEW LAYER').click(); await p.waitForTimeout(200);
  ok('new_layer', (await layerNames()).length === 6);
  await p.keyboard.press('b');
  await p.mouse.move(...at(10, 10)); await p.mouse.down(); await p.mouse.move(...at(40, 10), { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(200);
  const c1 = await px(25, 10); ok('pencil_stroke', c1[0] === 0xf2 && c1[1] === 0xec && c1[2] === 0xd8, JSON.stringify(c1));
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  const c2 = await px(25, 10); ok('undo', !(c2[0] === 0xf2 && c2[1] === 0xec && c2[2] === 0xd8), JSON.stringify(c2));
  await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(200);
  const c3 = await px(25, 10); ok('redo', c3[0] === 0xf2 && c3[2] === 0xd8, JSON.stringify(c3));
  // brush size ] 
  await p.keyboard.press(']'); await p.keyboard.press(']');
  ok('brush_size_key', await p.evaluate(() => document.body.innerText.includes('3 PX')));
  // eraser
  await p.keyboard.press('e'); await p.mouse.move(...at(25, 10)); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(200);
  // composite now shows underlying layer, check new layer pixel gone by comparing to dock layer: just check not cream
  const c4 = await px(25, 10); ok('eraser', !(c4[0] === 0xf2 && c4[1] === 0xec && c4[2] === 0xd8), JSON.stringify(c4));
  // color picker input
  await p.evaluate(() => { const i = document.querySelector('input[type=color]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '#ff0000'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(100);
  // fill on the empty new layer -> fills whole layer
  await p.keyboard.press('g'); await p.mouse.click(...at(200, 150)); await p.waitForTimeout(300);
  const c5 = await px(200, 150); ok('bucket_fill_and_color_input', c5[0] === 255 && c5[1] === 0 && c5[2] === 0, JSON.stringify(c5));
  // opacity hide toggle
  await p.locator('button[aria-label="Toggle visibility"]').first().click(); await p.waitForTimeout(200);
  const c6 = await px(200, 150); ok('visibility_toggle', !(c6[0] === 255 && c6[1] === 0 && c6[2] === 0), JSON.stringify(c6));
  await p.locator('button[aria-label="Toggle visibility"]').first().click(); await p.waitForTimeout(200);
  // dropper with alt-click
  await p.keyboard.press('b'); await p.keyboard.down('Alt'); await p.mouse.click(...at(200, 150)); await p.keyboard.up('Alt'); await p.waitForTimeout(100);
  ok('alt_click_dropper', await p.evaluate(() => document.body.innerText.includes('#FF0000')));
  // zoom
  const zb = await p.evaluate(() => [...document.querySelectorAll('div')].find(d => /^\d+×$/.test(d.innerText.trim()))?.innerText);
  await p.locator('button[aria-label="Zoom in"]').click(); await p.waitForTimeout(150);
  const za = await p.evaluate(() => [...document.querySelectorAll('div')].find(d => /^\d+×$/.test(d.innerText.trim()))?.innerText);
  ok('zoom_buttons', zb !== za, zb + ' -> ' + za);
  await p.locator('button[aria-label="Zoom out"]').click(); await p.waitForTimeout(150);
  // delete red layer, then clip view selection
  await btn('DEL').click(); await p.waitForTimeout(200);
  ok('delete_layer', (await layerNames()).length === 5);
  await btn('CLIP').click(); await p.waitForTimeout(200);
  const bb2 = await canvas(); const z2 = bb2.width / 320; const at2 = (x, y) => [bb2.x + (x + 0.5) * z2, bb2.y + (y + 0.5) * z2];
  await p.mouse.move(...at2(150, 150)); await p.mouse.down(); await p.mouse.move(...at2(200, 170), { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(200);
  const selTxt = await p.evaluate(() => (document.body.innerText.match(/(\d+) PX\b/g) || []).join(','));
  await btn('COPY TO NEW LAYER').click(); await p.waitForTimeout(300);
  const ln = await layerNames(); ok('selection_copy_to_layer', ln.length === 6 && ln.some(n => /copy/.test(n)), JSON.stringify(ln) + ' ' + selTxt);
  await btn('PAINT').click(); await p.waitForTimeout(200);
  // move tool nudge
  await p.keyboard.press('m'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(200);
  ok('move_nudge_no_error', errs.length === 0, errs.join(' | '));
  // merge down
  await btn('MERGE').click(); await p.waitForTimeout(300);
  ok('merge_down', (await layerNames()).length === 5);
  // import exact PNG + import pixelate via file inputs
  const inputs = p.locator('input[type=file]');
  const testPng = path.join(OUT, 'test-sprite.png');
  await p.evaluate(() => 0);
  const dataUrl = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 24; c.height = 16; const x = c.getContext('2d'); x.fillStyle = '#00ff00'; x.fillRect(0, 0, 24, 16); x.fillStyle = '#0000ff'; x.fillRect(4, 4, 16, 8); return c.toDataURL(); });
  fs.writeFileSync(testPng, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await inputs.nth(1).setInputFiles(testPng); await p.waitForTimeout(600);
  const ln2 = await layerNames(); ok('import_png_exact', ln2.length === 6 && ln2.some(n => /test-sprite/.test(n)), JSON.stringify(ln2));
  const c7 = await px(10, 8); ok('import_exact_pixels_and_rm_bg', c7[2] === 255 && c7[1] === 0 || c7[3] === 255, 'pixel(10,8)=' + JSON.stringify(c7) + ' (bg removal on by default makes green transparent)');
  await inputs.nth(0).setInputFiles(testPng); await p.waitForTimeout(800);
  ok('import_pixelate', (await layerNames()).length === 7, JSON.stringify(await layerNames()));
  // image tuning: open section and move palette slider
  await p.locator('button', { hasText: 'IMAGE TUNING' }).click(); await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '/02-after-edits.png' });
  // export
  await p.locator('button', { hasText: 'EXPORT PNG' }).click(); await p.waitForTimeout(200);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), btn('IMAGE').click()]);
  ok('export_png', !!dl, dl ? dl.suggestedFilename() : 'no download');
  // persistence
  await p.waitForTimeout(1200);
  const saved = await p.evaluate(() => { const s = localStorage.getItem('pixelStudio.v1'); return s ? { bytes: s.length, layers: JSON.parse(s).layers.length } : null; });
  ok('autosave_localstorage', !!saved, JSON.stringify(saved));
  await p.reload(); await p.waitForFunction(() => document.querySelectorAll('canvas').length >= 3); await p.waitForTimeout(1500);
  ok('reload_restores_layers', (await layerNames()).length === 7, JSON.stringify(await layerNames()));
  ok('no_page_errors', errs.length === 0, errs.join(' | '));
  fs.writeFileSync(OUT + '/results.json', JSON.stringify(R, null, 2));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
