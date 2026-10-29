// TRIM TRANSPARENT EDGES. The original worked on an Image via a canvas; this is the same rule
// (alpha > 8 counts as content) on raw RGBA so it runs anywhere.

export type RgbaImage = { w: number; h: number; data: Uint8ClampedArray };

/** Returns the image cropped to its content, or the same object if nothing to trim or it's empty. */
export function trimTransparent(img: RgbaImage): RgbaImage {
  const { w, h, data: d } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) if (d[(y * w + X) * 4 + 3] > 8) { if (X < x0) x0 = X; if (X > x1) x1 = X; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return img;
  const ow = x1 - x0 + 1, oh = y1 - y0 + 1, out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) out.set(d.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + ow) * 4), y * ow * 4);
  return { w: ow, h: oh, data: out };
}
