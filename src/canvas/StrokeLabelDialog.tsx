import { useEffect, useState } from "react";
import { useCanvasStore } from "./canvasStore";

// "This region is a…" — PLAN Phase 3 region-label step. Shown right
// after a freehand stroke is committed; the label drives AI cleanup
// (a "path" stroke becomes a path, "shed" a structure, etc.).
const SUGGESTIONS = [
  "raised bed",
  "bed",
  "path",
  "fence",
  "shed",
  "compost",
  "water",
  "tree",
];

export function StrokeLabelDialog() {
  const labelingStrokeId = useCanvasStore((s) => s.labelingStrokeId);
  const strokes = useCanvasStore((s) => s.strokes);
  const updateStrokeLabel = useCanvasStore((s) => s.updateStrokeLabel);
  const setLabelingStroke = useCanvasStore((s) => s.setLabelingStroke);
  const deleteStroke = useCanvasStore((s) => s.deleteStroke);
  const [text, setText] = useState("");

  const stroke = strokes.find((s) => s.id === labelingStrokeId);

  useEffect(() => {
    setText(stroke?.label ?? "");
  }, [stroke?.id, stroke?.label]);

  if (labelingStrokeId === null || !stroke) return null;

  const apply = (label: string) => {
    void updateStrokeLabel(stroke.id, label.trim() || null);
    setLabelingStroke(null);
  };

  return (
    <div className="label-dialog" role="dialog" aria-label="Label this region">
      <p className="label-dialog-title">
        This {stroke.closed ? "region" : "line"} is a…
      </p>
      <div className="label-chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => apply(s)}>
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply(text);
        }}
      >
        <input
          autoFocus
          value={text}
          placeholder="or type a label"
          onChange={(e) => setText(e.currentTarget.value)}
        />
        <div className="modal-actions">
          <button type="submit">Save</button>
          <button type="button" onClick={() => setLabelingStroke(null)}>
            Skip
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              void deleteStroke(stroke.id);
              setLabelingStroke(null);
            }}
          >
            Discard stroke
          </button>
        </div>
      </form>
    </div>
  );
}
