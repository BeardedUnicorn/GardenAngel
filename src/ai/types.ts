// Model adapter interface — PLAN §6.1. "OpenAI-compatible" is leaky;
// document provider divergence in docs/DECISIONS.md as discovered.

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: "json_object" } | { type: "text" };
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface ModelAdapter {
  name: string;
  chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  chatStream?(req: ChatRequest, signal?: AbortSignal): AsyncIterable<string>;
}

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}
