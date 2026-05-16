// Write-through cache wrapper (PLAN §6.3): always check plant_cache
// first, fall back to the network adapter, then write the result back.
// This is what makes companions/antagonists available offline after the
// first fetch.

import { plantsApi } from "./plantsApi";
import type { PlantAdapter, PlantDetail } from "./types";

export async function getCachedDetail(
  externalId: string,
): Promise<PlantDetail | null> {
  const cached = await plantsApi.cacheGet(externalId);
  return cached ? cached.data_json : null;
}

/**
 * Resolve a plant detail through the cache. Cache hit → no network.
 * Miss → adapter.getById, then write-through. The caller surfaces any
 * thrown network error to the user (PLAN §6.3 / Phase 4 acceptance).
 */
export async function resolvePlantDetail(
  adapter: PlantAdapter,
  externalId: string,
  signal?: AbortSignal,
): Promise<PlantDetail> {
  const cached = await getCachedDetail(externalId);
  if (cached) return cached;

  const detail = await adapter.getById(externalId, signal);
  await plantsApi.cachePut({
    external_id: detail.external_id,
    provider: detail.provider,
    common_name: detail.common_name,
    scientific_name: detail.scientific_name ?? null,
    data_json: detail,
  });
  return detail;
}
