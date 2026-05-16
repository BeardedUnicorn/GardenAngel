import { Line } from "react-konva";
import type { PathShape } from "../types";

interface Props {
  path: PathShape;
  isSelected: boolean;
  onSelect: () => void;
}

const COLOR = "#a78b6e";
const SELECTED_COLOR = "#1a73e8";

export function PathShapeView({ path, isSelected, onSelect }: Props) {
  const onTap = (e: { cancelBubble: boolean }) => {
    e.cancelBubble = true;
    onSelect();
  };

  return (
    <Line
      points={path.points.flat()}
      stroke={isSelected ? SELECTED_COLOR : COLOR}
      strokeWidth={path.width}
      lineCap="round"
      lineJoin="round"
      opacity={isSelected ? 0.95 : 0.8}
      hitStrokeWidth={Math.max(path.width, 12)}
      onMouseDown={onTap}
      onTap={onTap}
    />
  );
}
