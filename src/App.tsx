import { useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { CanvasStage } from "./canvas/CanvasStage";
import { ToolPalette } from "./canvas/ToolPalette";
import { PropertyPanel } from "./canvas/PropertyPanel";
import { StrokeLabelDialog } from "./canvas/StrokeLabelDialog";
import { CleanupPreview } from "./canvas/CleanupPreview";
import { useCanvasStore } from "./canvas/canvasStore";
import { useProjectStore } from "./project/projectStore";
import { useSettingsStore } from "./settings/settingsStore";
import { SettingsPanel } from "./settings/SettingsPanel";
import { CoachPanel } from "./coach/CoachPanel";
import { useCoachStore } from "./coach/coachStore";
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
  const mode = useCanvasStore((s) => s.mode);
  const setMode = useCanvasStore((s) => s.setMode);
  const loadSettings = useSettingsStore((s) => s.load);
  const openSettings = useSettingsStore((s) => s.open);
  const toggleCoach = useCoachStore((s) => s.toggle);
  const resetCoach = useCoachStore((s) => s.reset);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (current) {
      void hydrate();
      void loadSettings();
    } else {
      resetCanvas();
      resetCoach();
    }
  }, [current, hydrate, resetCanvas, loadSettings, resetCoach]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        void undo();
      }
      if (meta && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggleCoach();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, toggleCoach]);

  const errorMessage = lastError ?? canvasError;
  const dismissError = lastError ? clearError : clearCanvasError;

  return (
    <div className="app">
      <header className="topbar">
        <h1>GardenAngel</h1>
        <div className="topbar-actions">
          {current && (
            <div className="mode-toggle">
              <button
                className={mode === "sketch" ? "active" : ""}
                onClick={() => setMode("sketch")}
              >
                Sketch
              </button>
              <button
                className={mode === "plan" ? "active" : ""}
                onClick={() => setMode("plan")}
              >
                Plan
              </button>
            </div>
          )}
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
            <button onClick={toggleCoach} title="Coach (Cmd+J)">
              Coach
            </button>
          )}
          {current && <button onClick={openSettings}>Settings</button>}
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

      <StrokeLabelDialog />
      <CleanupPreview />
      {current && <CoachPanel />}
      <SettingsPanel />

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
