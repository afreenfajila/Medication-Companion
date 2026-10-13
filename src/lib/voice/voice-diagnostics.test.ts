import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCapture, FakeDetector, FakePlayback, FakeTranscription, FakeWebSocket, fakeWebSocketCtor, flush, frame } from "@/test/fake-audio";
import { VoiceSessionCoordinator } from "./coordinator";
import { ElevenLabsSpeech, type TokenResult } from "./elevenlabs-speech";
import { diag, sanitize, setDiagnosticsSinkForTest } from "./voice-diagnostics";

const SECRETS = {
  token: "sut_SECRET_TOKEN_123",
  key: "xi-PERMANENT-KEY",
  voice: "voice_PRIVATE_ID",
  transcript: "I take two Metformin 500 milligram tablets",
  line: "Your record says: Take 1 tablet twice daily with meals.",
  callback: "Call 9123 4567 about Metformin",
};

let logged: string[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.reset();
  logged = [];
  setDiagnosticsSinkForTest((line) => logged.push(line));
});
afterEach(() => {
  setDiagnosticsSinkForTest(null);
  vi.useRealTimers();
});

describe("development voice diagnostics", () => {
  it("keeps only numbers, booleans, reason codes and engine ids — any other string is dropped", () => {
    const out = sanitize({
      ms: 412.6,
      ok: false,
      reason: "voice-unavailable",
      engine: "elevenlabs",
      token: SECRETS.token,
      text: SECRETS.line,
      reasonButText: SECRETS.transcript,
      nested: { token: SECRETS.token },
      "bad key": 1,
    });
    expect(out).toEqual({ ms: 413, ok: false, reason: "voice-unavailable", engine: "elevenlabs" });
  });

  it("a whole call — token, socket, audio, a provider failure, fallback, a spoken turn — logs nothing sensitive", async () => {
    let n = 0;
    const fetchToken = vi.fn(async (): Promise<TokenResult> => ({ ok: true, token: { token: `${SECRETS.token}${n++}`, voiceId: SECRETS.voice, modelId: "eleven_flash_v2_5" } }));
    const playback = new FakePlayback();
    const speech = new ElevenLabsSpeech({ fetchToken, WebSocket: fakeWebSocketCtor, playback });
    const transcription = new FakeTranscription();
    const capture = new FakeCapture();
    const detector = new FakeDetector(true);
    const c = new VoiceSessionCoordinator({
      provider: () => null,
      transcription: () => transcription,
      speech: () => speech,
      capture: () => capture,
      detector: () => detector,
    });
    c.startCall("en");
    await flush();

    c.speak(SECRETS.line, "en");
    await flush();
    const ws = FakeWebSocket.instances.at(-1)!;
    ws.open();
    ws.message({ audio: "AAAA" });
    playback.emit({ type: "started", identity: { callId: 1, turnId: 1 } });
    ws.message({ isFinal: true });
    playback.emit({ type: "ended", identity: { callId: 1, turnId: 1 } });

    c.startListening("en");
    capture.feed(frame(0, 0.2));
    detector.emit({ type: "speech-start", at: 500, candidateAt: 200 });
    detector.emit({ type: "speech-end", at: 1500 });
    transcription.final(SECRETS.transcript);

    c.speak(SECRETS.callback, "en");
    await flush();
    FakeWebSocket.instances.at(-1)!.open();
    FakeWebSocket.instances.at(-1)!.message({ error: "quota_exceeded", message: `${SECRETS.key} ${SECRETS.callback}` });
    c.setMuted(true);
    c.endCall();

    const all = logged.join("\n");
    for (const secret of Object.values(SECRETS)) expect(all).not.toContain(secret);
    expect(all).not.toMatch(/Metformin|tablet|sut_|xi-|9123/);
    // …and it is useful: stages, timings, engines and reason codes.
    for (const stage of ["call-start", "output-ready", "tts-token", "tts-socket-open", "tts-first-audio", "tts-ended", "stt-commit", "stt-final", "tts-failed", "fallback", "mute", "call-end"]) {
      expect(all, stage).toContain(`[voice] ${stage}`);
    }
    expect(all).toMatch(/reason=quota-exceeded/);
    expect(all).toMatch(/engine=elevenlabs/);
    expect(all).toMatch(/ms=\d+/);
  });

  it("is silent unless enabled (production builds and tests by default)", () => {
    setDiagnosticsSinkForTest(null);
    diag("call-start", { ok: true });
    expect(logged).toEqual([]);
  });
});
