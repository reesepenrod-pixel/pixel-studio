# Pixel Studio

A local-first, browser-based environment for making 2D pixel-art point-and-click adventure
games without code. It grows out of an existing pixel-art editor built in Claude Design.

Owner: Reese Penrod (@reesepenrod-pixel). Comfortable with technical concepts, but wants
decisions explained in plain language. This is **not** part of the Camp Penrod website and
isn't hosted anywhere.

## Read first
- `docs/EXISTING_APPLICATION_AUDIT.md`: what the original app does, verified feature by feature
- `docs/ARCHITECTURE.md`: editor / runtime / project-data split, schema, event system
- `docs/IMPLEMENTATION_PLAN.md`: phases, the current task, open questions
- `docs/FEATURE_MATRIX.md`: status of every feature. Update it whenever a status changes.
- `docs/DECISIONS.md`: add an entry for every significant technical decision or new dependency

## Current state
Phase 1 approved and in progress. Tasks 1.0–1.6 are done: the original editor fully runs in the new app (`npm run dev`). Next is 1.8 (project schema), then 1.9 (IndexedDB project store, replacing the interim `draftStore`).
The progress log is at the bottom of `docs/IMPLEMENTATION_PLAN.md`.

## Layout
- `Pixel Studio.html`: the original app. **Never edit it.** It's the reference implementation.
- `legacy/recovered/`: readable source extracted from it (`app.js` = all logic, `template.html` = UI markup, `assets/`). Regenerate with `python3 -I tools/unbundle.py "Pixel Studio.html" <outdir>`.
- `src/`: the new app (layout in ARCHITECTURE §4). `src/core/imaging` = ported image pipeline; `src/core/raster` = pixels and compositing; `src/editors/art` = the Art workspace (`doc.ts` model, `controller.ts` behavior, `ArtWorkspace.tsx` and `panels.tsx` UI).
- `tests/unit`, `tests/parity` (port vs. original, byte for byte), `tests/e2e` (Playwright on the new app), `tests/legacy-baseline` (Playwright on the original HTML; 30 pass + 1 known defect).

## Commands
- `npm run dev`: dev server at http://localhost:5173
- `npm run check`: typecheck + unit + parity. Run before every commit.
- `npm run e2e`: browser tests against the new app
- `npm run build`: production build into `dist/`
- `npm run legacy:baseline`: browser probes against the original `Pixel Studio.html`

## Parity rule
Any change under `src/core/imaging` (or later ported code) must keep `tests/parity` green. Never edit a parity test to make it pass. If behavior is meant to change, say so, add a separate test for the new behavior, and record it in DECISIONS.

## Rules
- **Preserve working features.** Port first, improve second. Don't simplify or drop legacy behavior. If something truly can't be kept, say so and propose a replacement.
- **No fake functionality.** No buttons or panels that do nothing. Unbuilt features are hidden or clearly marked "planned".
- **Engine stays independent**: `src/engine/**` never imports React or editor code. Play mode and exported games use the same runtime.
- **Project data is data.** No `eval`, `new Function`, or user scripts. Events are declarative and run through the action registry.
- **Pixel-exact**: integer coordinates, integer zoom and scaling, `imageSmoothingEnabled = false`, `image-rendering: pixelated`.
- **Ids, not names**, for every reference. Schema changes need a version bump, a migration, a test, and a backup of the stored project before migrating.
- **Never lose user data silently.** Save failures must be visible.
- Keep files small and modules focused. Avoid premature abstraction.
- No new dependency without a `DECISIONS.md` entry and a mention in the commit message.

## Workflow
1. For each task: inspect relevant code → explain the change → implement → add or update tests → run checks → update docs.
2. Report honestly using these words: *implemented*, *tested*, *partially implemented*, *planned*, *blocked*. Don't say "done" for scaffolding.
3. Meaningful commits per task. Never force-push or rewrite history. **Never push to `main`.** Work on a branch; the owner merges (D-014). During Phase 1 everything goes on `claude/pixel-studio-dev-env-u7f29w`, with no new pull requests.

## Owner decisions so far
320×200 default resolution (D-010) · no legacy artwork to migrate · milestone PRs (D-014) · the 2× import grid option is removed (D-015).
