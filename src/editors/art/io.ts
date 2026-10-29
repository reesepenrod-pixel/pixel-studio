// Browser-side image input/output for the Art workspace: decoding files, the import-and-pixelate
// resampling (which relies on the browser's high-quality downscaler, as the original did), the
// sample scene, and PNG export. Everything else in the editor works on plain rasters.

import type { Raster } from '../../core/raster';

export function canvasOf(w: number, h: number): HTMLCanvasElement { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function rasterToCanvas(r: Raster): HTMLCanvasElement {
  const c = canvasOf(r.w, r.h);
  c.getContext('2d')!.putImageData(new ImageData(r.data.slice(), r.w, r.h), 0, 0);
  return c;
}

function readCanvas(c: HTMLCanvasElement | OffscreenCanvas): Raster {
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  return { w: c.width, h: c.height, data: new Uint8ClampedArray(x.getImageData(0, 0, c.width, c.height).data) };
}

/** Decodes an image file or URL to RGBA without any resampling or color management surprises. */
export async function decodeImage(src: Blob | string): Promise<Raster> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = canvasOf(bmp.width, bmp.height), x = c.getContext('2d')!;
  x.drawImage(bmp, 0, 0); bmp.close();
  return readCanvas(c);
}

/**
 * Fits an image inside gw×gh, centered, the way the original's importFile() did: halve with
 * high-quality smoothing while still more than 2× too big, then one final draw (smoothed when
 * shrinking, nearest-neighbor when enlarging). Returns the gw×gh result and where the image landed.
 */
export function fitImage(img: Raster, gw: number, gh: number): { raster: Raster; rect: { x: number; y: number; w: number; h: number } } {
  const sc = Math.min(gw / img.w, gh / img.h), tw = Math.max(1, Math.round(img.w * sc)), th = Math.max(1, Math.round(img.h * sc));
  let src: HTMLCanvasElement = rasterToCanvas(img), sw = img.w, sh = img.h;
  while (sw / 2 > tw && sh / 2 > th) { const c = canvasOf(Math.floor(sw / 2), Math.floor(sh / 2)), x = c.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); src = c; sw = c.width; sh = c.height; }
  const g = canvasOf(gw, gh), gx = g.getContext('2d')!;
  gx.imageSmoothingEnabled = sc < 1; gx.imageSmoothingQuality = 'high';
  const rect = { x: Math.floor((gw - tw) / 2), y: Math.floor((gh - th) / 2), w: tw, h: th };
  gx.drawImage(src, rect.x, rect.y, tw, th);
  return { raster: readCanvas(g), rect };
}

export const SAMPLE_SCENE = [['1-sky', 'Sky'], ['2-clouds', 'Clouds'], ['3-mountains', 'Mountains'], ['4-water', 'Water'], ['5-dock', 'Dock']] as const;
export const loadSampleLayer = (file: string) => decodeImage(`${import.meta.env.BASE_URL}sample/dock/${file}.png`);

export function downloadPng(r: Raster, scale: number, filename: string): void {
  const big = canvasOf(r.w * scale, r.h * scale), x = big.getContext('2d')!;
  x.imageSmoothingEnabled = false; x.drawImage(rasterToCanvas(r), 0, 0, r.w * scale, r.h * scale);
  big.toBlob(blob => {
    if (!blob) return;
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }, 'image/png');
}

