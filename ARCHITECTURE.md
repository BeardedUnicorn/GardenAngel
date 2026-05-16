# Architecture

A snapshot of how GardenAngel is built **right now**. For the immutable v0.1
contract (scope, schema, AI contracts, phased plan), see [docs/PLAN.md](docs/PLAN.md).
For the rationale behind specific deviations from that plan, see
[docs/DECISIONS.md](docs/DECISIONS.md).

## Overview

GardenAngel is a local-first macOS desktop app for permaculture-minded garden
planning. The user keeps all data in a single `.gardenangel` project file (a
zip containing SQLite + manifest + assets). A React frontend renders a 2D
top-down canvas of beds, paths, structures, and trees; a Rust backend owns
file I/O and persistence. AI features (sketch cleanup, coach) are scheduled
for later phases and not yet present in code.

## Tech stack at a glance

| Layer | Choice |
|---|---|
| Shell | Tauri 2.11 (macOS bundle, file association `.gardenangel`) |
| Frontend | React 19 + TypeScript 5.8 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Build | Vite 7 |
| Canvas | `react-konva` 19 over `konva` 9 |
| Client state | Zustand 5 |
| Server state | TanStack Query 5 (installed for Phase 4 plant API; not yet exercised) |
| Validation | Zod (installed for Phase 3 sketch-cleanup output validation; not yet exercised) |
| DB | SQLite via `rusqlite` (bundled) in Rust |
| Zip | `zip` 2.x in Rust |
| HTTP from FE | `@tauri-apps/plugin-http` (Phase 3+) |
| Secrets | `keyring` Rust crate → macOS Keychain (Phase 3+) |
| Tests | Vitest, `cargo test`, Playwright (installed, no e2e yet) |
| Package manager | pnpm 10.33.4 pinned via Corepack |

Refer to [docs/DECISIONS.md](docs/DECISIONS.md) ADR-002 for why we use
`rusqlite` directly instead of `tauri-plugin-sql`, and ADR-001 for why we
chose `keyring` over `tauri-plugin-stronghold`.

## Process model

```
┌─────────────────────────────────────────────────────┐
│  WebView (React + Vite, served by Tauri dev/build)  │
│                                                     │
│  ┌────────────────┐    ┌──────────────────────────┐ │
│  │ Zustand stores │ ── │ Konva canvas + UI panels │ │
│  └────────┬───────┘    └──────────────────────────┘ │
│           │ invoke("...")                           │
└───────────┼─────────────────────────────────────────┘
            │  Tauri IPC (JSON over channel)
            ▼
┌─────────────────────────────────────────────────────┐
│  Rust backend — crate `app_lib`                     │
│                                                     │
│  ┌────────────────┐    ┌──────────────────────────┐ │
│  │ Tauri commands │ ── │ ProjectState (Mutex)     │ │
│  └────────┬───────┘    └────────────┬─────────────┘ │
│           │                         │               │
│           ▼                         ▼               │
│   rusqlite::Connection      tempfile::TempDir       │
│   (per-call)                (per open project)      │
└─────────────────────────────────────────────────────┘
                                         │
                                         │ atomic zip+rename on save
                                         ▼
                                  *.gardenangel
```

`src-tauri/src/main.rs` is a one-line passthrough to `app_lib::run()`. All
plugin registration, state management, and command wiring lives in
[src-tauri/src/lib.rs](src-tauri/src/lib.rs) — required for future mobile
compatibility even though mobile is out of scope for v0.1.

## The `.gardenangel` project file

A zip archive containing:

```
garden.sqlite        # SQLite database (see schema below)
manifest.json        # { "format_version": 1, "app_version": "0.1.0", "created_at": ISO8601 }
assets/
  photos/<uuid>.jpg  # Journal photos (Phase 6+)
  sketches/<uuid>.png
```

**Lifecycle.** On `project_open`, the zip is unpacked into a per-project
[`tempfile::TempDir`](https://docs.rs/tempfile/). All edits go to the
SQLite database inside the working dir. On `project_save`, the working dir
is re-zipped to `<path>.tmp`, fsynced, and renamed over the original — an
atomic replace that survives mid-write crashes. On `project_close` the
`TempDir` is dropped (deleted).

**Migration discipline.** Schema changes go through numbered files in
[src-tauri/migrations/](src-tauri/migrations/). Migrations are embedded at
compile time via `include_str!` and tracked in a `_migrations` table; the
runner is idempotent (re-applying a tracked migration is a no-op).

## Data model

The full v1 schema lives in
[src-tauri/migrations/0001_init.sql](src-tauri/migrations/0001_init.sql).
Eleven tables shipped at v1, even though many won't have UI until later
phases — this avoids schema churn as features land. Tables:

- `gardens` — one row per project (id always 1 in v0.1; reserved for future multi-garden)
- `sketch_strokes` — vector freehand strokes (Phase 3)
- `beds` — bed shapes (rect / polygon / circle); has Phase 2 CRUD
- `paths` — path polylines with width; has Phase 2 CRUD
- `structures` — sheds, fences, water, compost, trees, other; has Phase 2 CRUD
- `plantings` — bed↔plant pairings (Phase 4)
- `plant_cache` — write-through cache of Permapeople/etc. lookups (Phase 4)
- `observations` — journal entries with optional photo (Phase 6)
- `coach_conversations`, `coach_messages` — coach chat history (Phase 5)
- `settings` — key/value config (Phase 3+)

Foreign keys are declared but not enforced (`PRAGMA foreign_keys` is off by
default in SQLite; we don't currently enable it because v0.1 has no cascade
requirements).

## Module layout

### Rust (`src-tauri/src/`)

| File | Responsibility |
|---|---|
| [main.rs](src-tauri/src/main.rs) | One-liner: `app_lib::run()` |
| [lib.rs](src-tauri/src/lib.rs) | Plugin registration, state, command registration |
| [error.rs](src-tauri/src/error.rs) | `SerializableError` enum (serde + thiserror) |
| [db.rs](src-tauri/src/db.rs) | Migration runner, idempotent |
| [project.rs](src-tauri/src/project.rs) | `project_new/open/save/close/current`, zip/unzip, atomic save, `ProjectState::with_db` helper |
| [shapes.rs](src-tauri/src/shapes.rs) | `bed_*`, `path_*`, `structure_*` CRUD; `shapes_list` snapshot |

Pattern: every command takes `State<'_, ProjectState>`, calls
`state.with_db(|conn| …)` to acquire a `rusqlite::Connection` against the
open project's working-dir SQLite. Errors return `Result<T, SerializableError>`
which serializes to a plain string for the frontend.

### Frontend (`src/`)

| Path | Responsibility |
|---|---|
| [main.tsx](src/main.tsx) | React entry point |
| [App.tsx](src/App.tsx) | Top bar (New / Open / Save / Undo / Close), workspace layout, project↔canvas wiring, global keybindings |
| [project/projectFile.ts](src/project/projectFile.ts) | Typed `invoke` wrappers for `project_*` commands |
| [project/projectStore.ts](src/project/projectStore.ts) | Zustand store: current project metadata, dirty flag, busy/error state |
| [canvas/types.ts](src/canvas/types.ts) | `Bed`, `PathShape`, `Structure`, geometry variants, `Tool` union, viewport defaults |
| [canvas/shapesApi.ts](src/canvas/shapesApi.ts) | Typed `invoke` wrappers for `shapes_list` and per-shape CRUD |
| [canvas/canvasStore.ts](src/canvas/canvasStore.ts) | Zustand store: viewport, active tool, hydrated shapes, selection, mutations, undo stack |
| [canvas/CanvasStage.tsx](src/canvas/CanvasStage.tsx) | Konva Stage, pan/zoom, per-tool drawing state machine, keyboard shortcuts, drawing preview overlay |
| [canvas/ToolPalette.tsx](src/canvas/ToolPalette.tsx) | Left rail tool buttons |
| [canvas/PropertyPanel.tsx](src/canvas/PropertyPanel.tsx) | Right rail editor for the active selection |
| [canvas/shapes/](src/canvas/shapes/) | `BedShape`, `PathShapeView`, `StructureShape` render components |

## State and data flow

Two Zustand stores at present:

- **`useProjectStore`** owns the project file lifecycle. State: `current`
  (project meta), `isDirty`, `isBusy`, `lastError`. Actions are async
  wrappers around Rust commands.

- **`useCanvasStore`** owns the canvas. State: `viewport` (x/y/scale,
  clamped), `tool`, three shape arrays (`beds`, `paths`, `structures`),
  `selection`, and an operational `undoStack`. Actions are async,
  server-first: each mutation calls a Rust command, applies the server
  response to the store, pushes an inverse command for undo, and
  invokes `useProjectStore.getState().markDirty()`.

**Hydration.** When `useProjectStore.current` flips non-null, an `useEffect`
in App.tsx calls `useCanvasStore.hydrate()`, which fetches
`shapes_list` and replaces the three shape arrays. The undo stack is
cleared. On project close, `useCanvasStore.reset()` returns the store to
its initial state.

**Persistence cadence.** Every shape mutation hits the backend immediately
(server-first). The 250 ms debounce mentioned in the plan is **not yet
implemented**; it will matter when drag-to-reposition lands and the canvas
emits many mutations per second. Property-panel text inputs currently
trigger one Rust call per keystroke — fine for v0.1 but a known UX wart.

## Canvas tools

Six tools live in the palette today (canonical Tool union in
[canvas/types.ts](src/canvas/types.ts)):

| Tool | Shortcut | Interaction | Produces |
|---|---|---|---|
| Select | V | Pan stage, click to select, drag stage when no selection | — |
| Rect bed | R | Drag from corner to corner | `Bed` with `shape_type='rect'` |
| Circle bed | C | Drag from center outward | `Bed` with `shape_type='circle'` |
| Polygon bed | P | Click vertices; Enter or click first vertex to close | `Bed` with `shape_type='polygon'` |
| Path | T | Click vertices; Enter to finish | `PathShape` |
| Structure | S | Drag from corner to corner | `Structure` with `kind='shed'` (default; editable in panel) |
| Tree | O | Drag canopy from center outward | `Structure` with `kind='tree'` + circle geometry |

**Drawing state machine.** `CanvasStage` holds a local `DrawingState` —
one of `idle | rect | circle | polygon | path` — distinct from the
shapes store. Transient (the in-progress drag/click sequence) until
commit, at which point the appropriate `create*` action fires. Pressing
Escape cancels in-progress drawing. Switching tools also cancels.

**Pan and zoom.** Wheel pans (deltaX/deltaY). `Cmd`/`Ctrl` + wheel zooms
toward the cursor (clamped 0.1–8×). Trackpad pinch fires `wheel` events
with `ctrlKey=true` and so behaves as zoom by default. With the Select
tool, an empty-area drag pans via Konva's built-in `Stage.draggable`.

## Undo model

Operational command pattern (no redo). Each mutation pushes a typed entry
to `undoStack` describing what was done; `undo()` pops the most recent
and dispatches its inverse via the backend. See
[docs/DECISIONS.md](docs/DECISIONS.md) ADR-003 for why redo is deferred.

Three concerns the current design handles correctly:
- Selection is cleared when the selected shape is undone or deleted.
- Undo of a `delete` reinserts via `create`, getting a new auto-increment
  ID. Acceptable in v0.1 because no other tables reference shape IDs yet
  (plantings land in Phase 4 and will force a re-design).
- Viewport changes (pan, zoom) and tool changes don't push to the stack.

## Testing topology

- **Vitest** (frontend, `pnpm test`): unit tests for stores and geometry
  round-trips. 20 tests passing as of the tree-tool commit.
- **`cargo test`** (`cargo test` in `src-tauri/`): migration apply +
  idempotency, zip/unzip round-trip, atomic save tmp-cleanup, per-shape
  CRUD, and an end-to-end Phase 2 test that exercises the full
  create→save→reopen→list pipeline. 10 tests passing.
- **Playwright** is installed but no e2e is written yet. Phase 1
  acceptance criterion ("new → draw a bed → save → reopen → bed is
  there") is currently satisfied by the cargo end-to-end test, not by a
  driven UI smoke. Real Playwright + Tauri-driver wiring is a Phase 8
  concern.

## Build and bundling

- **Dev:** `pnpm tauri dev` — Vite dev server on `localhost:1420`,
  Rust binary in debug mode, full HMR for frontend.
- **Production:** `pnpm tauri build` — Vite produces `dist/`, Tauri bundles
  it into `target/release/bundle/macos/GardenAngel.app`. Frontend bundle is
  ~540 kB minified (Konva dominates); acceptable for v0.1, code-splitting
  available if needed.

## What's deliberately not here yet

Phases 3–8 from [docs/PLAN.md](docs/PLAN.md) introduce:

- Sketch mode + AI cleanup (Phase 3) — bringing `sketch_strokes`,
  `tauri-plugin-http`, the OpenAI-compat adapter, Zod validation, and
  vertex editing.
- Permapeople plant adapter + companion suggestions (Phase 4) — bringing
  TanStack Query into the dependency graph.
- On-demand coach chat panel (Phase 5).
- Journal entries with photos baked into the project zip (Phase 6).
- PDF export (Phase 7).
- macOS menu bar, icons, About window, polish (Phase 8).

Nothing in those phases exists yet. The data model already accommodates
them; the UI does not surface them.
