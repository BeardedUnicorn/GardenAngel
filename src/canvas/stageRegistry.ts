import type Konva from "konva";

// The live Konva stage, shared so PDF export can snapshot it without
// threading a ref through the component tree. Set by CanvasStage.
export const stageRegistry: { current: Konva.Stage | null } = { current: null };
