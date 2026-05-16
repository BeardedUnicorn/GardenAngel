-- GardenAngel schema v3
-- Paths get an optional stroke color (Phase-2 path tool enhancement).
-- Nullable: existing paths and the path tool fall back to the default
-- path color in the renderer when this is NULL.

ALTER TABLE paths ADD COLUMN color TEXT;
