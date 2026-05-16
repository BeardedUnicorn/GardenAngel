import { invoke } from "@tauri-apps/api/core";
import type {
  Bed,
  BedInput,
  PathInput,
  PathShape,
  ShapesSnapshot,
  SketchStroke,
  Structure,
  StructureInput,
  StrokeInput,
} from "./types";

export interface CleanupApplyPayload {
  beds: BedInput[];
  paths: PathInput[];
  structures: StructureInput[];
  consumed_stroke_ids: number[];
}

export interface CleanupApplyResult {
  beds: Bed[];
  paths: PathShape[];
  structures: Structure[];
  consumed_stroke_ids: number[];
}

export const shapesApi = {
  list: () => invoke<ShapesSnapshot>("shapes_list"),

  bedCreate: (input: BedInput) => invoke<Bed>("bed_create", { input }),
  bedUpdate: (id: number, input: BedInput) => invoke<Bed>("bed_update", { id, input }),
  bedDelete: (id: number) => invoke<void>("bed_delete", { id }),

  pathCreate: (input: PathInput) => invoke<PathShape>("path_create", { input }),
  pathUpdate: (id: number, input: PathInput) => invoke<PathShape>("path_update", { id, input }),
  pathDelete: (id: number) => invoke<void>("path_delete", { id }),

  structureCreate: (input: StructureInput) =>
    invoke<Structure>("structure_create", { input }),
  structureUpdate: (id: number, input: StructureInput) =>
    invoke<Structure>("structure_update", { id, input }),
  structureDelete: (id: number) => invoke<void>("structure_delete", { id }),

  strokesList: () => invoke<SketchStroke[]>("strokes_list"),
  strokeCreate: (input: StrokeInput) => invoke<SketchStroke>("stroke_create", { input }),
  strokeUpdate: (id: number, input: StrokeInput) =>
    invoke<SketchStroke>("stroke_update", { id, input }),
  strokeDelete: (id: number) => invoke<void>("stroke_delete", { id }),
  applyCleanup: (apply: CleanupApplyPayload) =>
    invoke<CleanupApplyResult>("sketch_apply_cleanup", { apply }),
};
