import { useCanvasStore } from "./canvasStore";
import type { Tool } from "./types";

interface ToolDef {
  id: Tool;
  label: string;
  shortcut: string;
  hint: string;
}

const SKETCH_TOOLS: ToolDef[] = [
  { id: "select", label: "Pan", shortcut: "V", hint: "Pan / select strokes" },
  { id: "freehand", label: "Pen", shortcut: "F", hint: "Draw a freehand region or line" },
];

const PLAN_TOOLS: ToolDef[] = [
  { id: "select", label: "Select", shortcut: "V", hint: "Pan, select, drag vertices" },
  { id: "rect-bed", label: "Rect bed", shortcut: "R", hint: "Drag a rectangle" },
  { id: "circle-bed", label: "Circle bed", shortcut: "C", hint: "Drag from center outward" },
  { id: "polygon-bed", label: "Polygon bed", shortcut: "P", hint: "Click vertices, Enter to close" },
  { id: "path", label: "Path", shortcut: "T", hint: "Click vertices, Enter to finish" },
  { id: "structure", label: "Structure", shortcut: "S", hint: "Drag a rectangle (shed)" },
  { id: "tree", label: "Tree", shortcut: "O", hint: "Drag canopy from center outward" },
];

export function ToolPalette() {
  const mode = useCanvasStore((s) => s.mode);
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  const strokes = useCanvasStore((s) => s.strokes);
  const cleanupBusy = useCanvasStore((s) => s.cleanupBusy);
  const runCleanup = useCanvasStore((s) => s.runCleanup);

  const tools = mode === "sketch" ? SKETCH_TOOLS : PLAN_TOOLS;

  return (
    <aside className="tool-palette">
      <h2>{mode === "sketch" ? "Sketch" : "Plan"}</h2>
      <ul>
        {tools.map((t) => (
          <li key={t.id}>
            <button
              className={tool === t.id ? "tool active" : "tool"}
              onClick={() => setTool(t.id)}
              title={`${t.hint} (${t.shortcut})`}
            >
              <span className="tool-label">{t.label}</span>
              <span className="tool-shortcut">{t.shortcut}</span>
            </button>
          </li>
        ))}
      </ul>

      {mode === "sketch" && (
        <>
          <h2 style={{ marginTop: "1rem" }}>AI</h2>
          <button
            className="tool"
            disabled={cleanupBusy || strokes.length === 0}
            onClick={() =>
              void runCleanup({
                width: window.innerWidth,
                height: window.innerHeight,
              })
            }
            title="Send labelled strokes to the model and snap them into beds/paths/structures"
          >
            {cleanupBusy ? "Cleaning up…" : "Clean up sketch"}
          </button>
          <p className="dim small" style={{ marginTop: "0.5rem" }}>
            {strokes.length} stroke{strokes.length === 1 ? "" : "s"}. Label each
            region, then clean up.
          </p>
        </>
      )}
    </aside>
  );
}
