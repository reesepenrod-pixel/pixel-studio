// The "IN THE SCENE" palette: most-used opaque colors across rasters. Ported from the original's
// afterChange(), which samples every 2nd pixel (i += 8) for speed.
import { rgb2hex } from '../imaging/color';
import type { Raster } from './raster';

export function sceneColors(rasters: readonly Raster[], limit = 32): string[] {
  const counts = new Map<number, number>();
  for (const r of rasters) { const d = r.data; for (let i = 0; i < d.length; i += 8) if (d[i + 3] > 127) { const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; counts.set(k, (counts.get(k) || 0) + 1); } }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => rgb2hex(k >> 16, (k >> 8) & 255, k & 255));
}
