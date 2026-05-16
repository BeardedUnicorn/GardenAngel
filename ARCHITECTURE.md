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
file I/O and persistence. **Phases 3–5 are in:** a Sketch mode (freehand
vector strokes) feeds an OpenAI-compatible AI cleanup pass into editable
shapes (Plan-mode vertex editing); beds carry plantings sourced from
Permapeople with offline-cached companion guidance; and an on-demand,
mystically-voiced coach (Cmd+J) chats with §6.4 context assembly. The
journal/PDF/polish phases are still not present in code.

## Tech stack at a glance

| Layer | Choice |
|---|---|
| Shell | Tauri 2.11 (macOS bundle, file association `.gardenangel`) |
| Frontend | React 19 + TypeScript 5.8 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Build | Vite 7 |
| Canvas | `react-konva` 19 over `konva` 9 |
| Client state | Zustand 5 |
| Server state | TanStack Query 5 — plant search-as-you-type (`QueryClientProvider` in main.tsx) |
| Validation | Zod — sketch-cleanup output validation (`cleanupOutputSchema`) |
| DB | SQLite via `rusqlite` (bundled) in Rust |
| Zip | `zip` 2.x in Rust |
| HTTP from FE | `@tauri-apps/plugin-http` — OpenAI-compat adapter transport |
| Secrets | `keyring` Rust crate (`apple-native`) → macOS Keychain |
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
- `sketch_strokes` — vector freehand strokes; has Phase 3 CRUD. Migration `0002` adds nullable `consumed_at` (set when AI cleanup promotes a stroke; the row is stamped, not deleted — ADR-006)
- `beds` — bed shapes (rect / polygon / circle); has Phase 2 CRUD
- `paths` — path polylines with width; has Phase 2 CRUD
- `structures` — sheds, fences, water, compost, trees, other; has Phase 2 CRUD
- `plantings` — bed↔plant pairings; has Phase 4 create/list/delete (status defaults `planned`)
- `plant_cache` — write-through cache of plant lookups; has Phase 4 get/put (upsert on `external_id`)
- `observations` — journal entries; Phase 5 read paths (recent / per-bed) feed coach context; write path is Phase 6
- `coach_conversations`, `coach_messages` — coach chat history; has Phase 5 ensure/list/add (one conversation per project)
- `settings` — key/value config (AI base URL, model); has Phase 3 get/set/all

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
| [shapes.rs](src-tauri/src/shapes.rs) | `bed_*`, `path_*`, `structure_*` CRUD; `shapes_list` snapshot; shared `GARDEN_ID` |
| [sketch.rs](src-tauri/src/sketch.rs) | `strokes_list`, `stroke_create/update/delete`, `sketch_apply_cleanup` (atomic: create shapes + stamp `consumed_at` in one transaction) |
| [secret.rs](src-tauri/src/secret.rs) | `secret_set/get/has/delete` → macOS Keychain via `keyring` (ADR-001) |
| [settings.rs](src-tauri/src/settings.rs) | `settings_get_all`, `setting_get/set` over the `settings` table |
| [plants.rs](src-tauri/src/plants.rs) | `plant_cache_get/put` (write-through store), `plantings_list/create/delete` (guards bed exists) |
| [coach.rs](src-tauri/src/coach.rs) | `coach_conversation_ensure`, `coach_messages_list/add` (role-guarded), `observations_recent/for_bed` |

Pattern: every command takes `State<'_, ProjectState>`, calls
`state.with_db(|conn| …)` to acquire a `rusqlite::Connection` against the
open project's working-dir SQLite. Errors return `Result<T, SerializableError>`
which serializes to a plain string for the frontend.

### Frontend (`src/`)

| Path | Responsibility |
|---|---|
| [main.tsx](src/main.tsx) | React entry point |
| [App.tsx](src/App.tsx) | Top bar (Sketch/Plan toggle, New / Open / Save / Undo / Settings / Close), workspace layout, project↔canvas wiring, global keybindings |
| [project/projectStore.ts](src/project/projectStore.ts) | Zustand store: current project metadata, dirty flag, busy/error state (+ `projectFile.ts` invoke wrappers) |
| [canvas/types.ts](src/canvas/types.ts) | `Bed`, `PathShape`, `Structure`, `SketchStroke`, geometry variants, `Tool`/`CanvasMode` unions |
| [canvas/shapesApi.ts](src/canvas/shapesApi.ts) | Typed `invoke` wrappers: shape CRUD, stroke CRUD, `sketch_apply_cleanup` |
| [canvas/canvasStore.ts](src/canvas/canvasStore.ts) | Zustand store: mode, viewport, tool, shapes, strokes, selection, mutations, undo stack, cleanup flow |
| [canvas/CanvasStage.tsx](src/canvas/CanvasStage.tsx) | Konva Stage; mode-branched pointer handling (freehand sketch vs plan drawing), pan/zoom, preview overlay |
| [canvas/ToolPalette.tsx](src/canvas/ToolPalette.tsx) | Mode-aware left rail (Sketch: Pan/Pen + Clean-up; Plan: drawing tools) |
| [canvas/VertexEditor.tsx](src/canvas/VertexEditor.tsx) | Plan-mode draggable vertex/handle layer; commits one mutation on dragEnd (ADR-008) |
| [canvas/StrokeLabelDialog.tsx](src/canvas/StrokeLabelDialog.tsx) | "This region is a…" label step after a freehand stroke |
| [canvas/CleanupPreview.tsx](src/canvas/CleanupPreview.tsx) | Apply / Edit / Cancel diff gate before cleanup touches the DB |
| [canvas/shapes/](src/canvas/shapes/) | `BedShape`, `PathShapeView`, `StructureShape`, `StrokeShape` |
| [ai/types.ts](src/ai/types.ts), [ai/openaiCompatAdapter.ts](src/ai/openaiCompatAdapter.ts) | `ModelAdapter` interface; OpenAI-compat adapter over `tauri-plugin-http` (injectable transport) |
| [ai/sketchCleanupClient.ts](src/ai/sketchCleanupClient.ts) | Zod `cleanupOutputSchema`, `runSketchCleanup`, `CleanupError` (PLAN §6.2) |
| [coach/prompts/systemPrompts.ts](src/coach/prompts/systemPrompts.ts) | `CLEANUP_SYSTEM_PROMPT` (coach voice prompts land in Phase 5) |
| [settings/settingsStore.ts](src/settings/settingsStore.ts), [settings/SettingsPanel.tsx](src/settings/SettingsPanel.tsx) | Model config + Permapeople keys (Keychain), settings modal |
| [plants/permapeopleAdapter.ts](src/plants/permapeopleAdapter.ts) | `PlantAdapter` for Permapeople (search/getById, key headers, `normalizePermapeoplePlant`) |
| [plants/plantCache.ts](src/plants/plantCache.ts) | Write-through wrapper: Rust cache first, network fallback, write back (ADR-009) |
| [plants/plantsStore.ts](src/plants/plantsStore.ts) | Zustand: per-bed plantings + cached companion details |
| [plants/PlantPicker.tsx](src/plants/PlantPicker.tsx), [plants/PlantingsSection.tsx](src/plants/PlantingsSection.tsx) | Debounced search-as-you-type; per-bed plantings + companion/antagonist lines |
| [coach/prompts/systemPrompts.ts](src/coach/prompts/systemPrompts.ts) | Cleanup prompt + mystical/plain coach prompts (`coachSystemPrompt`) |
| [coach/CoachService.ts](src/coach/CoachService.ts) | Pure `assembleCoachMessages` — the only §6.4 context shape |
| [coach/coachStore.ts](src/coach/coachStore.ts), [coach/CoachPanel.tsx](src/coach/CoachPanel.tsx) | Conversation/streaming store; Cmd+J chat panel + voice toggle |
| [coach/__evals__/evalSet.ts](src/coach/__evals__/evalSet.ts) | 10-prompt manual eval set (PLAN §7) |

## State and data flow

Five Zustand stores plus TanStack Query for plant search:

- **`useProjectStore`** owns the project file lifecycle. State: `current`
  (project meta), `isDirty`, `isBusy`, `lastError`.

- **`useCanvasStore`** owns the canvas. State: `mode` (`sketch`|`plan`),
  `viewport`, `tool`, shape arrays (`beds`, `paths`, `structures`),
  `strokes`, `selection`, `undoStack`, and the cleanup flow
  (`cleanupBusy`, `cleanupPreview`, `cleanupWarnings`,
  `labelingStrokeId`). Shape mutations are async, server-first: call a
  Rust command, apply the response, push an inverse for undo, mark dirty.

- **`useSettingsStore`** owns model config + Permapeople keys. Non-secret
  fields (base URL, model) persist to the `settings` table; all keys go
  to the Keychain via `secret_*`. `resolveConfig()` /
  `resolvePermapeople()` fetch secrets transiently at call time — never
  held in renderer state.

- **`usePlantsStore`** owns per-bed plantings and the cached
  `PlantDetail` map used for companion display. `loadForBed` reads
  plantings + cache-only details (no network, offline-safe);
  `addPlanting` resolves through the write-through cache then creates the
  planting; `PlantPicker` search is a debounced TanStack Query.

- **`useCoachStore`** owns the chat: one conversation per project,
  display messages, streaming flag. `send` persists the user turn,
  builds §6.4 context via `assembleCoachMessages`, streams the reply
  through `adapter.chatStream`, updates the last message as deltas
  arrive, then persists the assistant turn. Reset on project close.

**Sketch cleanup flow.** `runCleanup()` assembles a §6.2 input from active
strokes, resolves the model config, builds an `openaiCompatAdapter`, and
calls `runSketchCleanup` (temperature 0, JSON-object, Zod-validated). On
success it stashes a `cleanupPreview`; the user reviews
(`CleanupPreview`) and `applyCleanup()` maps it to shape inputs and calls
the atomic `sketch_apply_cleanup`. Any failure raises `CleanupError` →
friendly toast + warnings, sketch left untouched.

**Hydration.** When `useProjectStore.current` flips non-null, App.tsx
calls `useCanvasStore.hydrate()` (fetches `shapes_list` + `strokes_list`
in parallel, filters consumed strokes, lands in Plan mode if structured
shapes already exist else Sketch) and `useSettingsStore.load()`. On
project close, `useCanvasStore.reset()` restores initial state.

**Persistence cadence.** Every shape mutation hits the backend immediately
(server-first). The 250 ms debounce mentioned in the plan is **not yet
implemented**; it will matter when drag-to-reposition lands and the canvas
emits many mutations per second. Property-panel text inputs currently
trigger one Rust call per keystroke — fine for v0.1 but a known UX wart.

## Canvas modes & tools

The canvas has two modes. **Sketch mode** offers Pan (V) and a freehand
Pen (F): the pen captures a vector point array on drag; on release, a
stroke whose endpoints nearly meet becomes a closed region, and the
"This region is a…" label dialog opens. "Clean up sketch" runs the AI
pass over labelled strokes. **Plan mode** offers the structured drawing
tools below plus vertex editing (drag the square handles of a selected
shape; geometry commits once on release — ADR-008).

Plan-mode tools (canonical Tool union in
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
`idle | rect | circle | polygon | path | freehand` — distinct from the
store. Transient until commit, when the appropriate `create*` action
fires. Escape cancels; switching tool or mode cancels.

**Pan and zoom.** Wheel pans (deltaX/deltaY). `Cmd`/`Ctrl` + wheel zooms
toward the cursor (clamped 0.1–8×). Trackpad pinch fires `wheel` events
with `ctrlKey=true` and so behaves as zoom by default. With the Select
tool, an empty-area drag pans via Konva's built-in `Stage.draggable`.

## Undo model

Operational command pattern (no redo). Each mutation pushes a typed entry
to `undoStack` describing what was done; `undo()` pops the most recent
and dispatches its inverse via the backend. See
[docs/DECISIONS.md](docs/DECISIONS.md) ADR-003 for why redo is deferred.

Concerns the current design handles correctly:
- Selection is cleared when the selected shape is undone or deleted.
- Undo of a `delete` reinserts via `create`, getting a new auto-increment
  ID. Acceptable in v0.1 because no other tables reference shape IDs yet
  (plantings land in Phase 4 and will force a re-design).
- Viewport, tool, and mode changes don't push to the stack.
- Vertex-edit drags push exactly one entry (commit on dragEnd — ADR-008).
- AI cleanup apply is a bulk atomic op deliberately **outside** the undo
  stack; the preview gate is the safety net (ADR-007). Applying clears
  the stack.

## Testing topology

- **Vitest** (frontend, `pnpm test`): stores + geometry round-trips, the
  §6.2 Zod contract, OpenAI-compat shaping/parsing, cleanup-apply
  mapping, Permapeople normalization/adapter, and the write-through
  cache wrapper (hit/miss/offline), the SSE delta parser + `chatStream`,
  and §6.4 context ordering/voice/window. 53 tests passing.
- **`cargo test`** (`src-tauri/`): migrations (incl. 0002
  `consumed_at`), zip/unzip + atomic save, per-shape CRUD, Phase 2
  end-to-end, stroke CRUD, atomic `apply_cleanup` (+ rollback), settings
  upsert, Keychain plumbing, plant-cache upsert, planting round-trip
  (+ missing-bed guard), coach conversation/message + observation reads.
  23 tests passing.
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
  ~664 kB minified (Konva dominates; Zod + AI, TanStack Query, coach).
  Over the 600 kB soft line in AGENTS.md — acceptable for v0.1;
  code-splitting the AI/plants/coach paths is the obvious lever if it
  needs trimming.

## What's deliberately not here yet

Phases 6–8 from [docs/PLAN.md](docs/PLAN.md) introduce:

- Journal entries with photos baked into the project zip (Phase 6) —
  the observation *write* path (read path already feeds coach context).
- PDF export (Phase 7).
- macOS menu bar, icons, About window, polish (Phase 8).

Nothing in those phases exists yet. The data model already accommodates
them; the UI does not surface them.
