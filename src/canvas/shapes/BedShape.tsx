import { Circle, Line, Rect } from "react-konva";
import type { Bed, CircleGeometry, PolygonGeometry, RectGeometry } from "../types";

interface Props {
  bed: Bed;
  isSelected: boolean;
  onSelect: () => void;
}

const FILL = "#cdebd6";
const STROKE = "#5b8c6a";
const SELECTED_STROKE = "#1a73e8";
const STROKE_WIDTH = 1.5;
const SELECTED_STROKE_WIDTH = 2.5;

export function BedShape({ bed, isSelected, onSelect }: Props) {
  const stroke = isSelected ? SELECTED_STROKE : STROKE;
  const strokeWidth = isSelected ? SELECTED_STROKE_WIDTH : STROKE_WIDTH;
  const onTap = (e: { cancelBubble: boolean }) => {
    e.cancelBubble = true;
    onSelect();
  };

  if (bed.shape_type === "rect") {
    const g = bed.geometry as RectGeometry;
    return (
      <Rect
        x={g.x}
        y={g.y}
        width={g.width}
        height={g.height}
        fill={FILL}
        stroke={stroke}
        strokeWidth={strokeWidth}
        onMouseDown={onTap}
        onTap={onTap}
      />
    );
  }
  if (bed.shape_type === "polygon") {
    const g = bed.geometry as PolygonGeometry;
    return (
      <Line
        points={g.points.flat()}
        closed
        fill={FILL}
        stroke={stroke}
        strokeWidth={strokeWidth}
        onMouseDown={onTap}
        onTap={onTap}
      />
    );
  }
  // circle
  const g = bed.geometry as CircleGeometry;
  return (
    <Circle
      x={g.cx}
      y={g.cy}
      radius={g.radius}
      fill={FILL}
      stroke={stroke}
      strokeWidth={strokeWidth}
      onMouseDown={onTap}
      onTap={onTap}
    />
  );
}
