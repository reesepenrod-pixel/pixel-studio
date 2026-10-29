// The layer compositor, ported from the original Pixel Studio's Component.composite() and
// generalized: each layer is a raster placed at an integer offset, instead of a full-canvas buffer.
// The same function will render art in the editor and scenes in the game runtime.
import { createRaster, type Raster } from './raster';

export type CompositeLayer = { raster: Raster; x: number; y: number; opacity: number /* 0–100 */ };

/** Straight-alpha "over", bottom → top, into a new `w`×`h` raster (or `into`, which is cleared first). */
export function composite(w: number, h: number, layers: readonly CompositeLayer[], into?: Raster): Raster {
  const out = into && into.w === w && into.h === h ? into : createRaster(w, h), o = out.data;
  o.fill(0);
  for (const L of layers) {
    const lo = L.opacity / 100; if (lo <= 0) continue;
    const s = L.raster.data, sw = L.raster.w;
    const x0 = Math.max(0, L.x), x1 = Math.min(w, L.x + L.raster.w), y0 = Math.max(0, L.y), y1 = Math.min(h, L.y + L.raster.h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const si = ((y - L.y) * sw + (x - L.x)) * 4, i = (y * w + x) * 4;
      const a = lo === 1 ? s[si + 3] : Math.round(s[si + 3] * lo);
      if (!a) continue;
      if (a === 255 || !o[i + 3]) { o[i] = s[si]; o[i + 1] = s[si + 1]; o[i + 2] = s[si + 2]; o[i + 3] = a; continue; }
      const sa = a / 255, da = o[i + 3] / 255, oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) o[i + c] = (s[si + c] * sa + o[i + c] * da * (1 - sa)) / oa;
      o[i + 3] = oa * 255;
    }
  }
  return out;
}
