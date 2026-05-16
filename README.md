# GardenAngel

A local-first macOS app for planning a permaculture-minded backyard garden.
Sketch your space, let an AI tidy your geometry into editable beds and paths,
add plantings from open plant databases, log a living journal, and chat with
a permaculture coach.

**Status:** v0.1.0 — feature-complete against the v0.1 plan. All eight
phases are in: project-file persistence, the drawing canvas, Sketch
mode with AI cleanup, Plan-mode vertex editing, Permapeople plantings
with companion suggestions, the permaculture coach, the living journal,
PDF export, and the native macOS menu / About.

## Screenshots

_Add captures of Sketch mode, AI cleanup preview, Plan with plantings,
and the coach panel here before publishing a release._

| | |
|---|---|
| `docs/img/sketch.png` | `docs/img/cleanup.png` |
| `docs/img/plan.png` | `docs/img/coach.png` |

## Requirements

- macOS 13+
- Node.js 22+ with Corepack enabled (`corepack enable` — gives you `pnpm` at the pinned version)
- Rust toolchain (`rustup` with stable, `cargo --version` ≥ 1.93)

## Development

```sh
pnpm install
pnpm tauri dev
```

This opens a desktop window. Use the **New** button to create a
`.gardenangel` project file anywhere on disk; **Open** to reload one.

### Production build

```sh
pnpm install
pnpm tauri build
```

Produces `src-tauri/target/release/bundle/macos/GardenAngel.app` (and a
`.dmg`). With no Apple signing identity configured Tauri ad-hoc signs
the bundle, which runs on macOS 13+ after the usual Gatekeeper
right-click → Open on first launch. Configure a Developer ID in
`src-tauri/tauri.conf.json` for a distributable signed build.

### First-run setup

Open **Settings** and add an OpenAI-compatible API key (sketch cleanup +
coach) and Permapeople API keys (plant search). All keys are stored in
the macOS Keychain, never in the project file. Toggle the coach voice
(mystical / plain) in the coach panel (**Cmd+J**).

### Useful commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Vite-only frontend dev server (no Tauri) |
| `pnpm tauri dev` | Full Tauri app, live-reload |
| `pnpm tauri build` | Production `.app` bundle |
| `pnpm test` | Vitest (frontend) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `cd src-tauri && cargo test` | Rust tests |

> The `packageManager` field in [package.json](package.json) pins pnpm to a
> specific version. Corepack will automatically use that version when you run
> `pnpm` — no manual install needed beyond `corepack enable`.

## Project file format

A `.gardenangel` file is a zip containing `garden.sqlite`, `manifest.json`,
and an `assets/` directory. The canonical schema is in
[src-tauri/migrations/0001_init.sql](src-tauri/migrations/0001_init.sql).

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Michael Herold.

## Known limitations (v0.1)

- macOS only; no Windows / Linux / mobile builds.
- No cloud sync, accounts, or multi-user.
- The AI sketch cleanup and coach need an OpenAI-compatible API key,
  and plant search needs Permapeople API keys (Settings → Keychain).
  Plant data © Permapeople.org, CC BY-SA 4.0.
- Coach replies stream as a single buffered reveal (the Tauri HTTP
  transport buffers the body — see DECISIONS ADR-010).
- The PDF scale bar is in canvas units, not feet — there's no
  pixels-per-foot calibration in v0.1 (ADR-012).
- Multi-year rotation, seasonal overlays, sun/water analysis,
  permaculture zones, and shopping/seed-starting lists are out of scope
  for v0.1 (the schema accommodates them; the UI does not surface them).
