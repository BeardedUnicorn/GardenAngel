import { create } from "zustand";
import { createOpenAiCompatAdapter } from "../ai/openaiCompatAdapter";
import { useProjectStore } from "../project/projectStore";
import { useSettingsStore } from "../settings/settingsStore";
import { useCanvasStore } from "../canvas/canvasStore";
import { plantsApi } from "../plants/plantsApi";
import { getCachedDetail } from "../plants/plantCache";
import { assembleCoachMessages, type CoachContext } from "./CoachService";
import { coachApi } from "./coachApi";

export interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
}

interface CoachState {
  isOpen: boolean;
  conversationId: number | null;
  messages: DisplayMessage[];
  streaming: boolean;
  lastError: string | null;

  toggle: () => void;
  close: () => void;
  init: () => Promise<void>;
  reset: () => void;
  send: (text: string) => Promise<void>;
  clearError: () => void;
}

function errToString(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return JSON.stringify(err);
}

async function buildContext(userMessage: string): Promise<CoachContext> {
  const project = useProjectStore.getState().current;
  const canvas = useCanvasStore.getState();
  const settings = useSettingsStore.getState();

  const ctx: CoachContext = {
    voice: settings.coachVoice,
    garden: {
      name: project?.name ?? "Untitled Garden",
      bedCount: canvas.beds.length,
      pathCount: canvas.paths.length,
      structureCount: canvas.structures.length,
    },
    recentObservations: [],
    history: useCoachStore
      .getState()
      .messages.map((m) => ({ role: m.role, content: m.content })),
    userMessage,
  };

  try {
    const recent = await coachApi.recentObservations(5);
    ctx.recentObservations = recent.map(
      (o) => `${o.observed_at.slice(0, 10)} — ${o.body}`,
    );
  } catch {
    // Observations are best-effort context, never block a coach reply.
  }

  const sel = canvas.selection;
  if (sel?.kind === "bed") {
    const bed = canvas.beds.find((b) => b.id === sel.id);
    if (bed) {
      const plantings = await plantsApi.plantingsList(bed.id).catch(() => []);
      const names: string[] = [];
      for (const p of plantings) {
        const d = await getCachedDetail(p.plant_id);
        names.push(d?.common_name ?? p.plant_id);
      }
      const obs = await coachApi.bedObservations(bed.id).catch(() => []);
      ctx.activeBed = {
        name: bed.name ?? `Bed ${bed.id}`,
        shapeType: bed.shape_type,
        soilNotes: bed.soil_notes,
        sun: bed.sun_exposure,
        plantings: names,
        observations: obs.map((o) => o.body),
      };
    }
  }
  return ctx;
}

export const useCoachStore = create<CoachState>((set, get) => ({
  isOpen: false,
  conversationId: null,
  messages: [],
  streaming: false,
  lastError: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  clearError: () => set({ lastError: null }),
  reset: () =>
    set({ conversationId: null, messages: [], streaming: false, lastError: null }),

  async init() {
    if (get().conversationId !== null) return;
    try {
      const conv = await coachApi.ensureConversation();
      const rows = await coachApi.listMessages(conv.id);
      set({
        conversationId: conv.id,
        messages: rows
          .filter((r) => r.role !== "system")
          .map((r) => ({ role: r.role as "user" | "assistant", content: r.content })),
      });
    } catch (err) {
      set({ lastError: errToString(err) });
    }
  },

  async send(text) {
    const body = text.trim();
    if (!body || get().streaming) return;
    await get().init();
    const conversationId = get().conversationId;
    if (conversationId === null) {
      set({ lastError: "No conversation (is a project open?)." });
      return;
    }

    set((s) => ({
      messages: [...s.messages, { role: "user", content: body }],
      streaming: true,
      lastError: null,
    }));

    try {
      const ctx = await buildContext(body);
      // History already includes the just-added user turn; drop it so it
      // isn't duplicated by assembleCoachMessages' explicit userMessage.
      ctx.history = ctx.history.slice(0, -1);

      await coachApi.addMessage(conversationId, "user", body, null);

      const config = await useSettingsStore.getState().resolveConfig();
      const adapter = createOpenAiCompatAdapter(config);
      const messages = assembleCoachMessages(ctx);

      set((s) => ({ messages: [...s.messages, { role: "assistant", content: "" }] }));
      let acc = "";
      const stream = adapter.chatStream!({
        model: config.model,
        messages,
        temperature: 0.7,
      });
      for await (const piece of stream) {
        acc += piece;
        set((s) => {
          const next = s.messages.slice();
          next[next.length - 1] = { role: "assistant", content: acc };
          return { messages: next };
        });
      }
      if (acc.length === 0) acc = "(no response)";
      await coachApi.addMessage(conversationId, "assistant", acc, config.model);
      useProjectStore.getState().markDirty();
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ streaming: false });
    }
  },
}));
