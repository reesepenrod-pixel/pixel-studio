import { beforeAll, describe, expect, it } from 'vitest';
import * as P from '../../src/core/imaging';
import { diff, dockStrip, DOCK_LAYERS, legacyTuning, loadLegacy, readPng, synthetic, type Legacy } from './legacy';

let L: Legacy;
beforeAll(() => { L = loadLegacy(); });

const images = () => [
  { name: 'dock strip (all 5 layers)', ...dockStrip() },
  ...DOCK_LAYERS.map(f => ({ name: f.split('/').pop()!, ...readPng(f) })),
  { name: 'synthetic 97×61', w: 97, h: 61, data: synthetic(97, 61) },
  { name: 'synthetic 160×100', w: 160, h: 100, data: synthetic(160, 100, 7) }
];

describe('color conversions match the original', () => {
  it('toLab / fromLab over a 17³ RGB lattice', () => {
    for (let r = 0; r <= 256; r += 16) for (let g = 0; g <= 256; g += 16) for (let b = 0; b <= 256; b += 16) {
      const c = [Math.min(r, 255), Math.min(g, 255), Math.min(b, 255)] as const;
      const a = P.toLab(...c), e = L.toLab(...c);
      expect(a).toEqual(Array.from(e));
      expect(P.fromLab(...a)).toEqual(Array.from(L.fromLab(...e)));
    }
  });
  it('detailToK', () => {
    for (const u of [1, 2, 3, 10, 55, 400]) for (let v = 0; v <= 100; v += 5) expect(P.detailToK(v, u)).toBe(L.detailToK(v, u));
  });
});

describe('pixel algorithms match the original byte for byte', () => {
  for (const img of images()) {
    describe(img.name, () => {
      it('quantizeData at several k', () => {
        for (const k of [2, 5, 16, 40, 1e9]) {
          const a = img.data.slice(), b = img.data.slice();
          expect(P.quantizeData(a, k)).toBe(L.quantizeData(b, k));
          expect(diff(a, b)).toBe('identical');
        }
      });
      it('removeBg on whole image and an inner rect', () => {
        for (const [r, tol] of [[{ x: 0, y: 0, w: img.w, h: img.h }, 30], [{ x: 3, y: 2, w: img.w - 6, h: img.h - 5 }, 60]] as const) {
          const a = img.data.slice(), b = img.data.slice();
          expect(P.removeBg(a, img.w, img.h, r, tol)).toBe(L.removeBg(b, img.w, img.h, r, tol));
          expect(diff(a, b)).toBe('identical');
        }
      });
      it('sharpen', () => {
        for (const [amt, tame] of [[0, 0.7], [0.8, 0], [2.5, 0.7], [1.3, 1]]) expect(diff(P.sharpen(img.data, img.w, img.h, amt, tame), L.sharpen(img.data, img.w, img.h, amt, tame))).toBe('identical');
      });
      it('ranges, family reduction, tones, deepen, recolor', () => {
        for (const sepSlider of [0, 30, 70, 100]) {
          const sep = P.rangeSepFromSlider(sepSlider); L.setRangeSep(sep);
          const ga = P.findRanges(img.data, sep), gb = L.findRanges(img.data, 0);
          expect(ga?.map(g => g.map(c => c.key))).toEqual(gb?.map((g: any[]) => g.map(c => c.key)));
          for (const fam of [0, 40, 100]) {
            const a = img.data.slice(), b = img.data.slice();
            const fa = P.familyReduce(a, fam, ga), fb = L.familyReduce(b, img.w, img.h, fam, gb);
            expect(diff(a, b)).toBe('identical');
            expect(fa && { fams: fa.fams, T: fa.T, rangeOf: [...fa.rangeOf] }).toEqual(fb && { fams: fb.fams, T: fb.T, rangeOf: [...fb.rangeOf] });
            const ra = fa ? fa.rangeOf : P.rangeMap(ga), rb = fb ? fb.rangeOf : L.rangeMap(gb);
            expect(JSON.parse(JSON.stringify(P.rangeTones(a, ra, 6)))).toEqual(JSON.parse(JSON.stringify(L.rangeTones(b, rb, 6))));
            for (const [amt, sel] of [[0.5, null], [1, new Set([0, 2])]] as const) {
              const da = a.slice(), db = b.slice();
              P.deepen(da, amt, ra, sel); L.deepen(db, amt, rb, sel);
              expect(diff(da, db)).toBe('identical');
            }
            const pr = new Int16Array(img.w * img.h).fill(-1);
            for (let p = 0; p < pr.length; p++) { const i = p * 4; if (a[i + 3] >= 128) { const r = ra.get((a[i] << 16) | (a[i + 1] << 8) | a[i + 2]); if (r != null) pr[p] = r; } }
            const adj = { 0: { h: 90, b: -30, s: 40 }, 1: { b: 60 }, 3: { h: -170, s: -100 } };
            const ca = a.slice(), cb = b.slice();
            P.adjustRanges(ca, pr, adj); L.adjustRanges(cb, pr, adj);
            expect(diff(ca, cb)).toBe('identical');
          }
        }
      });
    });
  }
});

describe('full IMAGE TUNING pipeline matches the original applyImport()', () => {
  const legacyState = (p: P.TuningParams) => ({ impDetail: p.detail, impFam: p.family, impSep: p.separation, impSharp: p.sharp, impTame: p.tame, impDeep: p.deep, impDeepSel: p.deepSel, impRangeAdj: p.rangeAdj });
  const cases: [string, Partial<P.TuningParams>][] = [
    ['defaults', {}],
    ['palette complexity 10', { detail: 10 }],
    ['tones per range 40, separation 30', { family: 40, separation: 30 }],
    ['sharpen 60, tame 20', { sharp: 60, tame: 20 }],
    ['deepen 80 on ranges 0 and 1', { deep: 80, deepSel: [0, 1] }],
    ['recolor three ranges', { rangeAdj: { 0: { h: 90, b: -30, s: 40 }, 2: { b: 50 }, 4: { s: -80 } } }],
    ['everything at once', { detail: 35, family: 55, separation: 85, sharp: 100, tame: 50, deep: 45, deepSel: [1], rangeAdj: { 1: { h: 30 } } }]
  ];
  for (const img of images().slice(0, 2).concat(images().slice(-1))) {
    for (const [name, over] of cases) {
      it(`${img.name}: ${name}`, () => {
        const p = { ...P.TUNING_DEFAULTS, ...over };
        const a = P.runTuning(img.data, img.w, img.h, p), b = legacyTuning(L, img.data, img.w, img.h, legacyState(p));
        expect(diff(a.data, b.data)).toBe('identical');
        expect(a.uniq).toBe(b.info.uniq);
        expect(a.k).toBe(b.info.k);
        expect(JSON.parse(JSON.stringify(a.ranges))).toEqual(JSON.parse(JSON.stringify(b.info.ranges)));
        expect(a.family?.fams).toBe(b.info.fi?.fams);
      });
    }
  }
  it('drops range picks when the range count changes, like the original', () => {
    const img = dockStrip(), p = { ...P.TUNING_DEFAULTS, deep: 90, deepSel: [0], rangeAdj: { 0: { h: 120 } } };
    for (const prev of [undefined, 3, 999]) {
      const a = P.runTuning(img.data, img.w, img.h, p, prev), b = legacyTuning(L, img.data, img.w, img.h, legacyState(p), prev);
      expect(a.rangesReset).toBe(b.rangesReset);
      expect(diff(a.data, b.data)).toBe('identical');
    }
  });
  it('does not modify its source', () => {
    const img = dockStrip(), before = img.data.slice();
    P.runTuning(img.data, img.w, img.h, { ...P.TUNING_DEFAULTS, sharp: 80, detail: 20 });
    expect(diff(img.data, before)).toBe('identical');
  });
});
