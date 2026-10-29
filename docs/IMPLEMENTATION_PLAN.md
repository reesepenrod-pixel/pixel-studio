# Implementation Plan

Status legend: ✅ Done · 🔄 In progress · ⏸ Awaiting approval · ⬜ Not started

| Phase | Goal | Status |
|---|---|---|
| 0 | Audit and architecture | ✅ (this document set) |
| 1 | Foundation: migrate the editor, project model, persistence | 🔄 in progress (approved 2026-10-29) |
| 1.5 | Art Studio extensions (line/rect/ellipse, palettes, transforms…) | ⬜ |
| 2 | Minimal Scene Builder: two scenes, hotspot transition, Play | ⬜ |
| 3 | Core interactivity: objects, states, events, inventory, dialogue, vertical slice | ⬜ |
| 4 | Animation and navigation | ⬜ |
| 5 | Environmental systems (surface painter, rain…) | ⬜ |
| 6 | Advanced systems (dialogue graph, menus, sequences, audio, cursors, inspector) | ⬜ |
| 7 | Export and polish | ⬜ |

Phase goals and acceptance criteria for 2–7 are as written in the master specification
(Part XIX). They will be broken into tasks here when each phase starts.

---

## Phase 1 — Foundation

**Goal.** The existing Pixel Studio runs as a maintainable TypeScript app, unchanged in look and
behavior, on top of a real project model with reliable local persistence and portable files.

**Phase acceptance criteria** (from spec §41, made checkable):
- [ ] Legacy baseline browser checks pass against the new Art workspace, the same 30 that pass on the original.
- [x] Ported imaging algorithms produce byte-identical output to the originals (parity suite: 57 tests, incl. the full tuning pipeline on the dock art; verified to fail on a one-constant change).
- [ ] A project can be created, artwork drawn, the page reloaded, and the project reopened intact.
- [ ] Art assets have stable ids that survive reload, rename, export/import.
- [ ] A project survives export → delete → import with identical pixels and metadata.
- [ ] A forced storage-quota error is shown to the user, and nothing is silently lost.
- [ ] `npm run check` (typecheck + unit + parity) and `npm run e2e` pass.

### Tasks

Each task is one commit (or a small series), independently testable, and leaves the app working.

| # | Task | Depends on | Done when | Risk |
|---|---|---|---|---|
| 1.0 ✅ | **Scaffold**: Vite + React + TS strict, Vitest, Playwright, `npm run dev/check/e2e/build`, CI-less local scripts, import-boundary lint rule (`engine` ↛ editor/React) | — | empty app builds; a sample unit test, a parity smoke test and an e2e smoke test run | low |
| 1.1 ✅ | **Port pure imaging algorithms** to `src/core/imaging/*.ts`: quantizeData, removeBg, sharpen, OKLab, mcut, findRanges (with `rangeSep` as a parameter instead of a global), familyReduce, rangeTones, deepen, adjustRanges, detailToK, trim | 1.0 | parity tests: original (loaded from `legacy/recovered/app.js`) vs. port give identical bytes on the 5 dock layers and synthetic images | **med**: color math drift |
| 1.2 | **Raster core** `src/core/raster`: `Raster {w,h,data}`, stamp, Bresenham line, flood fill, mask stamp, layer-with-offset compositor generalized from 320×200 | 1.0 | unit + parity tests (compositor vs. legacy at 320×200); works for arbitrary sizes | low |
| 1.3 | **Design tokens + shared UI kit**: `tokens.css` (exact legacy colors, Silkscreen, spacing), `Section` (collapsible with caption), `Slider`, `ToggleRow`, `SegButton`, `Swatch`, pixel icons | 1.0 | visual check against legacy screenshot | low |
| 1.4 | **PixelViewport** component: 3 stacked canvases, integer zoom 1–12, auto-fit, ctrl-wheel/pinch zoom at pointer, grid overlay, cursor preview, pointer → pixel mapping | 1.2, 1.3 | e2e: zoom, grid, coordinate readout | med |
| 1.5 | **Art workspace port (paint view)**: tools rail, pencil/eraser/bucket/dropper/move incl. resize handles and nudge, color & brush, recent and scene palette, layers panel, export PNG. Same shortcuts. Rename via inline edit instead of `prompt()` | 1.4 | baseline probes (core set) pass on the new app | **med**: behavior drift |
| 1.6 | **Art workspace port (clip view + import + tuning + recolor)** | 1.1, 1.5 | remaining baseline probes pass; tuning parity on the dock layer | **med** |
| 1.7 | **History service**: per-document undo/redo for raster and structural edits; 100-entry / 64 MB cap | 1.5 | unit tests for every command type; e2e undo/redo | low |
| 1.8 | **Project schema v1** (Zod) + ids + migration framework (`v0` = legacy localStorage JSON → v1) + integrity validator | 1.0 | unit: valid/invalid fixtures, duplicate ids, missing blobs, bad dimensions, future schemaVersion → readable errors | low |
| 1.9 | **IndexedDB ProjectStore**: projects/blobs/backups/meta stores, debounced autosave, atomic write order, orphan-blob GC, save-status badge, quota error dialog, `Ctrl/⌘+S` | 1.7, 1.8 | unit (fake-indexeddb) + e2e: reload restores; simulated quota error is shown | med |
| 1.10 | **Project manager screen**: create (name + resolution preset), open recent, rename, duplicate, delete with confirm | 1.9 | e2e covering each | low |
| 1.11 | **Asset library v0** (left panel): art assets with thumbnails, create from preset (Background / Object / Character / Inventory icon / UI / Custom size), rename, duplicate, tags, folders, search, delete with confirm; open in Art workspace; arbitrary art sizes | 1.9, 1.5 | e2e: create two assets of different sizes, edit both, reload | med: generalizing off 320×200 |
| 1.12 | **Portable project files**: export `.pixelstudio` zip, import with validation and migration, error list UI, fresh ids on import | 1.8, 1.9 | round-trip test: byte-identical pixels, equal JSON modulo ids; corrupt/hostile zips rejected | low |
| 1.13 | **Legacy artwork import**: "Import layers from PNGs" (multi-file exact import into a new art asset, one layer per file, name from filename) + how-to in docs | 1.11 | e2e with the 5 dock PNGs | low |
| 1.14 | **Docs & matrix update**, bump CLAUDE.md, record any new decisions | all | docs reflect reality | — |

Order: 1.0 → (1.1 ∥ 1.2 ∥ 1.3 ∥ 1.8) → 1.4 → 1.5 → 1.6 / 1.7 → 1.9 → 1.10 / 1.11 → 1.12 / 1.13 → 1.14.

### Phase 1 risks
1. **Tuning pipeline drift.** Parity tests with byte equality, run on real art.
2. **UI behavior drift in the port.** Baseline probes run on both old and new. Port first, improve later.
3. **Generalizing away from 320×200 (1.11)** could break the port. Generalization happens after the port passes parity, with the 320×200 parity tests kept as regression tests.
4. **IndexedDB edge cases** (private mode, eviction). Status badge, `storage.persist()`, and a prominent "Export project" action.
5. **Scope creep.** New drawing tools wait until 1.5 is done, unless the owner prioritizes otherwise.

---

## Phase 1.5 — Art Studio extensions (planned, not yet broken down)
Line, rectangle, ellipse (outline/filled) · rectangular marquee + magic wand · flip H/V, rotate 90° ·
mirror drawing · project & asset palettes, palette locking, nearest-color snap, palette swap ·
reference image layer (non-exported) · tile & pattern brushes · PNG layer export at 1×.

## Phase 2 onward
Broken down at the start of each phase. The first gameplay milestone is the vertical slice in
spec §56 (end of Phase 3).

---

### Progress log
- **2026-10-29 · 1.0 done.** Vite 8 + React 18.3.1 + TS 5.9 strict, Vitest 5, Playwright 1.63. `npm run dev | check | e2e | build | legacy:baseline`. The import-boundary rule is a unit test (`tests/unit/boundaries.test.ts`), with no ESLint needed. The app shell is a placeholder that says so.
- **2026-10-29 · 1.1 done.** `src/core/imaging/*` ported, plus `runTuning()` (the original `applyImport` as a pure function). Byte-identical to the original on all 5 dock layers, a 5-layer strip, and synthetic images. Changes from the original: range separation is a parameter instead of a module global; the unused `passes = 0` smoothing loop and unused parameters were dropped; `trimImage` now works on raw RGBA (`trimTransparent`, unit-tested).

## Open questions for the owner
- ~~Q1. Game resolution default.~~ **Answered: 320×200** (D-010).
- ~~Q2. Existing artwork.~~ **Answered: nothing to carry over.** Task 1.13 stays as a general "import layers from PNGs" feature, not a migration requirement.
- **Q3. Claude Design.** (Not objected to; proceeding.) After migration the editor UI can't be edited in Claude Design any more. OK?
- **Q4. Dependencies.** (Approved with the plan.) OK to add `zustand`, `immer`, `idb`, `fflate`, `zod` (all small and well maintained)?
- **Q5. Git workflow.** Work on a branch and merge to `main` via pull requests per task, or commit directly to `main`?
