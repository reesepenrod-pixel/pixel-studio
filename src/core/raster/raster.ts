// A raster is a block of RGBA pixels of any size. Everything in Pixel Studio that holds pixels
// (art layers, masks rendered for display, sprite frames) is built on this.

export type Raster = { w: number; h: number; data: Uint8ClampedArray };
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type RGB = readonly [number, number, number];

export const createRaster = (w: number, h: number): Raster => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
export const cloneRaster = (r: Raster): Raster => ({ w: r.w, h: r.h, data: r.data.slice() });
export const inBounds = (r: { w: number; h: number }, x: number, y: number): boolean => x >= 0 && y >= 0 && x < r.w && y < r.h;

/** Bounding box of pixels with any alpha, or null if the raster is empty. */
export function contentBounds(r: Raster): Rect | null {
  const { w, h, data: d } = r;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Nearest-neighbor resize: the only resampling allowed on pixel art. */
export function scaleNearest(src: Raster, w: number, h: number): Raster {
  if (w === src.w && h === src.h) return cloneRaster(src);
  const out = createRaster(w, h);
  for (let j = 0; j < h; j++) { const sy = Math.floor(j * src.h / h); for (let i = 0; i < w; i++) { const k = (sy * src.w + Math.floor(i * src.w / w)) * 4; out.data.set(src.data.subarray(k, k + 4), (j * w + i) * 4); } }
  return out;
}

/** Copies the `rect` region of `src` (which may extend past its edges; outside stays transparent). */
export function cropRaster(src: Raster, rect: Rect): Raster {
  const out = createRaster(rect.w, rect.h);
  for (let y = Math.max(0, rect.y); y < Math.min(src.h, rect.y + rect.h); y++) {
    const x0 = Math.max(0, rect.x), x1 = Math.min(src.w, rect.x + rect.w);
    if (x1 > x0) out.data.set(src.data.subarray((y * src.w + x0) * 4, (y * src.w + x1) * 4), ((y - rect.y) * rect.w + (x0 - rect.x)) * 4);
  }
  return out;
}
