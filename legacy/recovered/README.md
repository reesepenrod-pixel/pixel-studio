# Recovered source of the original Pixel Studio

Extracted from `../../Pixel Studio.html` (a Claude Design bundled page) by `tools/unbundle.py`.
These files are **for reading and parity testing only**. The original HTML is the runnable version.

| File | What it is |
|---|---|
| `app.js` | All application logic: pure image helpers at the top, then `class Component extends DCLogic` |
| `template.html` | The UI as a Claude Design `<x-dc>` template (`sc-for`, `sc-if`, `{{ bindings }}`) with inline styles |
| `dc-runtime.generated.js` | Claude Design's runtime that turns the template + class into React. Third-party generated code, kept for reference |
| `assets/scene_*.png` | The 160×100 sample dock scene layers (same as camppenrod `fish-dock/layers-v3`) |
| `assets/silkscreen-*.woff2` | Silkscreen pixel font, SIL Open Font License (Google Fonts) |

React 18.3.1 and ReactDOM UMD builds were also embedded but aren't copied here. They're standard npm releases.
