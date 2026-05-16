import { invoke } from "@tauri-apps/api/core";
import type {
  Bed,
  BedInput,
  PathInput,
  PathShape,
  ShapesSnapshot,
  Structure,
  StructureInput,
} from "./types";

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
};
