import type Konva from "konva";

/**
 * Props that make a shape Group draggable (whole-object move). The Group
 * renders its children in absolute world coords, so a drag just offsets
 * the Group; on release we read that offset, snap the Group back to the
 * origin, and hand the (dx, dy) to the caller to translate + persist the
 * geometry. Commit happens once, on dragEnd — exactly one undo entry,
 * consistent with ADR-008 (vertex editing).
 */
export function shapeDragProps(
  draggable: boolean,
  onSelect: () => void,
  onMove: (dx: number, dy: number) => void,
) {
  if (!draggable) return { draggable: false as const };
  return {
    draggable: true as const,
    onDragStart: () => onSelect(),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const dx = node.x();
      const dy = node.y();
      if (dx === 0 && dy === 0) return;
      node.position({ x: 0, y: 0 });
      onMove(dx, dy);
    },
  };
}
