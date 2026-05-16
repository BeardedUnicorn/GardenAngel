export type RectGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PolygonGeometry = {
  points: [number, number][];
};

export type CircleGeometry = {
  cx: number;
  cy: number;
  radius: number;
};

export type BedShapeType = "rect" | "polygon" | "circle";
export type BedGeometry = RectGeometry | PolygonGeometry | CircleGeometry;

export type SunExposure = "full" | "partial" | "shade";

export interface Bed {
  id: number;
  garden_id: number;
  name: string | null;
  shape_type: BedShapeType;
  geometry: BedGeometry;
  soil_notes: string | null;
  sun_exposure: SunExposure | null;
  created_at: string;
  updated_at: string;
}

export interface BedInput {
  name: string | null;
  shape_type: BedShapeType;
  geometry: BedGeometry;
  soil_notes: string | null;
  sun_exposure: SunExposure | null;
}

export interface PathShape {
  id: number;
  garden_id: number;
  name: string | null;
  points: [number, number][];
  width: number;
  material: string | null;
  created_at: string;
  updated_at: string;
}

export interface PathInput {
  name: string | null;
  points: [number, number][];
  width: number;
  material: string | null;
}

export type StructureKind = "shed" | "fence" | "water" | "compost" | "tree" | "other";

export type StructureGeometry = RectGeometry | PolygonGeometry | CircleGeometry;

export interface Structure {
  id: number;
  garden_id: number;
  name: string | null;
  kind: StructureKind;
  geometry: StructureGeometry;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StructureInput {
  name: string | null;
  kind: StructureKind;
  geometry: StructureGeometry;
  notes: string | null;
}

export interface ShapesSnapshot {
  beds: Bed[];
  paths: PathShape[];
  structures: Structure[];
}

export type Tool =
  | "select"
  | "freehand"
  | "rect-bed"
  | "circle-bed"
  | "polygon-bed"
  | "path"
  | "structure"
  | "tree";

export type CanvasMode = "sketch" | "plan";

export interface SketchStroke {
  id: number;
  garden_id: number;
  label: string | null;
  points: [number, number][];
  color: string | null;
  width: number | null;
  closed: boolean;
  created_at: string;
  consumed_at: string | null;
}

export interface StrokeInput {
  label: string | null;
  points: [number, number][];
  color: string | null;
  width: number | null;
  closed: boolean;
}

export type ShapeKind = "bed" | "path" | "structure";

export interface Selection {
  kind: ShapeKind;
  id: number;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export const DEFAULT_PATH_WIDTH = 24;
export const DEFAULT_STRUCTURE_KIND: StructureKind = "shed";
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
