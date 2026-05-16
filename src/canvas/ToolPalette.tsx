import { useCanvasStore } from "./canvasStore";
import type { Tool } from "./types";

interface ToolDef {
  id: Tool;
  label: string;
  shortcut: string;
  hint: string;
}

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", shortcut: "V", hint: "Pan, select, edit" },
  { id: "rect-bed", label: "Rect bed", shortcut: "R", hint: "Drag a rectangle" },
  { id: "circle-bed", label: "Circle bed", shortcut: "C", hint: "Drag from center outward" },
  { id: "polygon-bed", label: "Polygon bed", shortcut: "P", hint: "Click vertices, Enter to close" },
  { id: "path", label: "Path", shortcut: "T", hint: "Click vertices, Enter to finish" },
  { id: "structure", label: "Structure", shortcut: "S", hint: "Drag a rectangle (shed)" },
];

export function ToolPalette() {
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);

  return (
    <aside className="tool-palette">
      <h2>Tools</h2>
      <ul>
        {TOOLS.map((t) => (
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
    </aside>
  );
}
