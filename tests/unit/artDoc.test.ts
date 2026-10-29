import { describe, expect, it } from 'vitest';
import { createRaster, stamp, type Raster } from '../../src/core/raster';
import { ArtDoc } from '../../src/editors/art/doc';

const px = (r: Raster, x: number, y: number) => [...r.data.subarray((y * r.w + x) * 4, (y * r.w + x) * 4 + 4)];
function docWith(...colors: [number, number, number][]) {
  const d = new ArtDoc(20, 10);
  for (const c of colors) { const id = d.newId(), r = createRaster(20, 10); stamp(r, 5, 5, 3, c); d.addLayerPixels(id, r); d.layers = [...d.layers, { id, name: 'L' + id, visible: true, opacity: 100 }]; d.active = id; }
  return d;
}

describe('ArtDoc', () => {
  it('moving a layer partly off the canvas keeps the hidden pixels, and moving back restores them', () => {
    const d = docWith([255, 0, 0]), id = d.active!;
    const s = d.source(id)!;
    d.finalize(id, s.raster, { ...s, x: s.x + 17 });           // 3×3 block now at x 21–23: fully off-canvas
    expect(d.onCanvas(id)).toBe(false);
    expect(px(d.render(), 19, 5)[3]).toBe(0);
    const s2 = d.source(id)!; expect(s2.x).toBe(21);
    d.finalize(id, s2.raster, { ...s2, x: 4 });
    expect(d.onCanvas(id)).toBe(true);
    expect(px(d.render(), 5, 5)).toEqual([255, 0, 0, 255]);
  });
  it('painting is confined to the canvas even when the raster is larger', () => {
    const d = docWith([1, 1, 1]), id = d.active!, s = d.source(id)!;
    d.finalize(id, s.raster, { ...s, x: -10 });
    const P = d.placed(id); expect(P.x).toBe(-10);
    stamp(P.raster, 0 - P.x, 0 - P.y, 3, [9, 9, 9], d.canvasClip(id));
    expect(px(P.raster, -1 - P.x, 0 - P.y)[3]).toBe(0);   // off-canvas neighbor untouched
    expect(px(P.raster, 0 - P.x, 0 - P.y)).toEqual([9, 9, 9, 255]);
  });
  it('undo/redo restore pixels, layer list and active layer', () => {
    const d = docWith([255, 0, 0], [0, 255, 0]);
    d.pushUndo([d.active!]); stamp(d.placed(d.active!).raster, 0, 0, 1, [0, 0, 255]);
    d.deleteActive();
    expect(d.layers).toHaveLength(1);
    d.undo(); expect(d.layers).toHaveLength(2);
    d.undo(); expect(px(d.placed(2).raster, 0, 0)[3]).toBe(0);
    d.redo(); expect(px(d.placed(2).raster, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(d.canRedo()).toBe(true);
  });
  it('keeps at most 100 undo steps', () => {
    const d = docWith([1, 2, 3]);
    for (let i = 0; i < 130; i++) d.pushUndo([]);
    let n = 0; while (d.undo()) n++;
    expect(n).toBe(100);
  });
  it('merge down applies both opacities and keeps the result opaque', () => {
    const d = docWith([255, 0, 0], [0, 0, 255]);
    d.layers = d.layers.map(l => (l.id === 2 ? { ...l, opacity: 50 } : l));
    const id = d.mergeDown()!;
    expect(d.layers).toEqual([{ id, name: 'L1', visible: true, opacity: 100 }]);
    const c = px(d.placed(id).raster, 5, 5); expect(c[3]).toBe(255); expect(c[0]).toBeGreaterThan(100); expect(c[2]).toBeGreaterThan(100);
  });
  it('copy and cut to a new layer', () => {
    const d = docWith([255, 0, 0]), src = d.active!;
    expect(d.clipOut(false)).toBe('PAINT A SELECTION FIRST');
    d.mask.data[5 * 20 + 5] = 1; d.mask.data[0] = 1;
    const r = d.clipOut(true);
    expect(r).toEqual({ id: 2, n: 1 });
    expect(px(d.placed(src).raster, 5, 5)[3]).toBe(0);
    expect(px(d.placed(2).raster, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(d.layers.map(l => l.name)).toEqual(['L1', 'L1 clip']);
    expect(d.selectionCount()).toBe(0);
  });
  it('refuses to delete the last layer or merge the bottom one', () => {
    const d = docWith([1, 1, 1]);
    expect(d.deleteActive()).toBe(false);
    expect(d.mergeDown()).toBe(null);
  });
});
