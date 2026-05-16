-- GardenAngel schema v1
-- Designed to accommodate deferred v0.1 features (succession, rotation,
-- perennial state). Only the surfaced columns are exercised in v0.1.

CREATE TABLE gardens (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  zone TEXT,
  last_frost_date TEXT,
  first_frost_date TEXT,
  latitude REAL,
  longitude REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sketch_strokes (
  id INTEGER PRIMARY KEY,
  garden_id INTEGER NOT NULL REFERENCES gardens(id),
  label TEXT,
  points_json TEXT NOT NULL,
  color TEXT,
  width REAL,
  closed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE beds (
  id INTEGER PRIMARY KEY,
  garden_id INTEGER NOT NULL REFERENCES gardens(id),
  name TEXT,
  shape_type TEXT NOT NULL,
  geometry_json TEXT NOT NULL,
  soil_notes TEXT,
  sun_exposure TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE paths (
  id INTEGER PRIMARY KEY,
  garden_id INTEGER NOT NULL REFERENCES gardens(id),
  name TEXT,
  points_json TEXT NOT NULL,
  width REAL NOT NULL,
  material TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE structures (
  id INTEGER PRIMARY KEY,
  garden_id INTEGER NOT NULL REFERENCES gardens(id),
  name TEXT,
  kind TEXT NOT NULL,
  geometry_json TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE plantings (
  id INTEGER PRIMARY KEY,
  bed_id INTEGER NOT NULL REFERENCES beds(id),
  plant_id TEXT NOT NULL,
  planted_at TEXT,
  harvested_at TEXT,
  quantity INTEGER,
  position_json TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE plant_cache (
  external_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  common_name TEXT NOT NULL,
  scientific_name TEXT,
  data_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE observations (
  id INTEGER PRIMARY KEY,
  garden_id INTEGER NOT NULL REFERENCES gardens(id),
  bed_id INTEGER REFERENCES beds(id),
  planting_id INTEGER REFERENCES plantings(id),
  body TEXT NOT NULL,
  photo_path TEXT,
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
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_plantings_bed ON plantings(bed_id);
CREATE INDEX idx_observations_garden ON observations(garden_id);
CREATE INDEX idx_coach_messages_conv ON coach_messages(conversation_id);
