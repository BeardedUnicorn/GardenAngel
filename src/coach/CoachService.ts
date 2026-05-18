// Coach context assembly — PLAN §6.4. This is the *only* sanctioned
// context shape: system prompt → garden snapshot → active selection →
// recent observations → conversation history (windowed) → user message.
// New context types require a DECISIONS.md entry.

import type { ChatMessage } from "../ai/types";
import { coachSystemPrompt, type CoachVoice } from "./prompts/systemPrompts";

export interface GardenSnapshot {
  name: string;
  zone?: string | null;
  lastFrost?: string | null;
  firstFrost?: string | null;
  bedCount: number;
  pathCount: number;
  structureCount: number;
}

export interface ActiveBedContext {
  name: string;
  shapeType: string;
  soilNotes?: string | null;
  sun?: string | null;
  plantings: string[]; // common names
  observations: string[]; // bodies, newest first
}

export interface CoachContext {
  voice: CoachVoice;
  garden: GardenSnapshot;
  activeBed?: ActiveBedContext;
  recentObservations: string[]; // "date — body", newest first
  history: ChatMessage[]; // prior user/assistant turns, oldest→newest
  userMessage: string;
  historyWindow?: number; // default 20
}

function gardenBlock(g: GardenSnapshot): string {
  const lines = [
    `Garden: ${g.name}`,
    g.zone ? `USDA zone: ${g.zone}` : null,
    g.lastFrost ? `Last frost: ${g.lastFrost}` : null,
    g.firstFrost ? `First frost: ${g.firstFrost}` : null,
    `Layout: ${g.bedCount} bed(s), ${g.pathCount} path(s), ${g.structureCount} structure(s).`,
  ].filter(Boolean);
  return lines.join("\n");
}

function bedBlock(b: ActiveBedContext): string {
  const lines = [
    `Selected bed: ${b.name} (${b.shapeType}).`,
    b.sun ? `Sun: ${b.sun}` : null,
    b.soilNotes ? `Soil: ${b.soilNotes}` : null,
    b.plantings.length
      ? `Plantings: ${b.plantings.join(", ")}.`
      : "No plantings recorded in this bed.",
    b.observations.length
      ? `Recent notes on this bed:\n- ${b.observations.slice(0, 5).join("\n- ")}`
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Pure: build the exact §6.4 message array sent to the model. */
export function assembleCoachMessages(ctx: CoachContext): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: coachSystemPrompt(ctx.voice) },
    { role: "system", content: gardenBlock(ctx.garden) },
  ];
  if (ctx.activeBed) {
    messages.push({ role: "system", content: bedBlock(ctx.activeBed) });
  }
  if (ctx.recentObservations.length > 0) {
    messages.push({
      role: "system",
      content: `Recent garden observations (newest first):\n- ${ctx.recentObservations
        .slice(0, 5)
        .join("\n- ")}`,
    });
  }
  const window = ctx.historyWindow ?? 20;
  for (const m of ctx.history.slice(-window)) {
    messages.push(m);
  }
  messages.push({ role: "user", content: ctx.userMessage });
  return messages;
}
