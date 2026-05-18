import { describe, expect, it } from "vitest";
import {
  createPermapeopleAdapter,
  normalizePermapeoplePlant,
} from "./permapeopleAdapter";

const rawTomato = {
  id: 101,
  name: "Tomato",
  scientific_name: "Solanum lycopersicum",
  data: [
    { key: "Family", value: "Solanaceae" },
    { key: "Layer", value: "Herbs, Ground cover" },
    { key: "Light requirement", value: "Full sun" },
    { key: "Water requirement", value: "Moist" },
    { key: "Combine with", value: "Basil, Marigold; Carrot" },
    { key: "Avoid", value: "Potato, Fennel" },
  ],
};

describe("normalizePermapeoplePlant", () => {
  it("maps top-level + data fields", () => {
    const d = normalizePermapeoplePlant(rawTomato);
    expect(d.external_id).toBe("101");
    expect(d.provider).toBe("permapeople");
    expect(d.common_name).toBe("Tomato");
    expect(d.scientific_name).toBe("Solanum lycopersicum");
    expect(d.family).toBe("Solanaceae");
    expect(d.layers).toEqual(["Herbs", "Ground cover"]);
    expect(d.sun).toBe("Full sun");
    expect(d.water).toBe("Moist");
    expect(d.companions).toEqual(["Basil", "Marigold", "Carrot"]);
    expect(d.antagonists).toEqual(["Potato", "Fennel"]);
  });

  it("falls back gracefully with sparse data", () => {
    const d = normalizePermapeoplePlant({ id: 7 });
    expect(d.common_name).toBe("Plant 7");
    expect(d.scientific_name).toBeUndefined();
    expect(d.companions).toBeUndefined();
    expect(d.layers).toBeUndefined();
  });
});

describe("createPermapeopleAdapter", () => {
  const cfg = { keyId: "kid", keySecret: "ksec" };

  it("search POSTs {q} with key headers and maps summaries", async () => {
    const calls: { url: string; init: { headers: Record<string, string>; body?: string } }[] =
      [];
    const adapter = createPermapeopleAdapter(cfg, async (url, init) => {
      calls.push({ url, init: init as never });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ plants: [rawTomato] }),
      };
    });
    const out = await adapter.search("tomato");
    expect(out).toEqual([
      {
        external_id: "101",
        provider: "permapeople",
        common_name: "Tomato",
        scientific_name: "Solanum lycopersicum",
      },
    ]);
    expect(calls[0]!.url).toBe("https://permapeople.org/api/search");
    expect(calls[0]!.init.headers["x-permapeople-key-id"]).toBe("kid");
    expect(JSON.parse(calls[0]!.init.body!)).toEqual({ q: "tomato" });
  });

  it("getById GETs /plants/:id and normalizes", async () => {
    const adapter = createPermapeopleAdapter(cfg, async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(rawTomato),
    }));
    const d = await adapter.getById("101");
    expect(d.companions).toContain("Basil");
  });

  it("throws a clear error without configured keys", async () => {
    const adapter = createPermapeopleAdapter(
      { keyId: "", keySecret: "" },
      async () => ({ ok: true, status: 200, text: async () => "{}" }),
    );
    await expect(adapter.search("x")).rejects.toThrow(/keys not configured/);
  });

  it("surfaces HTTP errors", async () => {
    const adapter = createPermapeopleAdapter(cfg, async () => ({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    }));
    await expect(adapter.search("x")).rejects.toThrow(/HTTP 401/);
  });
});
