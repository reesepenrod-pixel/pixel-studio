// Global palette reduction (weighted median cut), ported verbatim from the original Pixel Studio.
import type { Pixels } from '../raster/raster';

/**
 * Reduces `d` (RGBA, in place) to at most `k` colors. Also normalizes alpha: pixels under 128
 * become fully transparent black, the rest fully opaque. Returns the number of distinct opaque
 * colors before reduction.
 */
export function quantizeData(d: Pixels, k: number): number {
  type Col = { key: number; v: [number, number, number]; n: number };
  type Box = { items: Col[]; range: number; ch: number };
  const map = new Map<number, Col>(), cols: Col[] = [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let c = map.get(key); if (!c) { c = { key, v: [d[i], d[i + 1], d[i + 2]], n: 0 }; map.set(key, c); cols.push(c); }
    c.n++;
  }
  if (cols.length <= k) return cols.length;
  const mkBox = (items: Col[]): Box => { let best = -1, ch = 0; for (let c = 0; c < 3; c++) { let mn = 255, mx = 0; for (const it of items) { const v = it.v[c]; if (v < mn) mn = v; if (v > mx) mx = v; } const r = (mx - mn) * [0.3, 0.59, 0.11][c]; if (r > best) { best = r; ch = c; } } return { items, range: best, ch }; };
  const heap: Box[] = [], done: Box[] = [];
  const push = (b: Box) => { if (b.items.length < 2 || b.range <= 0) { done.push(b); return; } heap.push(b); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p].range >= heap[i].range) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = (): Box => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].range > heap[m].range) m = l; if (r < heap.length && heap[r].range > heap[m].range) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  push(mkBox(cols));
  while (heap.length && heap.length + done.length < k) {
    const b = pop(), ch = b.ch; b.items.sort((p, q) => p.v[ch] - q.v[ch]);
    let tot = 0; for (const it of b.items) tot += it.n;
    let acc = 0, m = 1; for (let j = 0; j < b.items.length - 1; j++) { acc += b.items[j].n; if (acc >= tot / 2) { m = j + 1; break; } m = j + 1; }
    push(mkBox(b.items.slice(0, m))); push(mkBox(b.items.slice(m)));
  }
  const out = new Map<number, number[]>();
  for (const b of heap.concat(done)) { const s = [0, 0, 0]; let n = 0; for (const it of b.items) { for (let c = 0; c < 3; c++) s[c] += it.v[c] * it.n; n += it.n; } const avg = s.map(v => Math.round(v / n)); for (const it of b.items) out.set(it.key, avg); }
  for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const a = out.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])!; d[i] = a[0]; d[i + 1] = a[1]; d[i + 2] = a[2]; }
  return cols.length;
}

/** Maps the PALETTE COMPLEXITY slider (0–100) to a color count, given `uniq` distinct colors. */
export const detailToK = (v: number, uniq: number): number => (uniq <= 2 ? uniq : Math.max(2, Math.round(2 * Math.pow(uniq / 2, v / 100))));
