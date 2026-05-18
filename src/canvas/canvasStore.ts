import { create } from "zustand";
import { useProjectStore } from "../project/projectStore";
import { useSettingsStore } from "../settings/settingsStore";
import { createOpenAiCompatAdapter } from "../ai/openaiCompatAdapter";
import {
  CleanupError,
  runSketchCleanup,
  type CleanupOutput,
  type CleanupRequestInput,
} from "../ai/sketchCleanupClient";
import { shapesApi, type CleanupApplyPayload } from "./shapesApi";
import {
  DEFAULT_VIEWPORT,
  MAX_SCALE,
  MIN_SCALE,
  type Bed,
  type BedInput,
  type CanvasMode,
  type PathInput,
  type PathShape,
  type Selection,
  type ShapesSnapshot,
  type SketchStroke,
  type Structure,
  type StructureInput,
  type StrokeInput,
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
  mode: CanvasMode;
  viewport: Viewport;
  tool: Tool;
  beds: Bed[];
  paths: PathShape[];
  structures: Structure[];
  strokes: SketchStroke[];
  selection: Selection | null;
  undoStack: UndoCommand[];
  isHydrating: boolean;
  lastError: string | null;
  // Sketch cleanup flow (PLAN §6.2). Preview is held until the user
  // applies or cancels; nothing touches the DB until apply.
  cleanupBusy: boolean;
  cleanupPreview: CleanupOutput | null;
  cleanupWarnings: string[];
  // Stroke whose label dialog is open (just-drawn, awaiting "this is a…").
  labelingStrokeId: number | null;
}

interface CanvasActions {
  setMode: (m: CanvasMode) => void;
  setViewport: (v: Viewport) => void;
  setTool: (t: Tool) => void;
  select: (s: Selection | null) => void;
  hydrate: () => Promise<void>;
  reset: () => void;

  createStroke: (input: StrokeInput) => Promise<SketchStroke | null>;
  deleteStroke: (id: number) => Promise<void>;
  updateStrokeLabel: (id: number, label: string | null) => Promise<void>;
  setLabelingStroke: (id: number | null) => void;

  runCleanup: (canvasBounds: { width: number; height: number }) => Promise<void>;
  applyCleanup: () => Promise<void>;
  cancelCleanup: () => void;

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
  mode: "sketch",
  viewport: DEFAULT_VIEWPORT,
  tool: "select",
  beds: [],
  paths: [],
  structures: [],
  strokes: [],
  selection: null,
  undoStack: [],
  isHydrating: false,
  lastError: null,
  cleanupBusy: false,
  cleanupPreview: null,
  cleanupWarnings: [],
  labelingStrokeId: null,
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
    color: path.color,
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

  setMode: (m) => set({ mode: m, selection: null, tool: "select" }),

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
      const [snap, strokes]: [ShapesSnapshot, SketchStroke[]] = await Promise.all([
        shapesApi.list(),
        shapesApi.strokesList(),
      ]);
      const activeStrokes = strokes.filter((s) => s.consumed_at === null);
      const hasShapes =
        snap.beds.length + snap.paths.length + snap.structures.length > 0;
      set({
        beds: snap.beds,
        paths: snap.paths,
        structures: snap.structures,
        strokes: activeStrokes,
        // Land in plan mode if the project already has structured shapes,
        // otherwise sketch mode to start drawing.
        mode: hasShapes ? "plan" : "sketch",
        tool: "select",
        selection: null,
        undoStack: [],
        cleanupPreview: null,
        cleanupWarnings: [],
      });
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ isHydrating: false });
    }
  },

  // ---- Sketch strokes ----
  async createStroke(input) {
    try {
      const stroke = await shapesApi.strokeCreate(input);
      set((s) => ({ strokes: [...s.strokes, stroke] }));
      markDirty();
      return stroke;
    } catch (err) {
      set({ lastError: errToString(err) });
      return null;
    }
  },

  async deleteStroke(id) {
    try {
      await shapesApi.strokeDelete(id);
      set((s) => ({ strokes: removeById(s.strokes, id) }));
      markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    }
  },

  async updateStrokeLabel(id, label) {
    const stroke = get().strokes.find((s) => s.id === id);
    if (!stroke) return;
    try {
      const updated = await shapesApi.strokeUpdate(id, {
        label,
        points: stroke.points,
        color: stroke.color,
        width: stroke.width,
        closed: stroke.closed,
      });
      set((s) => ({ strokes: replaceById(s.strokes, updated) }));
      markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    }
  },

  // ---- AI sketch cleanup (PLAN §6.2) ----
  async runCleanup(canvasBounds) {
    const strokes = get().strokes;
    if (strokes.length === 0) {
      set({ lastError: "Nothing to clean up — sketch some regions first." });
      return;
    }
    set({ cleanupBusy: true, lastError: null });
    try {
      const config = await useSettingsStore.getState().resolveConfig();
      const adapter = createOpenAiCompatAdapter(config);
      const input: CleanupRequestInput = {
        canvas_bounds: canvasBounds,
        strokes: strokes.map((s) => ({
          id: s.id,
          label: s.label,
          closed: s.closed,
          points: s.points,
        })),
      };
      const output = await runSketchCleanup(adapter, config.model, input);
      set({ cleanupPreview: output, cleanupWarnings: output.warnings });
    } catch (err) {
      if (err instanceof CleanupError) {
        set({ lastError: err.message, cleanupWarnings: err.warnings });
      } else {
        set({ lastError: errToString(err) });
      }
    } finally {
      set({ cleanupBusy: false });
    }
  },

  setLabelingStroke: (id) => set({ labelingStrokeId: id }),

  cancelCleanup: () => set({ cleanupPreview: null, cleanupWarnings: [] }),

  async applyCleanup() {
    const preview = get().cleanupPreview;
    if (!preview) return;
    const activeIds = new Set(get().strokes.map((s) => s.id));
    const consumed = new Set<number>();
    const collect = (ids: number[]) =>
      ids.forEach((id) => {
        if (activeIds.has(id)) consumed.add(id);
      });

    const payload: CleanupApplyPayload = {
      beds: preview.beds.map((b) => {
        collect(b.source_stroke_ids);
        return {
          name: null,
          shape_type: b.shape_type,
          geometry: b.geometry,
          soil_notes: null,
          sun_exposure: null,
        };
      }),
      paths: preview.paths.map((p) => {
        collect(p.source_stroke_ids);
        return {
          name: null,
          points: p.points,
          width: p.width,
          material: null,
          color: null,
        };
      }),
      structures: preview.structures.map((st) => {
        collect(st.source_stroke_ids);
        return { name: null, kind: st.kind, geometry: st.geometry, notes: null };
      }),
      consumed_stroke_ids: [...consumed],
    };

    set({ cleanupBusy: true, lastError: null });
    try {
      const result = await shapesApi.applyCleanup(payload);
      const consumedSet = new Set(result.consumed_stroke_ids);
      set((s) => ({
        beds: [...s.beds, ...result.beds],
        paths: [...s.paths, ...result.paths],
        structures: [...s.structures, ...result.structures],
        strokes: s.strokes.filter((stroke) => !consumedSet.has(stroke.id)),
        cleanupPreview: null,
        cleanupWarnings: [],
        // Cleanup is a bulk op outside the undo stack (ADR-007); the
        // user reviews it in the preview before it ever lands.
        undoStack: [],
        mode: "plan",
        tool: "select",
        selection: null,
      }));
      markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ cleanupBusy: false });
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
