import { describe, expect, it } from 'vitest';
import * as R from '../../src/core/raster';

const px = (r: R.Raster, x: number, y: number) => [...r.data.subarray((y * r.w + x) * 4, (y * r.w + x) * 4 + 4)];
const solid = (w: number, h: number, c: number[]) => { const r = R.createRaster(w, h); for (let i = 0; i < r.data.length; i += 4) r.data.set(c, i); return r; };

describe('rasters of any size', () => {
  it('stamp clips at the edges of a non-320×200 raster', () => {
    const r = R.createRaster(16, 16); R.stamp(r, 15, 15, 3, [1, 2, 3]);
    expect(px(r, 15, 15)).toEqual([1, 2, 3, 255]); expect(px(r, 14, 14)).toEqual([1, 2, 3, 255]); expect(px(r, 13, 13)).toEqual([0, 0, 0, 0]);
  });
  it('flood fill stays inside its region on a 32×64 sprite', () => {
    const r = R.createRaster(32, 64); for (let y = 0; y < 64; y++) R.stamp(r, 16, y, 1, [9, 9, 9]);
    expect(R.floodFill(r, 0, 0, [200, 0, 0])).toBe(true);
    expect(px(r, 15, 30)).toEqual([200, 0, 0, 255]); expect(px(r, 17, 30)).toEqual([0, 0, 0, 0]); expect(px(r, 16, 30)).toEqual([9, 9, 9, 255]);
  });
  it('crop handles regions hanging off every side', () => {
    const r = solid(4, 4, [5, 5, 5, 255]), c = R.cropRaster(r, { x: -2, y: 3, w: 8, h: 3 });
    expect([c.w, c.h]).toEqual([8, 3]); expect(px(c, 1, 0)).toEqual([0, 0, 0, 0]); expect(px(c, 2, 0)).toEqual([5, 5, 5, 255]); expect(px(c, 2, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe('composite with offsets (replaces the original off-canvas "ext" special case)', () => {
  it('places a layer at an offset and clips what hangs off the canvas', () => {
    const out = R.composite(10, 10, [{ raster: solid(4, 4, [255, 0, 0, 255]), x: 8, y: -2, opacity: 100 }]);
    expect(px(out, 8, 0)).toEqual([255, 0, 0, 255]); expect(px(out, 9, 1)).toEqual([255, 0, 0, 255]); expect(px(out, 7, 0)).toEqual([0, 0, 0, 0]); expect(px(out, 8, 2)).toEqual([0, 0, 0, 0]);
  });
  it('a layer entirely off-canvas contributes nothing and does not throw', () => {
    const out = R.composite(10, 10, [{ raster: solid(4, 4, [1, 1, 1, 255]), x: 50, y: -40, opacity: 100 }]);
    expect(out.data.every(v => v === 0)).toBe(true);
  });
  it('reuses the `into` buffer when the size matches', () => {
    const buf = R.createRaster(4, 4); buf.data.fill(77);
    expect(R.composite(4, 4, [], buf)).toBe(buf); expect(buf.data.every(v => v === 0)).toBe(true);
  });
});

describe('sceneColors', () => {
  it('orders by usage and ignores transparent pixels', () => {
    const r = R.createRaster(8, 1);
    [[10, 0, 0], [10, 0, 0], [10, 0, 0], [0, 20, 0]].forEach((c, i) => R.stamp(r, i * 2, 0, 1, c as [number, number, number]));
    expect(R.sceneColors([r])).toEqual(['#0a0000', '#001400']);
  });
});
