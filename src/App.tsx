import { useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { CanvasStage } from "./canvas/CanvasStage";
import { ToolPalette } from "./canvas/ToolPalette";
import { PropertyPanel } from "./canvas/PropertyPanel";
import { useCanvasStore } from "./canvas/canvasStore";
import { useProjectStore } from "./project/projectStore";
import "./App.css";

const FILE_FILTER = [{ name: "GardenAngel Project", extensions: ["gardenangel"] }];

export default function App() {
  const { current, isBusy, isDirty, lastError, refresh, clearError } = useProjectStore();
  const hydrate = useCanvasStore((s) => s.hydrate);
  const resetCanvas = useCanvasStore((s) => s.reset);
  const canvasError = useCanvasStore((s) => s.lastError);
  const clearCanvasError = useCanvasStore((s) => s.clearError);
  const undo = useCanvasStore((s) => s.undo);
  const canUndo = useCanvasStore((s) => s.canUndo());

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (current) {
      void hydrate();
    } else {
      resetCanvas();
    }
  }, [current, hydrate, resetCanvas]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        void undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const errorMessage = lastError ?? canvasError;
  const dismissError = lastError ? clearError : clearCanvasError;

  return (
    <div className="app">
      <header className="topbar">
        <h1>GardenAngel</h1>
        <div className="topbar-actions">
          <button disabled={isBusy} onClick={onNew}>
            New
          </button>
          <button disabled={isBusy} onClick={onOpen}>
            Open
          </button>
          <button disabled={isBusy || !current} onClick={onSave}>
            Save{isDirty ? "*" : ""}
          </button>
          <button disabled={!canUndo} onClick={() => void undo()}>
            Undo
          </button>
          {current && (
            <button disabled={isBusy} onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </header>

      {current ? (
        <div className="workspace">
          <ToolPalette />
          <CanvasStage />
          <PropertyPanel />
        </div>
      ) : (
        <main className="main empty">
          <p>No project open. Create a new garden plan or open an existing one.</p>
        </main>
      )}

      {errorMessage && (
        <div className="error-toast" role="alert">
          <span>{errorMessage}</span>
          <button onClick={dismissError}>dismiss</button>
        </div>
      )}
    </div>
  );
}

async function onNew() {
  const path = await save({
    title: "Create a new garden plan",
    defaultPath: "garden.gardenangel",
    filters: FILE_FILTER,
  });
  if (!path) return;
  await useProjectStore.getState().newProject(path);
}

async function onOpen() {
  const path = await open({
    title: "Open a garden plan",
    multiple: false,
    directory: false,
    filters: FILE_FILTER,
  });
  if (!path || Array.isArray(path)) return;
  await useProjectStore.getState().openProject(path);
}

async function onSave() {
  await useProjectStore.getState().saveProject();
}

async function onClose() {
  await useProjectStore.getState().closeProject();
}
