// The Art workspace's behavior: a straight port of the original Pixel Studio Component's logic
// (tools, pointer/keyboard handling, layers, selection, import, image tuning, export, autosave),
// reorganized as a plain class. React components subscribe to `state`; the canvases are drawn
// directly (as in the original) so a brush stroke never waits on a React render.
//
// Deliberate differences from the original are marked "CHANGE:" and listed in docs/DECISIONS.md.

import { hex2rgb, quantizeData, removeBg, rgb2hex, runTuning, trimTransparent, type FamilyInfo, type RangeAdjust, type RangeInfo } from '../../core/imaging';
import { cropRaster, line, scaleNearest, sceneColors, stamp, stampMask, floodFill, type Pixels, type Point, type Raster, type Rect } from '../../core/raster';
import { describeSaveError, draftStore, type Draft, type DraftStore } from '../../core/persistence/draftStore';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArtDoc, type LayerId, type LayerMeta, type Source } from './doc';
import { decodeImage, downloadPng, fitImage, loadSampleLayer, SAMPLE_SCENE } from './io';

export type View = 'paint' | 'clip';
export type ToolId = 'pen' | 'eraser' | 'fill' | 'pick' | 'sel' | 'unsel' | 'move';
export type SectionId = 'color' | 'clip' | 'layers' | 'import' | 'tune' | 'ranges' | 'export';

/** IMAGE TUNING / RECOLOR RANGES slider state, per layer (the original's imp* keys). */
export type Sliders = {
  detail: number; family: number; separation: number; sharp: number; tame: number; deep: number;
  deepSel: number[] | null; rangeAdj: Record<number, RangeAdjust | undefined>; editRi: number[] | null;
};
export const SLIDER_DEFAULTS: Sliders = { detail: 100, family: 100, separation: 70, sharp: 0, tame: 70, deep: 0, deepSel: null, rangeAdj: {}, editRi: null };
export type TuningInfo = { name: string; uniq: number; k: number; family: FamilyInfo | null; ranges: RangeInfo[] };
export type SaveStatus = { state: 'idle' | 'saving' | 'saved' | 'error'; message?: string };

export type ArtState = {
  ready: boolean; w: number; h: number;
  view: View; tool: ToolId; prevTool: ToolId; size: number; selSize: number;
  color: string; recent: string[]; palette: string[];
  zoom: number; grid: boolean; cursor: Point | null; cursorCss: string;
  secOpen: Record<SectionId, boolean>;
  layers: LayerMeta[]; active: LayerId | null; rev: number; layerRev: Record<LayerId, number>;
  canUndo: boolean; canRedo: boolean; selCount: number;
  trim: boolean; rmBg: boolean; expScale: number;
  sliders: Sliders; info: TuningInfo | null;
  status: string; save: SaveStatus;
};

type Session = { id: LayerId; src: Pixels; gw: number; gh: number; b: number; uniq: number; name: string; nr?: number; info?: TuningInfo };
type MoveDrag = { id: LayerId; src: Source; box: Rect; cur: Rect; mode: string; sx: number; sy: number };
type Canvases = { main: HTMLCanvasElement; overlay: HTMLCanvasElement; cursor: HTMLCanvasElement; scroll: HTMLElement };

export const TOOLS: Record<View, [ToolId, string, string][]> = {
  paint: [['pen', 'PENCIL', 'B'], ['eraser', 'ERASER', 'E'], ['fill', 'BUCKET', 'G'], ['pick', 'DROPPER', 'I'], ['move', 'MOVE', 'M']],
  clip: [['sel', 'SELECT', 'S'], ['unsel', 'UNSELECT', 'D'], ['move', 'MOVE', 'M']]
};
const CURS: Record<string, string> = { move: 'move', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
export const MOVE_HINT = 'DRAG TO MOVE · HANDLES RESIZE · SHIFT KEEPS RATIO · ARROWS NUDGE';

export class ArtController {
  readonly doc: ArtDoc;
  state: ArtState;
  private listeners = new Set<() => void>();
  private cv: Canvases | null = null;
  private sessions = new Map<LayerId, Session>();     // the original's `imps`
  private lset = new Map<LayerId, Sliders>();         // per-layer slider memory
  private settingsFor: LayerId | null = null;         // the original's `_setFor`
  private drawing: 'px' | 'mask' | 'move' | null = null;
  private last: Point | null = null;
  private rgb: [number, number, number] = [0, 0, 0];
  private mv: MoveDrag | null = null;
  private boxCache: { k: string; b: Rect | null } | null = null;
  private pinchAcc = 0; private gestureZoom = 1;
  private zoomAnchor: { px: number; py: number; cx: number; cy: number } | null = null;
  private timers: Record<'flash' | 'save' | 'tune', ReturnType<typeof setTimeout> | undefined> = { flash: undefined, save: undefined, tune: undefined };
  private saving: Promise<void> | null = null; private saveAgain = false;

  constructor(w = 320, h = 200, private store: DraftStore = draftStore) {
    this.doc = new ArtDoc(w, h);
    this.doc.onSnapshotTouched = ids => this.endSessions(ids);
    this.state = {
      ready: false, w, h, view: 'paint', tool: 'pen', prevTool: 'pen', size: 1, selSize: 6,
      color: '#f2ecd8', recent: [], palette: [], zoom: 3, grid: true, cursor: null, cursorCss: 'crosshair',
      secOpen: { color: true, clip: true, layers: true, import: true, tune: false, ranges: false, export: false },
      layers: [], active: null, rev: 0, layerRev: {}, canUndo: false, canRedo: false, selCount: 0,
      trim: true, rmBg: true, expScale: 4, sliders: { ...SLIDER_DEFAULTS }, info: null,
      status: '', save: { state: 'idle' }
    };
  }

  // ── store plumbing ───────────────────────────────────────────────────────────
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getState = () => this.state;
  private set(patch: Partial<ArtState>) { this.state = { ...this.state, ...patch }; for (const fn of this.listeners) fn(); }
  private setSliders(patch: Partial<Sliders>) { this.set({ sliders: { ...this.state.sliders, ...patch } }); }

  // ── lifecycle ────────────────────────────────────────────────────────────────
  private initOnce: Promise<void> | null = null;
  /** Loads the autosaved artwork, or the sample scene on first run. Safe to call more than once. */
  init(): Promise<void> { return (this.initOnce ??= this.load()); }
  private async load(): Promise<void> {
    let draft: Draft | null = null;
    try { draft = await this.store.load(); } catch (e) { this.set({ save: { state: 'error', message: describeSaveError(e) } }); }
    if (draft && draft.w === this.doc.w && draft.h === this.doc.h) {
      const ids = draft.layers.map(l => { const id = this.doc.newId(); this.doc.addLayerPixels(id, { w: l.w, h: l.h, data: new Uint8ClampedArray(l.data) }, l.x, l.y); return { id, name: l.name, visible: l.visible, opacity: l.opacity ?? 100 }; });
      this.doc.layers = ids;
      this.doc.active = ids[Math.min(Math.max(0, draft.activeIndex), ids.length - 1)].id;
      this.set({ color: draft.color || this.state.color, recent: draft.recent || [] });
      this.afterChange(ids.map(l => l.id), false);
    } else {
      await this.addScene(false);
    }
    this.set({ ready: true });
  }

  /** Called by the canvas view once its elements exist. Sets the initial fit-to-window zoom. */
  attach(c: Canvases): () => void {
    this.cv = c;
    const el = c.scroll, W = this.doc.w, H = this.doc.h;
    this.set({ zoom: Math.max(1, Math.min(8, Math.floor(Math.min((el.clientWidth - 48) / W, (el.clientHeight - 48) / H)))) });
    el.addEventListener('wheel', this.onPinchWheel, { passive: false });
    el.addEventListener('gesturestart', this.onGesture as EventListener, { passive: false });
    el.addEventListener('gesturechange', this.onGesture as EventListener, { passive: false });
    window.addEventListener('keydown', this.onKey);
    this.redraw(); this.drawOverlay(); this.drawCursor();
    return () => {
      el.removeEventListener('wheel', this.onPinchWheel);
      el.removeEventListener('gesturestart', this.onGesture as EventListener);
      el.removeEventListener('gesturechange', this.onGesture as EventListener);
      window.removeEventListener('keydown', this.onKey);
      this.cv = null;
    };
  }

  /** Called after React re-renders the canvas stack (zoom or view changes resize/clear the overlays). */
  afterRender(): void {
    const a = this.zoomAnchor, el = this.cv?.scroll, main = this.cv?.main;
    if (a && el && main) { const r2 = main.getBoundingClientRect(); el.scrollLeft += r2.left + a.px * this.state.zoom - a.cx; el.scrollTop += r2.top + a.py * this.state.zoom - a.cy; }
    this.zoomAnchor = null;
    this.drawOverlay(); this.drawCursor();
  }

  // ── sample scene ─────────────────────────────────────────────────────────────
  addScene = async (undoable: boolean = true): Promise<void> => {
    const imgs = await Promise.all(SAMPLE_SCENE.map(([f]) => loadSampleLayer(f)));
    if (undoable) this.doc.pushUndo([]);
    // The sample art is 160×100 and is shown at 2× to fill the canvas, as in the original.
    const add = imgs.map((img, i) => {
      const id = this.doc.newId(), big = scaleNearest(img, img.w * 2, img.h * 2);
      this.doc.addLayerPixels(id, big.w === this.doc.w && big.h === this.doc.h ? big : cropRaster(big, this.doc.canvasRect));
      return { id, name: SAMPLE_SCENE[i][1], visible: true, opacity: 100 };
    });
    this.doc.layers = [...this.doc.layers, ...add];
    this.doc.active = add[add.length - 1].id;
    this.afterChange(add.map(l => l.id));
  };

  // ── drawing the canvases ─────────────────────────────────────────────────────
  redraw(): void { const c = this.cv?.main; if (c) c.getContext('2d')!.putImageData(new ImageData(this.doc.render().data, this.doc.w, this.doc.h), 0, 0); }

  drawOverlay(): void {
    const c = this.cv?.overlay; if (!c) return;
    const z = this.state.zoom, x = c.getContext('2d')!, W = this.doc.w, H = this.doc.h;
    x.clearRect(0, 0, c.width, c.height);
    if (this.state.grid && z >= 3) {
      for (let i = 1; i < W; i++) { x.fillStyle = i % 16 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.18)'; x.fillRect(i * z, 0, 1, H * z); }
      for (let j = 1; j < H; j++) { x.fillStyle = j % 16 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.18)'; x.fillRect(0, j * z, W * z, 1); }
    }
    if (this.state.view !== 'clip') return;
    const m = this.doc.mask.data, t = document.createElement('canvas'); t.width = W; t.height = H;
    const tx = t.getContext('2d')!, id = tx.createImageData(W, H);
    for (let p = 0; p < m.length; p++) if (m[p]) { id.data[p * 4] = 255; id.data[p * 4 + 1] = 216; id.data[p * 4 + 2] = 110; id.data[p * 4 + 3] = 90; }
    tx.putImageData(id, 0, 0);
    x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, W * z, H * z);
    x.fillStyle = '#ffd86e';
    const lw = z >= 6 ? 2 : 1;
    for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) {
      const p = y * W + X; if (!m[p]) continue;
      if (X === 0 || !m[p - 1]) x.fillRect(X * z, y * z, lw, z);
      if (X === W - 1 || !m[p + 1]) x.fillRect((X + 1) * z - lw, y * z, lw, z);
      if (y === 0 || !m[p - W]) x.fillRect(X * z, y * z, z, lw);
      if (y === H - 1 || !m[p + W]) x.fillRect(X * z, (y + 1) * z - lw, z, lw);
    }
  }

  drawCursor(): void {
    const c = this.cv?.cursor; if (!c) return;
    const x = c.getContext('2d')!, z = this.state.zoom, p = this.state.cursor, t = this.state.tool;
    x.clearRect(0, 0, c.width, c.height);
    if (t === 'move') {
      const b = this.mv ? this.mv.cur : this.curBox(); if (!b) return;
      const X = b.x * z, Y = b.y * z, Wd = b.w * z, Hd = b.h * z;
      x.strokeStyle = '#111'; x.lineWidth = 3; x.strokeRect(X + 0.5, Y + 0.5, Wd - 1, Hd - 1);
      x.strokeStyle = '#ffd86e'; x.lineWidth = 1; x.strokeRect(X + 0.5, Y + 0.5, Wd - 1, Hd - 1);
      for (const [u, v] of [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]]) {
        const hx = Math.round(X + Wd * u) - 4, hy = Math.round(Y + Hd * v) - 4;
        x.fillStyle = '#111'; x.fillRect(hx - 1, hy - 1, 10, 10); x.fillStyle = '#f2ecd8'; x.fillRect(hx, hy, 8, 8);
      }
      return;
    }
    if (!p) return;
    const s = t === 'sel' || t === 'unsel' ? this.state.selSize : t === 'pen' || t === 'eraser' ? this.state.size : 1, o = (s - 1) >> 1;
    if (t === 'pen') { x.globalAlpha = 0.55; x.fillStyle = this.state.color; x.fillRect((p.x - o) * z, (p.y - o) * z, s * z, s * z); x.globalAlpha = 1; }
    x.strokeStyle = '#111'; x.lineWidth = 3; x.strokeRect((p.x - o) * z + 0.5, (p.y - o) * z + 0.5, s * z - 1, s * z - 1);
    x.strokeStyle = t === 'sel' || t === 'unsel' ? '#ffd86e' : '#f2ecd8'; x.lineWidth = 1; x.strokeRect((p.x - o) * z + 0.5, (p.y - o) * z + 0.5, s * z - 1, s * z - 1);
  }

  // ── change bookkeeping ───────────────────────────────────────────────────────
  /** After any edit: redraw, refresh thumbnails/palette/counters, follow active-layer changes, autosave. */
  afterChange(ids: LayerId[] | null, save = true): void {
    const doc = this.doc;
    doc.rev++;
    this.syncActive();
    this.redraw(); this.drawOverlay();
    const layerRev = { ...this.state.layerRev };
    for (const id of ids ?? doc.layers.map(l => l.id)) layerRev[id] = (layerRev[id] || 0) + 1;
    this.set({
      layers: doc.layers, active: doc.active, rev: doc.rev, layerRev,
      palette: sceneColors(doc.layers.map(l => doc.canvasPixels(l.id))),
      selCount: doc.selectionCount(), canUndo: doc.canUndo(), canRedo: doc.canRedo()
    });
    this.drawCursor();
    if (save) this.scheduleSave();
  }

  /** When the active layer changes, remember the old layer's sliders and load the new one's. */
  private syncActive(): void {
    const a = this.doc.active;
    if (a === this.settingsFor) return;
    if (this.settingsFor != null) this.lset.set(this.settingsFor, this.state.sliders);
    this.settingsFor = a;
    const s = a != null ? this.sessions.get(a) : undefined;
    this.set({ sliders: { ...SLIDER_DEFAULTS, ...(a != null ? this.lset.get(a) : undefined) }, info: s?.info ?? null });
  }

  /** CHANGE: the original ended only the active layer's tuning session; this ends any session whose layer is edited. */
  private endSessions(ids: LayerId[]): void {
    let hit = false;
    for (const id of ids) if (this.sessions.delete(id) && id === this.doc.active) hit = true;
    if (hit && this.state.info) this.set({ info: null });
  }

  flash(msg: string): void {
    clearTimeout(this.timers.flash);
    this.set({ status: msg });
    this.timers.flash = setTimeout(() => this.set({ status: '' }), 2200);
  }

  // ── autosave (interim, see draftStore.ts) ────────────────────────────────────
  scheduleSave(): void {
    clearTimeout(this.timers.save);
    if (this.state.save.state !== 'saving') this.set({ save: { state: 'saving' } }); // never show a stale "SAVED"

    this.timers.save = setTimeout(() => { void this.saveNow(); }, 700);
  }
  /** Saves immediately; resolves when written (or failed, which is shown in the status bar). */
  async saveNow(): Promise<void> {
    clearTimeout(this.timers.save);
    if (this.saving) { this.saveAgain = true; return this.saving; }
    const doc = this.doc;
    const draft: Draft = {
      version: 1, w: doc.w, h: doc.h, color: this.state.color, recent: this.state.recent,
      activeIndex: Math.max(0, doc.layers.findIndex(l => l.id === doc.active)),
      layers: doc.layers.map(l => { const p = doc.placed(l.id); return { name: l.name, visible: l.visible, opacity: l.opacity, x: p.x, y: p.y, w: p.raster.w, h: p.raster.h, data: p.raster.data.slice() }; })
    };
    this.set({ save: { state: 'saving' } });
    this.saving = this.store.save(draft)
      .then(() => this.set({ save: { state: 'saved' } }))
      .catch(e => this.set({ save: { state: 'error', message: describeSaveError(e) } }))
      .finally(() => { this.saving = null; if (this.saveAgain) { this.saveAgain = false; void this.saveNow(); } });
    return this.saving;
  }

  // ── pointer input ────────────────────────────────────────────────────────────
  private cell(e: { clientX: number; clientY: number }): Point {
    const r = this.cv!.cursor.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / r.width * this.doc.w), y: Math.floor((e.clientY - r.top) / r.height * this.doc.h) };
  }
  private fcell(e: { clientX: number; clientY: number }): Point {
    const r = this.cv!.cursor.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * this.doc.w, y: (e.clientY - r.top) / r.height * this.doc.h };
  }
  private inCanvas(p: Point) { return p.x >= 0 && p.y >= 0 && p.x < this.doc.w && p.y < this.doc.h; }

  private curBox(): Rect | null {
    const a = this.doc.active, k = this.doc.rev + ':' + a;
    if (!this.boxCache || this.boxCache.k !== k) { const s = a != null && this.doc.pix.has(a) ? this.doc.source(a) : null; this.boxCache = { k, b: s && { x: s.x, y: s.y, w: s.w, h: s.h } }; }
    return this.boxCache.b;
  }
  private hitBox(b: Rect | null, f: Point): string | null {
    if (!b) return null;
    const t = Math.max(0.5, 6 / this.state.zoom), r = b.x + b.w, bt = b.y + b.h;
    if (f.x < b.x - t || f.x > r + t || f.y < b.y - t || f.y > bt + t) return null;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let v = Math.abs(f.y - b.y) < t ? 'n' : Math.abs(f.y - bt) < t ? 's' : '';
    let h = Math.abs(f.x - b.x) < t ? 'w' : Math.abs(f.x - r) < t ? 'e' : '';
    if (v && !h && Math.abs(f.x - cx) > t) v = '';
    if (h && !v && Math.abs(f.y - cy) > t) h = '';
    return v + h || (f.x >= b.x && f.x <= r && f.y >= b.y && f.y <= bt ? 'move' : null);
  }
  private renderMove(nb: Rect): void {
    const m = this.mv!; this.doc.previewMove(m.id, m.src.raster, nb); m.cur = nb;
    this.redraw(); this.drawCursor();
    this.set({ status: 'X ' + nb.x + '  Y ' + nb.y + '  ·  ' + nb.w + ' × ' + nb.h + ' PX' });
  }
  private moveTo(f: Point, shift: boolean): void {
    const m = this.mv!, b = m.box, dx = f.x - m.sx, dy = f.y - m.sy, md = m.mode;
    let nb: Rect;
    if (md === 'move') nb = { x: b.x + Math.round(dx), y: b.y + Math.round(dy), w: b.w, h: b.h };
    else {
      let l = b.x, t = b.y, r = b.x + b.w, bt = b.y + b.h;
      if (md.includes('w')) l = Math.min(Math.round(l + dx), r - 1);
      if (md.includes('e')) r = Math.max(Math.round(r + dx), l + 1);
      if (md.includes('n')) t = Math.min(Math.round(t + dy), bt - 1);
      if (md.includes('s')) bt = Math.max(Math.round(bt + dy), t + 1);
      if (shift && md.length === 2) {
        const s = Math.max((r - l) / b.w, (bt - t) / b.h), w = Math.max(1, Math.round(b.w * s)), h = Math.max(1, Math.round(b.h * s));
        if (md.includes('w')) l = r - w; else r = l + w;
        if (md.includes('n')) t = bt - h; else bt = t + h;
      }
      nb = { x: l, y: t, w: Math.min(2048, r - l), h: Math.min(2048, bt - t) };
    }
    const c = m.cur; if (c.x !== nb.x || c.y !== nb.y || c.w !== nb.w || c.h !== nb.h) this.renderMove(nb);
  }

  onPointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    if (e.button === 2 || !this.cv) return;
    const sc = e.currentTarget, sr = sc.getBoundingClientRect();
    if (e.target === sc && (e.clientX - sr.left >= sc.clientWidth || e.clientY - sr.top >= sc.clientHeight)) return; // scrollbar
    const p = this.cell(e), t = this.state.tool, view = this.state.view, doc = this.doc;
    sc.setPointerCapture(e.pointerId);
    if (!this.inCanvas(p) && (t === 'pick' || t === 'fill' || e.altKey)) return;
    if (view === 'paint' && (t === 'pick' || e.altKey)) { this.pick(p); return; }
    const L = doc.activeLayer(); if (!L) return;
    if (t === 'move') {
      if (!L.visible) { this.flash('ACTIVE LAYER IS HIDDEN'); return; }
      const src = doc.source(L.id); if (!src) { this.flash('ACTIVE LAYER IS EMPTY'); return; }
      const box = { x: src.x, y: src.y, w: src.w, h: src.h }, f = this.fcell(e);
      doc.pushUndo([L.id]);
      this.mv = { id: L.id, src, box, cur: box, mode: this.hitBox(box, f) || 'move', sx: f.x, sy: f.y };
      this.drawing = 'move'; return;
    }
    if (view === 'paint' && !L.visible) { this.flash('ACTIVE LAYER IS HIDDEN'); return; }
    this.rgb = hex2rgb(this.state.color);
    if (t === 'fill') {
      doc.pushUndo([L.id]);
      const P = doc.placed(L.id);
      if (floodFill(P.raster, p.x - P.x, p.y - P.y, this.rgb, doc.canvasClip(L.id))) { this.addRecent(this.state.color); this.afterChange([L.id]); } else doc.dropLastUndo();
      return;
    }
    if (t === 'pen' || t === 'eraser') { doc.pushUndo([L.id]); this.drawing = 'px'; this.last = p; this.stampAt(p.x, p.y); this.redraw(); }
    if (t === 'sel' || t === 'unsel') { doc.pushUndo([]); this.drawing = 'mask'; this.last = p; this.maskAt(p.x, p.y); this.drawOverlay(); }
  };

  private stampAt(x: number, y: number): void {
    const id = this.doc.active!, P = this.doc.placed(id);
    stamp(P.raster, x - P.x, y - P.y, this.state.size, this.state.tool === 'eraser' ? null : this.rgb, this.doc.canvasClip(id));
  }
  private maskAt(x: number, y: number): void { stampMask(this.doc.mask, x, y, this.state.selSize, this.state.tool === 'sel' ? 1 : 0); }

  onPointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    if (!this.cv) return;
    const p = this.cell(e), m = Math.max(this.state.size, this.state.selSize), W = this.doc.w, H = this.doc.h;
    const near = p.x > -m && p.y > -m && p.x < W + m && p.y < H + m, cp = near ? p : null, cur = this.state.cursor;
    if (cp ? !cur || cur.x !== p.x || cur.y !== p.y : cur) { this.set({ cursor: cp }); this.drawCursor(); }
    if (this.drawing === 'move') { this.moveTo(this.fcell(e), e.shiftKey); return; }
    if (this.state.tool === 'move') { const css = CURS[this.hitBox(this.curBox(), this.fcell(e)) ?? ''] || 'default'; if (css !== this.state.cursorCss) this.set({ cursorCss: css }); }
    if (!this.drawing || !this.last) return;
    if (this.drawing === 'px') { line(this.last, p, (x, y) => this.stampAt(x, y)); this.redraw(); }
    else { line(this.last, p, (x, y) => this.maskAt(x, y)); this.drawOverlay(); }
    this.last = p;
  };

  onPointerUp = (): void => {
    if (!this.drawing) return;
    const kind = this.drawing; this.drawing = null;
    if (kind === 'move') { const m = this.mv!; this.mv = null; this.doc.finalize(m.id, m.src.raster, m.cur); this.afterChange([m.id]); this.flash(this.state.status); return; }
    if (kind === 'px') { if (this.state.tool === 'pen') this.addRecent(this.state.color); this.afterChange([this.doc.active!]); }
    else this.afterChange([], false);
  };

  onPointerLeave = (): void => { if (!this.drawing) { this.set({ cursor: null }); this.drawCursor(); } };

  // ── zoom ─────────────────────────────────────────────────────────────────────
  setZoom(z: number): void { this.set({ zoom: Math.max(1, Math.min(12, z)) }); }
  zoomAt(z: number, cx: number, cy: number): void {
    z = Math.max(1, Math.min(12, z));
    const main = this.cv?.main, z0 = this.state.zoom;
    if (z === z0 || !main) return;
    const r = main.getBoundingClientRect();
    this.zoomAnchor = { px: (cx - r.left) / z0, py: (cy - r.top) / z0, cx, cy };
    this.set({ zoom: z });
  }
  private onPinchWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.pinchAcc -= e.deltaY;
    const step = 40; if (Math.abs(this.pinchAcc) < step) return;
    const d = Math.trunc(this.pinchAcc / step); this.pinchAcc -= d * step;
    this.zoomAt(this.state.zoom + d, e.clientX, e.clientY);
  };
  private onGesture = (e: Event & { scale: number; clientX: number; clientY: number }): void => {
    e.preventDefault();
    if (e.type === 'gesturestart') { this.gestureZoom = this.state.zoom; return; }
    this.zoomAt(Math.round(this.gestureZoom * e.scale), e.clientX, e.clientY);
  };

  // ── keyboard ─────────────────────────────────────────────────────────────────
  onKey = (e: KeyboardEvent): void => {
    const tg = (e.target as HTMLElement | null)?.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if ((e.metaKey || e.ctrlKey) && k === 'y') { e.preventDefault(); this.redo(); return; }
    if ((e.metaKey || e.ctrlKey) && k === 's') { e.preventDefault(); void this.saveNow(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'm') { this.setTool('move'); return; }
    const ar = ({ arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] } as Record<string, [number, number]>)[k];
    if (ar && this.state.tool === 'move' && !this.drawing) { e.preventDefault(); const n = e.shiftKey ? 10 : 1; this.nudge(ar[0] * n, ar[1] * n); return; }
    const map: Record<string, [View, ToolId]> = { b: ['paint', 'pen'], e: ['paint', 'eraser'], g: ['paint', 'fill'], i: ['paint', 'pick'], s: ['clip', 'sel'], d: ['clip', 'unsel'] };
    if (map[k]) { this.setTool(map[k][1], map[k][0]); return; }
    const clip = this.state.view === 'clip', max = clip ? 24 : 8;
    if (k === '[') { if (clip) this.set({ selSize: Math.max(1, this.state.selSize - 1) }); else this.set({ size: Math.max(1, this.state.size - 1) }); this.drawCursor(); }
    if (k === ']') { if (clip) this.set({ selSize: Math.min(max, this.state.selSize + 1) }); else this.set({ size: Math.min(max, this.state.size + 1) }); this.drawCursor(); }
  };

  // ── tools, views, color ──────────────────────────────────────────────────────
  setTool(tool: ToolId, view?: View): void {
    const s = this.state;
    this.set({ tool, view: view || s.view, prevTool: s.tool === 'pick' ? s.prevTool : s.tool, ...(tool !== 'move' ? { cursorCss: 'crosshair' } : {}) });
  }
  setView(view: View): void { if (view !== this.state.view) this.set({ view, tool: view === 'clip' ? 'sel' : 'pen', cursorCss: 'crosshair' }); }
  setColor(c: string): void { this.set({ color: c }); }
  private addRecent(c: string): void { const s = this.state, r = [c, ...s.recent.filter(x => x !== c)].slice(0, 8); if (r.join() !== s.recent.join()) this.set({ recent: r }); }
  private pick(p: Point): void {
    const o = this.doc.render().data, i = (p.y * this.doc.w + p.x) * 4;
    if (!o[i + 3]) { this.flash('NOTHING TO PICK THERE'); return; }
    this.setColor(rgb2hex(o[i], o[i + 1], o[i + 2]));
    if (this.state.tool === 'pick') this.set({ tool: this.state.prevTool === 'pick' ? 'pen' : this.state.prevTool });
  }
  setSize(v: number): void { this.set({ size: v }); }
  setSelSize(v: number): void { this.set({ selSize: v }); }
  toggleGrid(): void { this.set({ grid: !this.state.grid }); }
  toggleSection(k: SectionId): void { this.set({ secOpen: { ...this.state.secOpen, [k]: !this.state.secOpen[k] } }); }
  toggleTrim(): void { this.set({ trim: !this.state.trim }); }
  toggleRmBg(): void { this.set({ rmBg: !this.state.rmBg }); }
  setExportScale(v: number): void { this.set({ expScale: v }); }

  // ── history ──────────────────────────────────────────────────────────────────
  undo = (): void => { const ids = this.doc.undo(); if (ids) this.afterChange(ids); };
  redo = (): void => { const ids = this.doc.redo(); if (ids) this.afterChange(ids); };

  // ── layers ───────────────────────────────────────────────────────────────────
  newLayer = (): void => { const id = this.doc.newLayer(); this.afterChange([id]); };
  selectLayer(id: LayerId): void { this.doc.active = id; this.afterChange([], true); }
  toggleVisible(id: LayerId): void { const l = this.doc.layers.find(x => x.id === id); if (l) { this.doc.updateLayer(id, { visible: !l.visible }); this.afterChange([]); } }
  renameLayer(id: LayerId, name: string): void { const n = name.trim().slice(0, 24); const l = this.doc.layers.find(x => x.id === id); if (n && l && n !== l.name) { this.doc.updateLayer(id, { name: n }); this.afterChange([]); } }
  moveLayer(dir: 1 | -1): void { if (this.doc.moveLayer(dir)) this.afterChange([]); }
  deleteLayer = (): void => { if (this.doc.deleteActive()) this.afterChange([]); else this.flash('KEEP AT LEAST ONE LAYER'); };
  mergeDown = (): void => { const id = this.doc.mergeDown(); if (id == null) this.flash('NO LAYER BELOW'); else this.afterChange([id]); };
  /** The opacity slider records one undo step when a drag starts, then updates live. */
  opacityStart(): void { if (this.doc.activeLayer()) this.doc.pushUndo([]); }
  setOpacity(v: number): void {
    const a = this.doc.activeLayer(); if (!a) return;
    this.doc.setOpacityLive(a.id, v); this.doc.rev++;
    this.set({ layers: this.doc.layers, canUndo: this.doc.canUndo(), canRedo: this.doc.canRedo() });
    this.redraw(); this.scheduleSave();
  }
  private nudge(dx: number, dy: number): void {
    const L = this.doc.activeLayer(); if (!L) return;
    const s = this.doc.source(L.id); if (!s) return;
    this.doc.pushUndo([L.id]);
    this.doc.finalize(L.id, s.raster, { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h });
    this.afterChange([L.id]);
  }

  // ── selection ────────────────────────────────────────────────────────────────
  clipOut(cut: boolean): void {
    const r = this.doc.clipOut(cut);
    if (typeof r === 'string') { this.flash(r); return; }
    const src = this.doc.layers[this.doc.layers.findIndex(l => l.id === r.id) - 1];
    this.afterChange([src.id, r.id]);
    this.flash((cut ? 'CLIPPED ' : 'COPIED ') + r.n + ' PX TO NEW LAYER');
  }
  selectLayerPixels(): void { if (!this.doc.activeLayer()) return; this.doc.selectLayerPixels(); this.afterChange([], false); }
  invertSelection(): void { this.doc.editMask(m => { for (let p = 0; p < m.length; p++) m[p] ^= 1; }); this.afterChange([], false); }
  clearSelection(): void { this.doc.editMask(m => m.fill(0)); this.afterChange([], false); }

  // ── image tuning ─────────────────────────────────────────────────────────────
  private applyTuning(m: Session): void {
    if (!this.doc.pix.has(m.id)) return;
    const s = this.state.sliders;
    const r = runTuning(m.src, m.gw, m.gh, { detail: s.detail, family: s.family, separation: s.separation, sharp: s.sharp, tame: s.tame, deep: s.deep, deepSel: s.deepSel, rangeAdj: s.rangeAdj }, m.nr);
    if (r.rangesReset) this.setSliders({ deepSel: null, rangeAdj: {}, editRi: null });
    m.nr = r.ranges.length;
    const tuned: Raster = { w: m.gw, h: m.gh, data: r.data };
    this.doc.pix.set(m.id, { raster: m.b === 1 ? tuned : scaleNearest(tuned, m.gw * m.b, m.gh * m.b), x: 0, y: 0 });
    m.info = { name: m.name, uniq: r.uniq, k: r.k, family: r.family, ranges: r.ranges };
    if (m.id === this.doc.active) this.set({ info: m.info });
  }
  private liveTuning = (): void => {
    const a = this.doc.active, m = a != null ? this.sessions.get(a) : undefined;
    if (!m || !this.doc.pix.has(m.id)) return;
    this.applyTuning(m); this.redraw();
    clearTimeout(this.timers.tune);
    this.timers.tune = setTimeout(() => { if (this.sessions.has(m.id)) this.afterChange([m.id]); }, 120);
  };
  /** Starts a tuning session on the layer's current pixels (one undo step). */
  private beginAdjust(a: LayerMeta): boolean {
    if (!this.doc.onCanvas(a.id)) { this.flash('MOVE THE LAYER FULLY ONTO THE CANVAS TO ADJUST IT'); return false; }
    const d = this.doc.placed(a.id).raster.data, W = this.doc.w, H = this.doc.h;
    // Art drawn in 2×2 blocks (like the sample scene) is tuned at half size so it stays chunky.
    let b = W % 2 || H % 2 ? 1 : 2;
    outer: if (b === 2) for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4;
      for (const q of [i + 4, i + W * 4, i + W * 4 + 4]) for (let c = 0; c < 4; c++) if (d[q + c] !== d[i + c]) { b = 1; break outer; }
    }
    const gw = W / b, gh = H / b, src = new Uint8ClampedArray(gw * gh * 4);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = (y * b * W + x * b) * 4, o = (y * gw + x) * 4; for (let c = 0; c < 4; c++) src[o + c] = d[i + c]; }
    let any = false; for (let i = 3; i < src.length; i += 4) if (src[i]) { any = true; break; }
    if (!any) { this.flash('ACTIVE LAYER IS EMPTY'); return false; }
    this.doc.pushUndo([a.id]);
    this.sessions.set(a.id, { id: a.id, src, gw, gh, b, uniq: quantizeData(src.slice(), 1e9), name: a.name });
    return true;
  }
  private static readonly ADJUST_RESET: Partial<Sliders> = { detail: 100, family: 100, sharp: 0, deep: 0, deepSel: null, rangeAdj: {}, editRi: null };
  /** Moving any tuning slider on a layer with no session starts one first (as in the original). */
  setSlider<K extends 'detail' | 'family' | 'separation' | 'sharp' | 'tame' | 'deep'>(key: K, v: number): void {
    const a = this.doc.activeLayer();
    if (a && !this.sessions.has(a.id)) {
      if (!this.beginAdjust(a)) { this.setSliders({ [key]: v }); return; }
      this.setSliders({ ...ArtController.ADJUST_RESET, [key]: v }); this.liveTuning(); return;
    }
    this.setSliders({ [key]: v }); this.liveTuning();
  }
  adjustLayer = (): void => { const a = this.doc.activeLayer(); if (a && this.beginAdjust(a)) { this.setSliders(ArtController.ADJUST_RESET); this.liveTuning(); } };
  toggleDeepRange(ri: number): void { const cur = this.state.sliders.deepSel || [], nx = cur.includes(ri) ? cur.filter(x => x !== ri) : [...cur, ri]; this.setSliders({ deepSel: nx.length ? nx : null }); this.liveTuning(); }
  deepAll(): void { this.setSliders({ deepSel: null }); this.liveTuning(); }
  /** Range picking for RECOLOR RANGES. Shift-click adds/removes; plain click selects one (or deselects it). */
  pickRange(ri: number, shift: boolean): void {
    const cur = this.state.sliders.editRi || [];
    if (shift) { const nx = cur.includes(ri) ? cur.filter(x => x !== ri) : [...cur, ri]; this.setSliders({ editRi: nx.length ? nx : null }); }
    else this.setSliders({ editRi: cur.length === 1 && cur[0] === ri ? null : [ri] });
  }
  pickRangeGroup(ids: number[], shift: boolean): void { const cur = this.state.sliders.editRi || []; this.setSliders({ editRi: shift ? [...new Set([...cur, ...ids])] : ids }); }
  setRangeAdjust(k: 'h' | 'b' | 's', v: number): void {
    const s = this.state.sliders, n = { ...s.rangeAdj };
    for (const ri of s.editRi || []) n[ri] = { ...(n[ri] || {}), [k]: v };
    this.setSliders({ rangeAdj: n }); this.liveTuning();
  }
  resetRanges(all: boolean): void {
    const s = this.state.sliders, n = { ...s.rangeAdj };
    if (all) this.setSliders({ rangeAdj: {} }); else { for (const ri of s.editRi || []) delete n[ri]; this.setSliders({ rangeAdj: n }); }
    this.liveTuning();
  }

  // ── import ───────────────────────────────────────────────────────────────────
  /** IMPORT & PIXELATE: fit the image to the canvas, then start a tuning session on it. */
  async importFile(file: File): Promise<void> {
    if (!/^image\//.test(file.type || '') && !/\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name || '')) { this.flash('UNSUPPORTED FILE — USE PNG, JPG, GIF OR WEBP'); return; }
    let img: Raster;
    try { img = await decodeImage(file); } catch { this.flash('COULD NOT READ IMAGE'); return; }
    if (this.state.trim) img = trimTransparent(img);
    // CHANGE (D-015): always fits at 1×; the original's 2× "game grid" option is removed.
    const gw = this.doc.w, gh = this.doc.h, { raster, rect } = fitImage(img, gw, gh);
    if (this.state.rmBg) removeBg(raster.data, gw, gh, rect, 60);
    const name = (file.name || 'Import').replace(/\.[^.]+$/, '').slice(0, 20), id = this.doc.newId();
    this.doc.addLayerPixels(id, this.doc.blankLayer());
    if (this.settingsFor != null) this.lset.set(this.settingsFor, this.state.sliders);
    this.settingsFor = id;
    this.set({ sliders: { ...SLIDER_DEFAULTS } });
    const m: Session = { id, src: raster.data, gw, gh, b: 1, uniq: quantizeData(raster.data.slice(), 1e9), name };
    this.sessions.set(id, m);
    this.applyTuning(m);
    this.doc.insertLayer(id, name);
    this.set({ info: m.info ?? null });
    this.afterChange([id]);
  }
  /** IMPORT PNG (EXACT): pixel for pixel, no resampling or palette change. */
  async importExact(file: File): Promise<void> {
    if (!/png$/i.test(file.type || '') && !/\.png$/i.test(file.name || '')) { this.flash('PLEASE CHOOSE A .PNG FILE'); return; }
    let img: Raster;
    try { img = await decodeImage(file); } catch { this.flash('COULD NOT READ PNG'); return; }
    if (this.state.trim) img = trimTransparent(img);
    else img = { ...img, data: img.data.slice() };
    if (this.state.rmBg) removeBg(img.data, img.w, img.h, { x: 0, y: 0, w: img.w, h: img.h }, 30);
    const id = this.doc.newId();
    this.doc.finalize(id, img, { x: 0, y: 0, w: img.w, h: img.h });
    this.doc.insertLayer(id, (file.name || 'PNG').replace(/\.[^.]+$/, '').slice(0, 20));
    this.afterChange([id]);
    this.flash('PLACED ' + img.w + ' × ' + img.h + ' PNG' + (img.w > this.doc.w || img.h > this.doc.h ? ' — EXTENDS PAST CANVAS, USE MOVE (M)' : ''));
  }

  // ── export ───────────────────────────────────────────────────────────────────
  exportPng(layerOnly: boolean): void {
    const a = this.doc.activeLayer(); if (layerOnly && !a) return;
    const s = this.state.expScale, W = this.doc.w, H = this.doc.h;
    const r = layerOnly ? this.doc.canvasPixels(a!.id) : this.doc.render();
    downloadPng({ w: W, h: H, data: r.data.slice() }, s, (layerOnly ? a!.name.replace(/\s+/g, '-').toLowerCase() : 'pixel-studio') + '-' + W * s + 'x' + H * s + '.png');
  }
}
