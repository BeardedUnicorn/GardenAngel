# AGENTS.md

Onboarding for AI coding agents working on GardenAngel. Read this first.

## What this project is

A local-first macOS desktop app (Tauri 2 + React + TypeScript) for
permaculture-oriented backyard garden planning. Users sketch their space,
let an AI clean up the geometry into editable beds/paths/structures, place
plantings from open plant databases, log a living journal with photos, and
chat with a mystically-voiced permaculture coach. Everything persists to a
single `.gardenangel` project file (zip of SQLite + assets).

**Current state:** Phases 0–3 are done — scaffold, project-file
persistence, the Konva canvas with drawing tools, and Sketch mode with
OpenAI-compatible AI cleanup + Plan-mode vertex editing. Phases 4–8
(plants, coach, journal, PDF export, polish) are not yet built.

## Required reading, in order

1. **[docs/PLAN.md](docs/PLAN.md)** — the immutable v0.1 contract. Scope,
   non-scope, full schema, AI contracts (sketch cleanup JSON schema, coach
   context assembly, plant adapter interface), the 8-phase build sequence
   with acceptance criteria. **Treat this as the spec. Do not deviate
   without an ADR.**
2. **[ARCHITECTURE.md](ARCHITECTURE.md)** — how the code is actually laid out
   right now: process model, module map, state flow, undo model, what's
   not built yet.
3. **[docs/DECISIONS.md](docs/DECISIONS.md)** — ADRs for every place the
   implementation has diverged from PLAN.md or where a non-obvious choice
   was made. Already-recorded: keyring vs stronghold (ADR-001), rusqlite
   vs tauri-plugin-sql (ADR-002), undo-only no-redo (ADR-003), no
   drag-to-reposition yet (ADR-004).
4. **[docs/PROMPTS.md](docs/PROMPTS.md)** — coach + cleanup prompt history
   and eval results. Empty until Phase 3 / Phase 5 land.

## Setup

Requires macOS 13+, Node 22+, and Rust stable (1.93 or newer).

```sh
corepack enable          # one-time, gives you the pinned pnpm@10.33.4
pnpm install
pnpm tauri dev           # opens the desktop app
```

## Verification commands

After any change, run these and make sure they're all green before
declaring done:

```sh
pnpm typecheck             # tsc --noEmit
pnpm lint                  # eslint
pnpm test                  # vitest (frontend)
pnpm build                 # tsc + vite build
cd src-tauri && cargo test # Rust tests
cd src-tauri && cargo build
```

The frontend bundle is ~540 kB minified (Konva dominates); larger is
acceptable for v0.1 but worth a comment if you push it past 600 kB.

## Code conventions

### TypeScript
- Strict mode is on, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Index access (`arr[i]`) yields
  `T | undefined` — handle it.
- React 19's global `JSX.Element` was removed; use `ReactElement` from
  `react` if you need an explicit type, or just rely on inference.
- Prefer functional components and hooks. No class components.
- Zustand for client state; one store per concern (`useProjectStore`,
  `useCanvasStore`). Mutations are async, server-first.

### Rust
- Every Tauri command returns `Result<T, SerializableError>` defined in
  [src-tauri/src/error.rs](src-tauri/src/error.rs). Don't introduce a
  parallel error type.
- Per-call connections via `state.with_db(|conn| …)`. Don't reach into
  `ProjectState` directly.
- New schema changes go in **new numbered migrations** — never edit
  past migration files.
- Keep `src-tauri/src/main.rs` thin (one line). All builder/command
  wiring belongs in `lib.rs`.

### Style and discipline
- No commented-out code.
- No telemetry.
- No new dependencies without a justification comment at the import site
  (and ideally an ADR for substantial additions).
- Prettier 2-space indent, 100-char width, trailing commas everywhere,
  double quotes in JS/TS.
- ESLint flat config in [eslint.config.js](eslint.config.js).
- Prefer editing existing files over creating new ones unless the
  abstraction is genuinely new.

## Architecture quick reference

```
React (Vite, Konva) ──invoke──▶ Rust (app_lib)
        │                            │
   Zustand stores              rusqlite + tempfile
                                     │
                              atomic zip+rename
                                     ▼
                              *.gardenangel
```

- Frontend never runs raw SQL — only typed Tauri commands.
- All HTTP from the frontend goes through `@tauri-apps/plugin-http`,
  not `fetch`. (Sidesteps CORS, centralizes a future request-log hook.)
- Secrets land in the macOS Keychain via the `keyring` crate
  (Phase 3+). Never write API keys to the project file or to logs.

## Common pitfalls

- **Hardcoding `garden_id`.** v0.1 supports one garden per file, always
  id=1. The constant lives in [src-tauri/src/shapes.rs](src-tauri/src/shapes.rs)
  as `GARDEN_ID`. Don't sprinkle literal `1` through new code.
- **`tauri-plugin-sql` confusion.** It was in the original PLAN but was
  dropped (ADR-002). Use `rusqlite` directly in Rust and typed Tauri
  commands from the frontend. There is no `pnpm` package for it.
- **`tauri-plugin-stronghold` confusion.** Was in the original PLAN as
  an option; we chose `keyring` instead (ADR-001). When implementing the
  coach API key flow in Phase 3, reach for the Rust `keyring` crate.
- **JSX.Element.** React 19 removed it from the global namespace. Use
  `import type { ReactElement } from "react"`.
- **Adding redo.** The undo stack is intentionally one-way (ADR-003).
  Don't add redo without re-reading that ADR and updating it.

## Guardrails — do not do this without an ADR

These are explicitly out of scope for v0.1. If you find yourself wanting
to add one, stop and ask:

- Multi-year crop rotation, seasonal overlays, perennial growth state
- Sun/water analysis, permaculture zones 1–5
- Always-on coach sidebar, proactive nudges, voice mode
- Shopping or seed-starting lists
- Seasonal task calendar
- Multi-property workspace
- Windows / Linux / mobile builds
- Cloud sync, accounts, multi-user
- Telemetry of any kind
- Drag-to-reposition shapes (ADR-004 — coming in Phase 3 alongside AI
  cleanup, with the proper undo integration)
- Redo (ADR-003)

The data model in [src-tauri/migrations/0001_init.sql](src-tauri/migrations/0001_init.sql)
already accommodates several of these (rotation, succession, perennial
state) — surface area, not behavior, is the v0.1 constraint.

## Phase boundary discipline

Phases exist to keep risk contained. Don't smuggle Phase 4 plant-picker
work into a Phase 3 sketch-cleanup PR even if it seems "obvious." The
acceptance criteria in PLAN.md are the contract for each phase.

When you finish a phase:
1. Tick the acceptance items in PLAN.md (mentally; PLAN.md is
   immutable — don't edit it).
2. Update ARCHITECTURE.md to reflect what's new in the codebase.
3. Add ADRs to DECISIONS.md for any non-obvious choice that came up.
4. Commit per the conventions in [README.md](README.md).
