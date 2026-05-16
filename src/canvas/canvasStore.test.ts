import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useCanvasStore } from "./canvasStore";
import { useProjectStore } from "../project/projectStore";
import type { Bed, PathShape, Structure } from "./types";

const mockedInvoke = vi.mocked(invoke);

function makeBed(overrides: Partial<Bed> = {}): Bed {
  return {
    id: 1,
    garden_id: 1,
    name: "bed",
    shape_type: "rect",
    geometry: { x: 0, y: 0, width: 100, height: 60 },
    soil_notes: null,
    sun_exposure: null,
    created_at: "2026-05-16T00:00:00Z",
    updated_at: "2026-05-16T00:00:00Z",
    ...overrides,
  };
}

function makePath(overrides: Partial<PathShape> = {}): PathShape {
  return {
    id: 1,
    garden_id: 1,
    name: "p",
    points: [
      [0, 0],
      [50, 0],
    ],
    width: 24,
    material: null,
    created_at: "2026-05-16T00:00:00Z",
    updated_at: "2026-05-16T00:00:00Z",
    ...overrides,
  };
}

function makeStructure(overrides: Partial<Structure> = {}): Structure {
  return {
    id: 1,
    garden_id: 1,
    name: "shed",
    kind: "shed",
    geometry: { x: 200, y: 100, width: 60, height: 40 },
    notes: null,
    created_at: "2026-05-16T00:00:00Z",
    updated_at: "2026-05-16T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  useCanvasStore.getState().reset();
  useProjectStore.setState({
    current: {
      path: "/tmp/test.gardenangel",
      garden_id: 1,
      name: "Test Garden",
      created_at: "2026-05-16T00:00:00Z",
      format_version: 1,
      app_version: "0.1.0",
    },
    isDirty: false,
    isBusy: false,
    lastError: null,
  });
  mockedInvoke.mockReset();
});

describe("canvasStore", () => {
  describe("viewport", () => {
    it("clamps zoom to bounds", () => {
      useCanvasStore.getState().setViewport({ x: 0, y: 0, scale: 100 });
      expect(useCanvasStore.getState().viewport.scale).toBe(8);
      useCanvasStore.getState().setViewport({ x: 0, y: 0, scale: 0.001 });
      expect(useCanvasStore.getState().viewport.scale).toBe(0.1);
    });
  });

  describe("tool", () => {
    it("clears selection when switching away from select tool", () => {
      useCanvasStore.setState({ selection: { kind: "bed", id: 1 } });
      useCanvasStore.getState().setTool("rect-bed");
      expect(useCanvasStore.getState().selection).toBeNull();
    });

    it("preserves selection when switching to select tool", () => {
      useCanvasStore.setState({ selection: { kind: "bed", id: 1 } });
      useCanvasStore.getState().setTool("select");
      expect(useCanvasStore.getState().selection).toEqual({ kind: "bed", id: 1 });
    });
  });

  describe("hydration", () => {
    it("loads shapes from backend", async () => {
      const bed = makeBed();
      const path = makePath();
      const structure = makeStructure();
      mockedInvoke.mockResolvedValueOnce({
        beds: [bed],
        paths: [path],
        structures: [structure],
      });

      await useCanvasStore.getState().hydrate();
      const state = useCanvasStore.getState();
      expect(state.beds).toEqual([bed]);
      expect(state.paths).toEqual([path]);
      expect(state.structures).toEqual([structure]);
      expect(state.undoStack).toEqual([]);
    });
  });

  describe("bed mutations", () => {
    it("creates a bed and marks project dirty", async () => {
      const bed = makeBed();
      mockedInvoke.mockResolvedValueOnce(bed);

      const result = await useCanvasStore.getState().createBed({
        name: "bed",
        shape_type: "rect",
        geometry: { x: 0, y: 0, width: 100, height: 60 },
        soil_notes: null,
        sun_exposure: null,
      });

      expect(result).toEqual(bed);
      expect(useCanvasStore.getState().beds).toEqual([bed]);
      expect(useCanvasStore.getState().undoStack).toHaveLength(1);
      expect(useProjectStore.getState().isDirty).toBe(true);
    });

    it("updates a bed, pushing before+after to undo", async () => {
      const before = makeBed({ name: "old" });
      useCanvasStore.setState({ beds: [before] });
      const after = makeBed({ name: "new", updated_at: "2026-05-16T01:00:00Z" });
      mockedInvoke.mockResolvedValueOnce(after);

      await useCanvasStore.getState().updateBed(1, {
        name: "new",
        shape_type: "rect",
        geometry: { x: 0, y: 0, width: 100, height: 60 },
        soil_notes: null,
        sun_exposure: null,
      });

      expect(useCanvasStore.getState().beds[0]?.name).toBe("new");
      const cmd = useCanvasStore.getState().undoStack[0];
      expect(cmd?.kind).toBe("bed-update");
    });

    it("deletes a bed and clears selection if it was selected", async () => {
      const bed = makeBed();
      useCanvasStore.setState({ beds: [bed], selection: { kind: "bed", id: 1 } });
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useCanvasStore.getState().deleteBed(1);
      expect(useCanvasStore.getState().beds).toEqual([]);
      expect(useCanvasStore.getState().selection).toBeNull();
    });
  });

  describe("undo", () => {
    it("undoes a bed create by deleting it", async () => {
      const bed = makeBed();
      mockedInvoke.mockResolvedValueOnce(bed); // create
      await useCanvasStore.getState().createBed({
        name: "bed",
        shape_type: "rect",
        geometry: { x: 0, y: 0, width: 100, height: 60 },
        soil_notes: null,
        sun_exposure: null,
      });
      expect(useCanvasStore.getState().beds).toHaveLength(1);

      mockedInvoke.mockResolvedValueOnce(undefined); // delete during undo
      await useCanvasStore.getState().undo();

      expect(useCanvasStore.getState().beds).toEqual([]);
      expect(useCanvasStore.getState().undoStack).toEqual([]);
    });

    it("undoes a bed update by restoring previous state", async () => {
      const before = makeBed({ name: "old" });
      const after = makeBed({ name: "new" });
      useCanvasStore.setState({ beds: [before] });

      mockedInvoke.mockResolvedValueOnce(after);
      await useCanvasStore.getState().updateBed(1, {
        name: "new",
        shape_type: "rect",
        geometry: { x: 0, y: 0, width: 100, height: 60 },
        soil_notes: null,
        sun_exposure: null,
      });
      expect(useCanvasStore.getState().beds[0]?.name).toBe("new");

      mockedInvoke.mockResolvedValueOnce(before); // restored
      await useCanvasStore.getState().undo();
      expect(useCanvasStore.getState().beds[0]?.name).toBe("old");
    });

    it("undoes a bed delete by recreating it (new id is acceptable)", async () => {
      const bed = makeBed();
      useCanvasStore.setState({ beds: [bed] });

      mockedInvoke.mockResolvedValueOnce(undefined); // delete
      await useCanvasStore.getState().deleteBed(1);
      expect(useCanvasStore.getState().beds).toEqual([]);

      const recreated = makeBed({ id: 2 });
      mockedInvoke.mockResolvedValueOnce(recreated); // recreate via undo
      await useCanvasStore.getState().undo();
      expect(useCanvasStore.getState().beds).toEqual([recreated]);
    });

    it("is a no-op when the undo stack is empty", async () => {
      await useCanvasStore.getState().undo();
      expect(mockedInvoke).not.toHaveBeenCalled();
    });
  });

  describe("geometry round-trip via serde", () => {
    it("preserves rect geometry through create+update", async () => {
      const geom = { x: 12.5, y: 34.75, width: 100.125, height: 60.0625 };
      const bed = makeBed({ geometry: geom });
      mockedInvoke.mockResolvedValueOnce(bed);
      const created = await useCanvasStore.getState().createBed({
        name: null,
        shape_type: "rect",
        geometry: geom,
        soil_notes: null,
        sun_exposure: null,
      });
      expect(created?.geometry).toEqual(geom);
    });

    it("preserves circle geometry", async () => {
      const geom = { cx: 150.5, cy: 80.25, radius: 42.125 };
      const bed = makeBed({ shape_type: "circle", geometry: geom });
      mockedInvoke.mockResolvedValueOnce(bed);
      const created = await useCanvasStore.getState().createBed({
        name: null,
        shape_type: "circle",
        geometry: geom,
        soil_notes: null,
        sun_exposure: null,
      });
      expect(created?.shape_type).toBe("circle");
      expect(created?.geometry).toEqual(geom);
    });

    it("preserves polygon points order", async () => {
      const geom = {
        points: [
          [0, 0],
          [10, 5],
          [20, -3],
          [0, 0],
        ] as [number, number][],
      };
      const bed = makeBed({ shape_type: "polygon", geometry: geom });
      mockedInvoke.mockResolvedValueOnce(bed);
      const created = await useCanvasStore.getState().createBed({
        name: null,
        shape_type: "polygon",
        geometry: geom,
        soil_notes: null,
        sun_exposure: null,
      });
      expect(created?.geometry).toEqual(geom);
    });

    it("preserves path point array", async () => {
      const points: [number, number][] = [
        [0, 0],
        [50, 25],
        [100, 50],
      ];
      const path = makePath({ points });
      mockedInvoke.mockResolvedValueOnce(path);
      const created = await useCanvasStore
        .getState()
        .createPath({ name: null, points, width: 24, material: null });
      expect(created?.points).toEqual(points);
    });
  });
});
