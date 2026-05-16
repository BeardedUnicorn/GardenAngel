import { useEffect, useRef, useState } from "react";
import { Circle, Layer, Line, Rect, Stage } from "react-konva";
import type Konva from "konva";
import { useCanvasStore } from "./canvasStore";
import { BedShape } from "./shapes/BedShape";
import { PathShapeView } from "./shapes/PathShapeView";
import { StructureShape } from "./shapes/StructureShape";
import { StrokeShape } from "./shapes/StrokeShape";
import { VertexEditor } from "./VertexEditor";
import { stageRegistry } from "./stageRegistry";
import {
  DEFAULT_PATH_COLOR,
  DEFAULT_PATH_WIDTH,
  DEFAULT_STRUCTURE_KIND,
  MAX_SCALE,
  MIN_SCALE,
  type LineStructureKind,
  type Tool,
} from "./types";

const ZOOM_FACTOR = 1.05;
const MIN_RECT_SIZE = 4;
const MIN_CIRCLE_RADIUS = 4;
const MIN_POLY_VERTICES = 3;
const MIN_PATH_VERTICES = 2;
const POLYGON_CLOSE_RADIUS = 8;
// Freehand: drop near-duplicate points, and treat a stroke as a closed
// region if it ends near where it started with enough points.
const FREEHAND_MIN_STEP = 3;
const FREEHAND_CLOSE_DIST = 18;
const FREEHAND_MIN_POINTS = 4;

type DrawingState =
  | { kind: "idle" }
  | { kind: "rect"; start: [number, number]; end: [number, number]; for: "bed" | "structure" }
  | { kind: "circle"; center: [number, number]; cursor: [number, number]; for: "bed" | "tree" }
  | { kind: "polygon"; points: [number, number][]; cursor: [number, number] | null }
  | { kind: "path"; points: [number, number][]; cursor: [number, number] | null }
  | {
      kind: "linestruct";
      points: [number, number][];
      cursor: [number, number] | null;
      structKind: LineStructureKind;
    }
  | { kind: "freehand"; points: [number, number][] };

function rectFromDrag(
  start: [number, number],
  end: [number, number],
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(start[0], end[0]),
    y: Math.min(start[1], end[1]),
    width: Math.abs(end[0] - start[0]),
    height: Math.abs(end[1] - start[1]),
  };
}

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [drawing, setDrawing] = useState<DrawingState>({ kind: "idle" });

  const mode = useCanvasStore((s) => s.mode);
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const beds = useCanvasStore((s) => s.beds);
  const paths = useCanvasStore((s) => s.paths);
  const structures = useCanvasStore((s) => s.structures);
  const strokes = useCanvasStore((s) => s.strokes);
  const selection = useCanvasStore((s) => s.selection);
  const select = useCanvasStore((s) => s.select);
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  const createBed = useCanvasStore((s) => s.createBed);
  const createPath = useCanvasStore((s) => s.createPath);
  const createStructure = useCanvasStore((s) => s.createStructure);
  const deleteBed = useCanvasStore((s) => s.deleteBed);
  const deletePath = useCanvasStore((s) => s.deletePath);
  const deleteStructure = useCanvasStore((s) => s.deleteStructure);
  const createStroke = useCanvasStore((s) => s.createStroke);
  const setLabelingStroke = useCanvasStore((s) => s.setLabelingStroke);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Publish the live stage for PDF export; clear on unmount.
  useEffect(() => {
    stageRegistry.current = stageRef.current;
    return () => {
      stageRegistry.current = null;
    };
  });

  // Cancel any in-progress drawing when the tool or mode changes.
  useEffect(() => {
    setDrawing({ kind: "idle" });
  }, [tool, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === "Escape") {
        setDrawing({ kind: "idle" });
        return;
      }

      if (e.key === "Enter") {
        commitInProgress();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (
          drawing.kind === "polygon" ||
          drawing.kind === "path" ||
          drawing.kind === "linestruct"
        ) {
          if (drawing.points.length > 0) {
            setDrawing({ ...drawing, points: drawing.points.slice(0, -1) });
          }
          e.preventDefault();
          return;
        }
        if (selection) {
          e.preventDefault();
          if (selection.kind === "bed") void deleteBed(selection.id);
          if (selection.kind === "path") void deletePath(selection.id);
          if (selection.kind === "structure") void deleteStructure(selection.id);
        }
        return;
      }

      if (e.metaKey || e.ctrlKey) return;
      const sketchMap: Record<string, Tool> = { v: "select", f: "freehand" };
      const planMap: Record<string, Tool> = {
        v: "select",
        r: "rect-bed",
        c: "circle-bed",
        p: "polygon-bed",
        t: "path",
        s: "structure",
        o: "tree",
        e: "fence",
        l: "trellis",
      };
      const next = (mode === "sketch" ? sketchMap : planMap)[e.key.toLowerCase()];
      if (next) setTool(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, selection, tool, mode]);

  function screenToWorld(): [number, number] | null {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return [
      (pointer.x - viewport.x) / viewport.scale,
      (pointer.y - viewport.y) / viewport.scale,
    ];
  }

  async function finishFreehand(points: [number, number][]) {
    if (points.length < FREEHAND_MIN_POINTS) {
      setDrawing({ kind: "idle" });
      return;
    }
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const span = Math.hypot(last[0] - first[0], last[1] - first[1]) * viewport.scale;
    const closed = span <= FREEHAND_CLOSE_DIST;
    const pts = closed ? points.slice(0, -1) : points;
    setDrawing({ kind: "idle" });
    const stroke = await createStroke({
      label: null,
      points: pts,
      color: null,
      width: 2,
      closed,
    });
    if (stroke) setLabelingStroke(stroke.id);
  }

  function commitInProgress() {
    if (drawing.kind === "freehand") {
      void finishFreehand(drawing.points);
      return;
    }
    if (drawing.kind === "rect") {
      const { x, y, width, height } = rectFromDrag(drawing.start, drawing.end);
      if (width < MIN_RECT_SIZE || height < MIN_RECT_SIZE) {
        setDrawing({ kind: "idle" });
        return;
      }
      if (drawing.for === "bed") {
        void createBed({
          name: null,
          shape_type: "rect",
          geometry: { x, y, width, height },
          soil_notes: null,
          sun_exposure: null,
        });
      } else {
        void createStructure({
          name: null,
          kind: DEFAULT_STRUCTURE_KIND,
          geometry: { x, y, width, height },
          notes: null,
        });
      }
      setDrawing({ kind: "idle" });
      return;
    }
    if (drawing.kind === "circle") {
      const dx = drawing.cursor[0] - drawing.center[0];
      const dy = drawing.cursor[1] - drawing.center[1];
      const radius = Math.hypot(dx, dy);
      if (radius < MIN_CIRCLE_RADIUS) {
        setDrawing({ kind: "idle" });
        return;
      }
      const geom = { cx: drawing.center[0], cy: drawing.center[1], radius };
      if (drawing.for === "tree") {
        void createStructure({ name: null, kind: "tree", geometry: geom, notes: null });
      } else {
        void createBed({
          name: null,
          shape_type: "circle",
          geometry: geom,
          soil_notes: null,
          sun_exposure: null,
        });
      }
      setDrawing({ kind: "idle" });
      return;
    }
    if (drawing.kind === "polygon") {
      if (drawing.points.length < MIN_POLY_VERTICES) {
        setDrawing({ kind: "idle" });
        return;
      }
      void createBed({
        name: null,
        shape_type: "polygon",
        geometry: { points: drawing.points },
        soil_notes: null,
        sun_exposure: null,
      });
      setDrawing({ kind: "idle" });
      return;
    }
    if (drawing.kind === "path") {
      if (drawing.points.length < MIN_PATH_VERTICES) {
        setDrawing({ kind: "idle" });
        return;
      }
      void createPath({
        name: null,
        points: drawing.points,
        width: DEFAULT_PATH_WIDTH,
        material: null,
        color: DEFAULT_PATH_COLOR,
      });
      setDrawing({ kind: "idle" });
      return;
    }
    if (drawing.kind === "linestruct") {
      if (drawing.points.length < MIN_PATH_VERTICES) {
        setDrawing({ kind: "idle" });
        return;
      }
      void createStructure({
        name: null,
        kind: drawing.structKind,
        geometry: { points: drawing.points },
        notes: null,
      });
      setDrawing({ kind: "idle" });
    }
  }

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (e.evt.ctrlKey || e.evt.metaKey) {
      const oldScale = viewport.scale;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const proposed = direction > 0 ? oldScale * ZOOM_FACTOR : oldScale / ZOOM_FACTOR;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, proposed));
      if (newScale === oldScale) return;
      const worldX = (pointer.x - viewport.x) / oldScale;
      const worldY = (pointer.y - viewport.y) / oldScale;
      setViewport({
        x: pointer.x - worldX * newScale,
        y: pointer.y - worldY * newScale,
        scale: newScale,
      });
    } else {
      setViewport({
        x: viewport.x - e.evt.deltaX,
        y: viewport.y - e.evt.deltaY,
        scale: viewport.scale,
      });
    }
  };

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const onStage = e.target === e.target.getStage();
    const pt = screenToWorld();
    if (!pt) return;

    if (mode === "sketch") {
      if (tool === "freehand") {
        setDrawing({ kind: "freehand", points: [pt] });
      } else if (tool === "select" && onStage && selection) {
        select(null);
      }
      return;
    }

    if (tool === "rect-bed" || tool === "structure") {
      if (!onStage) return;
      setDrawing({
        kind: "rect",
        start: pt,
        end: pt,
        for: tool === "rect-bed" ? "bed" : "structure",
      });
      return;
    }

    if (tool === "circle-bed" || tool === "tree") {
      if (!onStage) return;
      setDrawing({
        kind: "circle",
        center: pt,
        cursor: pt,
        for: tool === "tree" ? "tree" : "bed",
      });
      return;
    }

    if (tool === "polygon-bed") {
      if (drawing.kind !== "polygon") {
        setDrawing({ kind: "polygon", points: [pt], cursor: pt });
        return;
      }
      const first = drawing.points[0];
      if (first && drawing.points.length >= MIN_POLY_VERTICES) {
        const dx = (pt[0] - first[0]) * viewport.scale;
        const dy = (pt[1] - first[1]) * viewport.scale;
        if (Math.hypot(dx, dy) <= POLYGON_CLOSE_RADIUS) {
          void createBed({
            name: null,
            shape_type: "polygon",
            geometry: { points: drawing.points },
            soil_notes: null,
            sun_exposure: null,
          });
          setDrawing({ kind: "idle" });
          return;
        }
      }
      setDrawing({ ...drawing, points: [...drawing.points, pt] });
      return;
    }

    if (tool === "path") {
      if (drawing.kind !== "path") {
        setDrawing({ kind: "path", points: [pt], cursor: pt });
      } else {
        setDrawing({ ...drawing, points: [...drawing.points, pt] });
      }
      return;
    }

    if (tool === "fence" || tool === "trellis") {
      if (drawing.kind !== "linestruct") {
        setDrawing({
          kind: "linestruct",
          points: [pt],
          cursor: pt,
          structKind: tool,
        });
      } else {
        setDrawing({ ...drawing, points: [...drawing.points, pt] });
      }
      return;
    }

    if (tool === "select" && onStage && selection) {
      select(null);
    }
  };

  const onMouseMove = () => {
    const pt = screenToWorld();
    if (!pt) return;
    if (drawing.kind === "rect") {
      setDrawing({ ...drawing, end: pt });
    } else if (drawing.kind === "circle") {
      setDrawing({ ...drawing, cursor: pt });
    } else if (
      drawing.kind === "polygon" ||
      drawing.kind === "path" ||
      drawing.kind === "linestruct"
    ) {
      setDrawing({ ...drawing, cursor: pt });
    } else if (drawing.kind === "freehand") {
      const last = drawing.points[drawing.points.length - 1]!;
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) >= FREEHAND_MIN_STEP) {
        setDrawing({ ...drawing, points: [...drawing.points, pt] });
      }
    }
  };

  const onMouseUp = () => {
    if (drawing.kind === "rect" || drawing.kind === "circle") {
      commitInProgress();
    } else if (drawing.kind === "freehand") {
      void finishFreehand(drawing.points);
    }
  };

  const onDblClick = () => {
    if (
      drawing.kind === "path" ||
      drawing.kind === "polygon" ||
      drawing.kind === "linestruct"
    ) {
      commitInProgress();
    }
  };

  const onDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target === e.target.getStage()) {
      const stage = e.target as Konva.Stage;
      setViewport({ x: stage.x(), y: stage.y(), scale: viewport.scale });
    }
  };

  const stageDraggable = tool === "select" && drawing.kind === "idle";

  return (
    <div ref={containerRef} className={`canvas-container tool-${tool}`}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable={stageDraggable}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDblClick={onDblClick}
        onDragEnd={onDragEnd}
      >
        <Layer listening>
          {mode === "plan" && (
            <>
              {beds.map((bed) => (
                <BedShape
                  key={`bed-${bed.id}`}
                  bed={bed}
                  isSelected={selection?.kind === "bed" && selection.id === bed.id}
                  onSelect={() => select({ kind: "bed", id: bed.id })}
                />
              ))}
              {paths.map((path) => (
                <PathShapeView
                  key={`path-${path.id}`}
                  path={path}
                  isSelected={selection?.kind === "path" && selection.id === path.id}
                  onSelect={() => select({ kind: "path", id: path.id })}
                />
              ))}
              {structures.map((structure) => (
                <StructureShape
                  key={`structure-${structure.id}`}
                  structure={structure}
                  isSelected={
                    selection?.kind === "structure" && selection.id === structure.id
                  }
                  onSelect={() => select({ kind: "structure", id: structure.id })}
                />
              ))}
              <VertexEditor />
            </>
          )}

          {mode === "sketch" &&
            strokes.map((stroke) => (
              <StrokeShape
                key={`stroke-${stroke.id}`}
                stroke={stroke}
                onClick={() => {
                  if (tool === "select") setLabelingStroke(stroke.id);
                }}
              />
            ))}

          <DrawingOverlay drawing={drawing} />
        </Layer>
      </Stage>
    </div>
  );
}

function DrawingOverlay({ drawing }: { drawing: DrawingState }) {
  if (drawing.kind === "rect") {
    const r = rectFromDrag(drawing.start, drawing.end);
    return (
      <Rect
        x={r.x}
        y={r.y}
        width={r.width}
        height={r.height}
        fill="rgba(26,115,232,0.12)"
        stroke="#1a73e8"
        strokeWidth={1}
        dash={[6, 4]}
        listening={false}
      />
    );
  }
  if (drawing.kind === "circle") {
    const dx = drawing.cursor[0] - drawing.center[0];
    const dy = drawing.cursor[1] - drawing.center[1];
    const radius = Math.hypot(dx, dy);
    return (
      <Circle
        x={drawing.center[0]}
        y={drawing.center[1]}
        radius={radius}
        fill="rgba(26,115,232,0.12)"
        stroke="#1a73e8"
        strokeWidth={1}
        dash={[6, 4]}
        listening={false}
      />
    );
  }
  if (drawing.kind === "polygon") {
    const pts = drawing.cursor ? [...drawing.points, drawing.cursor] : drawing.points;
    if (pts.length < 1) return null;
    return (
      <Line
        points={pts.flat()}
        stroke="#1a73e8"
        strokeWidth={1.5}
        dash={[6, 4]}
        closed={false}
        listening={false}
      />
    );
  }
  if (drawing.kind === "path") {
    const pts = drawing.cursor ? [...drawing.points, drawing.cursor] : drawing.points;
    if (pts.length < 1) return null;
    return (
      <Line
        points={pts.flat()}
        stroke="#1a73e8"
        strokeWidth={2}
        lineCap="round"
        dash={[8, 4]}
        listening={false}
      />
    );
  }
  if (drawing.kind === "linestruct") {
    const pts = drawing.cursor ? [...drawing.points, drawing.cursor] : drawing.points;
    if (pts.length < 1) return null;
    return (
      <Line
        points={pts.flat()}
        stroke="#1a73e8"
        strokeWidth={3}
        lineCap="round"
        lineJoin="round"
        dash={drawing.structKind === "trellis" ? [2, 4] : [8, 4]}
        listening={false}
      />
    );
  }
  if (drawing.kind === "freehand") {
    if (drawing.points.length < 1) return null;
    return (
      <Line
        points={drawing.points.flat()}
        stroke="#3a3a36"
        strokeWidth={2}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
    );
  }
  return null;
}
