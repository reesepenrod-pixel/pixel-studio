// Material "ranges": clusters an image's colors into families (skin, wood, water…) in OKLab,
// then optionally reduces each family to a few tones. Ported verbatim from the original
// Pixel Studio; the only change is that range separation is a parameter instead of a global.
import type { Pixels } from '../raster/raster';

import { fromLab, rgb2hex, toLab, type Lab, type RGB } from './color';

export type RangeColor = { key: number; n: number; p: Lab; f: number[] };
export type RangeGroups = RangeColor[][];
export type RangeOf = Map<number, number>;
export type RangeInfo = { ri: number; n: number; count: number; avg: { L: number; C: number; h: number }; tones: string[] };
export type FamilyInfo = { fams: number; T: number; rangeOf: RangeOf };

/** Median cut in OKLab with lightness weighted ×2. Splits `items` into at most `k` boxes. */
export function mcut<T extends { p: Lab; n: number }>(items: T[], k: number): T[][] {
  const boxes = [items];
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

/** RANGE SEPARATION slider (0–100) → clustering distance. */
export const rangeSepFromSlider = (v: number): number => 0.25 - v / 100 * 0.22;

/**
 * Groups the opaque colors of RGBA `d` into material ranges. `rangeSep` is the merge distance
 * (smaller = more ranges). Returns null when the image has no opaque pixels.
 */
export function findRanges(d: Pixels, rangeSep: number): RangeGroups | null {
  const map = new Map<number, RangeColor>(), cols: RangeColor[] = [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let c = map.get(key); if (!c) { c = { key, n: 0, p: toLab(d[i], d[i + 1], d[i + 2]), f: [] }; map.set(key, c); cols.push(c); }
    c.n++;
  }
  if (!cols.length) return null;
  // Ranges = materials. Feature space divides chroma by lightness so a material's shadow and highlight
  // land close together, while different materials of similar hue (skin / hair / shirt / gold) stay apart.
  const feat = (p: Lab) => { const Ld = Math.max(p[0], 0.2); return [p[0] * 0.25, p[1] / Ld * 3, p[2] / Ld * 3]; };
  const dist = (f: number[], g: number[]) => Math.hypot(f[0] - g[0], f[1] - g[1], f[2] - g[2]);
  for (const c of cols) c.f = feat(c.p);
  const D = rangeSep;
  type Cl = { f: number[]; n: number };
  let cl: Cl[] = [];
  for (const c of cols.slice().sort((a, b) => b.n - a.n)) {
    let best: Cl | null = null, bd = 1e9; for (const k of cl) { const dd = dist(k.f, c.f); if (dd < bd) { bd = dd; best = k; } }
    if (best && bd < D) { const t = best.n + c.n; for (let i = 0; i < 3; i++) best.f[i] = (best.f[i] * best.n + c.f[i] * c.n) / t; best.n = t; }
    else cl.push({ f: c.f.slice(), n: c.n });
  }
  const mergeInto = (a: Cl, b: Cl) => { const t = a.n + b.n; for (let i = 0; i < 3; i++) a.f[i] = (a.f[i] * a.n + b.f[i] * b.n) / t; a.n = t; cl = cl.filter(x => x !== b); };
  for (;;) {
    let bi: Cl | null = null, bj: Cl | null = null, bd = 1e9;
    for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) { const dd = dist(cl[i].f, cl[j].f); if (dd < bd) { bd = dd; bi = cl[i]; bj = cl[j]; } }
    if (!bi || !bj || bd > D) break;
    mergeInto(bi.n >= bj.n ? bi : bj, bi.n >= bj.n ? bj : bi);
  }
  const minN = 3;
  for (;;) {
    if (cl.length < 2) break;
    const small = cl.reduce((m, k) => (k.n < m.n ? k : m), cl[0]); if (small.n >= minN) break;
    let tgt: Cl | null = null, bd = 1e9; for (const k of cl) if (k !== small) { const dd = dist(k.f, small.f); if (dd < bd) { bd = dd; tgt = k; } }
    mergeInto(tgt!, small);
  }
  let groups: RangeColor[][] = [];
  for (let it = 0; it < 3; it++) {
    groups = cl.map(() => []);
    for (const c of cols) { let bi = 0, bd = 1e9; cl.forEach((k, i) => { const dd = dist(k.f, c.f); if (dd < bd) { bd = dd; bi = i; } }); groups[bi].push(c); }
    const next = cl.map((_k, i) => { const g = groups[i]; if (!g.length) return null; const s = [0, 0, 0]; let n = 0; for (const c of g) { for (let j = 0; j < 3; j++) s[j] += c.f[j] * c.n; n += c.n; } return { f: s.map(x => x / n), n }; });
    groups = groups.filter((_g, i) => next[i]); cl = next.filter((x): x is Cl => !!x);
  }
  return groups;
}

export function rangeMap(groups: RangeGroups | null): RangeOf {
  const m: RangeOf = new Map(); if (groups) groups.forEach((g, i) => { for (const it of g) m.set(it.key, i); }); return m;
}

/**
 * PALETTE COMPLEXITY 2: reduces each range to `T = round(64^(v/100))` tones (in place).
 * `v >= 100` means off and returns null. The returned `rangeOf` maps the *new* colors to ranges.
 */
export function familyReduce(d: Pixels, v: number, groups: RangeGroups | null): FamilyInfo | null {
  if (v >= 100 || !groups) return null;
  const rangeOf: RangeOf = new Map();
  const fams = new Map(groups.map((g, i) => [i, g.slice()] as const));
  const T = Math.max(1, Math.round(Math.pow(64, v / 100))), out = new Map<number, RGB>();
  for (const [ri, items] of fams) for (const g of mcut(items, T)) {
    const s = [0, 0, 0]; let n = 0; for (const it of g) { for (let c = 0; c < 3; c++) s[c] += it.p[c] * it.n; n += it.n; }
    const rgb = fromLab(s[0] / n, s[1] / n, s[2] / n); for (const it of g) out.set(it.key, rgb);
    rangeOf.set((rgb[0] << 16) | (rgb[1] << 8) | rgb[2], ri);
  }
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const a = out.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])!; d[i] = a[0]; d[i + 1] = a[1]; d[i + 2] = a[2]; }
  return { fams: fams.size, T, rangeOf };
}

/** Summarizes each range: pixel count, distinct tones, average OKLCh, and up to `n` sample tones dark → light. */
export function rangeTones(d: Pixels, rangeOf: RangeOf, n: number): RangeInfo[] {
  const per = new Map<number, Map<number, number>>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2], ri = rangeOf.get(key); if (ri == null) continue;
    let m = per.get(ri); if (!m) per.set(ri, (m = new Map())); m.set(key, (m.get(key) || 0) + 1);
  }
  const out: RangeInfo[] = [];
  for (const [ri, m] of per) {
    const cs = [...m].map(([key, c]) => { const p = toLab(key >> 16, (key >> 8) & 255, key & 255); return { key, c, L: p[0], p }; }).sort((a, b) => a.L - b.L);
    let tot = 0, sL = 0, sa = 0, sb = 0; for (const c of cs) { tot += c.c; sL += c.p[0] * c.c; sa += c.p[1] * c.c; sb += c.p[2] * c.c; }
    const avg = { L: sL / tot, C: Math.hypot(sa / tot, sb / tot), h: ((Math.atan2(sb / tot, sa / tot) * 180 / Math.PI) + 360) % 360 };
    const pick = cs.length <= n ? cs : Array.from({ length: n }, (_, j) => cs[Math.round(j * (cs.length - 1) / (n - 1))]);
    out.push({ ri, n: tot, count: cs.length, avg, tones: pick.map(c => rgb2hex(c.key >> 16, (c.key >> 8) & 255, c.key & 255)) });
  }
  return out.sort((a, b) => b.n - a.n);
}
