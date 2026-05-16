import { useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useProjectStore } from "./project/projectStore";
import "./App.css";

const FILE_FILTER = [{ name: "GardenAngel Project", extensions: ["gardenangel"] }];

export default function App() {
  const { current, isBusy, isDirty, lastError, refresh, clearError } = useProjectStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
          {current && (
            <button disabled={isBusy} onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </header>

      <main className="main">
        {current ? (
          <section className="project-info">
            <h2>{current.name}</h2>
            <dl>
              <dt>Path</dt>
              <dd>{current.path}</dd>
              <dt>Garden ID</dt>
              <dd>{current.garden_id}</dd>
              <dt>Created</dt>
              <dd>{current.created_at}</dd>
              <dt>Format</dt>
              <dd>v{current.format_version}</dd>
            </dl>
          </section>
        ) : (
          <section className="empty">
            <p>No project open. Create a new garden plan or open an existing one.</p>
          </section>
        )}
      </main>

      {lastError && (
        <div className="error-toast" role="alert">
          <span>{lastError}</span>
          <button onClick={clearError}>dismiss</button>
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
