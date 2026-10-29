// The IMAGE TUNING pipeline: the original Component.applyImport() as a pure function.
// Order matters and matches the original exactly:
// sharpen → find ranges → per-range tone reduction → deepen shadows → recolor → global palette reduction.
import type { Pixels } from '../raster/raster';

import { deepen } from './deepen';
import { quantizeData, detailToK } from './quantize';
import { familyReduce, findRanges, rangeMap, rangeSepFromSlider, rangeTones, type FamilyInfo, type RangeInfo } from './ranges';
import { adjustRanges, type RangeAdjust } from './recolor';
import { sharpen } from './sharpen';

/** Slider values exactly as the UI holds them (0–100 unless noted). Defaults: see TUNING_DEFAULTS. */
export type TuningParams = {
  detail: number;          // PALETTE COMPLEXITY
  family: number;          // PALETTE COMPLEXITY 2 (tones per range); 100 = off
  separation: number;      // RANGE SEPARATION
  sharp: number;           // SHARPNESS
  tame: number;            // TAME HIGHLIGHTS
  deep: number;            // DEEPEN SHADOWS
  deepSel: number[] | null; // ranges to deepen; null = all
  rangeAdj: Record<number, RangeAdjust | undefined>;
};

export const TUNING_DEFAULTS: TuningParams = { detail: 100, family: 100, separation: 70, sharp: 0, tame: 70, deep: 0, deepSel: null, rangeAdj: {} };

export type TuningResult = {
  data: Pixels;  // tuned pixels, same size as the source
  uniq: number;             // distinct colors before the final reduction
  k: number;                // colors after it
  family: FamilyInfo | null;
  ranges: RangeInfo[];
  /** True when the number of ranges changed since `prevRangeCount`, so range picks were discarded (deepSel and rangeAdj ignored). */
  rangesReset: boolean;
};

/**
 * Runs the tuning pipeline on `src` (RGBA, w×h; not modified). `prevRangeCount` is the range
 * count from the previous run on the same source (undefined on the first run). As in the
 * original, if it changed, per-range selections no longer line up and are dropped for this run.
 */
export function runTuning(src: Pixels, w: number, h: number, p: TuningParams, prevRangeCount?: number): TuningResult {
  const d = sharpen(src, w, h, p.sharp / 100 * 2.5, p.tame / 100);
  const groups = findRanges(d, rangeSepFromSlider(p.separation)), fi = familyReduce(d, p.family, groups);
  const rangeOf = fi ? fi.rangeOf : rangeMap(groups), ranges = rangeTones(d, rangeOf, 6);
  const rangesReset = prevRangeCount != null && prevRangeCount !== ranges.length;
  const sel = rangesReset ? null : p.deepSel, adj = rangesReset ? {} : p.rangeAdj || {};
  const pr = new Int16Array(w * h).fill(-1);
  for (let px = 0, i = 0; i < d.length; i += 4, px++) if (d[i + 3] >= 128) { const r = rangeOf.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); if (r != null) pr[px] = r; }
  deepen(d, p.deep / 100, rangeOf, sel && new Set(sel));
  adjustRanges(d, pr, adj);
  const uniq = quantizeData(d.slice(), 1e9), k = detailToK(p.detail, uniq);
  quantizeData(d, k);
  return { data: d, uniq, k: Math.min(k, uniq), family: fi, ranges, rangesReset };
}
