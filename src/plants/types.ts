// Plant data adapter interface — PLAN §6.3. All reads go through the
// cache wrapper (plantCache.ts), which checks plant_cache first and only
// then hits the network.

export type PlantProvider = "permapeople" | "usda" | "openfarm";

export interface PlantSummary {
  external_id: string;
  provider: PlantProvider;
  common_name: string;
  scientific_name?: string;
}

export interface PlantDetail extends PlantSummary {
  family?: string;
  layers?: string[];
  sun?: string;
  water?: string;
  // PLAN §6.3 types these as external_ids, but Permapeople exposes
  // companion/antagonist info only as free-text names (ADR-009). v0.1
  // stores and shows the names.
  companions?: string[];
  antagonists?: string[];
  raw: unknown;
}

export interface PlantAdapter {
  search(query: string, signal?: AbortSignal): Promise<PlantSummary[]>;
  getById(id: string, signal?: AbortSignal): Promise<PlantDetail>;
}
