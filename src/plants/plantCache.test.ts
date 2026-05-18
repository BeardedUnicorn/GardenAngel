import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { resolvePlantDetail } from "./plantCache";
import type { PlantAdapter, PlantDetail } from "./types";

const mockedInvoke = vi.mocked(invoke);

const detail: PlantDetail = {
  external_id: "101",
  provider: "permapeople",
  common_name: "Tomato",
  companions: ["Basil"],
  raw: {},
};

beforeEach(() => mockedInvoke.mockReset());

describe("resolvePlantDetail (write-through)", () => {
  it("returns cached data and never calls the adapter on a hit", async () => {
    mockedInvoke.mockResolvedValueOnce({
      external_id: "101",
      provider: "permapeople",
      common_name: "Tomato",
      scientific_name: null,
      data_json: detail,
      fetched_at: "2026-05-16T00:00:00Z",
    });
    const adapter: PlantAdapter = {
      search: vi.fn(),
      getById: vi.fn(),
    };

    const out = await resolvePlantDetail(adapter, "101");
    expect(out).toEqual(detail);
    expect(adapter.getById).not.toHaveBeenCalled();
    expect(mockedInvoke).toHaveBeenCalledTimes(1); // cacheGet only
  });

  it("falls back to the adapter on a miss and writes back", async () => {
    mockedInvoke.mockResolvedValueOnce(null); // cacheGet miss
    mockedInvoke.mockResolvedValueOnce({}); // cachePut
    const adapter: PlantAdapter = {
      search: vi.fn(),
      getById: vi.fn().mockResolvedValue(detail),
    };

    const out = await resolvePlantDetail(adapter, "101");
    expect(out).toEqual(detail);
    expect(adapter.getById).toHaveBeenCalledWith("101", undefined);
    const putCall = mockedInvoke.mock.calls[1]!;
    expect(putCall[0]).toBe("plant_cache_put");
    expect((putCall[1] as { input: { external_id: string } }).input.external_id).toBe("101");
  });

  it("propagates adapter network failure (first-fetch offline case)", async () => {
    mockedInvoke.mockResolvedValueOnce(null);
    const adapter: PlantAdapter = {
      search: vi.fn(),
      getById: vi.fn().mockRejectedValue(new Error("network down")),
    };
    await expect(resolvePlantDetail(adapter, "101")).rejects.toThrow("network down");
  });
});
