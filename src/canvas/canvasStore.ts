import { create } from "zustand";
import { useProjectStore } from "../project/projectStore";
import { shapesApi } from "./shapesApi";
import {
  DEFAULT_VIEWPORT,
  MAX_SCALE,
  MIN_SCALE,
  type Bed,
  type BedInput,
  type PathInput,
  type PathShape,
  type Selection,
  type ShapesSnapshot,
  type Structure,
  type StructureInput,
  type Tool,
  type Viewport,
} from "./types";

type UndoCommand =
  | { kind: "bed-create"; bed: Bed }
  | { kind: "bed-update"; before: Bed; after: Bed }
  | { kind: "bed-delete"; bed: Bed }
  | { kind: "path-create"; path: PathShape }
  | { kind: "path-update"; before: PathShape; after: PathShape }
  | { kind: "path-delete"; path: PathShape }
  | { kind: "structure-create"; structure: Structure }
  | { kind: "structure-update"; before: Structure; after: Structure }
  | { kind: "structure-delete"; structure: Structure };

interface CanvasState {
  viewport: Viewport;
  tool: Tool;
  beds: Bed[];
  paths: PathShape[];
  structures: Structure[];
  selection: Selection | null;
  undoStack: UndoCommand[];
  isHydrating: boolean;
  lastError: string | null;
}

interface CanvasActions {
  setViewport: (v: Viewport) => void;
  setTool: (t: Tool) => void;
  select: (s: Selection | null) => void;
  hydrate: () => Promise<void>;
  reset: () => void;

  createBed: (input: BedInput) => Promise<Bed | null>;
  updateBed: (id: number, input: BedInput) => Promise<Bed | null>;
  deleteBed: (id: number) => Promise<void>;

  createPath: (input: PathInput) => Promise<PathShape | null>;
  updatePath: (id: number, input: PathInput) => Promise<PathShape | null>;
  deletePath: (id: number) => Promise<void>;

  createStructure: (input: StructureInput) => Promise<Structure | null>;
  updateStructure: (id: number, input: StructureInput) => Promise<Structure | null>;
  deleteStructure: (id: number) => Promise<void>;

  undo: () => Promise<void>;
  canUndo: () => boolean;
  clearError: () => void;
}

const initialState: CanvasState = {
  viewport: DEFAULT_VIEWPORT,
  tool: "select",
  beds: [],
  paths: [],
  structures: [],
  selection: null,
  undoStack: [],
  isHydrating: false,
  lastError: null,
};

function bedToInput(bed: Bed): BedInput {
  return {
    name: bed.name,
    shape_type: bed.shape_type,
    geometry: bed.geometry,
    soil_notes: bed.soil_notes,
    sun_exposure: bed.sun_exposure,
  };
}

function pathToInput(path: PathShape): PathInput {
  return {
    name: path.name,
    points: path.points,
    width: path.width,
    material: path.material,
  };
}

function structureToInput(structure: Structure): StructureInput {
  return {
    name: structure.name,
    kind: structure.kind,
    geometry: structure.geometry,
    notes: structure.notes,
  };
}

function replaceById<T extends { id: number }>(arr: T[], next: T): T[] {
  return arr.map((item) => (item.id === next.id ? next : item));
}

function removeById<T extends { id: number }>(arr: T[], id: number): T[] {
  return arr.filter((item) => item.id !== id);
}

function errToString(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return JSON.stringify(err);
}

function markDirty() {
  useProjectStore.getState().markDirty();
}

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
  ...initialState,

  setViewport: (v) => {
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale));
    set({ viewport: { ...v, scale } });
  },

  setTool: (t) => set({ tool: t, selection: t === "select" ? get().selection : null }),

  select: (s) => set({ selection: s }),

  reset: () => set({ ...initialState }),

  async hydrate() {
    set({ isHydrating: true, lastError: null });
    try {
      const snap: ShapesSnapshot = await shapesApi.list();
      set({
        beds: snap.beds,
        paths: snap.paths,
        structures: snap.structures,
        selection: null,
        undoStack: [],
      });
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ isHydrating: false });
    }
  },

  // ---- Bed ----
  async createBed(input) {
    try {
      const bed = await shapesApi.bedCreate(input);
      set((s) => ({
        beds: [...s.beds, bed],
        undoStack: [...s.undoStack, { kind: "bed-create", bed }],
      }));
      markDirty();
      return bed;
    } catch (err) {
      set({ lastError: errToString(err) });
      return null;
    }
  },

  async updateBed(id, input) {
    const before = get().beds.find((b) => b.id === id);
    if (!before) return null;
    try {
      const after = await shapesApi.bedUpdate(id, input);
      set((s) => ({
        beds: replaceById(s.beds, after),
        undoStack: [...s.undoStack, { kind: "bed-update", before, after }],
      }));
      markDirty();
      return after;
    } catch (err) {
      set({ lastError: errToString(err) });
      return null;
    }
  },

  async deleteBed(id) {
    const bed = get().beds.find((b) => b.id === id);
    if (!bed) return;
    try {
      await shapesApi.bedDelete(id);
      set((s) => ({
        beds: removeById(s.beds, id),
        selection: s.selection?.kind === "bed" && s.selection.id === id ? null : s.selection,
        undoStack: [...s.undoStack, { kind: "bed-delete", bed }],
      }));
      markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    }
  },

  // ---- Path ----
  async createPath(input) {
    try {
      const path = await shapesApi.pathCreate(input);
      set((s) => ({
        paths: [...s.paths, path],
        undoStack: [...s.undoStack, { kind: "path-create", path }],
      }));
      markDirty();
      return path;
    } catch (err) {
      set({ lastError: errToString(err) });
      return null;
    }
  },

  async updatePath(id, input) {
    const before = get().paths.find((p) => p.id === id);
    if (!before) return null;
    try {
      const after = await shapesApi.pathUpdate(id, input);
      set((s) => ({
        paths: replaceById(s.paths, after),
        undoStack: [...s.undoStack, { kind: "path-update", before, after }],
      }));
      markDirty();
      return after;
    } catch (err) {
      set({ lastError: errToString(err) });
      return null;
    }
  },

  async deletePath(id) {
    const path = get().paths.find((p) => p.id === id);
    if (!path) return;
    try {
      await shapesApi.pathDelete(id);
      set((s) => ({
        paths: removeById(s.paths, id),
        selection: s.selection?.kind === "path" && s.selection.id === id ? null : s.selection,
        undoStack: [...s.undoStack, { kind: "path-delete", path }],
      }));
      markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    }
  },

  // ---- Structure ----
  async createStructure(input) {
    try {
      const structure = await shapesApi.structureCreate(input);
      set((s) => ({
        structures: [...s.structures, structure],
        undoStack: [...s.undoStack, { kind: "structure-create", structure }],
      }));
      markDirty();
      return structure;
    } catch (err) {
      set({ lastError: errToString(err) });
      return null;
    }
  },

  async updateStructure(id, input) {
    const before = get().structures.find((s) => s.id === id);
    if (!before) return null;
    try {
      const after = await shapesApi.structureUpdate(id, input);
      set((s) => ({
        structures: replaceById(s.structures, after),
        undoStack: [...s.undoStack, { kind: "structure-update", before, after }],
      }));
      markDirty();
      return after;
    } catch (err) {
      set({ lastError: errToString(err) });
      return null;
    }
  },

  async deleteStructure(id) {
    const structure = get().structures.find((s) => s.id === id);
    if (!structure) return;
    try {
      await shapesApi.structureDelete(id);
      set((s) => ({
        structures: removeById(s.structures, id),
        selection:
          s.selection?.kind === "structure" && s.selection.id === id ? null : s.selection,
        undoStack: [...s.undoStack, { kind: "structure-delete", structure }],
      }));
      markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    }
  },

  // ---- Undo ----
  canUndo: () => get().undoStack.length > 0,

  async undo() {
    const stack = get().undoStack;
    if (stack.length === 0) return;
    const cmd = stack[stack.length - 1]!;

    try {
      switch (cmd.kind) {
        case "bed-create": {
          await shapesApi.bedDelete(cmd.bed.id);
          set((s) => ({
            beds: removeById(s.beds, cmd.bed.id),
            undoStack: s.undoStack.slice(0, -1),
          }));
          break;
        }
        case "bed-update": {
          const restored = await shapesApi.bedUpdate(cmd.before.id, bedToInput(cmd.before));
          set((s) => ({
            beds: replaceById(s.beds, restored),
            undoStack: s.undoStack.slice(0, -1),
          }));
          break;
        }
        case "bed-delete": {
          const recreated = await shapesApi.bedCreate(bedToInput(cmd.bed));
          set((s) => ({
            beds: [...s.beds, recreated],
            undoStack: s.undoStack.slice(0, -1),
          }));
          break;
        }
        case "path-create": {
          await shapesApi.pathDelete(cmd.path.id);
          set((s) => ({
            paths: removeById(s.paths, cmd.path.id),
            undoStack: s.undoStack.slice(0, -1),
          }));
          break;
        }
        case "path-update": {
          const restored = await shapesApi.pathUpdate(cmd.before.id, pathToInput(cmd.before));
          set((s) => ({
            paths: replaceById(s.paths, restored),
            undoStack: s.undoStack.slice(0, -1),
          }));
          break;
        }
        case "path-delete": {
          const recreated = await shapesApi.pathCreate(pathToInput(cmd.path));
          set((s) => ({
            paths: [...s.paths, recreated],
            undoStack: s.undoStack.slice(0, -1),
          }));
          break;
        }
        case "structure-create": {
          await shapesApi.structureDelete(cmd.structure.id);
          set((s) => ({
            structures: removeById(s.structures, cmd.structure.id),
            undoStack: s.undoStack.slice(0, -1),
          }));
          break;
        }
        case "structure-update": {
          const restored = await shapesApi.structureUpdate(
            cmd.before.id,
            structureToInput(cmd.before),
          );
          set((s) => ({
            structures: replaceById(s.structures, restored),
            undoStack: s.undoStack.slice(0, -1),
          }));
          break;
        }
        case "structure-delete": {
          const recreated = await shapesApi.structureCreate(structureToInput(cmd.structure));
          set((s) => ({
            structures: [...s.structures, recreated],
            undoStack: s.undoStack.slice(0, -1),
          }));
          break;
        }
      }
      markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    }
  },

  clearError: () => set({ lastError: null }),
}));
