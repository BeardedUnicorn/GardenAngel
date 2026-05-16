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
