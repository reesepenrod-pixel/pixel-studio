# Pixel Studio — Architecture

Status: **Proposed. Awaiting approval** (2026-10-29). Decision records are in [`DECISIONS.md`](DECISIONS.md).

## 1. Goals that shape the architecture

1. The **same runtime** plays the game in the editor preview and in the exported game.
2. **Project data is plain, versioned, validated JSON plus binary images.** It is never executable.
3. **Pixel-exact everywhere**: integer coordinates, integer scaling, nearest-neighbor only.
4. **Preserve the existing Pixel Studio** behavior and look, then grow it.
5. **Local-first**: no server and no accounts. Works offline.
6. Simple enough that one person, working with Claude, can maintain it.

## 2. Technology

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | The schema, event system and runtime need types. |
| Editor UI | **React 18** | Already what the existing app runs on, so the port is mechanical. |
| Build/dev | **Vite** | Fast dev server, simple static build. It can also emit the standalone runtime bundle. |
| Editor state | **Zustand** + **Immer** | Small. Immer patches give inverse operations for undo of structured data. |
| Pixel buffers | `Uint8ClampedArray` RGBA **outside** React state | The existing app's approach. Fast, and avoids copying 256 KB per render. |
| Rendering | **Canvas 2D**, hand-written compositor | The existing compositor, generalized. No WebGL needed at these resolutions. |
| Game engine | **Custom lightweight runtime** (no Phaser/Pixi) | See D-004. |
| Local storage | **IndexedDB** via `idb` (≈1 KB) | Large binary storage, transactions, quota errors that can be caught and shown. |
| Project files | **ZIP** via `fflate` (≈8 KB) | `project.json` plus `assets/*.png`. Readable and inspectable. |
| Schema validation | **Zod** | One definition produces TS types, runtime validation and readable errors on import. |
| Unit tests | **Vitest** | Native to Vite. |
| Browser tests | **Playwright** | Already used for the legacy baseline. |
| Graph editors (dialogue, world map) | Decide in Phase 6. Candidate: `@xyflow/react` | Not needed until then (D-008). |

No other runtime dependencies are planned for Phase 1. Every new dependency gets a `DECISIONS.md` entry.

## 3. The three systems

```
┌──────────────────────── EDITOR (React) ─────────────────────────┐
│  Art · Scenes · Objects · Characters · Systems · World · Play   │
│  shared: PixelViewport, PropertyPanel, AssetBrowser, History    │
└──────────────┬─────────────────────────────────┬────────────────┘
               │ edits via commands              │ "Play" mounts
               ▼                                 ▼
┌──────── PROJECT DATA ───────┐      ┌──────── RUNTIME (no React) ─────┐
│ Zod schema + migrations     │─────▶│ loads a validated Project       │
│ ProjectStore (IndexedDB)    │ read │ GameState, EventInterpreter,    │
│ RasterStore (pixel buffers) │ only │ Renderer, Navigation, Effects   │
│ Validation & references     │      │ input → actions → render loop   │
└─────────────────────────────┘      └─────────────────────────────────┘
                                                 ▲
                                    exported game = runtime bundle
                                    + project.json + assets
```

Rules (enforced by lint import boundaries plus a test):
- `src/engine/**` must not import from `src/editors/**`, `src/app/**`, `src/components/**`, or React.
- `src/core/**` (schema, data, validation, pure algorithms) imports nothing UI-related.
- Editors read and write project data only through **commands** on the store, so every change is undoable and persisted the same way.
- Play mode builds a runtime instance from a **snapshot** of the current project. Playtesting never mutates editor data, so leaving Play can't lose work.

## 4. Repository layout

```
pixel-studio/
├── Pixel Studio.html          # original, untouched (reference)
├── legacy/recovered/          # readable source extracted from it + assets
├── tools/unbundle.py          # re-extracts legacy/recovered from the HTML
├── src/
│   ├── app/                   # shell: workspace tabs, routing, project manager screen
│   ├── components/            # shared UI: Panel, Section, Slider, Button, PixelViewport, AssetBrowser
│   ├── core/
│   │   ├── schema/            # Zod schemas, types, SCHEMA_VERSION, migrations/
│   │   ├── project/           # commands, history (undo/redo), ids, references
│   │   ├── raster/            # Raster type, drawing primitives, compositor
│   │   ├── imaging/           # ported legacy algorithms: quantize, ranges, deepen, recolor…
│   │   ├── persistence/       # IndexedDB store, autosave, recovery, zip import/export
│   │   └── validation/        # project integrity checks → human-readable issues
│   ├── editors/
│   │   ├── art/               # Phase 1: the migrated Pixel Studio
│   │   └── …                  # scenes/, objects/, characters/, systems/, world/ (later phases)
│   ├── engine/                # runtime: rendering/, interaction/, events/, navigation/, effects/, audio/, saves/
│   ├── export/                # standalone game export (Phase 7)
│   └── styles/                # tokens.css (the existing palette and font), base.css
├── public/fonts/              # Silkscreen
├── tests/
│   ├── unit/                  # Vitest
│   ├── parity/                # ported algorithms vs. original legacy functions
│   ├── e2e/                   # Playwright against the new app
│   └── legacy-baseline/       # Playwright probes against the original HTML
└── docs/
```

The editor folders for later phases are created when their phase starts, not before.

## 5. Project data model

### 5.1 Principles
- Every persistent entity has a stable id: `prefix_` + 12 random base-36 chars (for example `art_k3j9…`, `scn_…`, `obj_…`). Ids are never reused or renamed.
- References are always by id. Names are display labels only.
- `schemaVersion` is an integer. Each bump ships a pure `migrate_vN_to_vN+1(json)` function with tests. Before any migration the stored project is copied to a backup record.
- **Pixel data is not inside the JSON.** JSON holds metadata. Pixels live in binary blobs referenced by `blobId` (PNG in files, raw RGBA or PNG in IndexedDB).

### 5.2 Shape (v1 covers what Phase 1 needs; later fields are added by migration)

```ts
Project {
  schemaVersion: 1
  id: "prj_…", name, description, createdAt, updatedAt
  settings: {
    resolution: { w: 320, h: 200 }      // logical game pixels
    displayScale: "auto" | 1..8         // integer upscaling when playing
    grid: { major: 16 }                 // editor grid
  }
  palettes: Palette[]                   // { id, name, colors: "#rrggbb"[], locked }
  defaultPaletteId?: string
  assets: Asset[]
}

Asset (discriminated by kind) {
  id, kind: "art", name, tags: string[], folder: string, preset, createdAt, updatedAt
  // kind "art":
  size: { w, h }                        // any size, in logical pixels
  paletteId?: string
  layers: ArtLayer[]                    // bottom → top
  activeLayerId
}
ArtLayer { id, name, visible, opacity, blobId, offset: { x, y }, size: { w, h } }
```

`ArtLayer` with its own `offset` and `size` replaces the legacy `ext` special case. A layer is
a raster positioned relative to the artwork, so a moved or oversized layer simply has an offset
and size that extend past the artwork's bounds.

Later phases add collections to `Project` by migration: `objects` (definitions), `scenes` (with
`instances`, `hotspots`, `masks`, `walkMask`), `characters`, `animations` (as a kind of art asset
with frames), `dialogues`, `variables`, `events`, `ui`, `audio`, `world` (derived; see 5.4).

### 5.3 Assets, definitions, instances
- **Asset**: source media (art, audio). Has no gameplay behavior.
- **Object definition** (Phase 3): `{ id, name, category, components[], states[], defaultStateId, properties }`. States reference art and animation assets by id.
- **Instance** (Phase 2/3): `{ id, definitionId, position, layer, overrides: Partial<…>, detached?: false }`.
  - Resolution order: `instance.overrides` → `definition` → component defaults.
  - Overrides are **sparse**: only fields the user changed are stored. Changing the definition updates every instance that hasn't overridden that field.
  - **Detach** copies the resolved definition into a new definition owned by that instance and points the instance at it.
- **Usage index**: computed (not stored) map of `assetId → [{ ownerId, path }]`. It powers "where is this used", safe delete (blocked or confirmed with the list shown), and validation.

### 5.4 World map is not a separate source of truth
Scene connections are the `Transition scene` actions inside scene, hotspot and object events.
The world map editor **reads** those to draw edges, and **edits** them by creating or changing
those same actions. Node positions on the map are stored separately (`world.layout[sceneId] = {x,y}`),
since layout is cosmetic.

## 6. Persistence

- **IndexedDB database `pixel-studio`**, object stores:
  `projects` (JSON doc by id), `blobs` (by blobId: `{ projectId, data: Blob }`), `backups`, `meta` (recent projects, settings).
- **Autosave**: commands mark the project dirty, and a debounced writer (~1 s idle, max 10 s) persists it.
  Blobs are written first, then the project JSON is written in one transaction. A crash mid-save
  therefore leaves either the old JSON or the new one, both pointing at blobs that exist.
  Orphaned blobs are garbage-collected on open.
- **Save errors are surfaced**: a persistent status badge (`SAVED` / `SAVING…` / `NOT SAVED — reason`), plus a
  blocking dialog on quota errors offering "Export project file now". This directly fixes legacy defect §4.1.
- **Explicit save** (`Ctrl/⌘+S`) flushes immediately. **Export project** writes a portable `.pixelstudio` zip:
  `project.json` + `assets/<blobId>.png` + `manifest.json` (app version, schema version, checksums).
- **Import project**: unzip → check manifest → Zod-validate JSON → migrate if older → integrity checks → import with fresh project id (so importing twice never overwrites). Errors are shown as a list in plain language. Nothing is executed.
- `navigator.storage.persist()` is requested so the browser is less likely to evict data, but the docs and UI still treat exported files as the real backup.

## 7. Pixel grid rules
- All coordinates and sizes in project data are **integers in logical pixels**.
- Canvas drawing for display always uses `imageSmoothingEnabled = false`. Displayed canvases use CSS `image-rendering: pixelated`.
- Editor zoom and game display scale are **integers** only.
- Sub-pixel motion (walking, particles) is simulated in floats but **rendered at `Math.round` positions**.
- Transform tools (resize, Phase 1.5 rotate/flip) are nearest-neighbor only. Rotation is limited to 90° steps unless the user explicitly opts in.

## 8. Undo/redo
- One history service per open project, with a separate stack per open document (per art asset in Phase 1, per scene later), mirroring how users think about undo.
- Entry types:
  - **Structural** (layer list, names, properties): Immer inverse patches. Small.
  - **Raster**: the affected layer region (dirty rectangle) before and after, as RGBA. Starts as whole-layer copies, the legacy behavior, which is fine at these sizes; dirty rects are a later optimization.
- Limit: 100 entries or ~64 MB per stack, whichever comes first.
- History is in memory only (as in the legacy app). Saved projects don't carry undo history.

## 9. Runtime (Phases 2–7)
- `createRuntime(project, { canvas, startSceneId, debug })` returns `{ start, stop, getState, on(event) }`. Pure TypeScript, no React.
- Fixed-timestep update loop at 60 Hz, render via `requestAnimationFrame`, drawing the logical-resolution backbuffer and then integer-scaling it to the display canvas.
- Systems: `Renderer` (shared compositor + depth sort by foot anchor), `Interaction` (hit-testing hotspots, masks and instances by priority), `EventInterpreter`, `Inventory`, `Dialogue`, `Navigation` (A* on a downsampled walk mask), `Animation`, `Effects` (seeded particle systems that read surface masks), `Audio` (WebAudio), `Saves`.
- The editor's Play workspace mounts the **same** runtime, with debug overlays turned on.

## 10. Universal event system (Phase 3)

Declarative data, interpreted by an explicit registry. No `eval`, no `Function`, no user scripts.

```ts
EventHandler { id, trigger: Trigger, conditions?: Condition, actions: Action[], once?: boolean, enabled: boolean }

Trigger   = { type: "click" | "inspect" | "interact" | "pickup" | "useItem", itemId? }
          | { type: "sceneEnter" | "sceneExit" | "firstVisit" }
          | { type: "dialogueChoice", dialogueId, choiceId } | { type: "animationComplete", animationId }
          | { type: "timer", ms } | { type: "variableChanged", variableId }

Condition = { all: Condition[] } | { any: Condition[] } | { not: Condition }
          | { var: id, op: "==" | "!=" | "<" | "<=" | ">" | ">=", value }
          | { hasItem: id } | { objectState: instanceId, is: stateId }
          | { visited: sceneId } | { dialogueDone: dialogueId }

Action    = { do: "showText", text } | { do: "startDialogue", dialogueId } | { do: "setVar", var, op: "set"|"add", value }
          | { do: "setState", target, state } | { do: "playAnimation", target, animationId, wait? }
          | { do: "playSound", soundId } | { do: "giveItem" | "takeItem", itemId }
          | { do: "show" | "hide" | "enable" | "disable", target } | { do: "walkTo", character, point }
          | { do: "goToScene", sceneId, entryId, transition? } | { do: "startSequence", sequenceId }
          | { do: "wait", ms } | { do: "if", conditions, then: Action[], else?: Action[] }
```

- **Action registry**: `registerAction(name, { schema, run(ctx, params) })`. Each action has a Zod schema for its params, a validator for its references, and an editor form descriptor. Adding an action is one file.
- **Execution**: actions run as a queue per handler. Async actions (`wait`, `walkTo`, `playAnimation` with `wait`, dialogue) suspend that queue only.
- **Safety**: at most 8 levels of event-triggers-event depth and 1,000 actions per frame. `variableChanged` handlers don't re-fire for changes made by themselves within the same frame. On a limit breach the interpreter stops that chain and logs a clear error to the event debugger.
- **Editor**: the compact WHEN / IF / THEN / ELSE form is the primary UI (it maps 1:1 to the data). A graph view is optional and only for complex cases (Phase 6).
- **Debugger**: every dispatch appends a structured trace `{ trigger, conditionResults, actionsRun, result }`. That trace renders as the event history in Play mode.

## 11. Export (Phase 7)
- **Directory export (primary, most reliable)**: `index.html` + `runtime.js` + `game.json` + `assets/`. Zipped for download. Needs a static server or works from `file://` via inlined data (see D-009).
- **Single-file export**: same runtime with JSON and PNGs inlined as base64. Feasible because the runtime has no dependencies. Offered as a second option.
- Both are produced from the same build of `src/engine`, which is also what the editor's Play mode uses. An e2e test plays the vertical-slice game in an exported build and in the editor, and compares the state traces.

## 12. Migration of the existing application (strategy)

1. **Keep the original** `Pixel Studio.html` untouched at the repo root as the reference implementation, and keep the recovered source in `legacy/recovered/`.
2. **Port pure algorithms first** (`src/core/imaging`, `src/core/raster`) with **parity tests**. The tests load the original functions from `legacy/recovered/app.js` and assert byte-identical output on fixed inputs (including the dock scene).
3. **Port the UI 1:1** into React function components with the same layout, copy, colors, font and shortcuts. Don't redesign during the port.
4. **Run the baseline browser probes** against the new Art workspace (same steps, new selectors). The port is done when they pass on both.
5. **Only then** generalize: arbitrary art sizes, the project model, IndexedDB, the asset library.
6. Existing artwork comes across by PNG export from the old app and multi-file exact import into the new one.
