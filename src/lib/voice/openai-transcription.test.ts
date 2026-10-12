import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket, fakeWebSocketCtor, flush, frame, FRAME_MS } from "@/test/fake-audio";
import type { TranscriptionEvent } from "./adapters";
import { FINAL_TIMEOUT_MS, MIN_COMMIT_MS, OpenAiRealtimeTranscription, sessionUpdateMessage, type OpenAiSessionCredential } from "./openai-transcription";

const credential: OpenAiSessionCredential = { clientSecret: "ek_test", model: "gpt-live-transcribe", wsUrl: "wss://api.openai.com/v1/realtime", expiresAt: 1 };

async function connected(language: "en" | "zh-Hans" = "en", fetchSession = vi.fn(async () => credential)) {
  const a = new OpenAiRealtimeTranscription({ fetchSession, WebSocket: fakeWebSocketCtor });
  const events: TranscriptionEvent[] = [];
  a.subscribe((e) => events.push(e));
  const result = a.connect({ callId: 1, language });
  await flush();
  const ws = FakeWebSocket.instances.at(-1)!;
  ws.open();
  expect(await result).toBe(true);
  return { a, ws, events, fetchSession };
}

const DELTA = "conversation.item.input_audio_transcription.delta";
const COMPLETED = "conversation.item.input_audio_transcription.completed";
const id = (turnId: number) => ({ callId: 1, turnId });
/** Enough audio to be worth a request. */
function feed(a: OpenAiRealtimeTranscription, ms = 1000) {
  for (let at = 0; at < ms; at += FRAME_MS) a.appendAudio(frame(at, 0.1));
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.reset();
});
afterEach(() => vi.useRealTimers());

describe("OpenAI realtime transcription adapter", () => {
  it("connects with the short-lived secret as the subprotocol and configures a transcription-only session with no server turn detection", async () => {
    const { ws, events, fetchSession } = await connected("en");
    expect(fetchSession).toHaveBeenCalledWith("en");
    expect(ws.url).toBe(credential.wsUrl);
    expect(ws.protocols).toEqual(["realtime", "openai-insecure-api-key.ek_test"]);
    expect(ws.json(0)).toEqual(sessionUpdateMessage("gpt-live-transcribe", "en"));
    const session = ws.json(0).session as { type: string; audio: { input: Record<string, unknown> } };
    expect(session.type).toBe("transcription");
    expect(session.audio.input.turn_detection).toBeNull();
    expect(session.audio.input.format).toEqual({ type: "audio/pcm", rate: 24000 });
    expect(session.audio.input.transcription).toEqual({ model: "gpt-live-transcribe", languages: ["en", "zh"] });
    expect(JSON.stringify(ws.json(0))).not.toMatch(/instructions|metformin|record|tablet/i);
    expect(events).toEqual([{ type: "ready", callId: 1 }]);
  });

  it("puts the current language first in the hints (zh-Hans → zh, en)", async () => {
    const { ws } = await connected("zh-Hans");
    expect((ws.json(0).session as { audio: { input: { transcription: { languages: string[] } } } }).audio.input.transcription.languages).toEqual(["zh", "en"]);
  });

  it("resolves false when our route has no credential, and opens no socket", async () => {
    const a = new OpenAiRealtimeTranscription({ fetchSession: async () => null, WebSocket: fakeWebSocketCtor });
    expect(await a.connect({ callId: 1, language: "en" })).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("resolves false when the socket fails before opening", async () => {
    const a = new OpenAiRealtimeTranscription({ fetchSession: async () => credential, WebSocket: fakeWebSocketCtor });
    const result = a.connect({ callId: 1, language: "en" });
    await flush();
    FakeWebSocket.instances[0].error();
    expect(await result).toBe(false);
  });

  it("appends base64 PCM16 at 24 kHz only while a turn is open, after clearing the buffer", async () => {
    const { a, ws } = await connected();
    a.appendAudio(frame(0, 0.1)); // no turn: dropped
    expect(ws.sent).toHaveLength(1);
    a.beginTurn(id(1));
    expect(ws.json(1)).toEqual({ type: "input_audio_buffer.clear" });
    a.appendAudio(frame(0, 0.1));
    const append = ws.json(2) as { type: string; audio: string };
    expect(append.type).toBe("input_audio_buffer.append");
    const bytes = Buffer.from(append.audio, "base64");
    expect(bytes.length).toBe(1536 * 2); // 64 ms of 16-bit mono at 24 kHz
    expect(new Int16Array(bytes.buffer, bytes.byteOffset, 2)[0]).toBeCloseTo(0.1 * 0x7fff, -1);
    a.appendAudio({ samples: new Float32Array(1024).fill(0.1), sampleRate: 16000, at: 64 }); // resampled up
    expect(Buffer.from((ws.json(3) as { audio: string }).audio, "base64").length).toBe(1536 * 2);
  });

  it("interim deltas are display-only for the open turn; one final per committed turn, leading words intact", async () => {
    const { a, ws, events } = await connected();
    a.beginTurn(id(1));
    feed(a);
    ws.message({ type: DELTA, delta: "I have" });
    ws.message({ type: DELTA, delta: " Metformin" });
    expect(events.filter((e) => e.type === "interim").map((e) => (e as { text: string }).text)).toEqual(["I have", "I have Metformin"]);
    expect(events.some((e) => e.type === "final")).toBe(false);
    a.commitTurn(id(1));
    expect(ws.jsons.at(-1)).toEqual({ type: "input_audio_buffer.commit" });
    ws.message({ type: COMPLETED, item_id: "item_1", transcript: "I have Metformin 500" });
    expect(events.filter((e) => e.type === "final")).toEqual([{ type: "final", identity: id(1), text: "I have Metformin 500" }]);
    ws.message({ type: COMPLETED, item_id: "item_1", transcript: "I have Metformin 500" }); // repeated by the server
    expect(events.filter((e) => e.type === "final")).toHaveLength(1);
  });

  it("distinct nearby utterances stay distinct: no special-casing of 'I have Metformin 500'", async () => {
    const { a, ws, events } = await connected();
    for (const [turn, text] of [
      [1, "I have Metformin 500"],
      [2, "I have a Metformin 500"],
      [3, "我有二甲双胍 500"],
      [4, "我有 Metformin 500 毫克"],
    ] as const) {
      a.beginTurn(id(turn));
      feed(a);
      a.commitTurn(id(turn));
      ws.message({ type: COMPLETED, transcript: text });
    }
    expect(events.filter((e) => e.type === "final").map((e) => [(e as { identity: { turnId: number } }).identity.turnId, (e as { text: string }).text])).toEqual([
      [1, "I have Metformin 500"],
      [2, "I have a Metformin 500"],
      [3, "我有二甲双胍 500"],
      [4, "我有 Metformin 500 毫克"],
    ]);
  });

  it("provider text is treated as untrusted: markup stripped, whitespace collapsed, bounded like a typed message", async () => {
    const { a, ws, events } = await connected();
    a.beginTurn(id(1));
    feed(a);
    a.commitTurn(id(1));
    ws.message({ type: COMPLETED, transcript: `  <b>take   two</b>  ${"x".repeat(400)}` });
    const final = events.find((e) => e.type === "final") as { text: string };
    expect(final.text.startsWith("b take two /b")).toBe(true); // tags become plain words, not markup
    expect(final.text).not.toMatch(/[<>]/);
    expect(final.text.length).toBeLessThanOrEqual(300);
  });

  it("a tap's worth of audio is not committed: the buffer is cleared and the turn closed", async () => {
    const { a, ws, events } = await connected();
    a.beginTurn(id(1));
    a.appendAudio(frame(0, 0.1)); // 64 ms < MIN_COMMIT_MS
    expect(FRAME_MS).toBeLessThan(MIN_COMMIT_MS);
    a.commitTurn(id(1));
    expect(ws.jsons.at(-1)).toEqual({ type: "input_audio_buffer.clear" });
    expect(ws.jsons.some((m) => m.type === "input_audio_buffer.commit")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "turn-closed", identity: id(1) });
  });

  it("a final for a cancelled turn is dropped, and a delta for a turn that was closed is not shown", async () => {
    const { a, ws, events } = await connected();
    a.beginTurn(id(1));
    feed(a);
    a.commitTurn(id(1));
    a.cancelTurn(id(1));
    ws.message({ type: COMPLETED, transcript: "late words" });
    ws.message({ type: DELTA, delta: "ghost" });
    expect(events.filter((e) => e.type === "final" || e.type === "interim")).toEqual([]);
  });

  it("a final that never arrives closes the turn after the timeout instead of hanging", async () => {
    const { a, events } = await connected();
    a.beginTurn(id(1));
    feed(a);
    a.commitTurn(id(1));
    vi.advanceTimersByTime(FINAL_TIMEOUT_MS);
    expect(events.at(-1)).toEqual({ type: "turn-closed", identity: id(1) });
  });

  it("a provider failure for the item closes the turn; a session error surfaces as an error event", async () => {
    const { a, ws, events } = await connected();
    a.beginTurn(id(1));
    feed(a);
    a.commitTurn(id(1));
    ws.message({ type: "conversation.item.input_audio_transcription.failed" });
    expect(events.at(-1)).toEqual({ type: "turn-closed", identity: id(1) });
    ws.message({ type: "error", error: { code: "session_expired" } });
    expect(events.at(-1)).toEqual({ type: "error", callId: 1, code: "network" });
  });

  it("disconnect closes the socket and silences everything after it", async () => {
    const { a, ws, events } = await connected();
    a.beginTurn(id(1));
    feed(a);
    a.commitTurn(id(1));
    await a.disconnect();
    expect(ws.closed).toBe(true);
    const before = events.length;
    ws.message({ type: COMPLETED, transcript: "late" });
    vi.advanceTimersByTime(FINAL_TIMEOUT_MS);
    expect(events).toHaveLength(before);
  });
});
