// Color conversions, ported verbatim from the original Pixel Studio (legacy/recovered/app.js).
// OKLab is used for perceptual work: range clustering, shadow deepening, recoloring.

export type Lab = [L: number, a: number, b: number];
export type RGB = [r: number, g: number, b: number];

export const srgbL = (v: number): number => ((v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
export const Lsrgb = (v: number): number =>
  Math.max(0, Math.min(255, Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055))));

export function toLab(r: number, g: number, b: number): Lab {
  r = srgbL(r); g = srgbL(g); b = srgbL(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

export function fromLab(L: number, a: number, b: number): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    Lsrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    Lsrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    Lsrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  ];
}

export const hex2rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const rgb2hex = (r: number, g: number, b: number): string => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

/** Packs an opaque RGB triple into the 24-bit key used throughout the imaging code. */
export const rgbKey = (d: ArrayLike<number>, i: number): number => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
