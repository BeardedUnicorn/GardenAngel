import { create } from "zustand";
import {
  projectClose as rustClose,
  projectCurrent,
  projectNew as rustNew,
  projectOpen as rustOpen,
  projectSave as rustSave,
  type ProjectMeta,
} from "./projectFile";

interface ProjectStore {
  current: ProjectMeta | null;
  isDirty: boolean;
  isBusy: boolean;
  lastError: string | null;

  newProject: (path: string) => Promise<void>;
  openProject: (path: string) => Promise<void>;
  saveProject: () => Promise<void>;
  closeProject: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
  markDirty: () => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  current: null,
  isDirty: false,
  isBusy: false,
  lastError: null,

  async newProject(path) {
    set({ isBusy: true, lastError: null });
    try {
      const meta = await rustNew(path);
      set({ current: meta, isDirty: false });
    } catch (err) {
      set({ lastError: errorToString(err) });
    } finally {
      set({ isBusy: false });
    }
  },

  async openProject(path) {
    set({ isBusy: true, lastError: null });
    try {
      const meta = await rustOpen(path);
      set({ current: meta, isDirty: false });
    } catch (err) {
      set({ lastError: errorToString(err) });
    } finally {
      set({ isBusy: false });
    }
  },

  async saveProject() {
    if (!get().current) return;
    set({ isBusy: true, lastError: null });
    try {
      await rustSave();
      set({ isDirty: false });
    } catch (err) {
      set({ lastError: errorToString(err) });
    } finally {
      set({ isBusy: false });
    }
  },

  async closeProject() {
    set({ isBusy: true, lastError: null });
    try {
      await rustClose();
      set({ current: null, isDirty: false });
    } catch (err) {
      set({ lastError: errorToString(err) });
    } finally {
      set({ isBusy: false });
    }
  },

  async refresh() {
    try {
      const meta = await projectCurrent();
      set({ current: meta });
    } catch (err) {
      set({ lastError: errorToString(err) });
    }
  },

  clearError() {
    set({ lastError: null });
  },

  markDirty() {
    if (get().current) set({ isDirty: true });
  },
}));

function errorToString(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return JSON.stringify(err);
}
