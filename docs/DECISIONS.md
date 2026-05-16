# Architecture Decisions

Lightweight ADRs. Each entry: context, decision, consequences.

## ADR-001: Use `keyring` Rust crate for macOS Keychain, not `tauri-plugin-stronghold`

**Date:** 2026-05-16
**Status:** Accepted (implementation deferred to Phase 3)

### Context
The coach feature requires storing an API key for an OpenAI-compatible
endpoint. Two options were considered:

1. `tauri-plugin-stronghold` — Tauri's official secret-storage plugin. It's
   a cross-platform, password-unlocked encrypted vault (a single file on
   disk), not the OS keychain.
2. `keyring` Rust crate — A thin cross-platform wrapper around the OS
   credential store. On macOS it uses the Security framework / Keychain
   Services.

### Decision
Use the `keyring` crate, wrapped in dedicated Tauri commands
(`secret_set`, `secret_get`, `secret_delete`). The API key will live in the
macOS Keychain under service `com.mike.gardenangel`, account `coach-api-key`
(or similar).

### Rationale
- The user's mental model for a desktop app's secrets is the OS keychain.
  Apps like 1Password, Cursor, and VS Code use it for credentials.
- Stronghold introduces a second password prompt to unlock the vault on
  every launch — adds friction for a single API key.
- Stronghold's vault file is one more thing to back up / migrate; the
  Keychain "just works" across devices via iCloud Keychain.
- macOS-only v0.1 means we don't pay for `keyring`'s lack of cross-platform
  abstraction.

### Consequences
- One Rust dependency: `keyring = "3"`.
- Future cross-platform builds inherit `keyring`'s Windows / Linux backends
  for free, but each platform has different UX edges to verify when we
  get there.
- Tests for secret commands will mock the keyring backend (the crate
  supports a mock keyring for tests).

---

## ADR-002: Manage SQLite from Rust with `rusqlite`, drop `tauri-plugin-sql`

**Date:** 2026-05-16
**Status:** Accepted

### Context
The implementation plan initially listed `tauri-plugin-sql` as the DB
adapter. That plugin exposes a SQL connection pool to the frontend so it can
run queries directly via `invoke`.

GardenAngel's project file is a zip archive. To read or write, we have to:
1. Unzip into a temp working directory on open
2. Open SQLite against the file inside the working dir
3. Atomically zip+rename on save
4. Clean up the working dir on close

The working-dir path is private state we don't want to leak to the
frontend, and the database connection's lifecycle is tied to the
zip lifecycle — both belong in Rust.

### Decision
Use `rusqlite` (with the `bundled` feature) directly in Rust. Expose only
high-level, typed Tauri commands to the frontend (`project_new`,
`project_open`, etc., and later `garden_get`, `bed_create`, etc.). The
frontend never runs raw SQL.

### Rationale
- Cleaner API boundary: frontend describes domain operations, Rust handles
  storage details.
- Avoids two competing connection managers (Rust app state + plugin pool).
- `bundled` SQLite means no system dependency.

### Consequences
- More Rust commands to write as features grow. Each surface area is small
  and typed.
- `tauri-plugin-sql` dropped from `package.json` and `Cargo.toml`.
- If the frontend ever needs ad-hoc query capability (unlikely in v0.1),
  we'd add a single `query` command behind a feature flag.

---

## ADR-003: Undo-only command pattern for Phase 2; defer redo to v0.2

**Date:** 2026-05-16
**Status:** Accepted

### Context
The canonical plan for Phase 2 lists "Undo/redo using a command pattern
(keep small; not full event sourcing)". Implementing **undo** with
operational commands is straightforward — each mutation pushes an inverse
that calls the corresponding backend command. **Redo**, however, has a
real complication: redoing a `create` requires preserving the
server-assigned auto-increment ID. Without that, the recreated shape gets
a new ID, which (eventually) breaks references like `plantings.bed_id`.

Options considered:
1. Skip redo entirely for now.
2. Allow redo but accept that recreated shapes get new IDs (ID drift).
3. Add a backend command that re-inserts with a specified ID, plus
   identity preservation across the undo/redo cycle.

### Decision
Ship Phase 2 with **undo only**. Pressing Cmd+Z (or the Undo button)
reverses the most recent shape mutation. There is no redo. The undo
stack is cleared on project open/close. Viewport changes (pan/zoom) and
tool changes do not push to the undo stack.

### Rationale
- The Phase 2 acceptance smoke ("draw 4 shapes, save, reopen, all render
  correctly") doesn't require redo.
- Option 3 (backend ID preservation) is a real-but-non-trivial design
  change that's better made when references actually exist
  (Phase 4: plantings → beds). Doing it now is premature.
- Option 2 (ID drift) introduces a subtle correctness footgun for later
  phases. Better to defer than to ship a broken redo.

### Consequences
- `useCanvasStore` has `undoStack` and `canUndo()` / `undo()`, no redo.
- Undo of `bed-delete` / `path-delete` / `structure-delete` recreates
  the shape with a new ID; this is acceptable in v0.1 because no other
  tables reference shapes yet.
- When plantings land in Phase 4, ID-preserving operations become a
  requirement — re-evaluate undo design at that point.

---

## ADR-004: Defer shape drag-to-reposition; v0.1 supports text-edit only

**Date:** 2026-05-16
**Status:** Accepted

### Context
Phase 2 ships a Konva canvas with bed/path/structure primitives. Users
can draw new shapes, select them, edit their text properties (name,
soil notes, material, kind), and delete them. They cannot drag a shape
to a new position or reshape its vertices.

### Decision
For v0.1 Phase 2, shapes are **placed at draw time** and may only be
**deleted** if their position is wrong. Drag-to-move and vertex editing
are deferred.

### Rationale
- The Phase 2 acceptance criterion is "shapes render at the same
  positions after save/reopen" — strictly about persistence, not about
  in-canvas reposition UX.
- Drag handling with proper undo integration (snapshot before/after,
  not per-pointer-event) takes meaningful effort and would push Phase 2
  past one session.
- Most v0.1 workflows expect AI cleanup (Phase 3) to set the canonical
  positions; manual repositioning is a Phase-3-and-beyond concern.

### Consequences
- Shape positions are immutable for v0.1 short of delete + redraw.
- Phase 3 (sketch cleanup) and Phase 5 (coach) don't depend on
  reposition, so this isn't a blocker.
- When implementing drag in v0.2, ensure each drag pushes exactly one
  undo entry (capture before/after on dragStart/dragEnd, not on each
  drag event).

**Update (2026-05-16, Phase 3):** Vertex editing landed in Phase 3 as the
Phase 3 acceptance criteria require ("user can drag any vertex"). The
"re-evaluate when references exist" hook in ADR-003 still stands for
*redo*; reposition itself is now shipped. See **ADR-008**.

---

## ADR-005: Sketch cleanup is a separate, low-temperature, JSON-only call

**Date:** 2026-05-16
**Status:** Accepted

### Context
PLAN §6.2 requires the sketch→geometry cleanup pass to be its own AI call
with a narrow prompt and strict JSON schema — explicitly *not* the coach
pipeline. We needed to fix the prompt shape and the failure contract.

### Decision
- One system prompt (`CLEANUP_SYSTEM_PROMPT` in
  `src/coach/prompts/systemPrompts.ts`), one user message containing the
  JSON input (`canvas_bounds`, optional `scale_reference`, `strokes`).
- Call parameters fixed at `temperature: 0`,
  `response_format: { type: "json_object" }`.
- Output is parsed and validated with Zod (`cleanupOutputSchema`) before
  anything touches the DB. Geometry must structurally match its
  `shape_type` (a refine on the bed schema).
- Any failure — network, non-JSON, schema mismatch — raises
  `CleanupError`; the UI shows a friendly message + warnings and leaves
  the sketch strokes completely untouched.
- The full prompt text and revision history live in `docs/PROMPTS.md`
  (append-only, never edit a shipped prompt in place).

### Rationale
Determinism and a hard validation boundary matter more than cleverness
here: AI output is a *suggestion*, the user edits every vertex after, and
a bad response must never corrupt or lose the sketch.

### Consequences
- "OpenAI-compatible" divergence (e.g. providers that ignore
  `response_format`) will surface as Zod failures → safe fallback. Record
  concrete provider quirks here as discovered.
- The eval discipline in PLAN §7 applies when the cleanup prompt changes.

---

## ADR-006: Consumed strokes are stamped, not deleted (migration 0002)

**Date:** 2026-05-16
**Status:** Accepted

### Context
PLAN says strokes are "Cleared (not deleted) when promoted to plan." The
v1 schema had no column to express "this stroke became a shape."

### Decision
Migration `0002_sketch_consumed.sql` adds a nullable
`sketch_strokes.consumed_at TEXT`. `sketch_apply_cleanup` sets it (in the
same transaction that creates the shapes) instead of deleting the row.
The sketch layer renders only strokes with `consumed_at IS NULL`.

### Rationale
- Keeps the original freehand ink recoverable (PLAN §4 treats vector
  strokes as canonical).
- A boolean stamp is the minimum surface that satisfies "cleared, not
  deleted" without inventing un-cleanup UX in v0.1.
- Honors migration discipline — new numbered migration, 0001 untouched.

### Consequences
- `strokes_list` returns all strokes; the frontend filters consumed ones.
  A future "show original sketch" toggle is free.
- Re-running cleanup can't double-consume: the UPDATE guards on
  `consumed_at IS NULL` and errors if a stroke id is already consumed,
  which also keeps `apply_cleanup` atomic.

---

## ADR-007: Cleanup apply is atomic and lives outside the undo stack

**Date:** 2026-05-16
**Status:** Accepted

### Context
Applying cleanup creates N beds/paths/structures and consumes M strokes at
once. The Phase 2 undo model (ADR-003) is per-shape-mutation and one-way.
Making a bulk AI apply individually undoable would mean either N+M undo
entries or a bespoke compound command — and un-consuming strokes needs a
backend path that doesn't exist.

### Decision
`sketch_apply_cleanup` is a single Rust transaction (all shapes + all
stroke stamps, or nothing). On the frontend, applying clears the undo
stack rather than pushing entries. The user's safety net is the
**preview** (Apply / Edit / Cancel) — nothing reaches the DB until they
approve, and "Edit" returns them to the untouched sketch.

### Rationale
- Matches the Phase 3 acceptance (preview gate, atomic apply, editable
  result) without the complexity of compound/inverse bulk commands.
- Post-apply, every shape is a normal editable shape with normal
  per-mutation undo — so granular control resumes immediately.

### Consequences
- There is no one-click "undo the whole cleanup." Re-sketching is the
  recovery path in v0.1. Revisit if users ask for it (would need an
  un-consume backend op + compound command — pairs naturally with the
  redo work deferred in ADR-003).

---

## ADR-008: Vertex editing — snap on dragEnd, exactly one undo entry

**Date:** 2026-05-16
**Status:** Accepted (supersedes the deferral in ADR-004)

### Context
ADR-004 deferred drag-to-reposition. Phase 3 acceptance requires the user
to "drag any vertex" of a cleaned shape, so it's now in scope.

### Decision
In Plan mode with the Select tool, the selected shape renders draggable
square handles (`VertexEditor`): rect corners (opposite corner pinned),
circle center + radius, polygon/path per-vertex. The shape geometry is
recomputed and persisted **once, on Konva `dragEnd`** — which routes
through the existing `updateBed/updatePath/updateStructure` actions and
therefore pushes **exactly one** undo entry per drag (the very rule
ADR-004 flagged for whoever implemented this).

### Rationale
- Commit-on-release is the simplest correct integration with the
  Phase 2 undo model — no per-pointer-event churn, no partial states.
- Handle size is scaled by `1/viewport.scale` so handles stay a constant
  screen size at any zoom.

### Consequences
- The shape "snaps" to the new geometry on release rather than tracking
  the handle live. Acceptable for v0.1; live-preview is a polish item.
- Whole-shape translate (drag the body, not a vertex) is still not a
  thing; only vertices/center move. Out of scope until asked for.

---

## ADR-009: Permapeople companions are names; cache wrapper lives in the frontend

**Date:** 2026-05-16
**Status:** Accepted

### Context
PLAN §6.3 types `PlantDetail.companions` / `antagonists` as arrays of
`external_id`s, and says "All reads go through a cache wrapper that checks
`plant_cache` first." Two realities forced small calls:

1. The Permapeople API exposes companion/antagonist info only as
   free-text names inside the `data[]` key/value list (keys like
   "Combine with" / "Avoid"), not as plant ids. There is no reliable
   id mapping.
2. AGENTS.md mandates all frontend HTTP go through
   `@tauri-apps/plugin-http`. The network adapter therefore lives in the
   frontend, while the cache (SQLite) lives in Rust.

### Decision
- `companions` / `antagonists` hold **names** (strings split on `,`/`;`),
  shown verbatim in the Plantings panel. The §6.3 "external_ids" intent
  is recorded as aspirational; revisit if/when a provider gives ids.
- The cache wrapper (`plants/plantCache.ts`) is a thin frontend module:
  `resolvePlantDetail` calls the Rust `plant_cache_get` command first,
  and only on a miss calls the network adapter, then writes back via
  `plant_cache_put`. The whole normalized `PlantDetail` is stored as the
  cache row's `data_json`, so reads need no re-normalization and are
  provider-agnostic.
- Permapeople key id + secret are two more Keychain secrets
  (`permapeople-key-id`, `permapeople-key-secret`), consistent with
  ADR-001.

### Rationale
- Showing the names is honest and immediately useful; fabricating id
  links would be worse than text.
- Keeping the cache check in a frontend wrapper (over typed Rust
  commands) keeps the network call where the plugin-http rule wants it,
  without leaking the working-dir DB path to the renderer (ADR-002 still
  holds — the frontend never runs SQL).

### Consequences
- Offline behaviour matches the Phase 4 acceptance: once a plant is added
  (network fetch + write-through), reopening shows companions from cache
  with zero network calls. First-fetch network failure surfaces as a
  clear error and adds nothing.
- A future "link companion name → cached plant" enhancement is purely
  additive (string match against `plant_cache.common_name`).
