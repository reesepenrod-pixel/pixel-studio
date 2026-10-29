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
Phase 0 (audit and architecture) is complete. Phase 1 is **awaiting the owner's approval**.
Don't start the migration until the plan is approved.

## Layout
- `Pixel Studio.html`: the original app. **Never edit it.** It's the reference implementation.
- `legacy/recovered/`: readable source extracted from it (`app.js` = all logic, `template.html` = UI markup, `assets/`). Regenerate with `python3 -I tools/unbundle.py "Pixel Studio.html" <outdir>`.
- `tests/legacy-baseline/`: Playwright probes run against the original HTML, the behavior baseline for the port.
  Run: `NODE_PATH=$(npm root -g) node tests/legacy-baseline/probe-core.js "Pixel Studio.html" <screenshot-dir>`.
- Planned `src/` layout: ARCHITECTURE §4.

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
3. Meaningful commits per milestone. Never force-push or rewrite history. Don't push to `main` unless the owner has said that's the workflow (open question Q5).
