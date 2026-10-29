// Drawing primitives, ported from the original Pixel Studio's Component methods
// (stamp, stampMask, line, fill) and generalized from the fixed 320×200 canvas to any raster.
import type { Point, Raster, RGB } from './raster';

/** Square brush of `size` px centered like the original: offset (size − 1) >> 1. `color` null erases. */
export function stamp(r: Raster, x: number, y: number, size: number, color: RGB | null): void {
  const o = (size - 1) >> 1, d = r.data;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const X = x - o + i, Y = y - o + j; if (X < 0 || Y < 0 || X >= r.w || Y >= r.h) continue;
    const k = (Y * r.w + X) * 4;
    if (!color) { d[k] = d[k + 1] = d[k + 2] = d[k + 3] = 0; } else { d[k] = color[0]; d[k + 1] = color[1]; d[k + 2] = color[2]; d[k + 3] = 255; }
  }
}

/** A selection (or any 1-byte-per-pixel) mask. */
export type Mask = { w: number; h: number; data: Uint8Array };
export const createMask = (w: number, h: number): Mask => ({ w, h, data: new Uint8Array(w * h) });

export function stampMask(m: Mask, x: number, y: number, size: number, value: 0 | 1): void {
  const o = (size - 1) >> 1;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const X = x - o + i, Y = y - o + j; if (X < 0 || Y < 0 || X >= m.w || Y >= m.h) continue;
    m.data[Y * m.w + X] = value;
  }
}

/** Bresenham line from a to b inclusive, calling `fn` for every pixel. */
export function line(a: Point, b: Point, fn: (x: number, y: number) => void): void {
  let x0 = a.x, y0 = a.y; const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0), sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1; let err = dx + dy;
  for (;;) { fn(x0, y0); if (x0 === b.x && y0 === b.y) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
}

/**
 * Bucket fill: 4-connected, exact color match (any fully transparent pixel matches a transparent
 * start). Paints opaque `color`. Returns false when nothing would change.
 */
export function floodFill(r: Raster, x: number, y: number, color: RGB): boolean {
  const d = r.data, W = r.w, N = r.w * r.h, i0 = (y * W + x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], [cr, cg, cb] = color;
  if (t[3] === 255 && t[0] === cr && t[1] === cg && t[2] === cb) return false;
  const same = t[3] === 0 ? (i: number) => d[i + 3] === 0 : (i: number) => d[i] === t[0] && d[i + 1] === t[1] && d[i + 2] === t[2] && d[i + 3] === t[3];
  const seen = new Uint8Array(N), st = [y * W + x];
  while (st.length) {
    const p = st.pop()!; if (seen[p]) continue; seen[p] = 1;
    const i = p * 4; if (!same(i)) continue;
    d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = 255;
    const X = p % W;
    if (X > 0) st.push(p - 1);
    if (X < W - 1) st.push(p + 1);
    if (p >= W) st.push(p - W);
    if (p < N - W) st.push(p + W);
  }
  return true;
}
