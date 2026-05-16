import { Rect } from "react-konva";
import type Konva from "konva";
import { useCanvasStore } from "./canvasStore";
import type {
  Bed,
  CircleGeometry,
  PolygonGeometry,
  RectGeometry,
  Structure,
} from "./types";

// Plan-mode vertex editing (ADR-004 → ADR-008). Each drag commits exactly
// one mutation on dragEnd — which pushes exactly one undo entry — never
// per pointer event.

const HANDLE = 6;

function isRect(g: unknown): g is RectGeometry {
  return !!g && typeof g === "object" && "width" in g && "height" in g;
}
function isCircle(g: unknown): g is CircleGeometry {
  return !!g && typeof g === "object" && "radius" in g;
}
function isPolygon(g: unknown): g is PolygonGeometry {
  return !!g && typeof g === "object" && "points" in g;
}

export function VertexEditor() {
  const mode = useCanvasStore((s) => s.mode);
  const tool = useCanvasStore((s) => s.tool);
  const selection = useCanvasStore((s) => s.selection);
  const beds = useCanvasStore((s) => s.beds);
  const paths = useCanvasStore((s) => s.paths);
  const structures = useCanvasStore((s) => s.structures);
  const scale = useCanvasStore((s) => s.viewport.scale);
  const updateBed = useCanvasStore((s) => s.updateBed);
  const updatePath = useCanvasStore((s) => s.updatePath);
  const updateStructure = useCanvasStore((s) => s.updateStructure);

  if (mode !== "plan" || tool !== "select" || !selection) return null;
  const r = HANDLE / scale;

  if (selection.kind === "path") {
    const path = paths.find((p) => p.id === selection.id);
    if (!path) return null;
    return (
      <>
        {path.points.map((pt, i) => (
          <Handle
            key={i}
            x={pt[0]}
            y={pt[1]}
            r={r}
            onMoved={(nx, ny) => {
              const next = path.points.map((p, j) =>
                j === i ? ([nx, ny] as [number, number]) : p,
              );
              void updatePath(path.id, {
                name: path.name,
                points: next,
                width: path.width,
                material: path.material,
                color: path.color,
              });
            }}
          />
        ))}
      </>
    );
  }

  const shape: Bed | Structure | undefined =
    selection.kind === "bed"
      ? beds.find((b) => b.id === selection.id)
      : structures.find((s) => s.id === selection.id);
  if (!shape) return null;

  const commit = (geometry: Bed["geometry"]) => {
    if (selection.kind === "bed") {
      const b = shape as Bed;
      void updateBed(b.id, {
        name: b.name,
        shape_type: b.shape_type,
        geometry,
        soil_notes: b.soil_notes,
        sun_exposure: b.sun_exposure,
      });
    } else {
      const st = shape as Structure;
      void updateStructure(st.id, {
        name: st.name,
        kind: st.kind,
        geometry,
        notes: st.notes,
      });
    }
  };

  const g = shape.geometry;

  if (isRect(g)) {
    const corners: [number, number][] = [
      [g.x, g.y],
      [g.x + g.width, g.y],
      [g.x + g.width, g.y + g.height],
      [g.x, g.y + g.height],
    ];
    return (
      <>
        {corners.map(([cx, cy], i) => {
          const opp = corners[(i + 2) % 4]!;
          return (
            <Handle
              key={i}
              x={cx}
              y={cy}
              r={r}
              onMoved={(nx, ny) => {
                commit({
                  x: Math.min(nx, opp[0]),
                  y: Math.min(ny, opp[1]),
                  width: Math.max(1, Math.abs(nx - opp[0])),
                  height: Math.max(1, Math.abs(ny - opp[1])),
                });
              }}
            />
          );
        })}
      </>
    );
  }

  if (isCircle(g)) {
    return (
      <>
        <Handle
          x={g.cx}
          y={g.cy}
          r={r}
          fill="#1a73e8"
          onMoved={(nx, ny) => commit({ cx: nx, cy: ny, radius: g.radius })}
        />
        <Handle
          x={g.cx + g.radius}
          y={g.cy}
          r={r}
          onMoved={(nx, ny) =>
            commit({
              cx: g.cx,
              cy: g.cy,
              radius: Math.max(1, Math.hypot(nx - g.cx, ny - g.cy)),
            })
          }
        />
      </>
    );
  }

  if (isPolygon(g)) {
    return (
      <>
        {g.points.map((pt, i) => (
          <Handle
            key={i}
            x={pt[0]}
            y={pt[1]}
            r={r}
            onMoved={(nx, ny) =>
              commit({
                points: g.points.map((p, j) =>
                  j === i ? ([nx, ny] as [number, number]) : p,
                ),
              })
            }
          />
        ))}
      </>
    );
  }

  return null;
}

function Handle({
  x,
  y,
  r,
  fill = "#ffffff",
  onMoved,
}: {
  x: number;
  y: number;
  r: number;
  fill?: string;
  onMoved: (x: number, y: number) => void;
}) {
  return (
    <>
      <Rect
        x={x - r}
        y={y - r}
        width={r * 2}
        height={r * 2}
        fill={fill}
        stroke="#1a73e8"
        strokeWidth={r * 0.25}
        draggable
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          const node = e.target;
          onMoved(node.x() + r, node.y() + r);
        }}
      />
    </>
  );
}
