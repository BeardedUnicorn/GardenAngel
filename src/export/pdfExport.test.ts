import { afterEach, describe, expect, it } from "vitest";
import { buildPlanPdf } from "./pdfExport";
import { stageRegistry } from "../canvas/stageRegistry";

afterEach(() => {
  stageRegistry.current = null;
});

describe("buildPlanPdf", () => {
  it("throws a clear error when no stage is registered", () => {
    expect(() =>
      buildPlanPdf({ gardenName: "G", viewportScale: 1 }),
    ).toThrow(/Canvas not ready/);
  });

  it("produces a PDF byte stream from a stage snapshot", () => {
    // 1x1 transparent PNG.
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=";
    stageRegistry.current = {
      width: () => 800,
      height: () => 600,
      toDataURL: () => png,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const bytes = buildPlanPdf({ gardenName: "Backyard", viewportScale: 2 });
    expect(bytes.length).toBeGreaterThan(100);
    // PDF magic: %PDF
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x25, 0x50, 0x44, 0x46]);
  });
});
