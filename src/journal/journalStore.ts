import { create } from "zustand";
import { useProjectStore } from "../project/projectStore";
import { journalApi } from "./journalApi";
import type { ObservationRow } from "../coach/coachApi";

interface JournalState {
  isOpen: boolean;
  observations: ObservationRow[];
  busy: boolean;
  lastError: string | null;

  toggle: () => void;
  close: () => void;
  reset: () => void;
  load: () => Promise<void>;
  add: (args: {
    body: string;
    bedId: number | null;
    photoSourcePath: string | null;
  }) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clearError: () => void;
}

function errToString(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return JSON.stringify(err);
}

export const useJournalStore = create<JournalState>((set) => ({
  isOpen: false,
  observations: [],
  busy: false,
  lastError: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  reset: () => set({ isOpen: false, observations: [], lastError: null }),
  clearError: () => set({ lastError: null }),

  async load() {
    set({ busy: true, lastError: null });
    try {
      set({ observations: await journalApi.list() });
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ busy: false });
    }
  },

  async add({ body, bedId, photoSourcePath }) {
    set({ busy: true, lastError: null });
    try {
      await journalApi.create({
        body,
        bed_id: bedId,
        planting_id: null,
        observed_at: null,
        photo_source_path: photoSourcePath,
      });
      set({ observations: await journalApi.list() });
      useProjectStore.getState().markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ busy: false });
    }
  },

  async remove(id) {
    set({ busy: true, lastError: null });
    try {
      await journalApi.remove(id);
      set((s) => ({ observations: s.observations.filter((o) => o.id !== id) }));
      useProjectStore.getState().markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ busy: false });
    }
  },
}));
