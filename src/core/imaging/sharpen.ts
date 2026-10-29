// Unsharp-style sharpen with a highlight/shadow clamp, ported verbatim from the original Pixel Studio.

/**
 * Returns a sharpened copy of RGBA `src`. `amt` is the strength (0 = plain copy); `tame` (0–1)
 * pulls overshoot back toward the local 3×3 min/max so edges don't grow halos.
 */
export function sharpen(src: Uint8ClampedArray, w: number, h: number, amt: number, tame: number): Uint8ClampedArray {
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
