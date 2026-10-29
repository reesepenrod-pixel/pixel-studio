const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.resolve(process.argv[2]); const OUT = process.argv[3]; fs.mkdirSync(OUT, { recursive: true });
const ok = (k, v, n) => console.log((v ? 'PASS ' : 'FAIL ') + k + (n ? ' — ' + n : ''));
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(FILE); await p.waitForFunction(() => document.querySelectorAll('canvas').length >= 3); await p.waitForTimeout(1500);
  const hash = () => p.evaluate(() => { const d = document.querySelectorAll('canvas')[0].getContext('2d').getImageData(0, 0, 320, 200).data; let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) | 0; return h; });
  const uniq = () => p.evaluate(() => { const d = document.querySelectorAll('canvas')[0].getContext('2d').getImageData(0, 0, 320, 200).data; const s = new Set(); for (let i = 0; i < d.length; i += 4) s.add(d[i] << 16 | d[i+1] << 8 | d[i+2]); return s.size; });
  const setRange = (idx, v) => p.evaluate(([idx, v]) => { const i = document.querySelectorAll('input[type=range]')[idx]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, String(v)); i.dispatchEvent(new Event('input', { bubbles: true })); }, [idx, v]);
  const ranges = () => p.evaluate(() => [...document.querySelectorAll('input[type=range]')].map(i => i.min + '..' + i.max + '=' + i.value));
  // layer opacity (active = Dock)
  let h0 = await hash(); let r = await ranges(); console.log('ranges', r);
  const opIdx = r.findIndex(x => x.startsWith('0..100=100'));
  await setRange(opIdx, 40); await p.waitForTimeout(200); ok('layer_opacity', (await hash()) !== h0);
  await setRange(opIdx, 100); await p.waitForTimeout(200);
  // image tuning on active layer (Dock): palette complexity
  await p.locator('button', { hasText: 'IMAGE TUNING' }).click(); await p.waitForTimeout(200);
  r = await ranges(); console.log('ranges after tune open', r);
  const u0 = await uniq(); const tIdx = r.findIndex((x, i) => i > opIdx && x.startsWith('0..100=100'));
  await setRange(tIdx, 10); await p.waitForTimeout(800); const u1 = await uniq();
  ok('palette_complexity_reduces_colors', u1 < u0, u0 + ' -> ' + u1 + ' unique colors in composite');
  const txt = await p.evaluate(() => document.body.innerText);
  ok('ranges_detected', /RANGES|ADJUSTING/.test(txt), (txt.match(/ADJUSTING:[^\n]*/) || [''])[0]);
  await p.locator('button', { hasText: 'RECOLOR RANGES' }).click(); await p.waitForTimeout(300);
  const rbtn = await p.locator('button[title*="shift-click to multi-select"]').count();
  ok('recolor_ranges_listed', rbtn > 0, rbtn + ' range swatches');
  if (rbtn) { await p.locator('button[title*="shift-click to multi-select"]').first().click(); await p.waitForTimeout(200); r = await ranges(); const hIdx = r.findIndex(x => x.startsWith('-180..180')); const hb = await hash(); await setRange(hIdx, 90); await p.waitForTimeout(500); ok('recolor_hue_shift', (await hash()) !== hb); }
  await p.screenshot({ path: OUT + '/03-tuning.png', fullPage: true });
  // undo reverts the tuning
  await p.keyboard.press('Control+z'); await p.waitForTimeout(400); ok('undo_reverts_tuning', (await uniq()) >= u0 - 2, 'colors back to ' + (await uniq()));
  // move tool drag-resize on Dock layer
  await p.keyboard.press('m'); await p.waitForTimeout(200);
  const bb = await (await p.$$('canvas'))[2].boundingBox(); const z = bb.width / 320;
  const h1 = await hash(); await p.mouse.move(bb.x + 160 * z, bb.y + 150 * z); await p.mouse.down(); await p.mouse.move(bb.x + 170 * z, bb.y + 140 * z, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(300);
  ok('move_drag', (await hash()) !== h1);
  // storage quota: huge noisy exact PNG
  const big = path.join(OUT, 'big-noise.png');
  const du = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 1400; c.height = 1400; const x = c.getContext('2d'); const id = x.createImageData(1400, 1400); for (let i = 0; i < id.data.length; i++) id.data[i] = (Math.random() * 256) | 0; for (let i = 3; i < id.data.length; i += 4) id.data[i] = 255; x.putImageData(id, 0, 0); return c.toDataURL(); });
  fs.writeFileSync(big, Buffer.from(du.split(',')[1], 'base64'));
  const before = await p.evaluate(() => localStorage.getItem('pixelStudio.v1')?.length || 0);
  await p.locator('input[type=file]').nth(1).setInputFiles(big); await p.waitForTimeout(3000);
  const after = await p.evaluate(() => localStorage.getItem('pixelStudio.v1')?.length || 0);
  ok('large_project_save (KNOWN DEFECT: fails silently, see audit 4.1)', after !== before, 'saved length ' + before + ' -> ' + after + ' (big file ' + fs.statSync(big).size + ' bytes)');
  ok('no_page_errors', errs.length === 0, errs.join(' | '));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
