import type { ReactElement } from "react";
import { Circle, Group, Line, Rect, Text } from "react-konva";
import type { Bed, CircleGeometry, PolygonGeometry, RectGeometry } from "../types";
import { shapeDragProps } from "./shapeDrag";

interface Props {
  bed: Bed;
  isSelected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
}

const FILL = "#cdebd6";
const STROKE = "#5b8c6a";
const SELECTED_STROKE = "#1a73e8";
const STROKE_WIDTH = 1.5;
const SELECTED_STROKE_WIDTH = 2.5;
const LABEL_WIDTH = 90;

export function BedShape({ bed, isSelected, draggable, onSelect, onMove }: Props) {
  const stroke = isSelected ? SELECTED_STROKE : STROKE;
  const strokeWidth = isSelected ? SELECTED_STROKE_WIDTH : STROKE_WIDTH;
  const onTap = (e: { cancelBubble: boolean }) => {
    e.cancelBubble = true;
    onSelect();
  };

  let body: ReactElement;
  let labelX = 0;
  let labelY = 0;

  if (bed.shape_type === "rect") {
    const g = bed.geometry as RectGeometry;
    body = (
      <Rect
        x={g.x}
        y={g.y}
        width={g.width}
        height={g.height}
        fill={FILL}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
    labelX = g.x + g.width / 2;
    labelY = g.y + g.height / 2;
  } else if (bed.shape_type === "polygon") {
    const g = bed.geometry as PolygonGeometry;
    body = (
      <Line
        points={g.points.flat()}
        closed
        fill={FILL}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
    const n = g.points.length || 1;
    labelX = g.points.reduce((s, p) => s + p[0], 0) / n;
    labelY = g.points.reduce((s, p) => s + p[1], 0) / n;
  } else {
    const g = bed.geometry as CircleGeometry;
    body = (
      <Circle
        x={g.cx}
        y={g.cy}
        radius={g.radius}
        fill={FILL}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
    labelX = g.cx;
    labelY = g.cy;
  }

  const label = bed.name?.trim();

  return (
    <Group
      onMouseDown={onTap}
      onTap={onTap}
      {...shapeDragProps(draggable, onSelect, onMove)}
    >
      {body}
      {label && (
        <Text
          x={labelX - LABEL_WIDTH / 2}
          y={labelY - 6}
          width={LABEL_WIDTH}
          text={label}
          fontSize={11}
          fill="#1c1c1a"
          align="center"
          listening={false}
        />
      )}
    </Group>
  );
}
