// RECOLOR RANGES, ported verbatim from the original Pixel Studio.
import type { Pixels } from '../raster/raster';
import { fromLab, toLab, type RGB } from './color';

/** Hue in degrees (−180…180), brightness and saturation in −100…100. Missing = 0. */
export type RangeAdjust = { h?: number; b?: number; s?: number };

/**
 * Applies per-range hue/brightness/saturation shifts in place. `pr[p]` is the range index of
 * pixel `p` (−1 = none), captured *before* deepening so recoloring follows the original ranges.
 */
export function adjustRanges(d: Pixels, pr: Int16Array, adj: Record<number, RangeAdjust | undefined>): void {
  const cache = new Map<number, RGB>();
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
