import { describe, expect, it } from 'vitest';
import { trimTransparent } from '../../src/core/imaging';

const img = (w: number, h: number, opaque: [number, number][]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const [x, y] of opaque) data.set([x, y, 7, 255], (y * w + x) * 4);
  return { w, h, data };
};

describe('trimTransparent', () => {
  it('crops to the content box and keeps pixels in place', () => {
    const out = trimTransparent(img(10, 8, [[2, 3], [5, 6]]));
    expect([out.w, out.h]).toEqual([4, 4]);
    expect([...out.data.subarray(0, 4)]).toEqual([2, 3, 7, 255]);
    expect([...out.data.subarray((3 * 4 + 3) * 4, (3 * 4 + 3) * 4 + 4)]).toEqual([5, 6, 7, 255]);
  });
  it('returns the input unchanged when already tight or fully empty', () => {
    const tight = img(2, 1, [[0, 0], [1, 0]]), empty = img(3, 3, []);
    expect(trimTransparent(tight)).toBe(tight);
    expect(trimTransparent(empty)).toBe(empty);
  });
  it('treats alpha ≤ 8 as empty, matching the original threshold', () => {
    const i = img(4, 4, [[1, 1]]); i.data[(3 * 4 + 3) * 4 + 3] = 8;
    expect(trimTransparent(i).w).toBe(1);
  });
});
