// The artwork being edited: layers, their pixels, the selection mask and undo history.
// Ported from the original Pixel Studio's Component (px / ext / mask / undo / redo), with one
// structural change: each layer is a raster placed at an offset (`Placed`) instead of a
// full-canvas buffer plus a separate off-canvas `ext` buffer. Invariant: a layer's raster always
// covers the whole canvas, so painting anywhere on the canvas is always in bounds. It is exactly
// canvas-sized at (0, 0) unless the layer has pixels hanging off the canvas.
//
// No React and no DOM here, so everything is unit-testable.

import { composite, contentBounds, createMask, createRaster, cropRaster, scaleNearest, type Mask, type Raster, type Rect } from '../../core/raster';

export type LayerId = number;
export type LayerMeta = { id: LayerId; name: string; visible: boolean; opacity: number };
export type Placed = { raster: Raster; x: number; y: number };
/** A layer's content cropped to its bounding box, in canvas coordinates. */
export type Source = Rect & { raster: Raster };

type Snapshot = { layers: LayerMeta[]; active: LayerId | null; pix: [LayerId, Placed | null][]; mask: Uint8Array; bytes: number };

const MAX_UNDO = 100, MAX_UNDO_BYTES = 64 * 1024 * 1024;
const clonePlaced = (p: Placed): Placed => ({ raster: { w: p.raster.w, h: p.raster.h, data: p.raster.data.slice() }, x: p.x, y: p.y });

export class ArtDoc {
  layers: LayerMeta[] = [];          // bottom → top; replaced (never mutated) on change, for React
  active: LayerId | null = null;
  readonly pix = new Map<LayerId, Placed>();
  mask: Mask;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private nid = 1;
  /** Bumped on every change to pixels or layers; also used as a cache key. */
  rev = 0;
  /** Called with the ids of layers whose pixels may have changed, or [] for list/mask-only changes. */
  onSnapshotTouched: (ids: LayerId[]) => void = () => {};

  constructor(readonly w: number, readonly h: number) { this.mask = createMask(w, h); }

  // ── ids & lookups ────────────────────────────────────────────────────────────
  newId(): LayerId { return this.nid++; }
  get canvasRect(): Rect { return { x: 0, y: 0, w: this.w, h: this.h }; }
  activeLayer(): LayerMeta | undefined { return this.layers.find(l => l.id === this.active); }
  placed(id: LayerId): Placed { const p = this.pix.get(id); if (!p) throw new Error('layer ' + id + ' has no pixels'); return p; }
  /** Raster-space clip rect for painting only inside the canvas. */
  canvasClip(id: LayerId): Rect { const p = this.placed(id); return { x: -p.x, y: -p.y, w: this.w, h: this.h }; }
  /** True if the layer has no pixels outside the canvas (it's canvas-sized at 0,0). */
  onCanvas(id: LayerId): boolean { const p = this.placed(id); return p.x === 0 && p.y === 0 && p.raster.w === this.w && p.raster.h === this.h; }
  /** The canvas-area pixels of a layer (a view when possible, otherwise a copy). */
  canvasPixels(id: LayerId): Raster { const p = this.placed(id); return this.onCanvas(id) ? p.raster : cropRaster(p.raster, { x: -p.x, y: -p.y, w: this.w, h: this.h }); }
  /** Pixel index into a layer's raster for canvas coordinate (x, y). */
  index(id: LayerId, x: number, y: number): number { const p = this.placed(id); return ((y - p.y) * p.raster.w + (x - p.x)) * 4; }

  addLayerPixels(id: LayerId, raster: Raster, x = 0, y = 0): void { this.pix.set(id, { raster, x, y }); }
  blankLayer(): Raster { return createRaster(this.w, this.h); }

  // ── history ──────────────────────────────────────────────────────────────────
  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  private snap(ids: LayerId[]): Snapshot {
    let bytes = this.mask.data.length;
    const pix = ids.map((id): [LayerId, Placed | null] => { const p = this.pix.get(id); if (p) bytes += p.raster.data.length; return [id, p ? clonePlaced(p) : null]; });
    return { layers: this.layers.map(l => ({ ...l })), active: this.active, pix, mask: this.mask.data.slice(), bytes };
  }

  /** Records the current state of `ids` (and the layer list and mask) before a change. */
  pushUndo(ids: LayerId[]): void {
    this.onSnapshotTouched(ids);
    this.undoStack.push(this.snap(ids));
    let total = this.undoStack.reduce((s, e) => s + e.bytes, 0);
    while (this.undoStack.length > MAX_UNDO || (total > MAX_UNDO_BYTES && this.undoStack.length > 1)) total -= this.undoStack.shift()!.bytes;
    this.redoStack = [];
  }
  /** Drops the most recent undo entry (used when an action turns out to change nothing). */
  dropLastUndo(): void { this.undoStack.pop(); }

  private restore(s: Snapshot): LayerId[] {
    const ids = s.pix.map(p => p[0]);
    this.onSnapshotTouched(ids);
    for (const [id, p] of s.pix) if (p) this.pix.set(id, clonePlaced(p));
    this.mask = { w: this.w, h: this.h, data: s.mask.slice() };
    this.layers = s.layers; this.active = s.active;
    return ids;
  }
  /** Returns the ids whose pixels changed, or null if there was nothing to undo. */
  undo(): LayerId[] | null { const s = this.undoStack.pop(); if (!s) return null; this.redoStack.push(this.snap(s.pix.map(p => p[0]))); return this.restore(s); }
  redo(): LayerId[] | null { const s = this.redoStack.pop(); if (!s) return null; this.undoStack.push(this.snap(s.pix.map(p => p[0]))); return this.restore(s); }

  // ── layer list operations (all undoable) ─────────────────────────────────────
  /** Inserts a new layer above the active one and makes it active. */
  insertLayer(id: LayerId, name: string, undoIds: LayerId[] = []): void {
    this.pushUndo(undoIds);
    const idx = this.layers.findIndex(l => l.id === this.active), L = this.layers.slice();
    L.splice(idx + 1, 0, { id, name, visible: true, opacity: 100 });
    this.layers = L; this.active = id;
  }
  newLayer(): LayerId { const id = this.newId(); this.pix.set(id, { raster: this.blankLayer(), x: 0, y: 0 }); this.insertLayer(id, 'Layer ' + id); return id; }
  updateLayer(id: LayerId, patch: Partial<Omit<LayerMeta, 'id'>>): void { this.pushUndo([]); this.layers = this.layers.map(l => (l.id === id ? { ...l, ...patch } : l)); }
  /** Changes opacity without an undo entry (the slider records one when the drag starts). */
  setOpacityLive(id: LayerId, opacity: number): void { this.layers = this.layers.map(l => (l.id === id ? { ...l, opacity } : l)); }
  /** dir +1 moves the active layer up (toward the top), −1 down. Returns false at the ends. */
  moveLayer(dir: 1 | -1): boolean {
    const i = this.layers.findIndex(l => l.id === this.active), j = i + dir;
    if (i < 0 || j < 0 || j >= this.layers.length) return false;
    this.pushUndo([]);
    const L = this.layers.slice(); [L[i], L[j]] = [L[j], L[i]]; this.layers = L;
    return true;
  }
  /** Deletes the active layer; refuses to delete the last one. */
  deleteActive(): boolean {
    if (this.layers.length < 2) return false;
    const i = this.layers.findIndex(l => l.id === this.active);
    this.pushUndo([]);
    const L = this.layers.slice(); L.splice(i, 1);
    this.layers = L; this.active = L[Math.max(0, i - 1)].id;
    return true;
  }
  /**
   * Merges the active layer into the one below. Both opacities are applied and the result is fully
   * opaque, as in the original. Unlike the original, the upper layer's off-canvas pixels that fall
   * inside the lower layer's area are kept rather than dropped.
   */
  mergeDown(): LayerId | null {
    const i = this.layers.findIndex(l => l.id === this.active);
    if (i < 1) return null;
    const top = this.layers[i], bot = this.layers[i - 1], pb = this.placed(bot.id), pt = this.placed(top.id);
    this.pushUndo([bot.id]);
    const merged = composite(pb.raster.w, pb.raster.h, [
      { raster: pb.raster, x: 0, y: 0, opacity: bot.opacity },
      { raster: pt.raster, x: pt.x - pb.x, y: pt.y - pb.y, opacity: top.opacity }
    ]);
    this.pix.set(bot.id, { raster: merged, x: pb.x, y: pb.y });
    const L = this.layers.slice(); L.splice(i, 1); L[i - 1] = { ...bot, opacity: 100 };
    this.layers = L; this.active = bot.id;
    return bot.id;
  }

  // ── move / resize ────────────────────────────────────────────────────────────
  /** The layer's content cropped to its bounding box, in canvas coordinates; null if empty. */
  source(id: LayerId): Source | null {
    const p = this.placed(id), b = contentBounds(p.raster);
    return b ? { x: b.x + p.x, y: b.y + p.y, w: b.w, h: b.h, raster: cropRaster(p.raster, b) } : null;
  }
  /**
   * Places `src` scaled (nearest-neighbor) into box `nb`. If it fits on the canvas the layer becomes
   * canvas-sized again; otherwise its raster grows to cover canvas ∪ box so nothing is lost.
   */
  finalize(id: LayerId, src: Raster, nb: Rect): void {
    const full = scaleNearest(src, nb.w, nb.h);
    const fits = nb.x >= 0 && nb.y >= 0 && nb.x + nb.w <= this.w && nb.y + nb.h <= this.h;
    const u = fits ? this.canvasRect : { x: Math.min(0, nb.x), y: Math.min(0, nb.y), w: Math.max(this.w, nb.x + nb.w) - Math.min(0, nb.x), h: Math.max(this.h, nb.y + nb.h) - Math.min(0, nb.y) };
    const out = createRaster(u.w, u.h);
    for (let j = 0; j < nb.h; j++) out.data.set(full.data.subarray(j * nb.w * 4, (j + 1) * nb.w * 4), ((nb.y - u.y + j) * u.w + (nb.x - u.x)) * 4);
    this.pix.set(id, { raster: out, x: u.x, y: u.y });
  }
  /** What the canvas shows while a move/resize drag is in progress (canvas area only, like the original). */
  previewMove(id: LayerId, src: Raster, nb: Rect): void {
    const d = createRaster(this.w, this.h);
    for (let Y = Math.max(0, nb.y); Y < Math.min(this.h, nb.y + nb.h); Y++) {
      const sy = Math.floor((Y - nb.y) * src.h / nb.h);
      for (let X = Math.max(0, nb.x); X < Math.min(this.w, nb.x + nb.w); X++) {
        const k = (sy * src.w + Math.floor((X - nb.x) * src.w / nb.w)) * 4; d.data.set(src.data.subarray(k, k + 4), (Y * this.w + X) * 4);
      }
    }
    this.pix.set(id, { raster: d, x: 0, y: 0 });
  }

  // ── selection ────────────────────────────────────────────────────────────────
  selectionCount(): number { let n = 0; for (const v of this.mask.data) n += v; return n; }
  /**
   * Copies (or cuts, with `cut`) the selected pixels of the active layer into a new canvas-sized
   * layer above it, and clears the selection. Returns the pixel count, or an error message.
   */
  clipOut(cut: boolean): { id: LayerId; n: number } | string {
    const a = this.activeLayer(); if (!a) return 'NO ACTIVE LAYER';
    if (!this.selectionCount()) return 'PAINT A SELECTION FIRST';
    const src = this.placed(a.id).raster, dst = createRaster(this.w, this.h), m = this.mask.data;
    let n = 0;
    for (let p = 0; p < m.length; p++) {
      if (!m[p]) continue;
      const i = this.index(a.id, p % this.w, (p / this.w) | 0);
      if (src.data[i + 3]) { dst.data.set(src.data.subarray(i, i + 4), p * 4); n++; }
    }
    if (!n) return 'NO PIXELS ON ' + a.name.toUpperCase() + ' IN SELECTION';
    this.pushUndo([a.id]);
    if (cut) for (let p = 0; p < m.length; p++) if (m[p]) { const i = this.index(a.id, p % this.w, (p / this.w) | 0); src.data.fill(0, i, i + 4); }
    const id = this.newId(); this.pix.set(id, { raster: dst, x: 0, y: 0 });
    this.mask = createMask(this.w, this.h);
    const L = this.layers.slice(); L.splice(L.indexOf(a) + 1, 0, { id, name: a.name + (cut ? ' clip' : ' copy'), visible: true, opacity: 100 });
    this.layers = L; this.active = id;
    return { id, n };
  }
  /** Undoable change to the selection mask. */
  editMask(fn: (m: Uint8Array) => void): void { this.pushUndo([]); fn(this.mask.data); }
  selectLayerPixels(): void {
    const a = this.activeLayer(); if (!a) return;
    const d = this.placed(a.id).raster.data;
    this.editMask(m => { for (let p = 0; p < m.length; p++) m[p] = d[this.index(a.id, p % this.w, (p / this.w) | 0) + 3] ? 1 : 0; });
  }

  // ── rendering ────────────────────────────────────────────────────────────────
  private comp: Raster | null = null;
  /** Composite of visible layers at their opacity, canvas-sized. The buffer is reused between calls. */
  render(): Raster {
    this.comp = composite(this.w, this.h, this.layers.filter(l => l.visible).map(l => { const p = this.placed(l.id); return { raster: p.raster, x: p.x, y: p.y, opacity: l.opacity }; }), this.comp ?? undefined);
    return this.comp;
  }
}
