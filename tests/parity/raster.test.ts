// The original methods only work on a 320×200 canvas, so parity is checked there; the unit
// tests in tests/unit/raster.test.ts cover other sizes, offsets and edge cases.
import { beforeAll, describe, expect, it } from 'vitest';
import * as R from '../../src/core/raster';
import { diff, DOCK_LAYERS, loadLegacy, readPng, synthetic, type Legacy } from './legacy';

const W = 320, H = 200, N = W * H;
let L: Legacy;
beforeAll(() => { L = loadLegacy(); });

/** The 160×100 dock layers at 2×, which is how the original loads them (raster(img, 2)). */
const dockLayers = () => DOCK_LAYERS.map(f => R.scaleNearest({ ...readPng(f) }, W, H));
const fullCanvas = (seed: number): R.Raster => ({ w: W, h: H, data: synthetic(W, H, seed) });

describe('compositor matches the original composite()', () => {
  const run = (layers: { r: R.Raster; opacity: number; visible: boolean }[]) => {
    const px: Record<number, Uint8ClampedArray> = {}, list = layers.map((l, i) => { px[i + 1] = l.r.data; return { id: i + 1, visible: l.visible, opacity: l.opacity }; });
    const legacy = L.proto.composite.call({ state: { layers: list }, px }).data as Uint8ClampedArray;
    const port = R.composite(W, H, layers.filter(l => l.visible).map(l => ({ raster: l.r, x: 0, y: 0, opacity: l.opacity })));
    return diff(port.data, legacy);
  };
  it('the dock scene, fully opaque', () => { expect(run(dockLayers().map(r => ({ r, opacity: 100, visible: true })))).toBe('identical'); });
  it('mixed opacity, hidden layers and semi-transparent pixels', () => {
    const d = dockLayers();
    expect(run([{ r: d[0], opacity: 100, visible: true }, { r: fullCanvas(3), opacity: 37, visible: true }, { r: d[2], opacity: 80, visible: false }, { r: fullCanvas(9), opacity: 63, visible: true }, { r: d[4], opacity: 0, visible: true }])).toBe('identical');
  });
});

describe('drawing primitives match the original methods', () => {
  const sizes = [1, 2, 3, 5, 8, 24];
  it('pencil and eraser stamps, including at the canvas edges', () => {
    for (const size of sizes) for (const [x, y] of [[0, 0], [160, 100], [319, 199], [-2, 5], [318, 1]]) for (const tool of ['pen', 'eraser']) {
      const a = fullCanvas(size), b = a.data.slice();
      R.stamp(a, x, y, size, tool === 'pen' ? [12, 200, 77] : null);
      L.proto.stamp.call({ state: { size, active: 1, tool }, px: { 1: b }, rgb: [12, 200, 77] }, x, y);
      expect(diff(a.data, b)).toBe('identical');
    }
  });
  it('selection mask stamps', () => {
    for (const size of sizes) for (const tool of ['sel', 'unsel']) {
      const a = R.createMask(W, H), b = new Uint8Array(N); a.data.fill(tool === 'sel' ? 0 : 1); b.fill(tool === 'sel' ? 0 : 1);
      for (const [x, y] of [[0, 0], [100, 50], [319, 199]]) { R.stampMask(a, x, y, size, tool === 'sel' ? 1 : 0); L.proto.stampMask.call({ state: { selSize: size, tool }, mask: b }, x, y); }
      expect(diff(a.data, b)).toBe('identical');
    }
  });
  it('Bresenham lines in every octant', () => {
    const ends = [[0, 0], [319, 199], [5, 190], [300, 3], [160, 100], [161, 100], [160, 140], [100, 101]];
    for (const a of ends) for (const b of ends) {
      const pa: number[] = [], pb: number[] = [];
      R.line({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, (x, y) => pa.push(x, y));
      L.proto.line.call({}, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, (x: number, y: number) => pb.push(x, y));
      expect(pa).toEqual(pb);
    }
  });
  it('bucket fill on art, on empty space and on a no-op', () => {
    const dock = dockLayers();
    for (const [src, x, y, rgb] of [[dock[4], 160, 180, [255, 0, 0]], [dock[4], 10, 10, [1, 2, 3]], [dock[3], 50, 150, [9, 9, 9]], [fullCanvas(4), 0, 0, [200, 100, 0]]] as const) {
      const a = R.cloneRaster(src), b = src.data.slice(), exp = L.proto.fill.call({ state: { active: 1 }, px: { 1: b }, rgb }, x, y);
      expect(R.floodFill(a, x, y, rgb)).toBe(exp);
      expect(diff(a.data, b)).toBe('identical');
    }
    const i = (180 * W + 160) * 4, d = dock[4].data, same: [number, number, number] = [d[i], d[i + 1], d[i + 2]];
    expect(d[i + 3]).toBe(255);
    expect(R.floodFill(R.cloneRaster(dock[4]), 160, 180, same)).toBe(L.proto.fill.call({ state: { active: 1 }, px: { 1: d.slice() }, rgb: same }, 160, 180));
  });
  it('content bounds match layerBox()', () => {
    for (const r of [...dockLayers(), R.createRaster(W, H)]) expect(R.contentBounds(r)).toEqual(L.proto.layerBox.call({ px: { 1: r.data } }, 1));
  });
  it('nearest-neighbor scaling matches scaleSrc() (move-tool resize)', () => {
    const src = { ...readPng(DOCK_LAYERS[4]), x: 0, y: 0 };
    for (const [w, h] of [[160, 100], [320, 200], [97, 13], [400, 33], [1, 1]]) {
      expect(diff(R.scaleNearest(src, w, h).data, L.proto.scaleSrc.call({}, src, { w, h }))).toBe('identical');
    }
  });
});
