# Feature Matrix

**Legacy** = the original `Pixel Studio.html`. **New** = the TypeScript app (not started yet).

Status: ✅ working & tested · 🟡 present, not verified · ⚠️ broken/limited · 🚧 in progress · ⬜ not implemented ·
`n/a` doesn't apply. **Tests** names the check that covers it: `LB:` legacy-baseline probe, `P:` parity, `U:` unit, `E:` e2e.

Last updated: 2026-10-29 (Phase 1, tasks 1.0–1.1).

The imaging *algorithms* are ported and parity-tested (`P:` below). Their *UI* in the new app arrives in task 1.6, so the New column still shows ⬜ until it's usable.

## Art Studio (existing features to preserve)

| Feature | Legacy | Phase | New | Tests |
|---|---|---|---|---|
| Pencil, 1–8 px brush, `[` `]` | ✅ | 1.5 | ⬜ | LB: pencil_stroke, brush_size_key |
| Eraser | ✅ | 1.5 | ⬜ | LB: eraser |
| Bucket fill | ✅ | 1.5 | ⬜ | LB: bucket_fill_and_color_input |
| Dropper / Alt+click pick | ✅ | 1.5 | ⬜ | LB: alt_click_dropper |
| Color input + hex | ✅ | 1.5 | ⬜ | LB: bucket_fill_and_color_input |
| Recent colors | 🟡 | 1.5 | ⬜ | — |
| Scene palette (32 most used) | ✅ | 1.5 | ⬜ | visual |
| Move layer (drag) | ✅ | 1.5 | ⬜ | LB: move_drag |
| Resize handles, Shift ratio | 🟡 | 1.5 | ⬜ | — |
| Arrow nudge | ✅ | 1.5 | ⬜ | LB: move_nudge_no_error |
| Off-canvas pixel retention | 🟡 | 1.5 | ⬜ | — |
| Integer zoom 1–12, buttons | ✅ | 1.4 | ⬜ | LB: zoom_buttons |
| Ctrl/⌘-wheel & pinch zoom | 🟡 | 1.4 | ⬜ | — |
| Grid overlay | ✅ | 1.4 | ⬜ | visual |
| Layers: new / delete / visibility / opacity / merge | ✅ | 1.5 | ⬜ | LB: new_layer, delete_layer, visibility_toggle, layer_opacity, merge_down |
| Layers: reorder, rename | 🟡 | 1.5 | ⬜ | — |
| Layer thumbnails | ✅ | 1.5 | ⬜ | visual |
| Selection brush / unselect | ✅ | 1.6 | ⬜ | LB: selection_copy_to_layer |
| Copy selection to layer | ✅ | 1.6 | ⬜ | LB: selection_copy_to_layer |
| Clip selection to layer, select layer / invert / clear | 🟡 | 1.6 | ⬜ | — |
| Import & pixelate (file) | ✅ | 1.6 | ⬜ | LB: import_pixelate |
| Import via drag-and-drop | 🟡 | 1.6 | ⬜ | — |
| Import PNG exact | ✅ | 1.6 | ⬜ | LB: import_png_exact |
| Remove solid background | ✅ | 1.6 | ⬜ | LB: import_exact_pixels_and_rm_bg; P: imaging.test.ts |
| Trim transparent edges | 🟡 | 1.6 | ⬜ | U: trim.test.ts |
| Palette complexity | ✅ | 1.1/1.6 | ⬜ | LB: palette_complexity_reduces_colors; P: imaging.test.ts |
| Tones per range / range separation | 🟡 | 1.1/1.6 | ⬜ | P: imaging.test.ts |
| Sharpen + tame highlights | 🟡 | 1.1/1.6 | ⬜ | P: imaging.test.ts |
| Deepen shadows (+ per range) | 🟡 | 1.1/1.6 | ⬜ | P: imaging.test.ts |
| Material-range detection | ✅ | 1.1/1.6 | ⬜ | LB: ranges_detected; P: imaging.test.ts |
| Recolor ranges (hue) | ✅ | 1.1/1.6 | ⬜ | LB: recolor_hue_shift; P: imaging.test.ts |
| Recolor ranges (brightness / saturation / multi / reset) | 🟡 | 1.1/1.6 | ⬜ | P: imaging.test.ts |
| Adjust existing layer | ✅ | 1.6 | ⬜ | LB: undo_reverts_tuning |
| Undo / redo (60) | ✅ | 1.7 | ⬜ | LB: undo, redo |
| Export PNG composite 1/2/4/8× | ✅ | 1.5 | ⬜ | LB: export_png |
| Export active layer PNG | 🟡 | 1.5 | ⬜ | — |
| Autosave + restore | ✅ | 1.9 | ⬜ | LB: autosave_localstorage, reload_restores_layers |
| Save when storage is full | ⚠️ silent loss | 1.9 | ⬜ | LB: large_project_save (fails) |
| Sample dock scene | ✅ | 1.5 | ⬜ | LB: loads_default_dock_scene |

## Foundation (Phase 1, new)

| Feature | Legacy | Phase | New | Tests |
|---|---|---|---|---|
| Projects: create / open / rename / duplicate / delete | ⬜ | 1.10 | ⬜ | |
| Resolution presets 160×100 / 320×200 / 640×400 / custom | ⬜ | 1.10 | ⬜ | |
| Arbitrary art asset sizes | ⬜ | 1.11 | ⬜ | |
| Asset library: thumbnails, folders, tags, search, presets | ⬜ | 1.11 | ⬜ | |
| Stable ids, id references | ⬜ | 1.8 | ⬜ | |
| IndexedDB persistence, atomic autosave, save status | ⬜ | 1.9 | ⬜ | |
| Explicit save Ctrl/⌘+S | ⬜ | 1.9 | ⬜ | |
| Schema versioning + migrations + backups | ⬜ | 1.8 | ⬜ | |
| Portable `.pixelstudio` export/import with validation | ⬜ | 1.12 | ⬜ | |
| Import legacy layers from PNGs | ⬜ | 1.13 | ⬜ | |

## Planned (summary — expanded as phases start)

| Area | Phase | Status |
|---|---|---|
| Line / rect / ellipse / marquee / wand / flip / rotate 90 / mirror / tile & pattern brushes / reference images | 1.5 | ⬜ |
| Palettes: project & asset, locking, nearest-color, swap, cycling | 1.5 | ⬜ |
| Scenes, backgrounds, placement, hotspots (rect/poly/mask), transitions, fixed camera, Play | 2 | ⬜ |
| Object definitions, states, components, instances & overrides | 3 | ⬜ |
| Universal event system + compact logic editor + event debugger | 3 | ⬜ |
| Inventory, variables, basic dialogue, game-state saves | 3 | ⬜ |
| Vertical slice sample game (spec §56) | 3 | ⬜ |
| Character Studio, frame animation, onion skin, sprite sheets | 4 | ⬜ |
| Walk masks, A* pathfinding, approach points, depth sort, occlusion, perspective scale | 4 | ⬜ |
| Surface painter, rain/snow/fog/etc., splashes, ripples, shelter | 5 | ⬜ |
| Dialogue graph, menu/UI builder, sequences, audio, cursors, puzzle inspector, world map | 6 | ⬜ |
| Standalone export (directory + single file), accessibility, recovery | 7 | ⬜ |
