# Existing Application Audit — `Pixel Studio.html`

Audited: 2026-10-29 · Subject: `Pixel Studio.html` (283 KB, uploaded in commit `a506a6e`) · Status: **Phase 0 complete**

The original file has not been modified. Everything below comes from (a) reading the
recovered source line by line and (b) driving the real file in headless Chromium
(Playwright). Claims are labelled with how they were established.

---

## 1. What the file actually is

The HTML is a **Claude Design "bundled page"**, not hand-written HTML. Structure:

| Part | What it is |
|---|---|
| Loader `<script>` | Generic Claude Design unpacker. Decodes the manifest (base64, some gzip), turns assets into `blob:`/`data:` URLs, swaps them into the template, and boots the page. |
| `__bundler/manifest` | 12 embedded assets (below). |
| `__bundler/ext_resources` | Maps friendly ids (`scene_1_sky`, …) and two unpkg URLs to manifest UUIDs. Exposed at runtime as `window.__resources`. |
| `__bundler/template` | The real page: an `<x-dc>` template + a `<script type="text/x-dc">` containing the app logic. |

Embedded assets:

| Asset | Size | Notes |
|---|---|---|
| `dc-runtime` (JS) | 69 KB | Claude Design's runtime. Header: *"GENERATED from dc-runtime/src/*.ts — do not edit."* Compiles the `<x-dc>` template (`sc-for`, `sc-if`, `{{ }}` bindings, `sc-camel-on-*` events) into React elements and hosts a `class Component extends DCLogic`. |
| React 18.3.1 UMD | 11 KB (gz) | `react.production.min.js` |
| ReactDOM 18.3.1 UMD | 132 KB | `react-dom.production.min.js` |
| 5 × PNG, 160×100 | 7–14 KB each | Sample scene layers: sky, clouds, mountains, water, dock. **Byte-identical to `camppenrod/fish-dock/layers-v3/*.png`** (the Lake Myriad art). |
| 4 × woff2 | 1–4 KB | Silkscreen 400/700, latin + latin-ext (SIL OFL, from Google Fonts). |

**Source recovery: complete.** The application logic is plain, readable, un-minified
JavaScript (951 lines) and the UI is a readable template (≈270 lines). Nothing needs to be
reverse-engineered and no additional source files are required. Recovered copies live in
[`legacy/recovered/`](../legacy/recovered/), reproducible with `python3 tools/unbundle.py`.

The app works fully offline: React and fonts are embedded. The `<link rel=preconnect>` to
Google Fonts is vestigial.

## 2. Architecture of the existing app

- **One React class component** (`Component extends DCLogic`, ≈690 lines) holding all state
  and behavior. `renderVals()` builds a flat bag of ~150 values/callbacks that the template binds to.
- **Fixed canvas**: `const W = 320, H = 200` at module scope. Every algorithm, buffer and
  coordinate assumes 320×200.
- **"Game grid" = 2×**: the sample art is 160×100 drawn at 2× blocks; the status bar shows
  `GAME PX = x >> 1`. So the *intended* game resolution looks like **160×100 logical pixels**
  shown on a 320×200 editing canvas. This is implicit — nothing in the code names it.
- **Pure helper functions** at module top (quantize, background removal, sharpen, OKLab
  conversion, material "range" clustering, shadow deepening, range recoloring, trim). These
  have no dependency on React or the component and are the most reusable part of the code.

### Rendering
- Three stacked `<canvas>` elements:
  1. **main** — 320×200, receives `putImageData` of the composite, scaled up by CSS (`zoom` × size).
  2. **overlay** — `320·zoom × 200·zoom`: pixel grid (shown when zoom ≥ 3; major line every 16 px) and, in CLIP view, the selection tint + marching outline.
  3. **cursor** — same size: brush footprint preview, move-tool bounding box and 8 resize handles.
- `imageSmoothingEnabled = false` on every scaling draw; zoom is integer 1–12. Pixel-exact.
- Recomposition is **full-canvas, every change** (loop over all 64,000 px × visible layers).
  Fine at 320×200; won't scale to large scrolling scenes without dirty-rect caching.

### Layers
- `state.layers = [{ id, name, visible, opacity }]`, bottom → top; pixels in
  `this.px[id]: Uint8ClampedArray(320·200·4)` outside React state.
- `this.ext[id]` holds **off-canvas pixels** when a layer is moved/resized partly outside
  the canvas (or an exact-imported PNG is larger than 320×200), so nothing is lost when it is moved back.
- Compositing: straight-alpha "over" with per-layer opacity, written by hand (not canvas blending).

### Color & palette
- One current color (`#rrggbb`) via native `<input type=color>`, 8 **recent** colors, and an
  **"In the scene"** palette = 32 most-used colors across all layers (derived, sampled every 2nd px).
- No user-managed palettes, palette locking, or remapping.

### Import pipeline
- **Import & Pixelate** (PNG/JPG/GIF/WebP/BMP, button or drag-and-drop): optional trim, fit to the
  grid (1× = 320×200, 2× = 160×100 game grid) with stepwise high-quality downscaling, optional
  flood-fill removal of a solid background touching the edges, then the tuning pipeline.
- **Import PNG (exact)**: pixel-for-pixel, no resample/palette change, alpha kept; oversize parts go to `ext`.
- **Tuning pipeline** (live, re-runs on every slider change; works on imports *or* any existing on-canvas layer):
  sharpen (with "tame highlights" clamp) → cluster colors into **material ranges** in OKLab
  (chroma ÷ lightness feature space) → per-range tone reduction (median cut) → **deepen shadows**
  (all or selected ranges) → **recolor ranges** (hue/brightness/saturation per range, grouped by hue family) →
  global palette reduction (median cut to K colors). Results "bake in"; the source buffer is kept
  only while the layer is the active adjustment.

This pipeline is the most distinctive, sophisticated part of the app and must be preserved exactly.

### Undo/redo
- Snapshot-based: each entry stores the layer list, active id, the full pixel buffers (+`ext`) of
  the affected layers, and the selection mask. Max 60 entries. In memory only.
- Undo/redo themselves snapshot the current state so they are symmetrical. Works for paint,
  fill, move/resize/nudge, layer ops, selection ops, tuning (tested).

### Persistence
- `localStorage['pixelStudio.v1']` = JSON `{ layers:[{ name, visible, opacity, png(dataURL), active, ext? }], color, recent }`.
- Debounced 700 ms after changes. On load, if present, layers are restored; else the dock sample scene loads.
- **No project concept**: a single implicit document per browser origin.

### Export
- PNG of the composite or the active layer at 1×/2×/4×/8× nearest-neighbor
  (e.g. `pixel-studio-1280x800.png`).

### Keyboard shortcuts (from code)
`B` pencil · `E` eraser · `G` bucket · `I` dropper · `M` move · `S` select · `D` unselect ·
`[` / `]` brush (or selection brush) size · arrows nudge (Shift = 10 px) in Move ·
`Ctrl/⌘+Z` undo · `Ctrl/⌘+Shift+Z` / `Ctrl/⌘+Y` redo · `Alt+click` pick color ·
`Ctrl/⌘+wheel` and trackpad pinch zoom (anchored at pointer).

### Visual identity
Near-black UI (`#111` / `#1a1a1a` / borders `#262626`–`#333`), cream accent `#f2ecd8`, gold
highlight `#ffd86e`, Silkscreen pixel font in caps at 11 px with wide letter-spacing, 8×8
hand-drawn pixel tool icons, collapsible right-panel sections each with a one-line explanation.
Layout: top bar · 84 px tool rail · canvas · 270 px properties panel · status bar.
Screenshot: [`docs/audit/01-initial.png`](audit/01-initial.png).

## 3. Feature inventory

**Legend** — ✅ Confirmed working (exercised in a browser, 2026-10-29) · 🔎 Present in code, not verified ·
⚠️ Incomplete / broken / risky · ⬜ Not implemented.

Browser checks are scripted in [`tests/legacy-baseline/`](../tests/legacy-baseline/) — 31 checks, 30 pass, 1 confirmed defect.

### Drawing & canvas
| Feature | Status | Evidence |
|---|---|---|
| Pencil, 1–8 px square brush, Bresenham-connected strokes | ✅ | stroke pixel = `#f2ecd8` |
| Brush size slider and `[` `]` | ✅ | |
| Eraser | ✅ | |
| Bucket fill (4-connected, exact color match, active layer) | ✅ | |
| Dropper tool and Alt+click (samples composite) | ✅ | |
| Native color picker + hex readout | ✅ | |
| Recent colors (8) | 🔎 | code only |
| "In the scene" palette (32 most-used) | ✅ | visible in screenshot |
| Move tool: drag layer | ✅ | |
| Move tool: 8 resize handles (nearest-neighbor), Shift keeps ratio | 🔎 | |
| Arrow-key nudge (Shift = 10) | ✅ | no errors; pixel shift not asserted |
| Zoom buttons, integer 1–12 | ✅ | 3× → 4× |
| Ctrl/⌘+wheel & pinch zoom anchored at pointer | 🔎 | |
| Initial zoom auto-fits window | ✅ | 3× at 1440×900 |
| Pixel grid overlay (zoom ≥ 3, 16 px major lines) | ✅ | screenshot |
| Cursor/brush footprint preview | ✅ | screenshot |
| Line / rectangle / ellipse / mirror / tile / pattern brushes / reference images / rotate / flip | ⬜ | |

### Layers
| Feature | Status | |
|---|---|---|
| New layer (inserted above active) | ✅ | |
| Delete (keeps at least one) | ✅ | |
| Visibility toggle | ✅ | |
| Opacity 0–100 % (undoable) | ✅ | |
| Merge down | ✅ | |
| Reorder up/down | 🔎 | |
| Rename (double-click → `window.prompt`) | 🔎 | |
| Thumbnails | ✅ | screenshot |
| Off-canvas pixel retention (`ext`) | 🔎 | code; exact-import of 24×16 verified on-canvas only |

### Selection (CLIP view)
| Feature | Status | |
|---|---|---|
| Paint selection / unselect brush 1–24 px | ✅ | 436 px selected |
| Copy to new layer | ✅ | "Dock copy" created |
| Clip (cut) to new layer | 🔎 | |
| Select all pixels of layer / invert / clear | 🔎 | |
| Marquee / lasso / magic wand | ⬜ | |

### Import & image processing
| Feature | Status | |
|---|---|---|
| Import & pixelate (PNG/JPG/GIF/WebP/BMP) via file picker | ✅ | |
| Drag-and-drop import onto canvas | 🔎 | |
| Fit to 1× (320×200) or 2× game grid (160×100) | ✅ (2×) | default |
| Remove solid background | ✅ | green border removed on exact import |
| Trim transparent edges | 🔎 | on by default |
| Import PNG exact | ✅ | pixel (10,8) = source blue |
| Palette complexity (global median cut) | ✅ | 55 → 52 colors |
| Palette complexity 2 (tones per range) / range separation | 🔎 | |
| Sharpen + tame highlights | 🔎 | |
| Deepen shadows, per-range selection | 🔎 | |
| Material-range detection | ✅ | "ADJUSTING: DOCK" + 4 ranges listed |
| Recolor ranges: hue | ✅ | |
| Recolor ranges: brightness / saturation / multi-select / reset | 🔎 | |
| Tuning on an existing layer ("Adjust layer") + undo | ✅ | undo restored 55 colors |
| Add dock sample scene layers | ✅ | loads on first run |

### History, persistence, export
| Feature | Status | |
|---|---|---|
| Undo / redo (buttons and keys), 60 steps | ✅ | |
| Autosave to localStorage, restore on reload | ✅ | 7 layers restored |
| **Autosave when data exceeds the localStorage quota** | ⚠️ **broken** | see §4.1 |
| Export composite PNG at 1/2/4/8× | ✅ | `pixel-studio-1280x800.png` |
| Export active layer PNG | 🔎 | |
| Projects, multiple documents, explicit save, project files | ⬜ | |
| Animation of any kind | ⬜ | no frame/timeline code exists |

## 4. Defects and limitations

### 4.1 Silent data loss when storage is full — **confirmed, high severity**
`scheduleSave()` wraps `localStorage.setItem` in `try { } catch (e) {}`. When the serialized
project passes the browser's localStorage quota (~5 MB), the save throws and the error is
swallowed. Reproduced: importing one large PNG (1400×1400, 6.7 MB) left the stored project
unchanged and showed no warning. Because the whole project is one key, **every later save
fails too**, so all work after that point is lost on reload with no indication.
→ Fixed by design in Phase 1 (IndexedDB + surfaced save errors). The legacy file is left as is.

### 4.2 Structural limitations (by code reading)
- 320×200 is hard-coded (`W`, `H`, `N`), so art of any other size is impossible without generalizing every function.
- One implicit document; no ids that survive reload (`nid` restarts at 1 every load).
- Undo history is lost on reload; snapshots copy whole 256 KB layers (≈15 MB worst case at 60 steps × 1 layer).
- Tuning slider positions are per-layer in memory only; after reload a layer can be re-tuned only from its baked pixels.
- Layers partly off-canvas can't be tuned until moved fully on-canvas (explicit flash message).
- Merge down composites only on-canvas pixels: the upper layer's off-canvas (`ext`) pixels are dropped.
- Rename uses `window.prompt` (blocking, unstyled).
- `GAME PX` readout hard-codes the 2× relation.
- Full-canvas recomposite on every stroke segment.
- Material-range clustering (`findRanges`) is roughly cubic in the number of distinct colors: about 20–50 s for a synthetic image with a few thousand unique colors (found while writing parity tests). Real pixel art (tens to hundreds of colors) is instant, but a busy photo tuned at 1× could stall the tab. Optimize after the port, keeping parity tests as the guard.

### 4.3 Accessibility gaps
11 px uppercase pixel font throughout; layer rows are clickable `<div>`s; tool icons are CSS
background images; no visible focus styling; no keyboard path to canvas actions beyond shortcuts.

### 4.4 Dead code
`Component.quantize()` (unused, superseded by `quantizeData`), the `passes = 0` loop in
`familyReduce`, unused `v` parameters of `findRanges`/`familyReduce`.

### 4.5 Dependency on Claude Design's runtime
The UI is written in Claude Design's template dialect and runs on its generated `dc-runtime`.
It can be edited in Claude Design, but not built, tested, or modularized as a normal codebase.
This is the main reason for migration (see `ARCHITECTURE.md`, D-002).

## 5. Reuse assessment

| Part | Verdict | Notes |
|---|---|---|
| Image algorithms (quantize, removeBg, sharpen, OKLab, ranges, familyReduce, deepen, adjustRanges, trim) | **Preserve verbatim**, add types | Pure functions; generalize the few that read `W`/`H` by passing dimensions. Parity-test against the original. |
| Drawing primitives (stamp, Bresenham line, flood fill, mask stamp) | **Preserve**, generalize to any raster size | |
| Compositor | **Preserve** behavior; refactor into `engine/rendering` so the runtime and editor share it | |
| Move/resize with `ext` off-canvas retention | **Preserve** behavior; becomes "layer raster has an offset and its own size" | Removes the `ext` special case. |
| Three-canvas display, integer zoom, grid, cursor preview | **Preserve** | Becomes the shared `PixelViewport` component used by every editor. |
| Undo/redo | **Refactor**: keep semantics, move to a shared history service | |
| localStorage persistence | **Replace** with IndexedDB project store | Fixes §4.1. |
| Single class component + `renderVals` bag | **Refactor** into React function components + store | |
| Template markup and inline styles | **Port 1:1** to JSX with CSS tokens | Keeps the look exactly. |
| `dc-runtime`, embedded React UMD, bundler loader | **Replace** with Vite + npm React | |
| Silkscreen font, 8×8 icons, sample dock scene | **Preserve** as app assets | |

## 6. Migration risks

1. **Behavior drift in the tuning pipeline** (subtle color math). Mitigation: parity tests run the original functions and the ported ones on the same inputs and require byte-identical output.
2. **Losing UI behavior while porting the template.** Mitigation: the Playwright baseline probes become a parity suite run against both the legacy file and the new app.
3. **Existing user artwork** lives in the browser storage of wherever the old app was opened (a `file://` page or a Claude Design preview). The new app runs on a different origin and cannot read it. Mitigation: export each layer as a PNG from the old app, then use multi-file exact import in the new one (Phase 1, task 1.11).
4. **Leaving Claude Design.** After migration the UI can no longer be edited visually in Claude Design. That's a workflow change for the owner to accept (Open question Q3).
