import { Group, Line, Text } from "react-konva";
import type { PathShape } from "../types";

interface Props {
  path: PathShape;
  isSelected: boolean;
  onSelect: () => void;
}

const COLOR = "#a78b6e";
const SELECTED_COLOR = "#1a73e8";
const LABEL_WIDTH = 90;

function midpoint(points: [number, number][]): [number, number] {
  if (points.length === 0) return [0, 0];
  // Use the middle vertex so the label sits on the path itself.
  return points[Math.floor(points.length / 2)] ?? points[0]!;
}

export function PathShapeView({ path, isSelected, onSelect }: Props) {
  const onTap = (e: { cancelBubble: boolean }) => {
    e.cancelBubble = true;
    onSelect();
  };

  const label = path.name?.trim();
  const [mx, my] = midpoint(path.points);

  return (
    <Group onMouseDown={onTap} onTap={onTap}>
      <Line
        points={path.points.flat()}
        stroke={isSelected ? SELECTED_COLOR : COLOR}
        strokeWidth={path.width}
        lineCap="round"
        lineJoin="round"
        opacity={isSelected ? 0.95 : 0.8}
        hitStrokeWidth={Math.max(path.width, 12)}
      />
      {label && (
        <Text
          x={mx - LABEL_WIDTH / 2}
          y={my - 6}
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
