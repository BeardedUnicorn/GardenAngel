import { describe, expect, it } from "vitest";
import {
  buildChatBody,
  createOpenAiCompatAdapter,
  joinUrl,
  parseChatResponse,
  parseOpenAiStream,
} from "./openaiCompatAdapter";

describe("joinUrl", () => {
  it("normalizes trailing/leading slashes", () => {
    expect(joinUrl("https://api.example.com/v1/", "/chat/completions")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    expect(joinUrl("https://api.example.com/v1", "chat/completions")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });
});

describe("buildChatBody", () => {
  it("includes only defined optional fields", () => {
    const body = buildChatBody({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0,
      response_format: { type: "json_object" },
    });
    expect(body).toEqual({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0,
      response_format: { type: "json_object" },
    });
    expect("max_tokens" in body).toBe(false);
    expect("stream" in body).toBe(false);
  });
});

describe("parseChatResponse", () => {
  it("extracts content + usage", () => {
    const r = parseChatResponse(
      JSON.stringify({
        model: "gpt-x",
        choices: [{ message: { content: "hello" } }],
        usage: { prompt_tokens: 3, completion_tokens: 5 },
      }),
    );
    expect(r.content).toBe("hello");
    expect(r.model).toBe("gpt-x");
    expect(r.usage).toEqual({ prompt_tokens: 3, completion_tokens: 5 });
  });

  it("throws on API error payloads", () => {
    expect(() => parseChatResponse(JSON.stringify({ error: { message: "bad key" } }))).toThrow(
      /bad key/,
    );
  });

  it("throws on missing content", () => {
    expect(() => parseChatResponse(JSON.stringify({ choices: [] }))).toThrow();
  });
});

describe("parseOpenAiStream", () => {
  it("concatenates ordered deltas and ignores [DONE]/keepalive", () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Bas"}}]}',
      'data: {"choices":[{"delta":{"content":"il"}}]}',
      "data: [DONE]",
      "",
    ].join("\n");
    expect(parseOpenAiStream(sse)).toEqual(["Bas", "il"]);
    expect(parseOpenAiStream("garbage").length).toBe(0);
  });
});

describe("createOpenAiCompatAdapter.chatStream", () => {
  it("yields parsed deltas, falling back to plain JSON", async () => {
    const sseAdapter = createOpenAiCompatAdapter(
      { baseUrl: "https://x", apiKey: "k", model: "m" },
      async () => ({
        ok: true,
        status: 200,
        text: async () =>
          'data: {"choices":[{"delta":{"content":"hi"}}]}\ndata: [DONE]\n',
      }),
    );
    const chunks: string[] = [];
    for await (const c of sseAdapter.chatStream!({ model: "m", messages: [] })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("hi");

    const jsonAdapter = createOpenAiCompatAdapter(
      { baseUrl: "https://x", apiKey: "k", model: "m" },
      async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ model: "m", choices: [{ message: { content: "whole" } }] }),
      }),
    );
    const out: string[] = [];
    for await (const c of jsonAdapter.chatStream!({ model: "m", messages: [] })) out.push(c);
    expect(out.join("")).toBe("whole");
  });
});

describe("createOpenAiCompatAdapter.chat", () => {
  it("POSTs to /chat/completions with bearer auth and parses the reply", async () => {
    const calls: { url: string; init: unknown }[] = [];
    const fakeFetch = async (url: string, init?: unknown) => {
      calls.push({ url, init: init! });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ model: "m", choices: [{ message: { content: "ok" } }] }),
      };
    };
    const adapter = createOpenAiCompatAdapter(
      { baseUrl: "https://api.example.com/v1", apiKey: "secret", model: "m" },
      fakeFetch,
    );
    const res = await adapter.chat({ model: "", messages: [{ role: "user", content: "hi" }] });
    expect(res.content).toBe("ok");
    expect(calls[0]!.url).toBe("https://api.example.com/v1/chat/completions");
    const init = calls[0]!.init as { headers: Record<string, string>; body: string };
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body).model).toBe("m");
  });

  it("rejects when no API key is configured", async () => {
    const adapter = createOpenAiCompatAdapter(
      { baseUrl: "https://x", apiKey: "", model: "m" },
      async () => ({ ok: true, status: 200, text: async () => "{}" }),
    );
    await expect(
      adapter.chat({ model: "m", messages: [] }),
    ).rejects.toThrow(/API key/);
  });

  it("surfaces non-2xx HTTP errors", async () => {
    const adapter = createOpenAiCompatAdapter(
      { baseUrl: "https://x", apiKey: "k", model: "m" },
      async () => ({ ok: false, status: 500, text: async () => "upstream boom" }),
    );
    await expect(adapter.chat({ model: "m", messages: [] })).rejects.toThrow(/HTTP 500/);
  });
});
