import { describe, expect, it } from "vitest";
import {
  CleanupError,
  buildCleanupMessages,
  runSketchCleanup,
  validateCleanupOutput,
  type CleanupRequestInput,
} from "./sketchCleanupClient";
import type { ModelAdapter } from "./types";

const sampleInput: CleanupRequestInput = {
  canvas_bounds: { width: 1200, height: 800 },
  strokes: [
    { id: 1, label: "raised bed", closed: true, points: [[120, 80], [340, 82], [345, 260], [118, 258]] },
    { id: 2, label: "path", closed: false, points: [[0, 400], [600, 410]] },
  ],
};

describe("validateCleanupOutput (§6.2 contract)", () => {
  it("accepts a well-formed rect bed + path", () => {
    const raw = JSON.stringify({
      beds: [
        {
          source_stroke_ids: [1],
          shape_type: "rect",
          geometry: { x: 120, y: 80, width: 225, height: 180 },
        },
      ],
      paths: [{ source_stroke_ids: [2], points: [[0, 400], [600, 410]], width: 24 }],
      structures: [],
      warnings: [],
    });
    const out = validateCleanupOutput(raw);
    expect(out.beds).toHaveLength(1);
    expect(out.beds[0]!.shape_type).toBe("rect");
    expect(out.paths[0]!.width).toBe(24);
  });

  it("accepts polygon and circle bed geometry", () => {
    const raw = JSON.stringify({
      beds: [
        { source_stroke_ids: [1], shape_type: "polygon", geometry: { points: [[0, 0], [10, 0], [5, 9]] } },
        { source_stroke_ids: [3], shape_type: "circle", geometry: { cx: 50, cy: 50, radius: 20 } },
      ],
      paths: [],
      structures: [{ source_stroke_ids: [4], kind: "shed", geometry: { x: 0, y: 0, width: 5, height: 5 } }],
      warnings: ["stroke 9 was ambiguous"],
    });
    const out = validateCleanupOutput(raw);
    expect(out.beds).toHaveLength(2);
    expect(out.structures[0]!.kind).toBe("shed");
    expect(out.warnings).toContain("stroke 9 was ambiguous");
  });

  it("throws CleanupError on non-JSON", () => {
    expect(() => validateCleanupOutput("not json at all")).toThrow(CleanupError);
  });

  it("throws CleanupError when geometry does not match shape_type", () => {
    const raw = JSON.stringify({
      beds: [{ source_stroke_ids: [1], shape_type: "rect", geometry: { cx: 1, cy: 2, radius: 3 } }],
      paths: [],
      structures: [],
      warnings: [],
    });
    try {
      validateCleanupOutput(raw);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CleanupError);
      expect((e as CleanupError).warnings.length).toBeGreaterThan(0);
    }
  });

  it("rejects missing top-level keys", () => {
    expect(() => validateCleanupOutput(JSON.stringify({ beds: [] }))).toThrow(CleanupError);
  });

  it("rejects negative rect dimensions", () => {
    const raw = JSON.stringify({
      beds: [
        { source_stroke_ids: [1], shape_type: "rect", geometry: { x: 0, y: 0, width: -5, height: 9 } },
      ],
      paths: [],
      structures: [],
      warnings: [],
    });
    expect(() => validateCleanupOutput(raw)).toThrow(CleanupError);
  });
});

describe("buildCleanupMessages", () => {
  it("sends system prompt + JSON-stringified input as user message", () => {
    const msgs = buildCleanupMessages(sampleInput);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]!.role).toBe("user");
    expect(JSON.parse(msgs[1]!.content)).toEqual(sampleInput);
  });
});

describe("runSketchCleanup", () => {
  it("calls the adapter at temperature 0 with json_object format", async () => {
    let captured: unknown;
    const adapter: ModelAdapter = {
      name: "fake",
      async chat(req) {
        captured = req;
        return {
          model: "m",
          content: JSON.stringify({ beds: [], paths: [], structures: [], warnings: [] }),
        };
      },
    };
    const out = await runSketchCleanup(adapter, "gpt-x", sampleInput);
    expect(out.beds).toEqual([]);
    expect(captured).toMatchObject({
      model: "gpt-x",
      temperature: 0,
      response_format: { type: "json_object" },
    });
  });

  it("wraps adapter/network failure in CleanupError", async () => {
    const adapter: ModelAdapter = {
      name: "fake",
      async chat() {
        throw new Error("network down");
      },
    };
    await expect(runSketchCleanup(adapter, "m", sampleInput)).rejects.toBeInstanceOf(CleanupError);
  });
});
