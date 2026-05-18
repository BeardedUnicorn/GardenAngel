import { invoke } from "@tauri-apps/api/core";

export interface Conversation {
  id: number;
  garden_id: number;
  started_at: string;
  title: string | null;
}

export interface CoachMessageRow {
  id: number;
  conversation_id: number;
  role: "system" | "user" | "assistant";
  content: string;
  model: string | null;
  created_at: string;
}

export interface ObservationRow {
  id: number;
  garden_id: number;
  bed_id: number | null;
  planting_id: number | null;
  body: string;
  photo_path: string | null;
  observed_at: string;
  created_at: string;
}

export const coachApi = {
  ensureConversation: () => invoke<Conversation>("coach_conversation_ensure"),
  listMessages: (conversationId: number) =>
    invoke<CoachMessageRow[]>("coach_messages_list", { conversationId }),
  addMessage: (
    conversationId: number,
    role: "system" | "user" | "assistant",
    content: string,
    model: string | null,
  ) =>
    invoke<CoachMessageRow>("coach_message_add", {
      conversationId,
      role,
      content,
      model,
    }),
  recentObservations: (limit: number) =>
    invoke<ObservationRow[]>("observations_recent", { limit }),
  bedObservations: (bedId: number) =>
    invoke<ObservationRow[]>("observations_for_bed", { bedId }),
};
