import { invoke } from "@tauri-apps/api/core";
import type { PlantDetail, PlantProvider } from "./types";

export interface CachedPlant {
  external_id: string;
  provider: string;
  common_name: string;
  scientific_name: string | null;
  data_json: PlantDetail;
  fetched_at: string;
}

export interface CachedPlantInput {
  external_id: string;
  provider: PlantProvider;
  common_name: string;
  scientific_name: string | null;
  data_json: PlantDetail;
}

export interface Planting {
  id: number;
  bed_id: number;
  plant_id: string;
  planted_at: string | null;
  harvested_at: string | null;
  quantity: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlantingInput {
  bed_id: number;
  plant_id: string;
  quantity: number | null;
  notes: string | null;
}

export const plantsApi = {
  cacheGet: (externalId: string) =>
    invoke<CachedPlant | null>("plant_cache_get", { externalId }),
  cachePut: (input: CachedPlantInput) =>
    invoke<CachedPlant>("plant_cache_put", { input }),
  plantingsList: (bedId: number) =>
    invoke<Planting[]>("plantings_list", { bedId }),
  plantingCreate: (input: PlantingInput) =>
    invoke<Planting>("planting_create", { input }),
  plantingDelete: (id: number) => invoke<void>("planting_delete", { id }),
};
