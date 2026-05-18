# GardenAngel Prompts

Living record of the coach system prompts, sketch-cleanup prompts, and
eval results. Each prompt revision should append a dated entry — never
edit-in-place a shipped prompt.

## Coach voice

### Rev 1 — 2026-05-16 (Phase 5, shipped)

Two registers in `src/coach/prompts/systemPrompts.ts`, sharing a common
practical-first / no-folklore / safety-refusal tail (`COACH_COMMON`):

- `COACH_MYSTICAL_PROMPT` (default) — anchored on Mike's "Falling Bird"
  voice: grounded but symbolic (plants as kin, seasons as liturgy),
  archaic but not purple, never invents folklore.
- `COACH_PLAIN_PROMPT` (toggle) — clinical-but-warm, no symbolic
  register.

Voice persists to the `settings` table (`coach_voice`) and applies on
the next message (ADR-010). Context assembled per §6.4 by
`assembleCoachMessages`. Full text is single-sourced in the constants —
append a "Rev 2" here when it changes; never edit Rev 1.

## Eval results

Manual set: `src/coach/__evals__/evalSet.ts` (10 prompts — companion,
observation, schedule, beginner, ambiguous, refusal×2). No automated
judge in v0.1 (no telemetry, no judge model). Run by hand when the
coach prompt or model changes and record dated observations below.

*No eval run recorded yet (needs a live model + API key).*

## Sketch cleanup

### Rev 1 — 2026-05-16 (Phase 3, shipped)

Lives in `src/coach/prompts/systemPrompts.ts` as `CLEANUP_SYSTEM_PROMPT`.
Called with `temperature: 0`, `response_format: { type: "json_object" }`;
output Zod-validated by `cleanupOutputSchema` before it can touch the DB
(ADR-005). User message = JSON `{ canvas_bounds, scale_reference?,
strokes:[{id,label,closed,points}] }`.

Design intent:
- Geometry tidying, not creativity: snap to the simplest shape the label
  + form imply; preserve position/size; never invent shapes without a
  source stroke.
- Label routing: bed-ish closed strokes → `beds` (rect/circle/polygon by
  form); `path`/`walkway` open strokes → `paths`; built features
  (`shed`/`fence`/`water`/`compost`/`tree`/other) → `structures`.
- Ambiguous strokes are skipped with a human-readable `warnings` entry
  rather than guessed.
- Output is JSON only, exactly the §6.2 shape; geometry must match
  `shape_type`.

Full current text: see the constant in source (kept single-sourced there
to avoid drift). Append a "Rev 2" section here when it changes — do not
edit Rev 1.

No formal eval set for cleanup (PLAN §7 eval discipline targets the
coach). Spot results recorded with the next revision.
