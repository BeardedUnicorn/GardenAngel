import { Line } from "react-konva";
import type Konva from "konva";
import type { SketchStroke } from "../types";

// Freehand sketch ink. Canonical vector strokes (PLAN §4) — never raster.
export function StrokeShape({
  stroke,
  onClick,
}: {
  stroke: SketchStroke;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}) {
  return (
    <Line
      points={stroke.points.flat()}
      stroke={stroke.color ?? "#3a3a36"}
      strokeWidth={stroke.width ?? 2}
      closed={stroke.closed}
      lineCap="round"
      lineJoin="round"
      hitStrokeWidth={12}
      {...(stroke.closed ? { fill: "rgba(58,58,54,0.06)" } : {})}
      {...(onClick ? { onClick } : {})}
    />
  );
}
