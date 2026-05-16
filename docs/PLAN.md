# GardenAngel — Implementation Plan (v0.1 MVP)
> **For Claude (or any implementing agent):** This document is the contract. Build to it. If you encounter ambiguity, prefer the simplest interpretation that satisfies the acceptance criteria for the current phase. Do not implement features outside the current phase's scope, even if they seem obvious — phase boundaries exist to keep risk contained.
---
## 1. What you're building
GardenAngel is a macOS desktop app (Tauri 2 + React + TypeScript) for permaculture-oriented backyard garden planning. The user draws their space on a canvas, labels regions, and AI cleans up geometry into structured beds, paths, and structures. A coach LLM (OpenAI-compatible API, user-configurable model) provides companion-planting guidance, observation prompts, and seasonal tasks. Storage is local-first via a single `.gardenangel` project file.
### In scope for v0.1
- Tauri 2 + React + TS scaffold, macOS only
- 2D top-down canvas (Konva) with bed / path / structure primitives
- Sketch mode (vector freehand + region labels) → AI cleanup → Plan mode
- `.gardenangel` save/load (zip containing SQLite + assets + manifest)
- OpenAI-compatible coach with selectable model, mystical-voice default + plain toggle
- Permapeople adapter with local SQLite cache; companion-plant suggestions
- Living journal (text + photo)
- PDF export of plan
- Settings: API key, base URL, model, coach voice
### Explicitly out of scope for v0.1
- Multi-year rotation, seasonal overlays, perennial growth state (schema accommodates; UI does not surface)
- Sun/water analysis, permaculture zones 1–5
- Always-on coach sidebar, proactive nudges, voice mode
- Shopping/seed-starting list (deferred — depends on multi-year scope)
- Seasonal task calendar (deferred — depends on succession logic)
- Multi-property workspace
- Windows, Linux, mobile
- Cloud sync, accounts, multi-user
Do not add these. Design the data model to accommodate them; do not surface them in UI or business logic.
---
## 2. Tech stack (use these exact versions or higher within the same major)
| Layer | Choice | Notes |
|---|---|---|
| Shell | Tauri 2 | `@tauri-apps/cli@^2`, `@tauri-apps/api@^2`, `tauri@^2` |
| Frontend | React 18+, TypeScript 5+ | Strict mode on |
| Build | Vite 5+ | Default Tauri scaffold |
| Canvas | Konva via `react-konva` | Not Pixi, not raw SVG |
| State | Zustand | Slices per feature; no Redux |
| Server state | TanStack Query | For plant API calls |
| DB (Rust side) | `tauri-plugin-sql` with SQLite | All persistence |
| File ops | `tauri-plugin-fs`, `tauri-plugin-dialog` | Native open/save dialogs |
| HTTP (coach + plant API) | `tauri-plugin-http` from frontend | Avoids browser CORS, keeps keys out of renderer where possible |
| PDF | `jspdf` + canvas snapshot | Sufficient for v0.1 |
| Testing | Vitest (unit), Playwright (e2e), `cargo test` (Rust) | TDD where it matters — see §10 |
**Do not add libraries beyond this list without a clear justification in a comment at the import site.**
---
## 3. Project structure
```
gardenangel/
├── src/                              # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── canvas/                       # Konva canvas + tools
│   │   ├── CanvasStage.tsx
│   │   ├── SketchLayer.tsx
│   │   ├── PlanLayer.tsx
│   │   ├── tools/                    # bed, path, structure, freehand, label
│   │   └── shapes/                   # Bed.tsx, Path.tsx, Structure.tsx
│   ├── coach/                        # AI coach UI + service
│   │   ├── CoachPanel.tsx
│   │   ├── CoachService.ts           # context assembly, streaming
│   │   └── prompts/                  # systemPrompts.ts, fewShot.ts
│   ├── ai/                           # Model adapters
│   │   ├── types.ts                  # ChatMessage, ModelAdapter interface
│   │   ├── openaiCompatAdapter.ts
│   │   └── sketchCleanupClient.ts    # narrow, low-temp call
│   ├── plants/                       # Plant data adapters + cache
│   │   ├── types.ts
│   │   ├── permapeopleAdapter.ts
│   │   ├── plantCache.ts
│   │   └── PlantPicker.tsx
│   ├── journal/                      # Journal entries
│   ├── project/                      # .gardenangel file ops
│   │   ├── projectStore.ts           # Zustand
│   │   └── projectFile.ts            # open/save/new wrappers around Rust
│   ├── settings/                     # Settings UI + store
│   ├── export/
│   │   └── pdfExport.ts
│   ├── lib/                          # shared utils
│   └── styles/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                   # thin passthrough
│   │   └── lib.rs                    # all commands registered here
│   ├── capabilities/
│   │   └── default.json
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── build.rs
├── public/
├── docs/
│   ├── DECISIONS.md                  # ADRs for non-obvious choices
│   └── PROMPTS.md                    # current coach + cleanup prompts
├── package.json
├── tsconfig.json
└── README.md
```
**Rule:** `src-tauri/src/main.rs` stays thin — it only calls `app_lib::run()`. All Tauri commands, state, and builder setup live in `lib.rs`. This is required for future mobile compatibility even though mobile is out of scope now. (Per Tauri v2 conventions.)
---
## 4. The `.gardenangel` project file format
A `.gardenangel` file is a **zip archive** containing:
```
garden.sqlite      # SQLite database (see §5)
manifest.json      # { "format_version": 1, "app_version": "0.1.0", "created_at": ISO8601 }
assets/
  photos/<uuid>.jpg
  sketches/<uuid>.png   # raster snapshot for thumbnail/recovery only
```
- The canonical sketch is **vector strokes stored in the DB**, not the PNG. The PNG is a fallback/thumbnail.
- Open flow: copy zip to a temp working dir, operate on `garden.sqlite` in place, re-zip on save.
- Save uses atomic write (write to `*.tmp`, fsync, rename).
- File extension `.gardenangel` is registered via Tauri bundle config; double-click opens the app.
Implement file ops as Rust commands (`project_open`, `project_save`, `project_new`, `project_close`) since they touch the filesystem and need atomicity.
---
## 5. SQLite schema (v1 — design now accommodates deferred features)
```sql
-- One garden per project file. Row exists for future multi-garden support but is always id=1 in v0.1.
CREATE TABLE gardens (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  zone TEXT,                       -- USDA zone, nullable (progressive disclosure)
  last_frost_date TEXT,            -- ISO date, nullable
  first_frost_date TEXT,           -- ISO date, nullable
  latitude REAL,
  longitude REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Vector strokes from sketch mode. Cleared (not deleted) when promoted to plan.
CREATE TABLE sketch_strokes (
  id INTEGER PRIMARY KEY,
  garden_id INTEGER NOT NULL REFERENCES gardens(id),
  label TEXT,                      -- user-applied region label (e.g. "raised bed", "path")
  points_json TEXT NOT NULL,       -- [{x,y,pressure?}, ...]
  color TEXT,
  width REAL,
  closed INTEGER NOT NULL DEFAULT 0,  -- 1 if region polygon
  created_at TEXT NOT NULL
);
CREATE TABLE beds (
  id INTEGER PRIMARY KEY,
  garden_id INTEGER NOT NULL REFERENCES gardens(id),
  name TEXT,
  shape_type TEXT NOT NULL,        -- 'rect' | 'polygon' | 'circle'
  geometry_json TEXT NOT NULL,     -- shape-specific geometry
  soil_notes TEXT,
  sun_exposure TEXT,               -- 'full'|'partial'|'shade' nullable
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE paths (
  id INTEGER PRIMARY KEY,
  garden_id INTEGER NOT NULL REFERENCES gardens(id),
  name TEXT,
  points_json TEXT NOT NULL,       -- ordered vertex list
  width REAL NOT NULL,
  material TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE structures (
  id INTEGER PRIMARY KEY,
  garden_id INTEGER NOT NULL REFERENCES gardens(id),
  name TEXT,
  kind TEXT NOT NULL,              -- 'shed'|'fence'|'water'|'compost'|'tree'|'other'
  geometry_json TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Plantings: designed for future succession/rotation; v0.1 uses one row per bed-plant pairing.
CREATE TABLE plantings (
  id INTEGER PRIMARY KEY,
  bed_id INTEGER NOT NULL REFERENCES beds(id),
  plant_id TEXT NOT NULL,          -- foreign reference to plant_cache.external_id
  planted_at TEXT,                 -- ISO date, nullable (planned vs. actual)
  harvested_at TEXT,
  quantity INTEGER,
  position_json TEXT,              -- optional sub-bed positioning for later
  status TEXT NOT NULL DEFAULT 'planned',  -- 'planned'|'sown'|'growing'|'harvested'|'failed'
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Persistent plant data cache. external_id is the Permapeople id; provider lets us swap later.
CREATE TABLE plant_cache (
  external_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,          -- 'permapeople'|'usda'|'openfarm'
  common_name TEXT NOT NULL,
  scientific_name TEXT,
  data_json TEXT NOT NULL,         -- full normalized record
  fetched_at TEXT NOT NULL
);
CREATE TABLE observations (
  id INTEGER PRIMARY KEY,
  garden_id INTEGER NOT NULL REFERENCES gardens(id),
  bed_id INTEGER REFERENCES beds(id),
  planting_id INTEGER REFERENCES plantings(id),
  body TEXT NOT NULL,
  photo_path TEXT,                 -- relative path inside assets/
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE coach_conversations (
  id INTEGER PRIMARY KEY,
  garden_id INTEGER NOT NULL REFERENCES gardens(id),
  started_at TEXT NOT NULL,
  title TEXT
);
CREATE TABLE coach_messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES coach_conversations(id),
  role TEXT NOT NULL,              -- 'system'|'user'|'assistant'
  content TEXT NOT NULL,
  model TEXT,                      -- record which model produced this
  created_at TEXT NOT NULL
);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX idx_plantings_bed ON plantings(bed_id);
CREATE INDEX idx_observations_garden ON observations(garden_id);
CREATE INDEX idx_coach_messages_conv ON coach_messages(conversation_id);
```
**Migration discipline:** even at v0.1, every schema change goes through a numbered migration file (`migrations/0001_init.sql`, etc.). Do not edit past migrations.
---
## 6. Key interfaces and contracts
### 6.1 Model adapter interface (`src/ai/types.ts`)
```ts
export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string; }
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: 'json_object' } | { type: 'text' };
}
export interface ChatResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; };
}
export interface ModelAdapter {
  name: string;                    // 'openai-compat', etc.
  chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  chatStream?(req: ChatRequest, signal?: AbortSignal): AsyncIterable<string>;
}
```
The OpenAI-compat adapter targets `${baseUrl}/chat/completions`. Configurable base URL, API key, default model.
**Important:** "OpenAI-compatible" is leaky. Document any provider-specific divergence in `docs/DECISIONS.md` as it's discovered. Don't pretend the abstraction is free.
### 6.2 Sketch cleanup contract
The cleanup pass is **a separate AI call** with its own narrow prompt and a strict JSON output schema. Do not reuse the coach pipeline.
Input (sent in the user message as JSON):
```json
{
  "canvas_bounds": { "width": 1200, "height": 800 },
  "scale_reference": { "pixels_per_foot": 12 },     // optional
  "strokes": [
    {
      "id": 1, "label": "raised bed", "closed": true,
      "points": [[120,80],[340,82],[345,260],[118,258]]
    },
    { "id": 2, "label": "path", "closed": false, "points": [[...]] }
  ]
}
```
Required output:
```json
{
  "beds":       [{ "source_stroke_ids": [1], "shape_type": "rect", "geometry": { "x": 120, "y": 80, "width": 225, "height": 180 } }],
  "paths":      [{ "source_stroke_ids": [2], "points": [[...]], "width": 24 }],
  "structures": [],
  "warnings":   ["string..."]
}
```
- `temperature: 0`, `response_format: { type: 'json_object' }`.
- Validate output with Zod before applying. Bad output → show warnings, fall back to raw strokes.
- **The user can edit every vertex after cleanup.** AI output is suggestion, not gospel.
### 6.3 Plant data adapter interface (`src/plants/types.ts`)
```ts
export interface PlantSummary {
  external_id: string;
  provider: 'permapeople' | 'usda' | 'openfarm';
  common_name: string;
  scientific_name?: string;
}
export interface PlantDetail extends PlantSummary {
  family?: string;
  layers?: string[];               // permaculture layers
  sun?: string;
  water?: string;
  companions?: string[];           // external_ids
  antagonists?: string[];
  raw: unknown;                    // provider-native record
}
export interface PlantAdapter {
  search(query: string, signal?: AbortSignal): Promise<PlantSummary[]>;
  getById(id: string, signal?: AbortSignal): Promise<PlantDetail>;
}
```
All reads go through a cache wrapper that checks `plant_cache` first and falls back to network. Network results are written back to cache.
### 6.4 Coach context assembly
Every coach call assembles context in this order (most general → most specific):
1. **System prompt** — voice (mystical default or plain), permaculture framing, refusal/safety rules (no medical/edibility-safety advice as authoritative).
2. **Garden snapshot** — name, zone if set, frost dates if set, bed/path/structure counts and summaries.
3. **Active selection** — if a bed is selected, include its details + current plantings + recent observations on it.
4. **Recent observations** — last 5 from the garden, newest first.
5. **Conversation history** — sliding window (keep system prompt + last 20 messages by default; configurable).
6. **User message.**
This is the only sanctioned context shape. New context types require a `DECISIONS.md` entry.
---
## 7. Coach voice — the mystical default
Mystical drift is a real risk; the prompt needs to be specific. Anchor on Mike's Falling Bird voice (symbolic, naturalistic, slightly archaic but not purple). Ship a "plain teacher" toggle.
Mystical system prompt anchor (in `src/coach/prompts/systemPrompts.ts` — refine, do not delete):
> You are GardenAngel, a coach for permaculture-minded gardeners. You speak in a register that is grounded but symbolic — you treat plants as kin, the garden as a small ecology, and seasons as a kind of liturgy. You are not flowery and you do not invent folklore. Specific over poetic. When asked a practical question, answer it practically first; let the symbolic register color the framing, not replace the information. Cite plant facts only when you are confident; otherwise say what you would observe to find out. You do not give medical or foraging-safety advice.
Plain mode replaces the first three sentences with a clinical-but-warm framing.
Build a tiny eval set (10 prompts) in `src/coach/__evals__/` covering: companion suggestion, observation prompt, schedule question, beginner reassurance, ambiguous question, refusal case. Run manually when changing prompts or models; record results in `docs/PROMPTS.md`.
---
## 8. Phased build plan
Each phase ends with an **acceptance checklist**. Do not advance past a phase with failing items. Open a `DECISIONS.md` entry whenever a non-obvious tradeoff is made.
### Phase 0 — Scaffold (½ day)
- `npm create tauri-app@latest` → React + TS + Vite template
- Install Konva, react-konva, Zustand, TanStack Query, Zod, `tauri-plugin-sql`, `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-http`
- Configure `tauri.conf.json`: `productName: GardenAngel`, identifier `com.mike.gardenangel`, macOS bundle, file association for `.gardenangel`
- Capability file grants `core:default`, `sql:default`, `fs:default`, `dialog:default`, `http:default`
- ESLint + Prettier + strict tsconfig
**Acceptance:** `npm run tauri dev` opens an empty window titled "GardenAngel". `cargo test` and `vitest` both run (empty suites pass).
### Phase 1 — Project file & DB round-trip (1–2 days)
- SQLite migration runner; `0001_init.sql` from §5
- Rust commands: `project_new(path)`, `project_open(path)`, `project_save()`, `project_close()`
- Zip/unzip handling for `.gardenangel` (use `zip` crate)
- TS `projectStore` (Zustand) holds open-project state
- Minimal UI: New / Open / Save buttons, project name display
**Acceptance:** Create new project → save → close → reopen → garden row persists with same id and timestamps. Save uses tmp+rename. `cargo test` covers the zip/unzip + migration runner.
### Phase 2 — Canvas with bed/path/structure primitives (2–3 days)
- `CanvasStage` with pan, zoom (trackpad pinch + wheel)
- Tool palette: select, rectangle bed, polygon bed, path, structure
- Shapes persist to DB on commit (debounced); hydrate on project open
- Selection + delete + property panel (name, notes)
- Undo/redo using a command pattern (keep small; not full event sourcing)
**Acceptance:** Draw 2 beds, 1 path, 1 structure → save → reopen → all four render in same positions. Vitest covers the geometry serialization round-trip.
### Phase 3 — Sketch mode + AI cleanup (3–4 days, highest-risk phase)
- Sketch mode toggle; freehand pen tool capturing **vector strokes** (point arrays) — never raster
- Region close detection + label dialog ("This region is a…")
- "Clean up sketch" action calls `sketchCleanupClient`
- OpenAI-compat adapter (just enough to make this call) + settings UI for API key/base URL/model
- Zod validation on cleanup output; show diff preview ("Apply / Edit / Cancel")
- On apply: create beds/paths/structures, mark source strokes as consumed
- Every cleaned shape is fully editable in Plan mode
**Acceptance:** Sketch a labeled rectangle and a labeled path → cleanup produces snapped geometry → user can drag any vertex → save/reopen preserves edits. Cleanup failure (e.g. invalid JSON) shows a friendly warning and leaves sketch intact. One DECISIONS.md entry captures the cleanup prompt design.
### Phase 4 — Plant data & companion suggestions (2–3 days)
- `permapeopleAdapter` (search + detail) + `plant_cache` write-through
- `PlantPicker` component (search-as-you-type, TanStack Query)
- Per-bed "Plantings" list; add plant → creates `plantings` row with `status='planned'`
- Companion-plant suggestion panel: for each plant in the bed, show companions/antagonists from cache
**Acceptance:** Search "tomato" returns results; pick one → it's added to the selected bed → companions/antagonists shown using cached data on second open (no network call when offline after first fetch). Network failure on first fetch surfaces a clear error.
### Phase 5 — Coach panel (2 days)
- On-demand chat panel (Cmd+J toggle), streaming responses
- Context assembly per §6.4
- Conversation persistence in `coach_conversations` + `coach_messages`
- Voice toggle in settings; persist to `settings` table
- Eval set runs manually; results pasted into `docs/PROMPTS.md`
**Acceptance:** Open coach with a bed selected containing tomatoes → ask "what should I plant alongside these?" → response references the bed and the plant by name and offers a companion. Switching voice toggle changes register on next message.
### Phase 6 — Journal (1 day)
- Add observation: text + optional photo (Tauri dialog → copy into `assets/photos/<uuid>.jpg` in working dir)
- Journal list per garden + per bed
- Inline in coach context (most recent 5)
**Acceptance:** Add an observation with photo → save → reopen → photo renders from project file. Photos live inside the zip, not as external references.
### Phase 7 — PDF export (1 day)
- "Export Plan as PDF" → renders the Plan layer to canvas → `jspdf` → save dialog
- Include garden name, scale legend, timestamp
**Acceptance:** Exported PDF opens in Preview.app, plan is recognizable, scale legend is correct relative to canvas scale reference.
### Phase 8 — Polish & sign-off (1–2 days)
- macOS app icon, menu bar (File / Edit / View / Help)
- About window with version
- Crash/error toast surface
- README with screenshots, build instructions, known limitations
- Tag `v0.1.0`
**Acceptance:** Fresh clone → `npm install && npm run tauri build` produces a signed-or-ad-hoc `.app` that runs on macOS 13+. All previous phase acceptance criteria still pass.
---
## 9. Cross-cutting requirements
**Error handling.** Rust commands return `Result<T, SerializableError>`; frontend renders errors as toasts plus a "Copy error details" affordance. Never silently swallow.
**Secrets.** API keys live in the OS keychain via `tauri-plugin-stronghold` *or* in the `settings` table with a clear UX note ("stored in your project file") — pick one and document in DECISIONS.md. Never log keys.
**Network calls from the frontend** go through `tauri-plugin-http`, not `fetch`. This sidesteps CORS and centralizes a future request-logging hook.
**No telemetry** in v0.1. Don't add it without a separate decision.
**Performance.** Canvas writes debounce at 250 ms. SQLite writes outside the canvas hot path are immediate. If the canvas has more than ~500 shapes and feels sluggish, that's a future-phase concern — log it, don't optimize speculatively.
---
## 10. Testing strategy
- **Vitest** for: serialization round-trips (geometry, strokes, plant cache), Zod schemas, model adapter request shaping, context assembly. Aim for coverage where bugs would be silent (data round-trips and JSON contracts) — not 100%.
- **`cargo test`** for: migration runner, zip/unzip atomic save, command return types serialize cleanly.
- **Playwright e2e** for one smoke test only: new project → draw a bed → save → reopen → bed is there. Don't build a large e2e suite in v0.1.
- **TDD specifically for** §6.2 sketch cleanup validation and §5 schema migrations. Write the Zod schema test before the prompt. Write the migration test before the migration.
---
## 11. What "done" looks like
A `.app` on macOS 13+ where the user can: create a project, sketch their backyard freehand with labels, run AI cleanup to get editable beds/paths/structures, add plants from Permapeople with companion suggestions, log observations with photos, chat with a mystically-voiced coach about a selected bed, export a PDF plan, and reopen the project days later with everything intact.
Anything beyond that is v0.2.
