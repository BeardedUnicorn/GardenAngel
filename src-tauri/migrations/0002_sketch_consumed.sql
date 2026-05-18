-- GardenAngel schema v2
-- Phase 3 (sketch cleanup): a stroke is "consumed" when AI cleanup promotes
-- it into a bed/path/structure. We keep the stroke row (ADR-006: stamped,
-- not deleted) and set consumed_at so the sketch layer can hide it while
-- the original ink remains recoverable.

ALTER TABLE sketch_strokes ADD COLUMN consumed_at TEXT;
