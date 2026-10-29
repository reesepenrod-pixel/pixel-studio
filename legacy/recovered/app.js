
const W = 320, H = 200, N = W * H;
const KEY = 'pixelStudio.v1';
const ICONS = {
  pen: ['......XX', '.....XXX', '....XXX.', '...XXX..', '..XXX...', '.XXX....', 'XX......', 'X.......'],
  eraser: ['....XX..', '...XXXX.', '..XXXXXX', '.X.XXXX.', 'X...XX..', 'X..XX...', '.XXX....', 'XXXXXXXX'],
  fill: ['..XX....', '.X..X...', 'XXXXXX..', 'XXXXXXX.', 'XXXXXX.X', '.XXXX..X', '..XX...X', '.......X'],
  pick: ['.....XXX', '....XXXX', '...XXXXX', '..X.XXX.', '.X.X.X..', 'X.X.....', 'XX......', 'X.......'],
  sel: ['X.X.X.X.', '.......X', 'X....XX.', '....XXX.', 'X..XXX..', '..XXX..X', 'XXX.....', 'X.X.X.X.'],
  unsel: ['X.X.X.X.', '.......X', 'X.......', '..XXXX..', 'X.XXXX.X', '........', 'X......X', '.X.X.X.X'],
  move: ['...XX...', '..XXXX..', '.X.XX.X.', 'XXXXXXXX', 'XXXXXXXX', '.X.XX.X.', '..XXXX..', '...XX...']
};
const CURS = { move: 'move', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
function quantizeData(d, k) {
  const map = new Map(), cols = [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let c = map.get(key); if (!c) { c = { key, v: [d[i], d[i + 1], d[i + 2]], n: 0 }; map.set(key, c); cols.push(c); }
    c.n++;
  }
  if (cols.length <= k) return cols.length;
  const mkBox = items => { let best = -1, ch = 0; for (let c = 0; c < 3; c++) { let mn = 255, mx = 0; for (const it of items) { const v = it.v[c]; if (v < mn) mn = v; if (v > mx) mx = v; } const r = (mx - mn) * [0.3, 0.59, 0.11][c]; if (r > best) { best = r; ch = c; } } return { items, range: best, ch }; };
  const heap = [], done = [];
  const push = b => { if (b.items.length < 2 || b.range <= 0) { done.push(b); return; } heap.push(b); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p].range >= heap[i].range) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].range > heap[m].range) m = l; if (r < heap.length && heap[r].range > heap[m].range) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  push(mkBox(cols));
  while (heap.length && heap.length + done.length < k) {
    const b = pop(), ch = b.ch; b.items.sort((p, q) => p.v[ch] - q.v[ch]);
    let tot = 0; for (const it of b.items) tot += it.n;
    let acc = 0, m = 1; for (let j = 0; j < b.items.length - 1; j++) { acc += b.items[j].n; if (acc >= tot / 2) { m = j + 1; break; } m = j + 1; }
    push(mkBox(b.items.slice(0, m))); push(mkBox(b.items.slice(m)));
  }
  const out = new Map();
  for (const b of heap.concat(done)) { const s = [0, 0, 0]; let n = 0; for (const it of b.items) { for (let c = 0; c < 3; c++) s[c] += it.v[c] * it.n; n += it.n; } const avg = s.map(v => Math.round(v / n)); for (const it of b.items) out.set(it.key, avg); }
  for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const a = out.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); d[i] = a[0]; d[i + 1] = a[1]; d[i + 2] = a[2]; }
  return cols.length;
}
function removeBg(d, w, h, r, tol) {
  const at = (x, y) => (y * w + x) * 4;
  const cs = [at(r.x, r.y), at(r.x + r.w - 1, r.y), at(r.x, r.y + r.h - 1), at(r.x + r.w - 1, r.y + r.h - 1)];
  if (cs.some(i => d[i + 3] < 128)) return 0;
  const bg = [0, 1, 2].map(c => cs.reduce((s, i) => s + d[i + c], 0) / 4);
  const near = i => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) <= tol;
  if (!cs.every(near)) return 0;
  const seen = new Uint8Array(w * h), st = [];
  for (let x = r.x; x < r.x + r.w; x++) st.push(r.y * w + x, (r.y + r.h - 1) * w + x);
  for (let y = r.y; y < r.y + r.h; y++) st.push(y * w + r.x, y * w + r.x + r.w - 1);
  let n = 0;
  while (st.length) {
    const p = st.pop(); if (p < 0 || p >= w * h || seen[p]) continue; seen[p] = 1;
    const x = p % w, y = (p / w) | 0; if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) continue;
    const i = p * 4; if (d[i + 3] >= 128 && !near(i)) continue;
    d[i + 3] = 0; n++;
    if (x > r.x) st.push(p - 1); if (x < r.x + r.w - 1) st.push(p + 1); st.push(p - w, p + w);
  }
  return n;
}
function sharpen(src, w, h, amt, tame) {
  if (amt <= 0) return src.slice();
  const out = src.slice(), keep = 1 - tame;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (src[i + 3] < 128) continue;
    const s = [0, 0, 0], lo = [255, 255, 255], hi = [0, 0, 0]; let n = 0;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const X = x + k, Y = y + j; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const q = (Y * w + X) * 4; if (src[q + 3] < 128) continue;
      for (let c = 0; c < 3; c++) { const v = src[q + c]; s[c] += v; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
      n++;
    }
    for (let c = 0; c < 3; c++) {
      let v = src[i + c] + amt * (src[i + c] - s[c] / n);
      if (v > hi[c]) v = hi[c] + (v - hi[c]) * keep; else if (v < lo[c]) v = lo[c] - (lo[c] - v) * keep;
      out[i + c] = v;
    }
  }
  return out;
}
const srgbL = v => (v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const Lsrgb = v => Math.max(0, Math.min(255, Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055))));
function toLab(r, g, b) {
  r = srgbL(r); g = srgbL(g); b = srgbL(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromLab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [Lsrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), Lsrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), Lsrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
function mcut(items, k) {
  let boxes = [items];
  while (boxes.length < k) {
    let bi = -1, bc = 0, best = 0;
    boxes.forEach((b, j) => { if (b.length < 2) return; for (let c = 0; c < 3; c++) { let mn = 1e9, mx = -1e9; for (const it of b) { const v = it.p[c] * (c ? 1 : 2); if (v < mn) mn = v; if (v > mx) mx = v; } if (mx - mn > best) { best = mx - mn; bi = j; bc = c; } } });
    if (bi < 0 || best < 0.004) break;
    const b = boxes[bi]; b.sort((p, q) => p.p[bc] - q.p[bc]);
    let tot = 0; for (const it of b) tot += it.n;
    let acc = 0, m = 1; for (let j = 0; j < b.length - 1; j++) { acc += b[j].n; m = j + 1; if (acc >= tot / 2) break; }
    boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
  }
  return boxes;
}
let RANGE_SEP = 0.1;
function findRanges(d, v) {
  const map = new Map(), cols = [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let c = map.get(key); if (!c) { c = { key, n: 0, p: toLab(d[i], d[i + 1], d[i + 2]) }; map.set(key, c); cols.push(c); }
    c.n++;
  }
  if (!cols.length) return null;
  // Ranges = materials. Feature space divides chroma by lightness so a material's shadow and highlight
  // land close together, while different materials of similar hue (skin / hair / shirt / gold) stay apart.
  const feat = p => { const Ld = Math.max(p[0], 0.2); return [p[0] * 0.25, p[1] / Ld * 3, p[2] / Ld * 3]; };
  const dist = (f, g) => Math.hypot(f[0] - g[0], f[1] - g[1], f[2] - g[2]);
  let total = 0; for (const c of cols) { c.f = feat(c.p); total += c.n; }
  const D = RANGE_SEP;
  let cl = [];
  for (const c of cols.slice().sort((a, b) => b.n - a.n)) {
    let best = null, bd = 1e9; for (const k of cl) { const dd = dist(k.f, c.f); if (dd < bd) { bd = dd; best = k; } }
    if (best && bd < D) { const t = best.n + c.n; for (let i = 0; i < 3; i++) best.f[i] = (best.f[i] * best.n + c.f[i] * c.n) / t; best.n = t; }
    else cl.push({ f: c.f.slice(), n: c.n });
  }
  const mergeInto = (a, b) => { const t = a.n + b.n; for (let i = 0; i < 3; i++) a.f[i] = (a.f[i] * a.n + b.f[i] * b.n) / t; a.n = t; cl = cl.filter(x => x !== b); };
  for (;;) {
    let bi = null, bj = null, bd = 1e9;
    for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) { const dd = dist(cl[i].f, cl[j].f); if (dd < bd) { bd = dd; bi = cl[i]; bj = cl[j]; } }
    if (!bi || bd > D) break;
    mergeInto(bi.n >= bj.n ? bi : bj, bi.n >= bj.n ? bj : bi);
  }
  const minN = 3;
  for (;;) {
    if (cl.length < 2) break;
    const small = cl.reduce((m, k) => k.n < m.n ? k : m, cl[0]); if (small.n >= minN) break;
    let tgt = null, bd = 1e9; for (const k of cl) if (k !== small) { const dd = dist(k.f, small.f); if (dd < bd) { bd = dd; tgt = k; } }
    mergeInto(tgt, small);
  }
  let groups;
  for (let it = 0; it < 3; it++) {
    groups = cl.map(() => []);
    for (const c of cols) { let bi = 0, bd = 1e9; cl.forEach((k, i) => { const dd = dist(k.f, c.f); if (dd < bd) { bd = dd; bi = i; } }); groups[bi].push(c); }
    cl = cl.map((k, i) => { const g = groups[i]; if (!g.length) return null; const s = [0, 0, 0]; let n = 0; for (const c of g) { for (let j = 0; j < 3; j++) s[j] += c.f[j] * c.n; n += c.n; } return { f: s.map(x => x / n), n }; });
    groups = groups.filter((g, i) => cl[i]); cl = cl.filter(Boolean);
  }
  return groups;
}
function rangeMap(groups) { const m = new Map(); if (groups) groups.forEach((g, i) => { for (const it of g) m.set(it.key, i); }); return m; }
function familyReduce(d, w, h, v, groups) {
  if (v >= 100 || !groups) return null;
  const rangeOf = new Map();
  const fams = new Map(groups.map((g, i) => [i, g.slice()]));
  const T = Math.max(1, Math.round(Math.pow(64, v / 100))), out = new Map();
  for (const [ri, items] of fams) for (const g of mcut(items, T)) {
    const s = [0, 0, 0]; let n = 0; for (const it of g) { for (let c = 0; c < 3; c++) s[c] += it.p[c] * it.n; n += it.n; }
    const rgb = fromLab(s[0] / n, s[1] / n, s[2] / n); for (const it of g) out.set(it.key, rgb);
    rangeOf.set((rgb[0] << 16) | (rgb[1] << 8) | rgb[2], ri);
  }
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const a = out.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); d[i] = a[0]; d[i + 1] = a[1]; d[i + 2] = a[2]; }
  const passes = 0;
  for (let p = 0; p < passes; p++) {
    const src = d.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4; if (src[i + 3] < 128) continue;
      const cnt = new Map(); let bestK = -1, bestN = 0;
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { if (!j && !k) continue; const q = ((y + j) * w + x + k) * 4; if (src[q + 3] < 128) continue; const key = (src[q] << 16) | (src[q + 1] << 8) | src[q + 2]; const n = (cnt.get(key) || 0) + 1; cnt.set(key, n); if (n > bestN) { bestN = n; bestK = key; } }
      const own = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
      if (bestN >= 5 && bestK !== own && !(cnt.get(own) >= 2)) { d[i] = bestK >> 16; d[i + 1] = (bestK >> 8) & 255; d[i + 2] = bestK & 255; }
    }
  }
  return { fams: fams.size, T, rangeOf };
}
function rangeTones(d, rangeOf, n) {
  const per = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2], ri = rangeOf.get(key); if (ri == null) continue;
    let m = per.get(ri); if (!m) per.set(ri, m = new Map()); m.set(key, (m.get(key) || 0) + 1);
  }
  const out = [];
  for (const [ri, m] of per) {
    const cs = [...m].map(([key, c]) => { const p = toLab(key >> 16, (key >> 8) & 255, key & 255); return { key, c, L: p[0], p }; }).sort((a, b) => a.L - b.L);
    let tot = 0, sL = 0, sa = 0, sb = 0; for (const c of cs) { tot += c.c; sL += c.p[0] * c.c; sa += c.p[1] * c.c; sb += c.p[2] * c.c; }
    const avg = { L: sL / tot, C: Math.hypot(sa / tot, sb / tot), h: ((Math.atan2(sb / tot, sa / tot) * 180 / Math.PI) + 360) % 360 };
    const pick = cs.length <= n ? cs : Array.from({ length: n }, (_, j) => cs[Math.round(j * (cs.length - 1) / (n - 1))]);
    out.push({ ri, n: tot, count: cs.length, avg, tones: pick.map(c => rgb2hex(c.key >> 16, (c.key >> 8) & 255, c.key & 255)) });
  }
  return out.sort((a, b) => b.n - a.n);
}
// Dark part of a range = tones below the midpoint of that range's own lightness span.
// Darkest tone moves most; tones near the midpoint move least; light half untouched.
function deepen(d, amt, rangeOf, sel) {
  if (amt <= 0 || !rangeOf) return;
  const per = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2], ri = rangeOf.get(key);
    if (ri == null || (sel && !sel.has(ri))) continue;
    let s = per.get(ri); if (!s) per.set(ri, s = new Set()); s.add(key);
  }
  const out = new Map();
  for (const keys of per.values()) {
    if (keys.size < 2) continue;
    const cs = [...keys].map(key => ({ key, p: toLab(key >> 16, (key >> 8) & 255, key & 255) }));
    let lo = 1, hi = 0; for (const c of cs) { if (c.p[0] < lo) lo = c.p[0]; if (c.p[0] > hi) hi = c.p[0]; }
    const mid = (lo + hi) / 2; if (hi - lo < 0.02) continue;
    for (const c of cs) {
      if (c.p[0] >= mid) continue;
      const t = Math.min(1, (mid - c.p[0]) / (mid - lo)), w = 0.35 + 0.65 * t, [L, a, b] = c.p;
      out.set(c.key, fromLab(L * (1 - 0.6 * amt * w), a * (1 + 0.25 * amt * w), b * (1 + 0.25 * amt * w)));
    }
  }
  if (!out.size) return;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const o = out.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); if (o) { d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; } }
}
function adjustRanges(d, pr, adj) {
  const cache = new Map();
  for (let p = 0, i = 0; i < d.length; i += 4, p++) {
    const ri = pr[p]; if (ri < 0) continue; const A = adj[ri]; if (!A || (!A.h && !A.b && !A.s)) continue;
    const key = ri * 16777216 + ((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    let o = cache.get(key);
    if (!o) {
      const [L, a, b] = toLab(d[i], d[i + 1], d[i + 2]), t = (A.h || 0) * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t), sat = 1 + (A.s || 0) / 100;
      const bv = (A.b || 0) / 100, L2 = bv >= 0 ? L + (1 - L) * bv * 0.85 : L * (1 + bv * 0.85);
      o = fromLab(L2, (a * cs - b * sn) * sat, (a * sn + b * cs) * sat); cache.set(key, o);
    }
    d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2];
  }
}
function trimImage(img) {
  const w = img.width, h = img.height, c = mk(w, h), x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) if (d[(y * w + X) * 4 + 3] > 8) { if (X < x0) x0 = X; if (X > x1) x1 = X; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return img;
  const o = mk(x1 - x0 + 1, y1 - y0 + 1); o.getContext('2d').drawImage(c, -x0, -y0);
  return o;
}
const detailToK = (v, uniq) => uniq <= 2 ? uniq : Math.max(2, Math.round(2 * Math.pow(uniq / 2, v / 100)));
const TOOLS = {
  paint: [['pen', 'PENCIL', 'B'], ['eraser', 'ERASER', 'E'], ['fill', 'BUCKET', 'G'], ['pick', 'DROPPER', 'I'], ['move', 'MOVE', 'M']],
  clip: [['sel', 'SELECT', 'S'], ['unsel', 'UNSELECT', 'D'], ['move', 'MOVE', 'M']]
};
const iconCache = {};
const blobUrl = c => new Promise(res => c.toBlob(b => res(URL.createObjectURL(b))));
function icon(name, col) { return iconCache[name + col] || 'none'; }
function buildIcons() {
  return Promise.all(Object.keys(ICONS).flatMap(name => ['#1a1410', '#cfcfcf'].map(async col => {
    const c = mk(8, 8), x = c.getContext('2d');
    x.fillStyle = col;
    ICONS[name].forEach((r, y) => { for (let i = 0; i < 8; i++) if (r[i] === 'X') x.fillRect(i, y, 1, 1); });
    iconCache[name + col] = 'url(' + await blobUrl(c) + ')';
  })));
}
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

const IMP_KEYS = ['impDetail', 'impFam', 'impSharp', 'impTame', 'impDeep', 'impDeepSel', 'impSep', 'impRangeAdj', 'impEditRi', 'impInfo'];
const IMP_DEF = { impDetail: 100, impFam: 100, impSharp: 0, impTame: 70, impDeep: 0, impDeepSel: null, impSep: 70, impRangeAdj: {}, impEditRi: null, impInfo: null };
const pickImp = s => { const o = {}; for (const k of IMP_KEYS) o[k] = s[k]; return o; };
class Component extends DCLogic {
  state = { secOpen: { color: true, clip: true, layers: true, import: true, tune: false, ranges: false, export: false }, view: 'paint', tool: 'pen', prevTool: 'pen', size: 1, selSize: 6, color: '#f2ecd8', recent: [], layers: [], active: null,
    zoom: 3, grid: true, trim: true, impSharp: 0, impSep: 70, impDeep: 0, impDeepSel: null, impRangeAdj: {}, impEditRi: null, impFam: 100, impTame: 70, rmBg: true, impDetail: 100, impInfo: null, cursorCss: 'crosshair', impBlock: 2, expScale: 4, cursor: null, palette: [], selCount: 0, hist: 0, status: '' };
  lset = {}; imps = {};
  get imp() { return this._imp || null; }
  set imp(v) { if (v) this.imps[v.id] = v; else if (this._imp) delete this.imps[this._imp.id]; this._imp = v; }
  px = {}; ext = {}; mask = new Uint8Array(N); undo = []; redo = []; nid = 1; thumbs = {};
  mainRef = React.createRef(); ovRef = React.createRef(); curRef = React.createRef(); fileRef = React.createRef(); pngRef = React.createRef(); scrollRef = React.createRef();

  componentDidMount() {
    window.addEventListener('keydown', this.onKey);
    buildIcons().then(() => this.forceUpdate());
    const el = this.scrollRef.current;
    if (el) this.setState({ zoom: Math.max(1, Math.min(8, Math.floor(Math.min((el.clientWidth - 48) / W, (el.clientHeight - 48) / H)))) });
    if (el) {
      el.addEventListener('wheel', this.onPinchWheel, { passive: false });
      el.addEventListener('gesturestart', this.onGesture, { passive: false });
      el.addEventListener('gesturechange', this.onGesture, { passive: false });
    }
    this.load();
  }
  zoomAt(z, cx, cy) {
    z = Math.max(1, Math.min(12, z));
    const el = this.scrollRef.current, cv = this.mainRef.current, z0 = this.state.zoom;
    if (z === z0 || !el || !cv) return;
    const r = cv.getBoundingClientRect(), px = (cx - r.left) / z0, py = (cy - r.top) / z0;
    this.setState({ zoom: z }, () => {
      const r2 = cv.getBoundingClientRect();
      el.scrollLeft += r2.left + px * z - cx; el.scrollTop += r2.top + py * z - cy;
    });
  }
  onPinchWheel = e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this._pinchAcc = (this._pinchAcc || 0) - e.deltaY;
    const step = 40;
    if (Math.abs(this._pinchAcc) < step) return;
    const d = Math.trunc(this._pinchAcc / step); this._pinchAcc -= d * step;
    this.zoomAt(this.state.zoom + d, e.clientX, e.clientY);
  };
  onGesture = e => {
    e.preventDefault();
    if (e.type === 'gesturestart') { this._gz = this.state.zoom; return; }
    this.zoomAt(Math.round(this._gz * e.scale), e.clientX, e.clientY);
  };
  componentWillUnmount() { window.removeEventListener('keydown', this.onKey); }
  componentDidUpdate() {
    const s = this.state, ps = this._prev || {};
    this._prev = { layers: s.layers, zoom: s.zoom, grid: s.grid, view: s.view, tool: s.tool, active: s.active, hist: s.hist };
    if (s.active !== ps.active && this._setFor !== s.active) {
      if (this._setFor != null && this._lastPick) this.lset[this._setFor] = this._lastPick;
      this._setFor = s.active; this._imp = this.imps[s.active] || null;
      const ld = { ...IMP_DEF, ...(this.lset[s.active] || {}) }; if (!this._imp) ld.impInfo = null;
      this._lastPick = ld; this.setState(ld);
    } else if (this._setFor === s.active) this._lastPick = pickImp(s);
    if (s.layers !== ps.layers) this.redraw();
    if (s.zoom !== ps.zoom || s.grid !== ps.grid || s.view !== ps.view) this.drawOverlay();
    if (s.zoom !== ps.zoom || s.view !== ps.view || s.tool !== ps.tool || s.active !== ps.active || s.hist !== ps.hist) {
      this.drawCursor();
      if (s.tool !== ps.tool && s.tool !== 'move' && s.cursorCss !== 'crosshair') this.setState({ cursorCss: 'crosshair' });
    }
  }

  async load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (saved && saved.layers && saved.layers.length) {
      try {
        const imgs = await Promise.all(saved.layers.map(l => loadImg(l.png)));
        let active = null;
        const exImgs = await Promise.all(saved.layers.map(l => l.ext ? loadImg(l.ext.png).catch(() => null) : null));
        const layers = saved.layers.map((l, i) => {
          const id = this.nid++; this.px[id] = this.raster(imgs[i], 1); if (l.active) active = id;
          const ei = exImgs[i];
          if (ei) { const c = mk(ei.width, ei.height), x = c.getContext('2d'); x.drawImage(ei, 0, 0); this.ext[id] = { x: l.ext.x, y: l.ext.y, w: ei.width, h: ei.height, data: new Uint8ClampedArray(x.getImageData(0, 0, ei.width, ei.height).data) }; }
          return { id, name: l.name, visible: l.visible, opacity: l.opacity ?? 100 };
        });
        this.setState({ layers, active: active || layers[layers.length - 1].id, color: saved.color || this.state.color, recent: saved.recent || [] }, () => this.afterChange(layers.map(l => l.id), false));
        return;
      } catch (e) {}
    }
    this.addScene(false);
  }
  addScene = async (undoable) => {
    const names = ['1-sky', '2-clouds', '3-mountains', '4-water', '5-dock'], labels = ['Sky', 'Clouds', 'Mountains', 'Water', 'Dock'];
    const imgs = await Promise.all(names.map(n => loadImg((window.__resources && window.__resources['scene_' + n.replace('-', '_')]) || ('layers-v3/' + n + '.png'))));
    if (undoable !== false) this.pushUndo([]);
    const add = imgs.map((img, i) => { const id = this.nid++; this.px[id] = this.raster(img, 2); return { id, name: labels[i], visible: true }; });
    const layers = [...this.state.layers, ...add];
    this.setState({ layers, active: add[add.length - 1].id }, () => this.afterChange(add.map(l => l.id)));
  };
  raster(img, block) {
    const c = mk(W, H), x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(img, 0, 0, img.width * block, img.height * block);
    return new Uint8ClampedArray(x.getImageData(0, 0, W, H).data);
  }

  composite(only, ids) {
    const out = this.comp || (this.comp = new ImageData(W, H)), o = out.data;
    o.fill(0);
    const list = ids || (only ? [only] : this.state.layers.filter(l => l.visible).map(l => l.id));
    const opm = {}; if (!only) this.state.layers.forEach(l => opm[l.id] = (l.opacity ?? 100) / 100);
    for (const id of list) {
      const s = this.px[id];
      if (!s) continue;
      const lo = opm[id] ?? 1; if (lo <= 0) continue;
      for (let i = 0; i < N * 4; i += 4) {
        const a = lo === 1 ? s[i + 3] : Math.round(s[i + 3] * lo);
        if (!a) continue;
        if (a === 255 || !o[i + 3]) { o[i] = s[i]; o[i + 1] = s[i + 1]; o[i + 2] = s[i + 2]; o[i + 3] = a; continue; }
        const sa = a / 255, da = o[i + 3] / 255, oa = sa + da * (1 - sa);
        for (let c = 0; c < 3; c++) o[i + c] = (s[i + c] * sa + o[i + c] * da * (1 - sa)) / oa;
        o[i + 3] = oa * 255;
      }
    }
    return out;
  }
  redraw() { const c = this.mainRef.current; if (c) c.getContext('2d').putImageData(this.composite(), 0, 0); }
  drawOverlay() {
    const c = this.ovRef.current; if (!c) return;
    const z = this.state.zoom, x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    if (this.state.grid && z >= 3) {
      for (let i = 1; i < W; i++) { x.fillStyle = i % 16 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.18)'; x.fillRect(i * z, 0, 1, H * z); }
      for (let j = 1; j < H; j++) { x.fillStyle = j % 16 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.18)'; x.fillRect(0, j * z, W * z, 1); }
    }
    if (this.state.view !== 'clip') return;
    const m = this.mask, t = mk(W, H), tx = t.getContext('2d'), id = tx.createImageData(W, H);
    for (let p = 0; p < N; p++) if (m[p]) { id.data[p * 4] = 255; id.data[p * 4 + 1] = 216; id.data[p * 4 + 2] = 110; id.data[p * 4 + 3] = 90; }
    tx.putImageData(id, 0, 0);
    x.imageSmoothingEnabled = false;
    x.drawImage(t, 0, 0, W * z, H * z);
    x.fillStyle = '#ffd86e';
    const lw = z >= 6 ? 2 : 1;
    for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) {
      const p = y * W + X; if (!m[p]) continue;
      if (X === 0 || !m[p - 1]) x.fillRect(X * z, y * z, lw, z);
      if (X === W - 1 || !m[p + 1]) x.fillRect((X + 1) * z - lw, y * z, lw, z);
      if (y === 0 || !m[p - W]) x.fillRect(X * z, y * z, z, lw);
      if (y === H - 1 || !m[p + W]) x.fillRect(X * z, (y + 1) * z - lw, z, lw);
    }
  }
  drawCursor() {
    const c = this.curRef.current; if (!c) return;
    const x = c.getContext('2d'), z = this.state.zoom, p = this.state.cursor;
    x.clearRect(0, 0, c.width, c.height);
    const t = this.state.tool;
    if (t === 'move') {
      const b = this.mv ? this.mv.cur : this.curBox(); if (!b) return;
      const X = b.x * z, Y = b.y * z, Wd = b.w * z, Hd = b.h * z;
      x.strokeStyle = '#111'; x.lineWidth = 3; x.strokeRect(X + 0.5, Y + 0.5, Wd - 1, Hd - 1);
      x.strokeStyle = '#ffd86e'; x.lineWidth = 1; x.strokeRect(X + 0.5, Y + 0.5, Wd - 1, Hd - 1);
      [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]].forEach(([u, v]) => {
        const hx = Math.round(X + Wd * u) - 4, hy = Math.round(Y + Hd * v) - 4;
        x.fillStyle = '#111'; x.fillRect(hx - 1, hy - 1, 10, 10); x.fillStyle = '#f2ecd8'; x.fillRect(hx, hy, 8, 8);
      });
      return;
    }
    if (!p) return;
    const s = t === 'sel' || t === 'unsel' ? this.state.selSize : (t === 'pen' || t === 'eraser' ? this.state.size : 1), o = (s - 1) >> 1;
    if (t === 'pen') { x.globalAlpha = 0.55; x.fillStyle = this.state.color; x.fillRect((p.x - o) * z, (p.y - o) * z, s * z, s * z); x.globalAlpha = 1; }
    x.strokeStyle = '#111'; x.lineWidth = 3; x.strokeRect((p.x - o) * z + 0.5, (p.y - o) * z + 0.5, s * z - 1, s * z - 1);
    x.strokeStyle = t === 'sel' || t === 'unsel' ? '#ffd86e' : '#f2ecd8'; x.lineWidth = 1; x.strokeRect((p.x - o) * z + 0.5, (p.y - o) * z + 0.5, s * z - 1, s * z - 1);
  }

  snap(ids) {
    const L = this.state.layers;
    const ce = e => e ? { ...e, data: e.data.slice() } : null;
    return { layers: L.map(l => ({ ...l })), active: this.state.active, px: ids.map(id => [id, this.px[id] ? this.px[id].slice() : null, ce(this.ext[id])]), mask: this.mask.slice() };
  }
  pushUndo(ids) { if (this.imp && ids.includes(this.imp.id)) { this.imp = null; this.setState({ impInfo: null }); } this.undo.push(this.snap(ids)); if (this.undo.length > 60) this.undo.shift(); this.redo = []; }
  restore(s) {
    if (this.imp && s.px.some(p => p[0] === this.imp.id)) { this.imp = null; this.setState({ impInfo: null }); }
    s.px.forEach(([id, d, e]) => { if (d) { this.px[id] = d.slice(); this.ext[id] = e ? { ...e, data: e.data.slice() } : null; } });
    this.mask = s.mask.slice();
    this.setState({ layers: s.layers, active: s.active }, () => this.afterChange(s.px.map(p => p[0])));
  }
  doUndo = () => { const s = this.undo.pop(); if (!s) return; this.redo.push(this.snap(s.px.map(p => p[0]))); this.restore(s); };
  doRedo = () => { const s = this.redo.pop(); if (!s) return; this.undo.push(this.snap(s.px.map(p => p[0]))); this.restore(s); };

  afterChange(ids, save) {
    this.redraw(); this.drawOverlay();
    (ids || this.state.layers.map(l => l.id)).forEach(id => {
      if (!this.px[id]) return;
      const c = mk(W, H); c.getContext('2d').putImageData(new ImageData(this.px[id].slice(), W, H), 0, 0);
      blobUrl(c).then(u => { const old = this.thumbs[id]; this.thumbs[id] = 'url(' + u + ')'; if (old) URL.revokeObjectURL(old.slice(4, -1)); this.forceUpdate(); });
    });
    const counts = new Map();
    this.state.layers.forEach(l => { const d = this.px[l.id]; for (let i = 0; i < N * 4; i += 8) if (d[i + 3] > 127) { const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; counts.set(k, (counts.get(k) || 0) + 1); } });
    const palette = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 32).map(([k]) => rgb2hex(k >> 16, (k >> 8) & 255, k & 255));
    let sc = 0; for (let p = 0; p < N; p++) sc += this.mask[p];
    this.setState({ palette, selCount: sc, hist: this.state.hist + 1 });
    if (save !== false) this.scheduleSave();
  }
  scheduleSave() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      try {
        const c = mk(W, H), x = c.getContext('2d');
        const layers = this.state.layers.map(l => { x.clearRect(0, 0, W, H); x.putImageData(new ImageData(this.px[l.id].slice(), W, H), 0, 0); const out = { name: l.name, visible: l.visible, opacity: l.opacity ?? 100, png: c.toDataURL(), active: l.id === this.state.active }; const e = this.ext[l.id]; if (e) { const ec = mk(e.w, e.h); ec.getContext('2d').putImageData(new ImageData(e.data.slice(), e.w, e.h), 0, 0); out.ext = { x: e.x, y: e.y, png: ec.toDataURL() }; } return out; });
        localStorage.setItem(KEY, JSON.stringify({ layers, color: this.state.color, recent: this.state.recent }));
      } catch (e) {}
    }, 700);
  }

  cell(e) {
    const r = this.curRef.current.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / r.width * W), y: Math.floor((e.clientY - r.top) / r.height * H) };
  }
  inCanvas(p) { return p.x >= 0 && p.y >= 0 && p.x < W && p.y < H; }
  fcell(e) { const r = this.curRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  layerBox(id) {
    const d = this.px[id]; if (!d) return null;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  srcRect(id) {
    const b = this.layerBox(id), e = this.ext[id];
    if (!e) return b;
    if (!b) return { x: e.x, y: e.y, w: e.w, h: e.h };
    const x = Math.min(b.x, e.x), y = Math.min(b.y, e.y);
    return { x, y, w: Math.max(b.x + b.w, e.x + e.w) - x, h: Math.max(b.y + b.h, e.y + e.h) - y };
  }
  layerSource(id) {
    const u = this.srcRect(id); if (!u) return null;
    const d = this.px[id], e = this.ext[id], out = new Uint8ClampedArray(u.w * u.h * 4);
    if (e) for (let j = 0; j < e.h; j++) out.set(e.data.subarray(j * e.w * 4, (j + 1) * e.w * 4), ((e.y - u.y + j) * u.w + (e.x - u.x)) * 4);
    for (let Y = Math.max(0, u.y); Y < Math.min(H, u.y + u.h); Y++) for (let X = Math.max(0, u.x); X < Math.min(W, u.x + u.w); X++) {
      const s = (Y * W + X) * 4; out.set(d.subarray(s, s + 4), ((Y - u.y) * u.w + (X - u.x)) * 4);
    }
    return { ...u, data: out };
  }
  scaleSrc(s, nb) {
    const out = new Uint8ClampedArray(nb.w * nb.h * 4);
    for (let j = 0; j < nb.h; j++) { const sy = Math.floor(j * s.h / nb.h); for (let i = 0; i < nb.w; i++) { const k = (sy * s.w + Math.floor(i * s.w / nb.w)) * 4; out.set(s.data.subarray(k, k + 4), (j * nb.w + i) * 4); } }
    return out;
  }
  finalize(id, s, nb) {
    const full = nb.w === s.w && nb.h === s.h ? s.data : this.scaleSrc(s, nb), d = new Uint8ClampedArray(N * 4);
    for (let Y = Math.max(0, nb.y); Y < Math.min(H, nb.y + nb.h); Y++) for (let X = Math.max(0, nb.x); X < Math.min(W, nb.x + nb.w); X++) {
      const k = ((Y - nb.y) * nb.w + (X - nb.x)) * 4; d.set(full.subarray(k, k + 4), (Y * W + X) * 4);
    }
    this.px[id] = d;
    this.ext[id] = nb.x >= 0 && nb.y >= 0 && nb.x + nb.w <= W && nb.y + nb.h <= H ? null : { ...nb, data: full };
  }
  curBox() {
    const k = this.state.hist + ':' + this.state.active;
    if (!this.boxC || this.boxC.k !== k) this.boxC = { k, b: this.srcRect(this.state.active) };
    return this.boxC.b;
  }
  hitBox(b, f) {
    if (!b) return null;
    const t = Math.max(0.5, 6 / this.state.zoom), r = b.x + b.w, bt = b.y + b.h;
    if (f.x < b.x - t || f.x > r + t || f.y < b.y - t || f.y > bt + t) return null;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let v = Math.abs(f.y - b.y) < t ? 'n' : Math.abs(f.y - bt) < t ? 's' : '';
    let h = Math.abs(f.x - b.x) < t ? 'w' : Math.abs(f.x - r) < t ? 'e' : '';
    if (v && !h && Math.abs(f.x - cx) > t) v = '';
    if (h && !v && Math.abs(f.y - cy) > t) h = '';
    return v + h || (f.x >= b.x && f.x <= r && f.y >= b.y && f.y <= bt ? 'move' : null);
  }
  renderMove(nb) {
    const m = this.mv, s = m.src, d = new Uint8ClampedArray(N * 4);
    for (let Y = Math.max(0, nb.y); Y < Math.min(H, nb.y + nb.h); Y++) {
      const sy = Math.floor((Y - nb.y) * s.h / nb.h);
      for (let X = Math.max(0, nb.x); X < Math.min(W, nb.x + nb.w); X++) {
        const k = (sy * s.w + Math.floor((X - nb.x) * s.w / nb.w)) * 4; d.set(s.data.subarray(k, k + 4), (Y * W + X) * 4);
      }
    }
    this.px[m.id] = d; m.cur = nb; this.redraw(); this.drawCursor();
    this.setState({ status: 'X ' + nb.x + '  Y ' + nb.y + '  ·  ' + nb.w + ' × ' + nb.h + ' PX' });
  }
  moveTo(f, shift) {
    const m = this.mv, b = m.box, dx = f.x - m.sx, dy = f.y - m.sy, md = m.mode;
    let nb;
    if (md === 'move') nb = { x: b.x + Math.round(dx), y: b.y + Math.round(dy), w: b.w, h: b.h };
    else {
      let l = b.x, t = b.y, r = b.x + b.w, bt = b.y + b.h;
      if (md.includes('w')) l = Math.min(Math.round(l + dx), r - 1);
      if (md.includes('e')) r = Math.max(Math.round(r + dx), l + 1);
      if (md.includes('n')) t = Math.min(Math.round(t + dy), bt - 1);
      if (md.includes('s')) bt = Math.max(Math.round(bt + dy), t + 1);
      if (shift && md.length === 2) {
        const s = Math.max((r - l) / b.w, (bt - t) / b.h), w = Math.max(1, Math.round(b.w * s)), h = Math.max(1, Math.round(b.h * s));
        if (md.includes('w')) l = r - w; else r = l + w;
        if (md.includes('n')) t = bt - h; else bt = t + h;
      }
      nb = { x: l, y: t, w: Math.min(2048, r - l), h: Math.min(2048, bt - t) };
    }
    const c = m.cur; if (c.x !== nb.x || c.y !== nb.y || c.w !== nb.w || c.h !== nb.h) this.renderMove(nb);
  }
  nudge(dx, dy) {
    const L = this.activeLayer(); if (!L) return;
    const s = this.layerSource(L.id); if (!s) return;
    this.pushUndo([L.id]);
    this.finalize(L.id, s, { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h });
    this.afterChange([L.id]);
  }
  activeLayer() { return this.state.layers.find(l => l.id === this.state.active); }
  stamp(x, y) {
    const s = this.state.size, o = (s - 1) >> 1, d = this.px[this.state.active], er = this.state.tool === 'eraser', [r, g, b] = this.rgb;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const X = x - o + i, Y = y - o + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const k = (Y * W + X) * 4;
      if (er) { d[k] = d[k + 1] = d[k + 2] = d[k + 3] = 0; } else { d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255; }
    }
  }
  stampMask(x, y) {
    const s = this.state.selSize, o = (s - 1) >> 1, v = this.state.tool === 'sel' ? 1 : 0;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const X = x - o + i, Y = y - o + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      this.mask[Y * W + X] = v;
    }
  }
  line(a, b, fn) {
    let x0 = a.x, y0 = a.y; const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0), sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1; let err = dx + dy;
    for (;;) { fn(x0, y0); if (x0 === b.x && y0 === b.y) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  fill(x, y) {
    const d = this.px[this.state.active], i0 = (y * W + x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], [r, g, b] = this.rgb;
    if (t[3] === 255 && t[0] === r && t[1] === g && t[2] === b) return false;
    const same = t[3] === 0 ? i => d[i + 3] === 0 : i => d[i] === t[0] && d[i + 1] === t[1] && d[i + 2] === t[2] && d[i + 3] === t[3];
    const seen = new Uint8Array(N), st = [y * W + x];
    while (st.length) {
      const p = st.pop(); if (seen[p]) continue; seen[p] = 1;
      const i = p * 4; if (!same(i)) continue;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      const X = p % W;
      if (X > 0) st.push(p - 1); if (X < W - 1) st.push(p + 1); if (p >= W) st.push(p - W); if (p < N - W) st.push(p + W);
    }
    return true;
  }
  pick(p) {
    const o = this.composite().data, i = (p.y * W + p.x) * 4;
    if (!o[i + 3]) { this.flash('NOTHING TO PICK THERE'); return; }
    this.setColor(rgb2hex(o[i], o[i + 1], o[i + 2]));
    if (this.state.tool === 'pick') this.setState({ tool: this.state.prevTool === 'pick' ? 'pen' : this.state.prevTool });
  }
  setColor(c) { this.setState({ color: c }); }
  addRecent(c) { const r = [c, ...this.state.recent.filter(x => x !== c)].slice(0, 8); if (r.join() !== this.state.recent.join()) this.setState({ recent: r }); }
  flash(msg) { clearTimeout(this.flashT); this.setState({ status: msg }); this.flashT = setTimeout(() => this.setState({ status: '' }), 2200); }

  onDown = e => {
    if (e.button === 2) return;
    const sc = e.currentTarget; if (e.target === sc && (e.clientX - sc.getBoundingClientRect().left >= sc.clientWidth || e.clientY - sc.getBoundingClientRect().top >= sc.clientHeight)) return;
    const p = this.cell(e), t = this.state.tool, view = this.state.view;
    sc.setPointerCapture(e.pointerId);
    if (!this.inCanvas(p) && (t === 'pick' || t === 'fill' || e.altKey)) return;
    if (view === 'paint' && (t === 'pick' || e.altKey)) { this.pick(p); return; }
    const L = this.activeLayer();
    if (!L) return;
    if (t === 'move') {
      if (!L.visible) { this.flash('ACTIVE LAYER IS HIDDEN'); return; }
      const src = this.layerSource(L.id); if (!src) { this.flash('ACTIVE LAYER IS EMPTY'); return; }
      const box = { x: src.x, y: src.y, w: src.w, h: src.h }, f = this.fcell(e);
      this.pushUndo([L.id]);
      this.mv = { id: L.id, src, box, cur: box, mode: this.hitBox(box, f) || 'move', sx: f.x, sy: f.y };
      this.drawing = 'move'; return;
    }
    if (view === 'paint' && !L.visible) { this.flash('ACTIVE LAYER IS HIDDEN'); return; }
    this.rgb = hex2rgb(this.state.color);
    if (t === 'fill') { this.pushUndo([L.id]); if (this.fill(p.x, p.y)) { this.addRecent(this.state.color); this.afterChange([L.id]); } else this.undo.pop(); return; }
    if (t === 'pen' || t === 'eraser') { this.pushUndo([L.id]); this.drawing = 'px'; this.last = p; this.stamp(p.x, p.y); this.redraw(); }
    if (t === 'sel' || t === 'unsel') { this.pushUndo([]); this.drawing = 'mask'; this.last = p; this.stampMask(p.x, p.y); this.drawOverlay(); }
  };
  onMove = e => {
    const p = this.cell(e), m = Math.max(this.state.size, this.state.selSize), near = p.x > -m && p.y > -m && p.x < W + m && p.y < H + m, cp = near ? p : null, cur = this.state.cursor;
    if (cp ? (!cur || cur.x !== p.x || cur.y !== p.y) : cur) this.setState({ cursor: cp }, () => this.drawCursor());
    if (this.drawing === 'move') { this.moveTo(this.fcell(e), e.shiftKey); return; }
    if (this.state.tool === 'move') { const css = CURS[this.hitBox(this.curBox(), this.fcell(e))] || 'default'; if (css !== this.state.cursorCss) this.setState({ cursorCss: css }); }
    if (!this.drawing) return;
    if (this.drawing === 'px') { this.line(this.last, p, (x, y) => this.stamp(x, y)); this.redraw(); }
    else { this.line(this.last, p, (x, y) => this.stampMask(x, y)); this.drawOverlay(); }
    this.last = p;
  };
  onUp = () => {
    if (!this.drawing) return;
    const kind = this.drawing; this.drawing = null;
    if (kind === 'move') { const m = this.mv; this.mv = null; this.finalize(m.id, m.src, m.cur); this.afterChange([m.id]); this.flash(this.state.status); return; }
    if (kind === 'px') { if (this.state.tool === 'pen') this.addRecent(this.state.color); this.afterChange([this.state.active]); }
    else this.afterChange([], false);
  };
  onLeave = () => { if (!this.drawing) this.setState({ cursor: null }, () => this.drawCursor()); };
  onKey = e => {
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return; }
    if ((e.metaKey || e.ctrlKey) && k === 'y') { e.preventDefault(); this.doRedo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'm') { this.setTool('move'); return; }
    const ar = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
    if (ar && this.state.tool === 'move' && !this.drawing) { e.preventDefault(); const n = e.shiftKey ? 10 : 1; this.nudge(ar[0] * n, ar[1] * n); return; }
    const map = { b: ['paint', 'pen'], e: ['paint', 'eraser'], g: ['paint', 'fill'], i: ['paint', 'pick'], s: ['clip', 'sel'], d: ['clip', 'unsel'] };
    if (map[k]) { this.setTool(map[k][1], map[k][0]); return; }
    const key = this.state.view === 'clip' ? 'selSize' : 'size', max = this.state.view === 'clip' ? 24 : 8;
    if (k === '[') this.setState({ [key]: Math.max(1, this.state[key] - 1) }, () => this.drawCursor());
    if (k === ']') this.setState({ [key]: Math.min(max, this.state[key] + 1) }, () => this.drawCursor());
  };
  setTool(tool, view) { this.setState(s => ({ tool, view: view || s.view, prevTool: s.tool === 'pick' ? s.prevTool : s.tool })); }
  setView(view) { if (view !== this.state.view) this.setState({ view, tool: view === 'clip' ? 'sel' : 'pen' }); }

  updLayers(fn, ids, undoIds) {
    this.pushUndo(undoIds || []);
    const r = fn(this.state.layers.slice());
    this.setState(r, () => this.afterChange(ids || []));
  }
  newLayer = () => {
    const id = this.nid++; this.px[id] = new Uint8ClampedArray(N * 4);
    const idx = this.state.layers.findIndex(l => l.id === this.state.active);
    this.updLayers(L => { L.splice(idx + 1, 0, { id, name: 'Layer ' + id, visible: true }); return { layers: L, active: id }; }, [id]);
  };
  moveLayer(dir) {
    const L0 = this.state.layers, i = L0.findIndex(l => l.id === this.state.active), j = i + dir;
    if (i < 0 || j < 0 || j >= L0.length) return;
    this.updLayers(L => { [L[i], L[j]] = [L[j], L[i]]; return { layers: L }; });
  }
  delLayer = () => {
    const L0 = this.state.layers; if (L0.length < 2) { this.flash('KEEP AT LEAST ONE LAYER'); return; }
    const i = L0.findIndex(l => l.id === this.state.active);
    this.updLayers(L => { L.splice(i, 1); return { layers: L, active: L[Math.max(0, i - 1)].id }; });
  };
  mergeDown = () => {
    const L0 = this.state.layers, i = L0.findIndex(l => l.id === this.state.active);
    if (i < 1) { this.flash('NO LAYER BELOW'); return; }
    const top = L0[i], bot = L0[i - 1];
    this.pushUndo([bot.id]);
    this.px[bot.id] = this.composite(null, [bot.id, top.id]).data.slice();
    const L = L0.slice(); L.splice(i, 1); L[i - 1] = { ...bot, opacity: 100 };
    this.setState({ layers: L, active: bot.id }, () => this.afterChange([bot.id]));
  };
  clipOut(cut) {
    const L0 = this.state.layers, a = this.activeLayer();
    if (!a) return;
    if (!this.state.selCount) { this.flash('PAINT A SELECTION FIRST'); return; }
    const src = this.px[a.id], dst = new Uint8ClampedArray(N * 4);
    let n = 0;
    for (let p = 0; p < N; p++) if (this.mask[p] && src[p * 4 + 3]) { const i = p * 4; dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = src[i + 3]; n++; }
    if (!n) { this.flash('NO PIXELS ON ' + a.name.toUpperCase() + ' IN SELECTION'); return; }
    this.pushUndo([a.id]);
    if (cut) for (let p = 0; p < N; p++) if (this.mask[p]) src.fill(0, p * 4, p * 4 + 4);
    const id = this.nid++; this.px[id] = dst;
    this.mask = new Uint8Array(N);
    const L = L0.slice(); L.splice(L0.indexOf(a) + 1, 0, { id, name: a.name + (cut ? ' clip' : ' copy'), visible: true });
    this.setState({ layers: L, active: id }, () => { this.afterChange([a.id, id]); this.flash((cut ? 'CLIPPED ' : 'COPIED ') + n + ' PX TO NEW LAYER'); });
  }
  selOp(fn) { this.pushUndo([]); fn(); this.afterChange([], false); }

  quantize(d, k) {
    const idx = [];
    for (let p = 0; p < d.length / 4; p++) if (d[p * 4 + 3] >= 128) idx.push(p);
    if (!idx.length) return;
    let boxes = [idx];
    while (boxes.length < k) {
      let best = 0, bi = -1, bc = 0;
      boxes.forEach((b, j) => {
        if (b.length < 2) return;
        for (let c = 0; c < 3; c++) { let mn = 255, mx = 0; for (const p of b) { const v = d[p * 4 + c]; if (v < mn) mn = v; if (v > mx) mx = v; } if (mx - mn > best) { best = mx - mn; bi = j; bc = c; } }
      });
      if (bi < 0) break;
      const b = boxes[bi]; b.sort((p, q) => d[p * 4 + bc] - d[q * 4 + bc]);
      const m = b.length >> 1; boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
    }
    const pal = boxes.map(b => { const s = [0, 0, 0]; for (const p of b) for (let c = 0; c < 3; c++) s[c] += d[p * 4 + c]; return s.map(v => Math.round(v / b.length)); });
    for (let p = 0; p < d.length / 4; p++) {
      const i = p * 4;
      if (d[i + 3] < 128) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
      let bd = 1e9, bp = pal[0];
      for (const c of pal) { const e = (d[i] - c[0]) ** 2 * 0.3 + (d[i + 1] - c[1]) ** 2 * 0.59 + (d[i + 2] - c[2]) ** 2 * 0.11; if (e < bd) { bd = e; bp = c; } }
      d[i] = bp[0]; d[i + 1] = bp[1]; d[i + 2] = bp[2]; d[i + 3] = 255;
    }
  }
  applyImport() {
    const m = this.imp; if (!m || !this.px[m.id]) return;
    const d = sharpen(m.src, m.gw, m.gh, this.state.impSharp / 100 * 2.5, this.state.impTame / 100);
    RANGE_SEP = 0.25 - this.state.impSep / 100 * 0.22;
    const groups = findRanges(d, this.state.impFam), fi = familyReduce(d, m.gw, m.gh, this.state.impFam, groups);
    const rangeOf = fi ? fi.rangeOf : rangeMap(groups), ranges = rangeTones(d, rangeOf, 6);
    let sel = this.state.impDeepSel;
    if (m.nr != null && m.nr !== ranges.length) { sel = null; this.setState({ impDeepSel: null, impRangeAdj: {}, impEditRi: null }); this.state.impRangeAdj = {}; }
    m.nr = ranges.length;
    const pr = new Int16Array(m.gw * m.gh).fill(-1);
    for (let p = 0, i = 0; i < d.length; i += 4, p++) if (d[i + 3] >= 128) { const r = rangeOf.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); if (r != null) pr[p] = r; }
    deepen(d, this.state.impDeep / 100, rangeOf, sel && new Set(sel));
    adjustRanges(d, pr, this.state.impRangeAdj || {});
    const uniq = quantizeData(d.slice(), 1e9), k = detailToK(this.state.impDetail, uniq);
    quantizeData(d, k);
    const g = mk(m.gw, m.gh); g.getContext('2d').putImageData(new ImageData(d, m.gw, m.gh), 0, 0);
    this.px[m.id] = this.raster(g, m.b);
    this.setState({ impInfo: { name: m.name, uniq, k: Math.min(k, uniq), fi, ranges } });
  }
  async importExact(file) {
    if (!/png$/i.test(file.type || '') && !/\.png$/i.test(file.name || '')) { this.flash('PLEASE CHOOSE A .PNG FILE'); return; }
    const url = URL.createObjectURL(file);
    let img; try { img = await loadImg(url); } catch (e) { this.flash('COULD NOT READ PNG'); return; }
    if (this.state.trim) img = trimImage(img);
    const c = mk(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const src = { x: 0, y: 0, w: img.width, h: img.height, data: new Uint8ClampedArray(x.getImageData(0, 0, img.width, img.height).data) };
    if (this.state.rmBg) removeBg(src.data, src.w, src.h, { x: 0, y: 0, w: src.w, h: src.h }, 30);
    const id = this.nid++;
    this.finalize(id, src, { x: 0, y: 0, w: src.w, h: src.h });
    const name = (file.name || 'PNG').replace(/\.[^.]+$/, '').slice(0, 20);
    const idx = this.state.layers.findIndex(l => l.id === this.state.active);
    this.updLayers(L => { L.splice(idx + 1, 0, { id, name, visible: true }); return { layers: L, active: id }; }, [id]);
    this.flash('PLACED ' + src.w + ' × ' + src.h + ' PNG' + (src.w > W || src.h > H ? ' — EXTENDS PAST CANVAS, USE MOVE (M)' : ''));
  }
  setImp(key, v) {
    const a = this.activeLayer();
    if (a && (!this.imp || this.imp.id !== a.id)) {
      if (!this.beginAdjust(a)) { this.setState({ [key]: v }); return; }
      this.setState({ impDetail: 100, impFam: 100, impSharp: 0, impDeep: 0, impDeepSel: null, impRangeAdj: {}, impEditRi: null, [key]: v }, this.liveImp);
      return;
    }
    this.setState({ [key]: v }, this.liveImp);
  }
  beginAdjust(a) {
    if (this.ext[a.id]) { this.flash('MOVE THE LAYER FULLY ONTO THE CANVAS TO ADJUST IT'); return false; }
    const d = this.px[a.id]; if (!d) return false;
    let b = 2;
    outer: for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4;
      for (const q of [i + 4, i + W * 4, i + W * 4 + 4]) for (let c = 0; c < 4; c++) if (d[q + c] !== d[i + c]) { b = 1; break outer; }
    }
    const gw = W / b, gh = H / b, src = new Uint8ClampedArray(gw * gh * 4);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = (y * b * W + x * b) * 4, o = (y * gw + x) * 4; for (let c = 0; c < 4; c++) src[o + c] = d[i + c]; }
    let any = false; for (let i = 3; i < src.length; i += 4) if (src[i]) { any = true; break; }
    if (!any) { this.flash('ACTIVE LAYER IS EMPTY'); return false; }
    this.pushUndo([a.id]);
    this.imp = { id: a.id, src, gw, gh, b, uniq: quantizeData(src.slice(), 1e9), name: a.name };
    return true;
  }
  setRange(k, v) { this.setState(st => { const n = { ...st.impRangeAdj }; for (const ri of st.impEditRi || []) n[ri] = { ...(n[ri] || {}), [k]: v }; return { impRangeAdj: n }; }, this.liveImp); }
  rangeEditVals(s) {
    const adj = s.impRangeAdj || {}, sel = s.impEditRi || [], A = adj[sel[0]] || {}, sg = v => (v > 0 ? '+' : '') + (v || 0);
    const SECT = [[45, 'REDS'], [80, 'ORANGES & BROWNS'], [115, 'YELLOWS'], [170, 'GREENS'], [230, 'TEALS'], [290, 'BLUES'], [345, 'PURPLES'], [361, 'REDS']];
    const groups = new Map();
    for (const r of (s.impInfo && s.impInfo.ranges || []).slice(0, 32)) {
      const g = r.avg.C < 0.035 ? 'NEUTRALS' : SECT.find(x => r.avg.h < x[0])[1];
      if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r);
    }
    const order = ['NEUTRALS', 'REDS', 'ORANGES & BROWNS', 'YELLOWS', 'GREENS', 'TEALS', 'BLUES', 'PURPLES'];
    const editGroups = order.filter(g => groups.has(g)).map(g => {
      const rs = groups.get(g).sort((a, b) => a.avg.L - b.avg.L), ids = rs.map(r => r.ri);
      return {
        label: g + ' · ' + rs.length,
        pickAll: e => this.setState(st => { const cur = st.impEditRi || []; return { impEditRi: e.shiftKey ? [...new Set([...cur, ...ids])] : ids }; }),
        items: rs.map(r => {
          const on = sel.includes(r.ri), R = adj[r.ri], mod = R && (R.h || R.b || R.s);
          return { tones: r.tones.map(c => ({ c })), title: r.count + ' tones · ' + r.n + ' px · shift-click to multi-select', ring: on ? '0 0 0 2px #111, 0 0 0 4px #ffd86e' : mod ? '0 0 0 2px #111, 0 0 0 3px #888' : 'inset 0 0 0 1px #333',
            on: e => this.setState(st => { const cur = st.impEditRi || []; if (e.shiftKey) { const nx = cur.includes(r.ri) ? cur.filter(x => x !== r.ri) : [...cur, r.ri]; return { impEditRi: nx.length ? nx : null }; } return { impEditRi: cur.length === 1 && cur[0] === r.ri ? null : [r.ri] }; }) };
        })
      };
    });
    return {
      editGroups,
      hasEditRi: sel.length > 0 && !!s.impInfo,
      editSelLabel: sel.length > 1 ? sel.length + ' RANGES SELECTED' : sel.length ? '1 RANGE SELECTED' : 'SHIFT-CLICK FOR MULTIPLE',
      rngH: A.h || 0, rngB: A.b || 0, rngS: A.s || 0, rngHLabel: sg(A.h) + '°', rngBLabel: sg(A.b), rngSLabel: sg(A.s),
      onRngH: e => this.setRange('h', +e.target.value), onRngB: e => this.setRange('b', +e.target.value), onRngS: e => this.setRange('s', +e.target.value),
      rngResetLabel: sel.length > 1 ? 'RESET SELECTED' : 'RESET THIS RANGE',
      rngReset: () => this.setState(st => { const n = { ...st.impRangeAdj }; for (const ri of st.impEditRi || []) delete n[ri]; return { impRangeAdj: n }; }, this.liveImp),
      rngResetAll: () => this.setState({ impRangeAdj: {} }, this.liveImp)
    };
  }
  adjustLayer = () => { const a = this.activeLayer(); if (a && this.beginAdjust(a)) this.setState({ impDetail: 100, impFam: 100, impSharp: 0, impDeep: 0, impDeepSel: null, impRangeAdj: {}, impEditRi: null }, this.liveImp); };
  liveImp = () => { if (this.imp && this.px[this.imp.id]) { this.applyImport(); this.redraw(); clearTimeout(this.impT); this.impT = setTimeout(() => this.imp && this.afterChange([this.imp.id]), 120); } };
  async importFile(file) {
    if (!/^image\//.test(file.type || '') && !/\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name || '')) { this.flash('UNSUPPORTED FILE — USE PNG, JPG, GIF OR WEBP'); return; }
    const url = URL.createObjectURL(file);
    let img; try { img = await loadImg(url); } catch (e) { this.flash('COULD NOT READ IMAGE'); return; }
    if (this.state.trim) img = trimImage(img);
    const b = this.state.impBlock, gw = W / b, gh = H / b;
    const sc = Math.min(gw / img.width, gh / img.height), tw = Math.max(1, Math.round(img.width * sc)), th = Math.max(1, Math.round(img.height * sc));
    let src = img, sw = img.width, sh = img.height;
    while (sw / 2 > tw && sh / 2 > th) { const c = mk(Math.floor(sw / 2), Math.floor(sh / 2)), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); src = c; sw = c.width; sh = c.height; }
    const g = mk(gw, gh), gx = g.getContext('2d');
    gx.imageSmoothingEnabled = sc < 1; gx.imageSmoothingQuality = 'high';
    gx.drawImage(src, Math.floor((gw - tw) / 2), Math.floor((gh - th) / 2), tw, th);
    const src0 = new Uint8ClampedArray(gx.getImageData(0, 0, gw, gh).data);
    if (this.state.rmBg) removeBg(src0, gw, gh, { x: Math.floor((gw - tw) / 2), y: Math.floor((gh - th) / 2), w: tw, h: th }, 60);
    URL.revokeObjectURL(url);
    const name = (file.name || 'Import').replace(/\.[^.]+$/, '').slice(0, 20);
    const id = this.nid++;
    const uniq = quantizeData(src0.slice(), 1e9);
    this.px[id] = new Uint8ClampedArray(N * 4);
    if (this._setFor != null) this.lset[this._setFor] = pickImp(this.state);
    this._setFor = id;
    await new Promise(r => this.setState(IMP_DEF, r));
    this.imp = { id, src: src0, gw, gh, b, uniq, name };
    this.applyImport();
    const idx = this.state.layers.findIndex(l => l.id === this.state.active);
    this.updLayers(L => { L.splice(idx + 1, 0, { id, name, visible: true }); return { layers: L, active: id }; }, [id]);
  }
  exportPng(layerOnly) {
    const a = this.activeLayer(); if (layerOnly && !a) return;
    const s = this.state.expScale, src = mk(W, H);
    src.getContext('2d').putImageData(layerOnly ? new ImageData(this.px[a.id].slice(), W, H) : this.composite(), 0, 0);
    this.comp = null;
    const c = mk(W * s, H * s), x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, W * s, H * s);
    c.toBlob(blob => { const u = URL.createObjectURL(blob), el = document.createElement('a'); el.href = u; el.download = (layerOnly ? a.name.replace(/\s+/g, '-').toLowerCase() : 'pixel-studio') + '-' + W * s + 'x' + H * s + '.png'; el.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); });
  }

  renderVals() {
    const s = this.state, on = (a, b) => a === b;
    const tools = TOOLS[s.view].map(([id, label, key]) => {
      const act = s.tool === id;
      return { label, hint: label + ' (' + key + ')', icon: icon(id, act ? '#1a1410' : '#cfcfcf'), bg: act ? '#f2ecd8' : '#1a1a1a', fg: act ? '#1a1410' : '#bbb', bd: act ? '#f2ecd8' : '#2e2e2e', on: () => this.setTool(id) };
    });
    const sw = c => ({ c, ring: c.toLowerCase() === s.color.toLowerCase() ? '0 0 0 2px #111, 0 0 0 4px #f2ecd8' : 'inset 0 0 0 1px rgba(255,255,255,0.08)', on: () => this.setColor(c) });
    const a = this.activeLayer(), cur = s.cursor;
    let statusText = s.status, statusColor = '#ffd86e';
    if (!statusText) { statusColor = '#777'; statusText = s.tool === 'move' ? 'DRAG TO MOVE · HANDLES RESIZE · SHIFT KEEPS RATIO · ARROWS NUDGE' : (a ? 'ACTIVE: ' + a.name.toUpperCase() + (a.visible ? '' : ' (HIDDEN)') : ''); }
    return {
      views: [['paint', 'PAINT'], ['clip', 'CLIP']].map(([id, label]) => ({ label, on: () => this.setView(id), bg: on(s.view, id) ? '#ddd' : '#1c1c1c', fg: on(s.view, id) ? '#111' : '#bbb' })),
      tools, isPaint: s.view === 'paint', isClip: s.view === 'clip',
      doUndo: this.doUndo, doRedo: this.doRedo, undoOp: this.undo.length ? 1 : 0.4, redoOp: this.redo.length ? 1 : 0.4,
      zoomLabel: s.zoom + '×', zoomIn: () => this.setState({ zoom: Math.min(12, s.zoom + 1) }), zoomOut: () => this.setState({ zoom: Math.max(1, s.zoom - 1) }),
      toggleGrid: () => this.setState({ grid: !s.grid }), gridBg: s.grid ? '#ddd' : '#1c1c1c', gridFg: s.grid ? '#111' : '#bbb',
      cw: W * s.zoom + 'px', ch: H * s.zoom + 'px', chk: s.zoom * 2 + 'px ' + s.zoom * 2 + 'px', ovW: W * s.zoom, ovH: H * s.zoom,
      mainRef: this.mainRef, ovRef: this.ovRef, curRef: this.curRef, fileRef: this.fileRef, scrollRef: this.scrollRef,
      onDown: this.onDown, onMove: this.onMove, onUp: this.onUp, onLeave: this.onLeave, noMenu: e => e.preventDefault(),
      posText: cur ? 'X ' + cur.x + '  Y ' + cur.y : 'X –  Y –', gamePosText: cur ? 'GAME PX ' + (cur.x >> 1) + ', ' + (cur.y >> 1) : '',
      statusText, statusColor,
      color: s.color, colorHex: s.color.toUpperCase(), onColor: e => this.setColor(e.target.value),
      hasRecent: s.recent.length > 0, recent: s.recent.map(sw), palette: s.palette.map(sw),
      size: s.size, sizeLabel: s.size + ' PX', onSize: e => this.setState({ size: +e.target.value }),
      selSize: s.selSize, selSizeLabel: s.selSize + ' PX', onSelSize: e => this.setState({ selSize: +e.target.value }),
      selCountLabel: s.selCount ? s.selCount + ' PX' : 'NONE', selOp: s.selCount ? 1 : 0.45,
      clipToLayer: () => this.clipOut(true), copyToLayer: () => this.clipOut(false),
      selLayer: () => { if (!a) return; this.selOp(() => { const d = this.px[a.id]; for (let p = 0; p < N; p++) this.mask[p] = d[p * 4 + 3] ? 1 : 0; }); },
      selInvert: () => this.selOp(() => { for (let p = 0; p < N; p++) this.mask[p] ^= 1; }),
      selClear: () => this.selOp(() => this.mask.fill(0)),
      newLayer: this.newLayer, layerUp: () => this.moveLayer(1), layerDown: () => this.moveLayer(-1), mergeDown: this.mergeDown, delLayer: this.delLayer,
      layerRows: s.layers.slice().reverse().map(l => {
        const act = l.id === s.active;
        return { name: l.name, thumb: this.thumbs[l.id] || 'none', op: l.visible ? 1 : 0.35, eye: l.visible ? 'ON' : 'OFF', eyeFg: l.visible ? '#f2ecd8' : '#666',
          bg: act ? '#2a2620' : 'transparent', ring: act ? 'inset 0 0 0 2px #ffd86e' : 'none', fg: act ? '#f2ecd8' : (l.visible ? '#bbb' : '#666'),
          select: () => this.setState({ active: l.id }, () => this.scheduleSave()),
          toggle: e => { e.stopPropagation(); this.updLayers(L => ({ layers: L.map(x => x.id === l.id ? { ...x, visible: !x.visible } : x) })); },
          rename: () => { const n = prompt('Layer name', l.name); if (n && n.trim()) this.updLayers(L => ({ layers: L.map(x => x.id === l.id ? { ...x, name: n.trim().slice(0, 24) } : x) })); } };
      }),
      sec: Object.fromEntries(Object.keys(s.secOpen).map(k => [k, { open: s.secOpen[k], caret: s.secOpen[k] ? '−' : '+', bg: s.secOpen[k] ? '#141414' : 'transparent', toggle: () => this.setState(st => ({ secOpen: { ...st.secOpen, [k]: !st.secOpen[k] } })) }])),
      layerOpacity: a ? (a.opacity ?? 100) : 100, layerOpacityLabel: (a ? (a.opacity ?? 100) : 100) + '%',
      opStart: () => { if (a) this.pushUndo([]); },
      onLayerOpacity: e => { if (!a) return; const v = +e.target.value; this.setState(st => ({ layers: st.layers.map(x => x.id === a.id ? { ...x, opacity: v } : x) }), () => { this.redraw(); this.scheduleSave(); }); },
      impDetail: s.impDetail,
      onImpDetail: e => this.setImp('impDetail', +e.target.value),
      impSep: s.impSep, onImpSep: e => this.setImp('impSep', +e.target.value), sepOp: s.impFam < 100 ? 1 : 0.4,
      impSepLabel: s.impInfo && s.impInfo.fi ? s.impInfo.fi.fams + ' RANGES' : s.impSep + '%',
      impFam: s.impFam, onImpFam: e => this.setImp('impFam', +e.target.value),
      impFamLabel: s.impFam >= 100 ? 'OFF' : (s.impInfo && s.impInfo.fi ? s.impInfo.fi.fams + ' RANGES · ' : '') + (Math.max(1, Math.round(Math.pow(64, s.impFam / 100)))) + ' TONE' + (Math.round(Math.pow(64, s.impFam / 100)) > 1 ? 'S' : '') + ' EACH',
      ...this.rangeEditVals(s),
      deepOp: s.impDeep ? 1 : 0.45, noRanges: !(s.impInfo && s.impInfo.ranges && s.impInfo.ranges.length),
      deepSelLabel: !s.impDeepSel ? 'ALL RANGES' : s.impDeepSel.length + ' SELECTED',
      deepAll: () => this.setState({ impDeepSel: null }, this.liveImp),
      deepAllBg: s.impDeepSel ? '#1c1c1c' : '#ddd', deepAllFg: s.impDeepSel ? '#bbb' : '#111',
      deepRanges: (s.impInfo && s.impInfo.ranges || []).slice(0, 24).map(r => {
        const on = !!(s.impDeepSel && s.impDeepSel.includes(r.ri));
        return { tones: r.tones.map(c => ({ c })), title: r.count + ' tones · ' + r.n + ' px', ring: on ? '0 0 0 2px #111, 0 0 0 4px #f2ecd8' : 'inset 0 0 0 1px #333',
          on: () => this.setState(st => { const cur = st.impDeepSel || []; const nx = cur.includes(r.ri) ? cur.filter(x => x !== r.ri) : [...cur, r.ri]; return { impDeepSel: nx.length ? nx : null }; }, this.liveImp) };
      }),
      impDeep: s.impDeep, impDeepLabel: s.impDeep ? s.impDeep + '%' : 'OFF', onImpDeep: e => this.setImp('impDeep', +e.target.value),
      impSharp: s.impSharp, impSharpLabel: s.impSharp ? s.impSharp + '%' : 'OFF', onImpSharp: e => this.setImp('impSharp', +e.target.value),
      impTame: s.impTame, impTameLabel: s.impTame + '%', onImpTame: e => this.setImp('impTame', +e.target.value), tameOp: s.impSharp ? 1 : 0.4,
      impLabel: s.impInfo ? s.impInfo.k + ' / ' + s.impInfo.uniq + ' COLORS' : (s.impDetail === 100 ? 'ALL COLORS' : s.impDetail + '%'),
      impHint: s.impInfo ? 'ADJUSTING: ' + s.impInfo.name.toUpperCase() + ' · EDITS BAKE IN, SLIDERS STILL WORK AFTER' : (a ? 'SLIDERS ADJUST ' + a.name.toUpperCase() + ' · OR IMPORT / DROP A NEW IMAGE' : 'APPLIES TO NEXT IMPORT · OR DROP AN IMAGE ON THE CANVAS'),
      canAdjust: !s.impInfo && !!a, adjustLayer: this.adjustLayer, adjustLabel: a ? 'ADJUST ' + a.name.toUpperCase() : '',
      cursorCss: s.cursorCss,
      onDragOver: e => e.preventDefault(),
      onDrop: e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) this.importFile(f); },
      blocks: [[1, '1× · 320×200'], [2, '2× · GAME GRID']].map(([v, label]) => ({ label, on: () => this.setState({ impBlock: v }), bg: s.impBlock === v ? '#ddd' : '#1c1c1c', fg: s.impBlock === v ? '#111' : '#bbb' })),
      pickFile: () => this.fileRef.current && this.fileRef.current.click(),
      onFile: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) this.importFile(f); },
      pickPng: () => this.pngRef.current && this.pngRef.current.click(),
      onPng: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) this.importExact(f); },
      toggleRmBg: () => this.setState({ rmBg: !s.rmBg }), rmBgLabel: s.rmBg ? 'ON' : 'OFF', rmBgFg: s.rmBg ? '#ffd86e' : '#666',
      toggleTrim: () => this.setState({ trim: !s.trim }), trimLabel: s.trim ? 'ON' : 'OFF', trimFg: s.trim ? '#ffd86e' : '#666',
      pngRef: this.pngRef,
      addScene: () => this.addScene(true),
      scales: [1, 2, 4, 8].map(v => ({ label: v + '×', on: () => this.setState({ expScale: v }), bg: s.expScale === v ? '#ddd' : '#1c1c1c', fg: s.expScale === v ? '#111' : '#bbb' })),
      expSizeLabel: W * s.expScale + ' × ' + H * s.expScale + ' PX',
      exportAll: () => this.exportPng(false), exportLayer: () => this.exportPng(true)
    };
  }
}
