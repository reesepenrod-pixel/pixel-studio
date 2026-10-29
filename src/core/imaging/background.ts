// Solid-background removal, ported verbatim from the original Pixel Studio.
import type { Pixels } from '../raster/raster';

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * If all four corners of rect `r` share one opaque color (within `tol`, summed RGB distance),
 * flood-fills from the rect's edges and makes every connected near-matching pixel transparent.
 * Works in place on RGBA `d` of width `w`. Returns the number of pixels cleared.
 */
export function removeBg(d: Pixels, w: number, h: number, r: Rect, tol: number): number {
  const at = (x: number, y: number) => (y * w + x) * 4;
  const cs = [at(r.x, r.y), at(r.x + r.w - 1, r.y), at(r.x, r.y + r.h - 1), at(r.x + r.w - 1, r.y + r.h - 1)];
  if (cs.some(i => d[i + 3] < 128)) return 0;
  const bg = [0, 1, 2].map(c => cs.reduce((s, i) => s + d[i + c], 0) / 4);
  const near = (i: number) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) <= tol;
  if (!cs.every(near)) return 0;
  const seen = new Uint8Array(w * h), st: number[] = [];
  for (let x = r.x; x < r.x + r.w; x++) st.push(r.y * w + x, (r.y + r.h - 1) * w + x);
  for (let y = r.y; y < r.y + r.h; y++) st.push(y * w + r.x, y * w + r.x + r.w - 1);
  let n = 0;
  while (st.length) {
    const p = st.pop()!; if (p < 0 || p >= w * h || seen[p]) continue; seen[p] = 1;
    const x = p % w, y = (p / w) | 0; if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) continue;
    const i = p * 4; if (d[i + 3] >= 128 && !near(i)) continue;
    d[i + 3] = 0; n++;
    if (x > r.x) st.push(p - 1);
    if (x < r.x + r.w - 1) st.push(p + 1);
    st.push(p - w, p + w);
  }
  return n;
}
