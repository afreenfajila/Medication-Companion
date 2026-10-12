// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFailureSchema, elevenLabsTokenResponseSchema } from "@/lib/api/schemas";
import { resetRateLimit } from "@/lib/api/rate-limit";
import { DEFAULT_TTS_MODEL, POST, resetVoiceCheckCache } from "./route";

const PERMANENT_KEY = "xi-PERMANENT-SECRET-0123456789abcdef";
const TOKEN_URL = "https://api.elevenlabs.io/v1/single-use-token/tts_websocket";

function req(headers?: Record<string, string>) {
  return new Request("http://localhost/api/voice/elevenlabs-token", { method: "POST", headers: { ...headers } });
}

type Reply = () => Response | Promise<Response>;
/** A fake ElevenLabs: the voice check, the model list and the token mint answer separately. */
function provider({
  voice = () => Response.json({ voice_id: "voice_fictional" }),
  models = () => Response.json([{ model_id: DEFAULT_TTS_MODEL, can_do_text_to_speech: true }, { model_id: "eleven_turbo_v2_5", can_do_text_to_speech: true }]),
  token = () => Response.json({ token: "sut_abc" }),
}: { voice?: Reply; models?: Reply; token?: Reply } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === TOKEN_URL) return token();
    if (url.endsWith("/v1/models")) return models();
    if (url.includes("/v1/voices/")) return voice();
    throw new Error(`unexpected ${url}`);
  });
}
const calls = (part: string) => fetchMock.mock.calls.filter(([u]) => String(u).includes(part)).length;
const code = async (res: Response) => apiFailureSchema.parse(await res.json()).error.code;

const fetchMock = vi.fn();

beforeEach(() => {
  resetRateLimit();
  resetVoiceCheckCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ELEVENLABS_API_KEY", PERMANENT_KEY);
  vi.stubEnv("ELEVENLABS_VOICE_ID", "voice_fictional");
  vi.stubEnv("ELEVENLABS_TTS_MODEL", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/voice/elevenlabs-token", () => {
  it("checks the configured voice and model, then returns a single-use token — never the permanent key", async () => {
    provider();
    const res = await POST(req());
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(PERMANENT_KEY);
    const parsed = elevenLabsTokenResponseSchema.parse(JSON.parse(text));
    expect(parsed.ok && parsed.data).toEqual({ token: "sut_abc", voiceId: "voice_fictional", modelId: DEFAULT_TTS_MODEL });
    const tokenCall = fetchMock.mock.calls.find(([u]) => u === TOKEN_URL) as [string, RequestInit];
    expect((tokenCall[1].headers as Record<string, string>)["xi-api-key"]).toBe(PERMANENT_KEY);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v1/voices/voice_fictional");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("the voice/model check is cached: a call's many tokens cost one check", async () => {
    provider();
    for (let i = 0; i < 5; i++) expect((await POST(req())).status).toBe(200);
    expect(calls("/v1/voices/")).toBe(1);
    expect(calls("/v1/models")).toBe(1);
    expect(calls("single-use-token")).toBe(5);
  });

  it("uses ELEVENLABS_TTS_MODEL when set", async () => {
    vi.stubEnv("ELEVENLABS_TTS_MODEL", "eleven_turbo_v2_5");
    provider();
    const parsed = elevenLabsTokenResponseSchema.parse(await (await POST(req())).json());
    expect(parsed.ok && parsed.data.modelId).toBe("eleven_turbo_v2_5");
  });

  it.each([
    ["no key", { ELEVENLABS_API_KEY: "" }],
    ["no voice", { ELEVENLABS_VOICE_ID: "" }],
  ])("503 'unconfigured' when not configured (%s), without calling ElevenLabs", async (_name, env) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(await code(res)).toBe("voice_output_unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["not found", () => Response.json({ detail: { status: "voice_not_found", message: "…" } }, { status: 404 })],
    ["malformed id", () => Response.json({ detail: { status: "invalid_voice_id" } }, { status: 400 })],
    ["not on this plan", () => Response.json({ detail: { status: "subscription_required" } }, { status: 403 })],
  ])("a voice this account can't use (%s) fails before any token is minted", async (_name, voice) => {
    provider({ voice });
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(await code(res)).toBe("voice_unavailable");
    expect(calls("single-use-token")).toBe(0);
  });

  it("a model that isn't available, or can't do text-to-speech, fails before any token is minted", async () => {
    vi.stubEnv("ELEVENLABS_TTS_MODEL", "eleven_imaginary_v9");
    provider();
    expect(await code(await POST(req()))).toBe("model_unavailable");
    resetVoiceCheckCache();
    vi.stubEnv("ELEVENLABS_TTS_MODEL", "eleven_sts");
    provider({ models: () => Response.json([{ model_id: "eleven_sts", can_do_text_to_speech: false }]) });
    expect(await code(await POST(req()))).toBe("model_unavailable");
    expect(calls("single-use-token")).toBe(0);
  });

  it("credits used up is its own reason", async () => {
    provider({ token: () => Response.json({ detail: { status: "quota_exceeded" } }, { status: 402 }) });
    expect(await code(await POST(req()))).toBe("quota_exceeded");
  });

  it("a key that may not read voices is not proof the voice is unavailable: the token is still minted", async () => {
    provider({
      voice: () => Response.json({ detail: { status: "missing_permissions" } }, { status: 403 }),
      models: () => Response.json({ detail: { status: "missing_permissions" } }, { status: 403 }),
    });
    expect((await POST(req())).status).toBe(200);
  });

  it.each([
    ["provider error", { token: () => Response.json({ detail: `bad ${PERMANENT_KEY}` }, { status: 401 }) }],
    ["the key echoed back", { token: () => Response.json({ token: PERMANENT_KEY }) }],
    ["empty token", { token: () => Response.json({ token: "" }) }],
    ["network failure", { token: () => Promise.reject(new Error("ECONNRESET")) }],
    ["rejected key at the check", { voice: () => Response.json({ detail: `bad ${PERMANENT_KEY}` }, { status: 401 }) }],
  ])("a provider problem (%s) is a safe 503 'token_unavailable' with no secret in the body", async (_name, replies) => {
    provider(replies);
    const res = await POST(req());
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(text).not.toContain(PERMANENT_KEY);
    expect(apiFailureSchema.parse(JSON.parse(text)).error.code).toBe("token_unavailable");
  });

  it("logs reason codes and statuses only — never the key, a token or a provider body", async () => {
    const logged: string[] = [];
    vi.mocked(console.error).mockImplementation((...args: unknown[]) => void logged.push(args.join(" ")));
    provider({ voice: () => Response.json({ detail: { status: "voice_not_found", message: `secret ${PERMANENT_KEY}` } }, { status: 404 }) });
    await POST(req());
    resetVoiceCheckCache();
    provider({ token: () => Response.json({ token: "sut_LEAKED", detail: PERMANENT_KEY }, { status: 500 }) });
    await POST(req());
    expect(logged.join("\n")).not.toMatch(new RegExp(`${PERMANENT_KEY}|sut_|voice_fictional|secret`));
    expect(logged.join("\n")).toMatch(/pre-flight voice_unavailable/);
  });

  it("refuses cross-origin requests", async () => {
    const res = await POST(req({ origin: "https://evil.example", host: "localhost" }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate-limits repeated calls", async () => {
    provider();
    let last = 200;
    for (let i = 0; i < 122; i++) last = (await POST(req())).status;
    expect(last).toBe(429);
  });
});
