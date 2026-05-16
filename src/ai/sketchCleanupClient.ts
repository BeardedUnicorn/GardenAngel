// Sketch cleanup — PLAN §6.2. A *separate* low-temperature AI call with a
// strict JSON contract. Never reuse the coach pipeline. AI output is a
// suggestion, not gospel: the user edits every vertex afterward, and any
// validation failure falls back to the raw strokes untouched.

import { z } from "zod";
import type { ModelAdapter } from "./types";
import { CLEANUP_SYSTEM_PROMPT } from "../coach/prompts/systemPrompts";

// ---- Input contract ----

export interface CleanupStrokeInput {
  id: number;
  label: string | null;
  closed: boolean;
  points: [number, number][];
}

export interface CleanupRequestInput {
  canvas_bounds: { width: number; height: number };
  scale_reference?: { pixels_per_foot: number };
  strokes: CleanupStrokeInput[];
}

// ---- Output schema (Zod-validated before anything touches the DB) ----

const point = z.tuple([z.number(), z.number()]);

const rectGeometry = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
const polygonGeometry = z.object({
  points: z.array(point).min(3),
});
const circleGeometry = z.object({
  cx: z.number(),
  cy: z.number(),
  radius: z.number().positive(),
});
const anyGeometry = z.union([rectGeometry, polygonGeometry, circleGeometry]);

const bedShapeType = z.enum(["rect", "polygon", "circle"]);
const structureKind = z.enum(["shed", "fence", "water", "compost", "tree", "other"]);

const cleanedBed = z
  .object({
    source_stroke_ids: z.array(z.number().int()),
    shape_type: bedShapeType,
    geometry: anyGeometry,
  })
  .refine((b) => geometryMatchesType(b.shape_type, b.geometry), {
    message: "bed geometry does not match shape_type",
  });

const cleanedPath = z.object({
  source_stroke_ids: z.array(z.number().int()),
  points: z.array(point).min(2),
  width: z.number().positive(),
});

const cleanedStructure = z.object({
  source_stroke_ids: z.array(z.number().int()),
  kind: structureKind,
  geometry: anyGeometry,
});

export const cleanupOutputSchema = z.object({
  beds: z.array(cleanedBed),
  paths: z.array(cleanedPath),
  structures: z.array(cleanedStructure),
  warnings: z.array(z.string()),
});

export type CleanupOutput = z.infer<typeof cleanupOutputSchema>;

function geometryMatchesType(shapeType: string, geometry: unknown): boolean {
  if (shapeType === "rect") return rectGeometry.safeParse(geometry).success;
  if (shapeType === "polygon") return polygonGeometry.safeParse(geometry).success;
  if (shapeType === "circle") return circleGeometry.safeParse(geometry).success;
  return false;
}

export class CleanupError extends Error {
  constructor(
    message: string,
    public readonly warnings: string[] = [],
  ) {
    super(message);
    this.name = "CleanupError";
  }
}

/** Validate raw model JSON text against the §6.2 contract. */
export function validateCleanupOutput(rawContent: string): CleanupOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new CleanupError("AI cleanup returned text that was not valid JSON.");
  }
  const result = cleanupOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new CleanupError(
      "AI cleanup output did not match the expected shape; keeping your sketch as-is.",
      result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  return result.data;
}

export function buildCleanupMessages(input: CleanupRequestInput) {
  return [
    { role: "system" as const, content: CLEANUP_SYSTEM_PROMPT },
    { role: "user" as const, content: JSON.stringify(input) },
  ];
}

/** Run the cleanup call end to end. Throws CleanupError on any failure. */
export async function runSketchCleanup(
  adapter: ModelAdapter,
  model: string,
  input: CleanupRequestInput,
  signal?: AbortSignal,
): Promise<CleanupOutput> {
  let response;
  try {
    response = await adapter.chat(
      {
        model,
        messages: buildCleanupMessages(input),
        temperature: 0,
        response_format: { type: "json_object" },
      },
      signal,
    );
  } catch (err) {
    throw new CleanupError(
      err instanceof Error ? err.message : "AI cleanup request failed.",
    );
  }
  return validateCleanupOutput(response.content);
}
