// OpenAI-compatible chat adapter. Targets `${baseUrl}/chat/completions`.
//
// Network goes through @tauri-apps/plugin-http (not browser fetch) to
// sidestep CORS and keep a single future request-logging hook — see
// AGENTS.md. The transport is injectable so request shaping and response
// parsing are unit-testable without a live endpoint.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { ChatRequest, ChatResponse, ModelAdapter, ModelConfig } from "./types";

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function buildChatBody(req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;
  if (req.stream !== undefined) body.stream = req.stream;
  if (req.response_format !== undefined) body.response_format = req.response_format;
  return body;
}

export function parseChatResponse(raw: string): ChatResponse {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Model returned non-JSON response: ${raw.slice(0, 200)}`);
  }
  const obj = json as {
    choices?: { message?: { content?: string } }[];
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (obj.error?.message) {
    throw new Error(`Model API error: ${obj.error.message}`);
  }
  const content = obj.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Model response missing choices[0].message.content");
  }
  const response: ChatResponse = { content, model: obj.model ?? "unknown" };
  if (
    obj.usage &&
    typeof obj.usage.prompt_tokens === "number" &&
    typeof obj.usage.completion_tokens === "number"
  ) {
    response.usage = {
      prompt_tokens: obj.usage.prompt_tokens,
      completion_tokens: obj.usage.completion_tokens,
    };
  }
  return response;
}

export function createOpenAiCompatAdapter(
  config: ModelConfig,
  fetchImpl: FetchLike = tauriFetch as unknown as FetchLike,
): ModelAdapter {
  return {
    name: "openai-compat",
    async chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
      if (!config.baseUrl) throw new Error("No API base URL configured (Settings).");
      if (!config.apiKey) throw new Error("No API key configured (Settings).");
      const url = joinUrl(config.baseUrl, "chat/completions");
      const init: Parameters<FetchLike>[1] = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildChatBody({ ...req, model: req.model || config.model })),
      };
      if (signal) init.signal = signal;
      const res = await fetchImpl(url, init);
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Model request failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
      }
      return parseChatResponse(text);
    },
  };
}
