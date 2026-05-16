# GardenAngel Prompts

Living record of the coach system prompts, sketch-cleanup prompts, and
eval results. Each prompt revision should append a dated entry — never
edit-in-place a shipped prompt.

## Coach voice

*Not yet implemented. See Phase 5 in the canonical plan.*

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

No formal eval set yet (PLAN §7 eval discipline is Phase 5 / coach). Spot
results recorded with the next revision.

## Eval results

*No evals yet. Will populate when Phase 5 lands.*
