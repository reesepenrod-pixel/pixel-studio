// Loads the ORIGINAL Pixel Studio functions from legacy/recovered/app.js into a sandbox so the
// port can be compared against them byte for byte. Only top-level definitions are evaluated;
// the Component class is defined but never instantiated.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { PNG } from 'pngjs';
import type { Pixels } from '../../src/core/raster';

const root = fileURLToPath(new URL('../../', import.meta.url));

class FakeImageData {
  data: Pixels; width: number; height: number;
  constructor(a: Pixels | number, b: number, c?: number) {
    if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
    else { this.data = a; this.width = b; this.height = c!; }
  }
}
// Just enough canvas for applyImport(): it puts the tuned pixels into a canvas, then hands the canvas to raster().
const fakeDocument = {
  createElement: () => {
    const canvas: { width: number; height: number; pixels?: Pixels; getContext: () => unknown } = {
      width: 0, height: 0,
      getContext: () => ({ putImageData: (img: FakeImageData) => { canvas.pixels = img.data; } })
    };
    return canvas;
  }
};

type Fn = (...args: any[]) => any;
export type Legacy = {
  quantizeData: Fn; removeBg: Fn; sharpen: Fn; toLab: Fn; fromLab: Fn; mcut: Fn; findRanges: Fn; rangeMap: Fn;
  familyReduce: Fn; rangeTones: Fn; deepen: Fn; adjustRanges: Fn; detailToK: Fn; setRangeSep: (v: number) => void;
  applyImport: Fn;
  /** Component.prototype, for calling original methods with a stand-in `this`. */
  proto: Record<string, Fn>;
};

export function loadLegacy(): Legacy {
  const src = readFileSync(root + 'legacy/recovered/app.js', 'utf8');
  const ctx = vm.createContext({ DCLogic: class {}, React: { createRef: () => ({}) }, document: fakeDocument, ImageData: FakeImageData });
  const exportsExpr = `;({ quantizeData, removeBg, sharpen, toLab, fromLab, mcut, findRanges, rangeMap, familyReduce, rangeTones, deepen,
    adjustRanges, detailToK, setRangeSep: v => { RANGE_SEP = v; }, applyImport: Component.prototype.applyImport, proto: Component.prototype })`;
  return new vm.Script(src + exportsExpr, { filename: 'legacy/recovered/app.js' }).runInContext(ctx) as Legacy;
}

export type LegacyTuning = { data: Pixels; info: any; rangesReset: boolean };

/** Runs the original Component.applyImport() with a stand-in `this` holding the given slider state. */
export function legacyTuning(L: Legacy, src: Pixels, w: number, h: number, state: Record<string, unknown>, prevRangeCount?: number): LegacyTuning {
  const self = {
    imp: { id: 1, src, gw: w, gh: h, b: 1, name: 'test', nr: prevRangeCount },
    px: { 1: true } as Record<number, unknown>,
    state: { ...state },
    resetCalls: 0,
    setState(o: Record<string, unknown>) { if ('impRangeAdj' in o && 'impDeepSel' in o) this.resetCalls++; Object.assign(this.state, o); },
    raster: (canvas: { pixels: Pixels }) => canvas.pixels
  };
  L.applyImport.call(self);
  return { data: self.px[1] as Pixels, info: (self.state as any).impInfo, rangesReset: self.resetCalls > 0 };
}

export function readPng(rel: string): { w: number; h: number; data: Pixels } {
  const png = PNG.sync.read(readFileSync(root + rel));
  return { w: png.width, h: png.height, data: new Uint8ClampedArray(png.data) };
}

export const DOCK_LAYERS = ['scene_1_sky', 'scene_2_clouds', 'scene_3_mountains', 'scene_4_water', 'scene_5_dock'].map(n => `legacy/recovered/assets/${n}.png`);

/** Deterministic test image: gradients, hard edges, a transparent hole and some noise. */
export function synthetic(w: number, h: number, seed = 1): Pixels {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, band = (x / w * 4) | 0;
    d[i] = band === 0 ? 200 * y / h : band === 1 ? 40 : band === 2 ? 220 : 120 + 60 * Math.sin(x);
    d[i + 1] = band === 1 ? 160 * x / w + 40 : band === 3 ? 90 : 80 * rnd();
    d[i + 2] = band === 2 ? 30 : 255 * (1 - y / h);
    // Coarsen to steps of 24 so there are a few hundred colors, like real pixel art. (Thousands of
    // distinct colors make the original range clustering take tens of seconds; see audit §4.2.)
    for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] / 24) * 24;
    d[i + 3] = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (h / 6) ** 2 ? 0 : rnd() < 0.03 ? 100 : 255;
  }
  return d;
}

/** Concatenates every dock layer side by side into one image so one run covers all of them. */
export function dockStrip(): { w: number; h: number; data: Pixels } {
  const imgs = DOCK_LAYERS.map(readPng), h = imgs[0].h, w = imgs.reduce((s, i) => s + i.w, 0), out = new Uint8ClampedArray(w * h * 4);
  let ox = 0;
  for (const im of imgs) { for (let y = 0; y < h; y++) out.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), (y * w + ox) * 4); ox += im.w; }
  return { w, h, data: out };
}

/** Readable mismatch report for byte arrays. */
export function diff(a: ArrayLike<number>, b: ArrayLike<number>): string {
  if (a.length !== b.length) return `length ${a.length} vs ${b.length}`;
  let n = 0, first = -1; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { n++; if (first < 0) first = i; }
  return n ? `${n} bytes differ, first at ${first} (${a[first]} vs ${b[first]})` : 'identical';
}
