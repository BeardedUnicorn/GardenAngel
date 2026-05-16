# GardenAngel

A local-first macOS app for planning a permaculture-minded backyard garden.
Sketch your space, let an AI tidy your geometry into editable beds and paths,
add plantings from open plant databases, log a living journal, and chat with
a permaculture coach.

**Status:** v0.1 — early development. Phases 0–6 are in: project-file
persistence, the drawing canvas, Sketch mode with AI cleanup,
Permapeople plantings with companion suggestions, the permaculture
coach, and the living journal. PDF export still to land.

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
- PDF export is not yet implemented (planned for Phase 7). The AI
  sketch cleanup and coach need an OpenAI-compatible API key, and plant
  search needs Permapeople API keys — set both in Settings (stored in
  the macOS Keychain). Coach is Cmd+J. Plant data © Permapeople.org,
  CC BY-SA 4.0.
