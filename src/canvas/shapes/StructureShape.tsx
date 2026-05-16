import type { ReactElement } from "react";
import { Circle, Group, Line, Rect, Text } from "react-konva";
import type {
  CircleGeometry,
  PolygonGeometry,
  RectGeometry,
  Structure,
  StructureKind,
} from "../types";
import { LINE_STRUCTURE_KINDS } from "../types";

interface Props {
  structure: Structure;
  isSelected: boolean;
  onSelect: () => void;
}

const STYLE: Record<StructureKind, { fill: string; stroke: string }> = {
  shed: { fill: "#b69b78", stroke: "#7a5a3a" },
  fence: { fill: "#9a9a9a", stroke: "#5e5e5e" },
  trellis: { fill: "#d8c19a", stroke: "#7a5a3a" },
  water: { fill: "#a8d5ff", stroke: "#3f7cad" },
  compost: { fill: "#7a5a3a", stroke: "#4a3624" },
  tree: { fill: "#7ab06a", stroke: "#3a5e2c" },
  other: { fill: "#dddddd", stroke: "#888888" },
};

// Deterministic scalloped canopy outline from a circle footprint. Two
// summed sine harmonics give a lumpy "tree-from-above" silhouette; no
// randomness so it's stable across renders.
function canopyPoints(cx: number, cy: number, radius: number): number[] {
  const STEPS = 64;
  const pts: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    const a = (i / STEPS) * Math.PI * 2;
    const wobble =
      1 + 0.14 * Math.sin(a * 7) + 0.07 * Math.sin(a * 13 + 1.1);
    pts.push(cx + Math.cos(a) * radius * wobble);
    pts.push(cy + Math.sin(a) * radius * wobble);
  }
  return pts;
}

export function StructureShape({ structure, isSelected, onSelect }: Props) {
  const style = STYLE[structure.kind] ?? STYLE.other;
  const stroke = isSelected ? "#1a73e8" : style.stroke;
  const strokeWidth = isSelected ? 2.5 : 1.5;
  const onTap = (e: { cancelBubble: boolean }) => {
    e.cancelBubble = true;
    onSelect();
  };

  const geom = structure.geometry;
  const isLineKind = (LINE_STRUCTURE_KINDS as readonly string[]).includes(
    structure.kind,
  );
  let body: ReactElement;
  let labelX = 0;
  let labelY = 0;

  if (structure.kind === "tree" && "radius" in geom) {
    // Squiggly canopy instead of a perfect circle.
    const g = geom as CircleGeometry;
    body = (
      <Line
        points={canopyPoints(g.cx, g.cy, g.radius)}
        closed
        tension={0.5}
        fill={style.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
    labelX = g.cx;
    labelY = g.cy;
  } else if (isLineKind && "points" in geom) {
    // Fence / trellis: an open run, not a filled area.
    const g = geom as PolygonGeometry;
    body = (
      <Line
        points={g.points.flat()}
        closed={false}
        stroke={stroke}
        strokeWidth={isSelected ? 4 : 3}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={12}
        {...(structure.kind === "trellis" ? { dash: [2, 4] } : {})}
      />
    );
    const mid = g.points[Math.floor(g.points.length / 2)] ?? g.points[0] ?? [0, 0];
    labelX = mid[0];
    labelY = mid[1];
  } else if ("width" in geom) {
    const g = geom as RectGeometry;
    body = (
      <Rect
        x={g.x}
        y={g.y}
        width={g.width}
        height={g.height}
        fill={style.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
    labelX = g.x + g.width / 2;
    labelY = g.y + g.height / 2;
  } else if ("radius" in geom) {
    const g = geom as CircleGeometry;
    body = (
      <Circle
        x={g.cx}
        y={g.cy}
        radius={g.radius}
        fill={style.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
    labelX = g.cx;
    labelY = g.cy;
  } else {
    const g = geom as PolygonGeometry;
    body = (
      <Line
        points={g.points.flat()}
        closed
        fill={style.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
    labelX = g.points[0]?.[0] ?? 0;
    labelY = g.points[0]?.[1] ?? 0;
  }

  return (
    <Group onMouseDown={onTap} onTap={onTap}>
      {body}
      <Text
        x={labelX - 45}
        y={labelY - 6}
        width={90}
        text={structure.name ?? structure.kind}
        fontSize={11}
        fill="#1c1c1a"
        align="center"
        listening={false}
      />
    </Group>
  );
}
