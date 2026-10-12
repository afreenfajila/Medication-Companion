import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakePlayback, FakeWebSocket, fakeWebSocketCtor } from "@/test/fake-audio";
import type { SpeechEvent } from "./adapters";
import { ElevenLabsSpeech, ELEVENLABS_SAMPLE_RATE, providerReason, SLOW_SPEED, START_TIMEOUT_MS, streamInputUrl, type ElevenLabsToken, type TokenResult } from "./elevenlabs-speech";

const token: ElevenLabsToken = { token: "sut_1", voiceId: "voice_fictional", modelId: "eleven_flash_v2_5" };
const id = (turnId: number) => ({ callId: 1, turnId });

function setup(opts: { approve?: (t: string) => boolean; tokens?: Array<ElevenLabsToken | null> } = {}) {
  const tokens = opts.tokens ?? [token, { ...token, token: "sut_2" }, { ...token, token: "sut_3" }];
  let n = 0;
  const fetchToken = vi.fn(async (): Promise<TokenResult> => {
    const t = tokens[Math.min(n++, tokens.length - 1)];
    return t ? { ok: true, token: t } : { ok: false, reason: "token-unavailable" };
  });
  const playback = new FakePlayback();
  const a = new ElevenLabsSpeech({ fetchToken, WebSocket: fakeWebSocketCtor, playback, approve: opts.approve });
  const events: SpeechEvent[] = [];
  a.subscribe((e) => events.push(e));
  return { a, playback, events, fetchToken };
}

async function speaking(text = "Here is what your record says.", opts: Parameters<typeof setup>[0] & { slow?: boolean; language?: "en" | "zh-Hans" } = {}) {
  const s = setup(opts);
  await s.a.connect({ callId: 1 });
  s.a.speak({ identity: id(1), text, language: opts.language ?? "en", slow: opts.slow ?? false });
  await Promise.resolve();
  await Promise.resolve();
  const ws = FakeWebSocket.instances.at(-1)!;
  return { ...s, ws };
}

const chunk = (bytes: number[]) => Buffer.from(bytes).toString("base64");

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.reset();
});
afterEach(() => vi.useRealTimers());

describe("ElevenLabs streaming speech adapter", () => {
  it("prefetches a single-use token at connect; connect fails when none can be minted", async () => {
    const { a, fetchToken } = setup();
    expect(await a.connect({ callId: 1 })).toBe(true);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    const none = setup({ tokens: [null] });
    expect(await none.a.connect({ callId: 1 })).toBe(false);
    expect(none.a.unavailableReason).toBe("token-unavailable");
  });

  it("opens one socket per line with the token, voice, model, PCM 24 kHz and language in the URL — never a permanent key", async () => {
    const { ws } = await speaking("随餐服用。", { language: "zh-Hans" });
    const url = new URL(ws.url);
    expect(url.pathname).toBe("/v1/text-to-speech/voice_fictional/stream-input");
    expect(url.searchParams.get("single_use_token")).toBe("sut_1");
    expect(url.searchParams.get("model_id")).toBe("eleven_flash_v2_5");
    expect(url.searchParams.get("output_format")).toBe("pcm_24000");
    expect(url.searchParams.get("language_code")).toBe("zh");
    expect(ws.url).not.toMatch(/xi-api-key|xi_|sk-/);
    expect(streamInputUrl("wss://x", token, "en")).toContain("language_code=en");
  });

  it("sends exactly the visible text, flushed, then end-of-line — and nothing else", async () => {
    const { ws } = await speaking("Here is what your record says.", { slow: true });
    ws.open();
    expect(ws.jsons).toEqual([
      { text: " ", voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: SLOW_SPEED }, generation_config: { chunk_length_schedule: [50, 120, 160, 290] } },
      { text: "Here is what your record says. ", flush: true },
      { text: "" },
    ]);
  });

  it("plays each audio chunk under the line's identity and finishes the stream on isFinal; a late chunk is dropped", async () => {
    const { a, ws, playback, events } = await speaking();
    ws.open();
    expect(playback.begins).toEqual([{ identity: id(1), sampleRate: ELEVENLABS_SAMPLE_RATE }]);
    ws.message({ audio: chunk([0, 0, 255, 127]), isFinal: null });
    expect(playback.chunks).toHaveLength(1);
    expect(Array.from(playback.chunks[0].pcm16)).toEqual([0, 32767]);
    playback.emit({ type: "started", identity: id(1) });
    expect(events).toEqual([{ type: "started", identity: id(1) }]);
    ws.message({ audio: chunk([1, 0]), isFinal: true });
    expect(playback.finishes).toEqual([id(1)]);
    expect(ws.closed).toBe(true);
    ws.message({ audio: chunk([2, 0]) }); // after the socket was released
    expect(playback.chunks).toHaveLength(2);
    playback.emit({ type: "ended", identity: id(1) });
    expect(events.at(-1)).toEqual({ type: "ended", identity: id(1) });
    a.dispose();
  });

  it("refuses to voice text that is not approved: no socket, no token spent, failed before audio", async () => {
    const { a, events, fetchToken } = setup({ approve: (t) => t === "Approved line." });
    await a.connect({ callId: 1 });
    a.speak({ identity: id(1), text: "Take two tablets now.", language: "en", slow: false });
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(events).toEqual([{ type: "failed", identity: id(1), beforeAudio: true, code: "unapproved" }]);
    expect(fetchToken).toHaveBeenCalledTimes(1); // only the connect-time prefetch
    a.speak({ identity: id(2), text: "Approved line.", language: "en", slow: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("a socket failure before audio is a before-audio failure; after audio started it is an interruption, not a retry", async () => {
    const first = await speaking();
    first.ws.open();
    first.ws.error();
    expect(first.events).toEqual([{ type: "failed", identity: id(1), beforeAudio: true, code: "websocket-failed" }]);
    expect(first.playback.stops).toBe(1);

    FakeWebSocket.reset();
    const second = await speaking();
    second.ws.open();
    second.ws.message({ audio: chunk([0, 0]) });
    second.playback.emit({ type: "started", identity: id(1) });
    second.ws.serverClose();
    expect(second.events.at(-1)).toEqual({ type: "failed", identity: id(1), beforeAudio: false, code: "websocket-failed" });
    expect(FakeWebSocket.instances).toHaveLength(1); // no second socket for the same line
  });

  it("a provider error message or no audio at all within the start window fails before audio", async () => {
    const errored = await speaking();
    errored.ws.open();
    errored.ws.message({ error: "quota_exceeded", message: "…" });
    expect(errored.events.at(-1)).toMatchObject({ type: "failed", beforeAudio: true, code: "quota-exceeded" });

    FakeWebSocket.reset();
    const silent = await speaking();
    silent.ws.open();
    vi.advanceTimersByTime(START_TIMEOUT_MS);
    expect(silent.events.at(-1)).toMatchObject({ type: "failed", beforeAudio: true, code: "timeout" });
    expect(silent.ws.closed).toBe(true);
  });

  it("interrupt() stops playback, closes the socket and drops everything that arrives afterwards for that line", async () => {
    const { a, ws, playback, events } = await speaking();
    ws.open();
    ws.message({ audio: chunk([0, 0]) });
    playback.emit({ type: "started", identity: id(1) });
    a.interrupt(id(1));
    expect(playback.stops).toBe(1);
    expect(ws.closed).toBe(true);
    const before = events.length;
    ws.message({ audio: chunk([3, 0]), isFinal: true });
    playback.emit({ type: "ended", identity: id(1) });
    expect(playback.chunks).toHaveLength(1);
    expect(events).toHaveLength(before);
  });

  it("a new line replaces the current one and uses a fresh token", async () => {
    const { a, ws } = await speaking();
    ws.open();
    a.speak({ identity: id(2), text: "Next.", language: "en", slow: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(ws.closed).toBe(true);
    const next = FakeWebSocket.instances.at(-1)!;
    expect(next).not.toBe(ws);
    expect(new URL(next.url).searchParams.get("single_use_token")).toBe("sut_2");
  });

  it("without a token for this line the line fails before audio (the browser may take over)", async () => {
    const { a, events } = setup({ tokens: [token, null] });
    await a.connect({ callId: 1 });
    a.speak({ identity: id(1), text: "Hello.", language: "en", slow: false }); // consumes sut_1's prefetch? No: the prefetch is used here…
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(1);
    a.interrupt(id(1));
    a.speak({ identity: id(2), text: "Again.", language: "en", slow: false }); // …and the next prefetch was null
    await Promise.resolve();
    await Promise.resolve();
    expect(events.at(-1)).toEqual({ type: "failed", identity: id(2), beforeAudio: true, code: "token-unavailable" });
  });
});

describe("free-tier robustness: pre-flight, reason codes, no repeated retries", () => {
  const routeFailure = (reason: "voice-unavailable" | "model-unavailable" | "unconfigured" | "quota-exceeded") => {
    const fetchToken = vi.fn(async (): Promise<TokenResult> => ({ ok: false, reason }));
    const a = new ElevenLabsSpeech({ fetchToken, WebSocket: fakeWebSocketCtor, playback: new FakePlayback() });
    return { a, fetchToken };
  };

  it("a voice the account can't use fails at connect with its reason — before any socket or playback", async () => {
    for (const reason of ["voice-unavailable", "model-unavailable", "unconfigured", "quota-exceeded"] as const) {
      FakeWebSocket.reset();
      const { a } = routeFailure(reason);
      expect(await a.connect({ callId: 1 })).toBe(false);
      expect(a.unavailableReason).toBe(reason);
      expect(FakeWebSocket.instances).toHaveLength(0);
    }
  });

  it("pre-flight: a line from another call, or with no visible text, never opens a socket", async () => {
    const { a, events } = setup();
    await a.connect({ callId: 1 });
    a.speak({ identity: { callId: 2, turnId: 1 }, text: "Hello.", language: "en", slow: false });
    a.speak({ identity: id(2), text: "   ", language: "en", slow: false });
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(events.map((e) => (e.type === "failed" ? e.code : e.type))).toEqual(["not-allowed", "no-approved-text"]);
  });

  it("maps documented provider errors to reason codes, never passing the raw text on", () => {
    expect(providerReason("voice_not_found The specified voice ID does not exist")).toBe("voice-unavailable");
    expect(providerReason("subscription_required")).toBe("voice-unavailable");
    expect(providerReason("quota_exceeded")).toBe("quota-exceeded");
    expect(providerReason("insufficient_credits")).toBe("quota-exceeded");
    expect(providerReason("model_access_denied")).toBe("model-unavailable");
    expect(providerReason("invalid_api_key")).toBe("token-unavailable");
    expect(providerReason("something else")).toBe("websocket-failed");
  });

  it("a voice rejected by the socket before audio is 'voice-unavailable', and later lines fail fast with no new token or socket", async () => {
    const { a, ws, events, fetchToken } = await speaking();
    ws.open();
    ws.message({ error: "voice_not_found", message: "The specified voice ID does not exist." });
    expect(events.at(-1)).toEqual({ type: "failed", identity: id(1), beforeAudio: true, code: "voice-unavailable" });
    const fetched = fetchToken.mock.calls.length;
    a.speak({ identity: id(2), text: "Next line.", language: "en", slow: false });
    a.speak({ identity: id(3), text: "Another line.", language: "en", slow: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(1); // no retry this call
    expect(fetchToken.mock.calls.length).toBe(fetched); // and no tokens spent
    expect(events.slice(-2).map((e) => (e.type === "failed" ? e.code : e.type))).toEqual(["voice-unavailable", "voice-unavailable"]);
    // A new call starts fresh.
    await a.connect({ callId: 2 });
    a.speak({ identity: { callId: 2, turnId: 1 }, text: "Hello.", language: "en", slow: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("a close with a provider reason is mapped too; audio that can't be decoded is 'playback-decode-failed'", async () => {
    const closed = await speaking();
    closed.ws.open();
    closed.ws.onclose?.call(closed.ws, { reason: "quota_exceeded" });
    expect(closed.events.at(-1)).toMatchObject({ beforeAudio: true, code: "quota-exceeded" });

    FakeWebSocket.reset();
    const bad = await speaking();
    bad.ws.open();
    bad.ws.message({ audio: "%%%not-base64%%%" });
    expect(bad.events.at(-1)).toMatchObject({ beforeAudio: true, code: "playback-decode-failed" });

    FakeWebSocket.reset();
    const queue = await speaking();
    queue.ws.open();
    queue.playback.emit({ type: "failed", identity: id(1), beforeAudio: true });
    expect(queue.events.at(-1)).toMatchObject({ beforeAudio: true, code: "playback-decode-failed" });
  });

  it("a long safety-critical line is sent whole and unchanged — no trimming for credits", async () => {
    const urgent =
      "This may need urgent help. Please contact local emergency services or urgent medical care now. If you can, ask someone near you to help.";
    const { ws } = await speaking(urgent);
    ws.open();
    expect(ws.json(1)).toEqual({ text: `${urgent} `, flush: true });
  });
});
