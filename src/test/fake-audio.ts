import type {
  AudioCapture,
  AudioFrame,
  BargeInDetector,
  BargeInEvent,
  CaptureDiagnostics,
  SpeechAdapter,
  SpeechEvent,
  SpeechFailureReason,
  SpeechProbabilityModel,
  SpeechRequest,
  TranscriptionAdapter,
  TranscriptionEvent,
  TurnIdentity,
} from "@/lib/voice/adapters";
import type { WebSocketLike } from "@/lib/voice/openai-transcription";
import type { PlaybackEvent, PlaybackQueue } from "@/lib/voice/playback-queue";
import type { VoiceErrorCode } from "@/lib/voice/provider";

/** Controllable fakes for the realtime voice layer. No network, no audio hardware, no timers of their own. */

export const FRAME = 1536;
export const RATE = 24000;
export const FRAME_MS = (FRAME / RATE) * 1000; // 64

/** Lets every pending microtask chain (async connects) settle. */
export async function flush(ticks = 25): Promise<void> {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

// ---- PCM fixtures ------------------------------------------------------------------------

export function frame(at: number, samples: Float32Array | number = 0, sampleRate = RATE): AudioFrame {
  return { samples: typeof samples === "number" ? new Float32Array(FRAME).fill(samples) : samples, sampleRate, at };
}
export function silence(n = FRAME): Float32Array {
  return new Float32Array(n);
}
export function tone(n = FRAME, amplitude = 0.3, hz = 220, sampleRate = RATE): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return out;
}
/** Deterministic white noise. */
export function noise(n = FRAME, amplitude = 0.02, seed = 1): Float32Array {
  const out = new Float32Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = amplitude * ((x / 0x7fffffff) * 2 - 1);
  }
  return out;
}

// ---- WebSocket -----------------------------------------------------------------------------

export class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  static reset() {
    FakeWebSocket.instances = [];
  }
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: WebSocketLike["onopen"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  onerror: WebSocketLike["onerror"] = null;
  onclose: WebSocketLike["onclose"] = null;
  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.closed = true;
  }
  // -- drivers
  open() {
    this.readyState = 1;
    this.onopen?.call(this, {});
  }
  message(obj: unknown) {
    this.onmessage?.call(this, { data: JSON.stringify(obj) });
  }
  error() {
    this.onerror?.call(this, {});
  }
  serverClose() {
    this.readyState = 3;
    this.onclose?.call(this, {});
  }
  json(i: number): Record<string, unknown> {
    return JSON.parse(this.sent[i]);
  }
  get jsons(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s));
  }
}
export const fakeWebSocketCtor = FakeWebSocket as unknown as new (url: string, protocols?: string | string[]) => WebSocketLike;

// ---- Capture, detector, adapters -------------------------------------------------------------

export class FakeCapture implements AudioCapture {
  result: { ok: true; diagnostics: CaptureDiagnostics } | { ok: false; code: VoiceErrorCode } = {
    ok: true,
    diagnostics: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: RATE },
  };
  starts = 0;
  stops = 0;
  private ring: AudioFrame[] = [];
  private listeners = new Set<(f: AudioFrame) => void>();
  async start() {
    this.starts += 1;
    return this.result;
  }
  onFrame(l: (f: AudioFrame) => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  preRoll(ms: number): AudioFrame[] {
    const out: AudioFrame[] = [];
    let total = 0;
    for (let i = this.ring.length - 1; i >= 0 && total < ms; i--) {
      out.unshift(this.ring[i]);
      total += (this.ring[i].samples.length / this.ring[i].sampleRate) * 1000;
    }
    return out;
  }
  stop() {
    this.stops += 1;
    this.ring = [];
  }
  /** The microphone produced a frame. */
  feed(f: AudioFrame) {
    this.ring.push(f);
    this.listeners.forEach((l) => l(f));
  }
}

export class FakeDetector implements BargeInDetector {
  processed: AudioFrame[] = [];
  playbackActive: boolean[] = [];
  endpointMs: number[] = [];
  starts = 0;
  stops = 0;
  private listeners = new Set<(e: BargeInEvent) => void>();
  constructor(public vad = true) {}
  async start() {
    this.starts += 1;
    return { vad: this.vad };
  }
  process(f: AudioFrame) {
    this.processed.push(f);
  }
  setPlaybackActive(a: boolean) {
    this.playbackActive.push(a);
  }
  setEndpointSilenceMs(ms: number) {
    this.endpointMs.push(ms);
  }
  stop() {
    this.stops += 1;
  }
  subscribe(l: (e: BargeInEvent) => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  emit(e: BargeInEvent) {
    this.listeners.forEach((l) => l(e));
  }
}

export class FakeTranscription implements TranscriptionAdapter {
  readonly id = "openai-realtime" as const;
  readonly streamsAudio = true;
  connectResult = true;
  connects: Array<{ callId: number; language: string }> = [];
  begun: TurnIdentity[] = [];
  appended: Array<{ identity: TurnIdentity; frame: AudioFrame }> = [];
  committed: TurnIdentity[] = [];
  cancelled: TurnIdentity[] = [];
  disconnects = 0;
  private open: TurnIdentity | null = null;
  private listeners = new Set<(e: TranscriptionEvent) => void>();
  async connect(ctx: { callId: number; language: string }) {
    this.connects.push(ctx);
    return this.connectResult;
  }
  beginTurn(identity: TurnIdentity) {
    this.open = identity;
    this.begun.push(identity);
  }
  appendAudio(frame: AudioFrame) {
    if (this.open) this.appended.push({ identity: this.open, frame });
  }
  commitTurn(identity: TurnIdentity) {
    this.committed.push(identity);
    this.open = null;
  }
  cancelTurn(identity: TurnIdentity) {
    this.cancelled.push(identity);
    this.open = null;
  }
  async disconnect() {
    this.disconnects += 1;
    this.open = null;
  }
  subscribe(l: (e: TranscriptionEvent) => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  // -- drivers
  interim(text: string, identity = this.begun.at(-1)!) {
    this.emit({ type: "interim", identity, text });
  }
  final(text: string, identity = this.begun.at(-1)!, confidence?: number) {
    this.emit({ type: "final", identity, text, confidence });
  }
  closed(identity = this.begun.at(-1)!) {
    this.emit({ type: "turn-closed", identity });
  }
  fail(code: VoiceErrorCode, callId = this.connects.at(-1)!.callId) {
    this.emit({ type: "error", callId, code });
  }
  private emit(e: TranscriptionEvent) {
    this.listeners.forEach((l) => l(e));
  }
}

export class FakeSpeechAdapter implements SpeechAdapter {
  readonly id = "elevenlabs" as const;
  connectResult = true;
  /** Why connect failed, as the real adapter reports it (unset: unknown). */
  unavailableReason: SpeechFailureReason | null = null;
  connects = 0;
  requests: SpeechRequest[] = [];
  interrupts: TurnIdentity[] = [];
  disconnects = 0;
  private listeners = new Set<(e: SpeechEvent) => void>();
  async connect() {
    this.connects += 1;
    return this.connectResult;
  }
  speak(request: SpeechRequest) {
    this.requests.push(request);
  }
  interrupt(identity: TurnIdentity) {
    this.interrupts.push(identity);
  }
  async disconnect() {
    this.disconnects += 1;
  }
  subscribe(l: (e: SpeechEvent) => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  // -- drivers (what the speaker would do)
  started(identity = this.requests.at(-1)!.identity) {
    this.emit({ type: "started", identity });
  }
  ended(identity = this.requests.at(-1)!.identity) {
    this.emit({ type: "ended", identity });
  }
  failBeforeAudio(code: SpeechFailureReason = "websocket-failed", identity = this.requests.at(-1)!.identity) {
    this.emit({ type: "failed", identity, beforeAudio: true, code });
  }
  breakMidLine(identity = this.requests.at(-1)!.identity) {
    this.emit({ type: "failed", identity, beforeAudio: false, code: "websocket-failed" });
  }
  private emit(e: SpeechEvent) {
    this.listeners.forEach((l) => l(e));
  }
}

export class FakePlayback implements PlaybackQueue {
  begins: Array<{ identity: TurnIdentity; sampleRate: number }> = [];
  chunks: Array<{ identity: TurnIdentity; pcm16: Int16Array }> = [];
  finishes: TurnIdentity[] = [];
  stops = 0;
  private listeners = new Set<(e: PlaybackEvent) => void>();
  begin(identity: TurnIdentity, sampleRate: number) {
    this.begins.push({ identity, sampleRate });
  }
  enqueue(identity: TurnIdentity, pcm16: Int16Array) {
    this.chunks.push({ identity, pcm16 });
  }
  finish(identity: TurnIdentity) {
    this.finishes.push(identity);
  }
  stop() {
    this.stops += 1;
  }
  subscribe(l: (e: PlaybackEvent) => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  emit(e: PlaybackEvent) {
    this.listeners.forEach((l) => l(e));
  }
}

/** A speech-probability model that answers from a script (per window), then repeats its last value. */
export class ScriptedModel implements SpeechProbabilityModel {
  calls = 0;
  disposed = false;
  resets = 0;
  constructor(public script: number[] = []) {}
  async probability() {
    const p = this.script[Math.min(this.calls, this.script.length - 1)] ?? 0;
    this.calls += 1;
    return p;
  }
  reset() {
    this.resets += 1;
  }
  dispose() {
    this.disposed = true;
  }
}
