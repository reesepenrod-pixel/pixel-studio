// DEEPEN SHADOWS, ported verbatim from the original Pixel Studio.
import { fromLab, toLab, type Lab, type RGB } from './color';
import type { RangeOf } from './ranges';

// Dark part of a range = tones below the midpoint of that range's own lightness span.
// Darkest tone moves most; tones near the midpoint move least; light half untouched.
export function deepen(d: Uint8ClampedArray, amt: number, rangeOf: RangeOf | null, sel: Set<number> | null): void {
  if (amt <= 0 || !rangeOf) return;
  const per = new Map<number, Set<number>>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2], ri = rangeOf.get(key);
    if (ri == null || (sel && !sel.has(ri))) continue;
    let s = per.get(ri); if (!s) per.set(ri, (s = new Set())); s.add(key);
  }
  const out = new Map<number, RGB>();
  for (const keys of per.values()) {
    if (keys.size < 2) continue;
    const cs: { key: number; p: Lab }[] = [...keys].map(key => ({ key, p: toLab(key >> 16, (key >> 8) & 255, key & 255) }));
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
