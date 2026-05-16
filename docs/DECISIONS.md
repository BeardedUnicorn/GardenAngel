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
