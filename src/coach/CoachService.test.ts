import { describe, expect, it } from "vitest";
import { assembleCoachMessages, type CoachContext } from "./CoachService";

const base: CoachContext = {
  voice: "mystical",
  garden: {
    name: "Backyard",
    zone: "7b",
    bedCount: 2,
    pathCount: 1,
    structureCount: 0,
  },
  recentObservations: [],
  history: [],
  userMessage: "what should I plant alongside these?",
};

describe("assembleCoachMessages (§6.4 order)", () => {
  it("orders system → garden → bed → observations → history → user", () => {
    const ctx: CoachContext = {
      ...base,
      activeBed: {
        name: "Salsa bed",
        shapeType: "rect",
        sun: "full",
        plantings: ["Tomato", "Pepper"],
        observations: ["aphids on the tomato"],
      },
      recentObservations: ["2026-05-10 — first true leaves"],
      history: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    };
    const msgs = assembleCoachMessages(ctx);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[0]!.content).toMatch(/treat plants as kin/);
    expect(msgs[1]!.content).toMatch(/Garden: Backyard/);
    expect(msgs[2]!.content).toMatch(/Salsa bed/);
    expect(msgs[2]!.content).toMatch(/Tomato, Pepper/);
    expect(msgs[3]!.content).toMatch(/Recent garden observations/);
    expect(msgs[4]).toEqual({ role: "user", content: "hi" });
    expect(msgs[5]).toEqual({ role: "assistant", content: "hello" });
    expect(msgs[msgs.length - 1]).toEqual({
      role: "user",
      content: "what should I plant alongside these?",
    });
  });

  it("plain voice swaps the system register", () => {
    const msgs = assembleCoachMessages({ ...base, voice: "plain" });
    expect(msgs[0]!.content).toMatch(/speak plainly and warmly/);
    expect(msgs[0]!.content).not.toMatch(/liturgy/);
  });

  it("omits bed/observation blocks when absent and windows history", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `m${i}`,
    }));
    const msgs = assembleCoachMessages({ ...base, history, historyWindow: 10 });
    // system + garden + 10 history + user = 13
    expect(msgs).toHaveLength(13);
    expect(msgs[2]!.content).toBe("m20");
  });
});
