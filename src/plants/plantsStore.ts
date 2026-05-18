import { create } from "zustand";
import { useProjectStore } from "../project/projectStore";
import { useSettingsStore } from "../settings/settingsStore";
import { createPermapeopleAdapter } from "./permapeopleAdapter";
import { getCachedDetail, resolvePlantDetail } from "./plantCache";
import { plantsApi, type Planting } from "./plantsApi";
import type { PlantDetail, PlantSummary } from "./types";

interface PlantsState {
  bedId: number | null;
  plantings: Planting[];
  detailsById: Record<string, PlantDetail>;
  busy: boolean;
  lastError: string | null;

  loadForBed: (bedId: number) => Promise<void>;
  clear: () => void;
  addPlanting: (summary: PlantSummary) => Promise<void>;
  removePlanting: (id: number) => Promise<void>;
  clearError: () => void;
}

function errToString(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return JSON.stringify(err);
}

async function adapter() {
  const cfg = await useSettingsStore.getState().resolvePermapeople();
  return createPermapeopleAdapter(cfg);
}

export const usePlantsStore = create<PlantsState>((set, get) => ({
  bedId: null,
  plantings: [],
  detailsById: {},
  busy: false,
  lastError: null,

  clear: () => set({ bedId: null, plantings: [], detailsById: {} }),
  clearError: () => set({ lastError: null }),

  async loadForBed(bedId) {
    set({ bedId, busy: true, lastError: null });
    try {
      const plantings = await plantsApi.plantingsList(bedId);
      // Companion display uses cache only — no network on reopen/offline.
      const details: Record<string, PlantDetail> = {};
      for (const p of plantings) {
        if (details[p.plant_id]) continue;
        const d = await getCachedDetail(p.plant_id);
        if (d) details[p.plant_id] = d;
      }
      // Ignore late results if the selection moved on.
      if (get().bedId === bedId) set({ plantings, detailsById: details });
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ busy: false });
    }
  },

  async addPlanting(summary) {
    const bedId = get().bedId;
    if (bedId === null) return;
    set({ busy: true, lastError: null });
    try {
      // resolvePlantDetail writes the full record (incl. companions)
      // through the cache so it's available offline next time.
      const detail = await resolvePlantDetail(await adapter(), summary.external_id);
      await plantsApi.plantingCreate({
        bed_id: bedId,
        plant_id: summary.external_id,
        quantity: null,
        notes: null,
      });
      const plantings = await plantsApi.plantingsList(bedId);
      set((s) => ({
        plantings,
        detailsById: { ...s.detailsById, [detail.external_id]: detail },
      }));
      useProjectStore.getState().markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ busy: false });
    }
  },

  async removePlanting(id) {
    const bedId = get().bedId;
    set({ busy: true, lastError: null });
    try {
      await plantsApi.plantingDelete(id);
      if (bedId !== null) {
        const plantings = await plantsApi.plantingsList(bedId);
        set({ plantings });
      }
      useProjectStore.getState().markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ busy: false });
    }
  },
}));
