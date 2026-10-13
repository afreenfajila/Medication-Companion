// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFailureSchema, openAiSessionResponseSchema } from "@/lib/api/schemas";
import { resetRateLimit } from "@/lib/api/rate-limit";
import { DEFAULT_TRANSCRIBE_MODEL, POST } from "./route";

const PERMANENT_KEY = "sk-proj-PERMANENT-SECRET-0123456789";

function req(body: unknown = { language: "en" }, headers?: Record<string, string>) {
  return new Request("http://localhost/api/voice/openai-session", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  resetRateLimit();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENAI_API_KEY", PERMANENT_KEY);
  vi.stubEnv("OPENAI_TRANSCRIBE_MODEL", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/voice/openai-session", () => {
  it("returns a short-lived client secret and never the permanent key", async () => {
    fetchMock.mockResolvedValue(Response.json({ value: "ek_abc123", expires_at: 1_900_000_000, session: {} }));
    const res = await POST(req());
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(PERMANENT_KEY);
    const parsed = openAiSessionResponseSchema.parse(JSON.parse(text));
    expect(parsed.ok && parsed.data).toEqual({
      clientSecret: "ek_abc123",
      model: DEFAULT_TRANSCRIBE_MODEL,
      wsUrl: "wss://api.openai.com/v1/realtime",
      expiresAt: 1_900_000_000,
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("asks OpenAI for a transcription-only session with no server turn detection and the language hints", async () => {
    fetchMock.mockResolvedValue(Response.json({ value: "ek_x", expires_at: 1 }));
    await POST(req({ language: "zh-Hans" }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${PERMANENT_KEY}`);
    const body = JSON.parse(String(init.body));
    expect(body.session.type).toBe("transcription");
    expect(body.session.audio.input.turn_detection).toBeNull();
    expect(body.session.audio.input.transcription).toEqual({ model: DEFAULT_TRANSCRIBE_MODEL, languages: ["zh", "en"] });
    expect(body.session.audio.input.format).toEqual({ type: "audio/pcm", rate: 24000 });
    expect(JSON.stringify(body)).not.toMatch(/metformin|instruction|record|pharmac/i); // nothing about the person rides along
  });

  it("uses OPENAI_TRANSCRIBE_MODEL when set", async () => {
    vi.stubEnv("OPENAI_TRANSCRIBE_MODEL", "gpt-live-transcribe");
    fetchMock.mockResolvedValue(Response.json({ value: "ek_x", expires_at: 1 }));
    const res = await POST(req());
    const parsed = openAiSessionResponseSchema.parse(await res.json());
    expect(parsed.ok && parsed.data.model).toBe("gpt-live-transcribe");
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).session.audio.input.transcription.model).toBe("gpt-live-transcribe");
  });

  it("503 when OPENAI_API_KEY is not configured, without calling OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(apiFailureSchema.parse(await res.json()).error.code).toBe("voice_input_unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["provider error", () => Response.json({ error: { message: `bad key ${PERMANENT_KEY}` } }, { status: 401 })],
    ["malformed secret", () => Response.json({ value: "not-ephemeral" })],
    ["network failure", () => Promise.reject(new Error("ECONNRESET"))],
  ])("a provider problem (%s) is a safe 503 with no secret in the body", async (_name, reply) => {
    fetchMock.mockImplementation(() => Promise.resolve(reply()).catch((e) => Promise.reject(e)));
    const res = await POST(req());
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(text).not.toContain(PERMANENT_KEY);
    expect(apiFailureSchema.safeParse(JSON.parse(text)).success).toBe(true);
  });

  it("rejects an unsupported language", async () => {
    const res = await POST(req({ language: "fr" }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses cross-origin requests", async () => {
    const res = await POST(req(undefined, { origin: "https://evil.example", host: "localhost" }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate-limits repeated calls", async () => {
    fetchMock.mockResolvedValue(Response.json({ value: "ek_x", expires_at: 1 }));
    let last = 200;
    for (let i = 0; i < 22; i++) last = (await POST(req())).status;
    expect(last).toBe(429);
  });
});
