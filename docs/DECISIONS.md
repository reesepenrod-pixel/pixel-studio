# Decisions Log

Format: **ID · Title** · Status · Date. Status is one of *Proposed* (awaiting owner approval), *Accepted*, or *Superseded by D-xxx*.

---

## D-001 · Keep the original HTML untouched; recover source into `legacy/` · Accepted · 2026-10-29
**Context.** The existing app is a Claude Design bundle, and its logic is readable once extracted.
**Decision.** Never edit `Pixel Studio.html`. Extract readable source to `legacy/recovered/` with `tools/unbundle.py`, reproducibly.
**Why.** The original stays runnable as the reference for parity tests and side-by-side comparison. Nothing is lost.

## D-002 · Migrate off Claude Design's runtime to TypeScript + React + Vite · Accepted · 2026-10-29
**Context.** The UI runs on Claude Design's generated `dc-runtime` template dialect. That dialect can't be type-checked, unit-tested, split into modules, or built into a separate game runtime.
**Options.** (a) Keep editing in Claude Design: fastest visually, but it hits a ceiling quickly and can't host an engine. (b) Port to vanilla TS + DOM: no framework, but rebuilding many complex panels by hand. (c) **Port to React + TS + Vite.**
**Decision.** (c). The legacy app already *is* React 18 under the hood: a class component plus a template that compiles to `createElement`. Porting the template to JSX is mechanical, and the logic carries over nearly line for line.
**Cost.** The editor UI can no longer be round-tripped through Claude Design. Mockups made there can still guide new screens.

## D-003 · Pixel buffers live outside React/Zustand state · Accepted · 2026-10-29
Keep the legacy pattern: `Uint8ClampedArray` buffers in a `RasterStore` keyed by blob id. State holds metadata plus a revision counter that triggers redraws. Putting 256 KB arrays through immutable state would mean a copy on every stroke.

## D-004 · Custom lightweight runtime, not Phaser/Pixi/Excalibur · Accepted · 2026-10-29
**Context.** Point-and-click adventures at 160×100–640×400 need precise pixel control, simple sprite compositing, hit-testing, pathfinding on a mask, and particles. They don't need physics, WebGL, or tilemaps.
**Decision.** Write a small Canvas 2D runtime in `src/engine`.
**Why.**
- The editor already has a pixel-exact compositor, and reusing it keeps preview and export identical.
- General engines bring their own scene graph, loaders and scaling, and we'd spend effort fighting their smoothing and scaling defaults.
- Exports stay tiny and dependency-free.
- Each subsystem is a few hundred lines.

**Revisit if** performance profiling shows Canvas 2D can't hold 60 fps with effects at 640×400.

## D-005 · IndexedDB for local projects; ZIP for portable files · Accepted · 2026-10-29
IndexedDB (via `idb`) stores binary data well, supports transactions, and reports quota errors that we can show the user. That fixes the legacy silent-save-failure defect. Portable `.pixelstudio` = ZIP (`fflate`) of `project.json` + PNGs + `manifest.json`. ZIP is chosen over one big JSON with base64 because it is ~33 % smaller and the images inside are viewable directly.

## D-006 · Zod for the project schema · Accepted · 2026-10-29
One source gives TypeScript types, import validation, readable error paths ("scenes[2].hotspots[0].actions[1].sceneId: unknown scene"), and the parameter schemas for event actions. ~12 KB gzipped, editor only. The runtime gets validated data and doesn't need it.

## D-007 · Declarative event system with an explicit action registry · Accepted · 2026-10-29
TRIGGER → CONDITIONS → ACTIONS as JSON data, interpreted by registered action handlers. No expression strings and no `eval`. Recursion and step limits are built into the interpreter. Details in ARCHITECTURE §10.

## D-008 · Defer the node-graph library choice to Phase 6 · Accepted · 2026-10-29
Dialogue trees and the world map need a graph canvas. `@xyflow/react` is the leading candidate. Choosing now would be premature, since Phases 1–5 don't need one, and simple branching dialogue in Phase 3 uses a list/tree form.

## D-009 · Export the game as a directory first, single-file second · Accepted · 2026-10-29
Browsers block `fetch()` of local JSON from `file://` pages. The directory export therefore loads game data from a `<script src="game-data.js">` (data assigned to a global, never evaluated as logic), which works from `file://` and from any static host. A single-file variant inlines that script and base64 images. Both run the same `runtime.js`.

## D-010 · Default logical resolution · Accepted · 2026-10-29
The legacy editor canvas is 320×200, but its sample art and "GAME PX" readout use a 2× game grid (160×100). New projects will offer presets 160×100, 320×200, 640×400 and custom. **Decision (owner, 2026-10-29): new projects default to 320×200.** One editor pixel = one game pixel. The legacy "2× game grid" import option stays available for chunkier art, but it no longer defines the game resolution, and the `GAME PX` readout (which assumed 2×) is dropped in the port.

## D-011 · Ids are random prefixed strings, never names or indexes · Accepted · 2026-10-29
`prefix_` + 12 base-36 chars from `crypto.getRandomValues`. Readable in JSON and debug output, and collision-safe enough for local projects. Duplicating or importing always mints new ids and rewrites internal references.

## D-012 · Toolchain versions · Accepted · 2026-10-29
React **18.3.1**, the exact version the original app embedded, so behavior stays the same during the port. An upgrade to 19 is a later, separate change.
TypeScript **5.9** rather than 7.0, because 7.0 is the new native compiler and too fresh for tooling.
Vite 8, Vitest 5. `@playwright/test` is pinned to **1.63.0** to match the browser build preinstalled in Claude Code's cloud environment.
Dev-only: `pngjs` decodes PNGs in parity tests (Node has no canvas). It isn't shipped.

## D-013 · Parity testing against the original code · Accepted · 2026-10-29
Parity tests load the *original* functions from `legacy/recovered/app.js` in a Node `vm` sandbox, including `Component.prototype.applyImport` with a stand-in `this`, and require byte-identical output from the port on real artwork. That's stronger than golden files (no fixtures to regenerate), and it keeps the original as the specification.

## D-014 · Work reaches `main` through milestone pull requests · Accepted · 2026-10-29
Owner's choice. Claude works on a branch and opens a pull request per meaningful milestone (not per small task). The owner merges. Claude never pushes to `main` directly.

## D-015 · Drop the "2× game grid" import option · Accepted · 2026-10-29
Owner's request, following D-010 (320×200 default). The IMPORT section's PIXEL GRID buttons (`1× · 320×200` / `2× · GAME GRID`) are removed, and imports fit at 1×, one image pixel per project pixel. Kept, because they aren't that button:
- the sample dock scene (160×100 art) still loads scaled 2× to fill a 320×200 canvas;
- tuning an existing layer still detects art drawn in 2×2 blocks and keeps it chunky (`beginAdjust`).

The parity-tested algorithms are unaffected.
