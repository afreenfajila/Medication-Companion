import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakePlayback, FakeWebSocket, fakeWebSocketCtor, flush, frame } from "@/test/fake-audio";
import { BrowserSpeechAdapter } from "./browser-adapters";
import { ElevenLabsSpeech } from "./elevenlabs-speech";
import { OpenAiRealtimeTranscription } from "./openai-transcription";
import { WebAudioPlaybackQueue, type PlaybackContextLike } from "./playback-queue";
import type { SpeechVoiceProvider } from "./provider";

/**
 * Regression: in a real browser, `setTimeout`/`clearTimeout` stored on an object
 * and called as `this.setTimer(...)` throw "TypeError: Illegal invocation".
 * Node and jsdom don't, so these stand-ins do, exactly as Chrome does: they
 * accept being called as a plain function only.
 */
const realSet = globalThis.setTimeout;
const realClear = globalThis.clearTimeout;
let set = 0;
let cleared = 0;

beforeEach(() => {
  set = 0;
  cleared = 0;
  FakeWebSocket.reset();
  vi.stubGlobal("setTimeout", function (this: unknown, fn: () => void, ms?: number) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    set += 1;
    return realSet(fn, ms);
  });
  vi.stubGlobal("clearTimeout", function (this: unknown, id?: ReturnType<typeof realSet>) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    cleared += 1;
    return realClear(id);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("browser timers are called as plain functions (no 'Illegal invocation')", () => {
  it("the stand-in fails exactly like Chrome for the old pattern (stored, then called as a method)", () => {
    const old = { setTimer: setTimeout, clearTimer: clearTimeout };
    expect(() => old.setTimer(() => undefined, 1)).toThrow("Illegal invocation");
    expect(() => old.clearTimer(undefined)).toThrow("Illegal invocation");
  });

  it("ElevenLabs speech: a line's start timer is set and cleared", async () => {
    const speech = new ElevenLabsSpeech({
      fetchToken: async () => ({ ok: true, token: { token: "sut_1", voiceId: "v", modelId: "eleven_flash_v2_5" } }),
      WebSocket: fakeWebSocketCtor,
      playback: new FakePlayback(),
    });
    await speech.connect({ callId: 1 });
    expect(() => speech.speak({ identity: { callId: 1, turnId: 1 }, text: "Hello.", language: "en", slow: false })).not.toThrow();
    expect(set).toBeGreaterThan(0);
    await speech.disconnect();
    expect(cleared).toBeGreaterThan(0);
  });

  it("OpenAI transcription: a committed turn's final timer is set and cleared", async () => {
    const t = new OpenAiRealtimeTranscription({
      fetchSession: async () => ({ clientSecret: "ek_1", model: "gpt-live-transcribe", wsUrl: "wss://example.test", expiresAt: 1 }),
      WebSocket: fakeWebSocketCtor,
    });
    const connected = t.connect({ callId: 1, language: "en" });
    await flush();
    FakeWebSocket.instances[0].open();
    await connected;
    const id = { callId: 1, turnId: 1 };
    t.beginTurn(id);
    for (let at = 0; at < 1000; at += 64) t.appendAudio(frame(at, 0.1));
    expect(() => t.commitTurn(id)).not.toThrow();
    expect(set).toBeGreaterThan(0);
    t.cancelTurn(id);
    expect(cleared).toBeGreaterThan(0);
  });

  it("browser voice: the start timer is set and cleared", async () => {
    const provider = {
      capabilities: { recognition: false, synthesis: true },
      onSpeakingChange: () => () => undefined,
      speak: () => undefined,
      stopSpeaking: () => undefined,
    } as unknown as SpeechVoiceProvider;
    const adapter = new BrowserSpeechAdapter(provider);
    await adapter.connect();
    expect(() => adapter.speak({ identity: { callId: 1, turnId: 1 }, text: "Hello.", language: "en", slow: false })).not.toThrow();
    expect(set).toBeGreaterThan(0);
    adapter.interrupt({ callId: 1, turnId: 1 });
    expect(cleared).toBeGreaterThan(0);
  });

  it("Web Audio playback: the 'started' timer is set and cleared", () => {
    const ctx: PlaybackContextLike = {
      currentTime: 0,
      state: "running",
      destination: {},
      resume: async () => undefined,
      createBuffer: (_c, length, rate) => ({ duration: length / rate, getChannelData: () => new Float32Array(length) }),
      createBufferSource: () => ({ buffer: null, onended: null, connect: () => undefined, start: () => undefined, stop: () => undefined }),
    };
    const q = new WebAudioPlaybackQueue(() => ctx);
    q.begin({ callId: 1, turnId: 1 }, 24000);
    expect(() => q.enqueue({ callId: 1, turnId: 1 }, new Int16Array(240))).not.toThrow();
    expect(set).toBeGreaterThan(0);
    q.stop();
    expect(cleared).toBeGreaterThan(0);
  });
});
