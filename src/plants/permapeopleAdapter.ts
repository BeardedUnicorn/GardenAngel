// Permapeople adapter — POST /api/search, GET /api/plants/:id.
//
// Auth is two header keys (x-permapeople-key-id / -key-secret). Network
// goes through @tauri-apps/plugin-http (AGENTS.md: no browser fetch).
// Transport is injectable for unit tests. Data © Permapeople.org,
// CC BY-SA 4.0.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { PlantAdapter, PlantDetail, PlantSummary } from "./types";

export interface PermapeopleConfig {
  keyId: string;
  keySecret: string;
  baseUrl?: string;
}

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const DEFAULT_BASE = "https://permapeople.org/api";

interface RawPlant {
  id: number;
  name?: string;
  scientific_name?: string;
  data?: { key: string; value: string }[];
}

function dataMap(raw: RawPlant): Map<string, string> {
  const m = new Map<string, string>();
  for (const { key, value } of raw.data ?? []) m.set(key.toLowerCase(), value);
  return m;
}

function splitList(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  const parts = v
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

/** Pure: normalize a Permapeople plant object into PlantDetail. */
export function normalizePermapeoplePlant(raw: RawPlant): PlantDetail {
  const m = dataMap(raw);
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const hit = m.get(k.toLowerCase());
      if (hit) return hit;
    }
    return undefined;
  };
  const detail: PlantDetail = {
    external_id: String(raw.id),
    provider: "permapeople",
    common_name: raw.name?.trim() || `Plant ${raw.id}`,
    raw,
  };
  if (raw.scientific_name) detail.scientific_name = raw.scientific_name;
  const family = pick("family");
  if (family) detail.family = family;
  const layers = splitList(pick("layer", "layers"));
  if (layers) detail.layers = layers;
  const sun = pick("light requirement", "sun");
  if (sun) detail.sun = sun;
  const water = pick("water requirement", "water");
  if (water) detail.water = water;
  const companions = splitList(pick("companions", "companion plants", "combine with"));
  if (companions) detail.companions = companions;
  const antagonists = splitList(pick("antagonists", "antagonist plants", "avoid"));
  if (antagonists) detail.antagonists = antagonists;
  return detail;
}

function toSummary(raw: RawPlant): PlantSummary {
  const s: PlantSummary = {
    external_id: String(raw.id),
    provider: "permapeople",
    common_name: raw.name?.trim() || `Plant ${raw.id}`,
  };
  if (raw.scientific_name) s.scientific_name = raw.scientific_name;
  return s;
}

export function createPermapeopleAdapter(
  config: PermapeopleConfig,
  fetchImpl: FetchLike = tauriFetch as unknown as FetchLike,
): PlantAdapter {
  const base = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
  const headers = () => {
    if (!config.keyId || !config.keySecret) {
      throw new Error("Permapeople API keys not configured (Settings).");
    }
    return {
      "Content-Type": "application/json",
      "x-permapeople-key-id": config.keyId,
      "x-permapeople-key-secret": config.keySecret,
    };
  };

  return {
    async search(query, signal) {
      const init: Parameters<FetchLike>[1] = {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ q: query }),
      };
      if (signal) init.signal = signal;
      const res = await fetchImpl(`${base}/search`, init);
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Plant search failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
      }
      let json: { plants?: RawPlant[] };
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Plant search returned invalid JSON.");
      }
      return (json.plants ?? []).map(toSummary);
    },

    async getById(id, signal) {
      const init: Parameters<FetchLike>[1] = { method: "GET", headers: headers() };
      if (signal) init.signal = signal;
      const res = await fetchImpl(`${base}/plants/${encodeURIComponent(id)}`, init);
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Plant lookup failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
      }
      let json: RawPlant;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Plant lookup returned invalid JSON.");
      }
      return normalizePermapeoplePlant(json);
    },
  };
}
