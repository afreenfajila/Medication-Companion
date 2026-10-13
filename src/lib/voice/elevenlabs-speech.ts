import type { UiLanguage } from "@/types/content";
import {
  base64ToBytes,
  sameIdentity,
  TERMINAL_SPEECH_FAILURES,
  type SpeechAdapter,
  type SpeechEvent,
  type SpeechFailureReason,
  type SpeechRequest,
  type TurnIdentity,
} from "./adapters";
import type { WebSocketCtor, WebSocketLike } from "./openai-transcription";
import type { PlaybackQueue } from "./playback-queue";
import { diag, since } from "./voice-diagnostics";

/**
 * Speech output through ElevenLabs' streaming text-to-speech WebSocket, played
 * through Web Audio. Each line is one socket, opened with a single-use token
 * that our server mints (the permanent key never reaches the page); the next
 * token is fetched in the background so a line never waits for one.
 *
 * Built for a free account: before a socket opens, a line must pass pre-flight
 * (it belongs to this call, it is approved visible text, there is a token, a
 * voice and a model). Provider errors become internal reason codes. After a
 * failure that won't fix itself within the call (unconfigured, no token, voice
 * or model unavailable, credits used up), the adapter stops trying until the
 * next call: no repeated retries, no tokens spent.
 *
 * The adapter renders exactly the text it is given — the same string that is
 * already on screen — and reports only what the speaker did: started (audio is
 * actually playing), ended, or failed before/after audio. Chunks for any other
 * turn are dropped.
 */

export const ELEVENLABS_OUTPUT_FORMAT = "pcm_24000";
export const ELEVENLABS_SAMPLE_RATE = 24000;
export const SLOW_SPEED = 0.85;
/** If nothing has started playing by then, the line is not voiced. */
export const START_TIMEOUT_MS = 8000;

export type ElevenLabsToken = { token: string; voiceId: string; modelId: string };
export type TokenResult = { ok: true; token: ElevenLabsToken } | { ok: false; reason: SpeechFailureReason };

export type ElevenLabsDeps = {
  fetchToken: () => Promise<TokenResult>;
  WebSocket: WebSocketCtor;
  playback: PlaybackQueue;
  /** Only approved strings may be voiced (the visible line, checked again here). */
  approve?: (text: string) => boolean;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
  baseUrl?: string;
};

export function streamInputUrl(base: string, t: ElevenLabsToken, language: UiLanguage): string {
  const q = new URLSearchParams({
    model_id: t.modelId,
    output_format: ELEVENLABS_OUTPUT_FORMAT,
    language_code: language === "zh-Hans" ? "zh" : "en",
    single_use_token: t.token,
    inactivity_timeout: "20",
  });
  return `${base}/v1/text-to-speech/${encodeURIComponent(t.voiceId)}/stream-input?${q.toString()}`;
}

/**
 * Maps a provider error (message fields or a close reason) to a reason code by
 * documented error codes and keywords only; the raw text itself goes nowhere.
 */
export function providerReason(raw: string): SpeechFailureReason {
  const s = raw.toLowerCase();
  if (/quota|credit|insufficient_credits|character_limit/.test(s)) return "quota-exceeded";
  if (/model/.test(s)) return "model-unavailable";
  if (/voice|subscription_required|feature_not_available|paid_plan/.test(s)) return "voice-unavailable";
  if (/api_key|token|auth|unauthori[sz]ed|permission/.test(s)) return "token-unavailable";
  return "websocket-failed";
}

const noToken = (): Promise<TokenResult> => Promise.resolve({ ok: false, reason: "token-unavailable" });

type Line = {
  identity: TurnIdentity;
  ws: WebSocketLike | null;
  audioBegan: boolean;
  done: boolean;
  startedAt: number;
  timer?: ReturnType<typeof setTimeout>;
};

export class ElevenLabsSpeech implements SpeechAdapter {
  readonly id = "elevenlabs" as const;
  private listeners = new Set<(e: SpeechEvent) => void>();
  private token: Promise<TokenResult> | null = null;
  private current: Line | null = null;
  private callId: number | null = null;
  /** A terminal failure this call: every later line fails fast with it, and nothing is fetched. */
  private blocked: SpeechFailureReason | null = null;
  unavailableReason: SpeechFailureReason | null = null;
  private unsubscribePlayback: () => void;
  private readonly setTimer: NonNullable<ElevenLabsDeps["setTimer"]>;
  private readonly clearTimer: NonNullable<ElevenLabsDeps["clearTimer"]>;
  private readonly base: string;

  constructor(private readonly deps: ElevenLabsDeps) {
    // Wrapped: a browser's setTimeout called as this.setTimer(...) throws "Illegal invocation".
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((t) => clearTimeout(t));
    this.base = deps.baseUrl ?? "wss://api.elevenlabs.io";
    this.unsubscribePlayback = deps.playback.subscribe((e) => {
      const cur = this.current;
      if (!cur || !sameIdentity(cur.identity, e.identity)) return; // a stale chunk's event
      if (e.type === "started") {
        if (cur.timer) this.clearTimer(cur.timer);
        cur.audioBegan = true;
        diag("tts-first-audio", { ms: since(cur.startedAt), engine: "elevenlabs" });
        this.emit({ type: "started", identity: e.identity });
      } else if (e.type === "ended") {
        this.current = null;
        diag("tts-ended", { ms: since(cur.startedAt), engine: "elevenlabs" });
        this.emit({ type: "ended", identity: e.identity });
      } else this.fail(cur, "playback-decode-failed");
    });
  }

  async connect(context?: { callId: number }): Promise<boolean> {
    this.callId = context?.callId ?? null;
    this.blocked = null;
    this.unavailableReason = null;
    const started = Date.now();
    this.token = this.fetchToken();
    const first = await this.token;
    diag("tts-token", { ms: since(started), ok: first.ok, ...(first.ok ? {} : { reason: first.reason }) });
    if (first.ok) return true;
    this.unavailableReason = first.reason;
    this.blocked = first.reason;
    this.token = null;
    return false;
  }

  speak(request: SpeechRequest): void {
    this.interrupt(this.current?.identity ?? request.identity);
    const cur: Line = { identity: request.identity, ws: null, audioBegan: false, done: false, startedAt: Date.now() };
    this.current = cur;

    // Pre-flight, before any socket or token is used.
    if (this.callId !== null && request.identity.callId !== this.callId) return this.fail(cur, "not-allowed");
    if (this.blocked) return this.fail(cur, this.blocked); // no repeated retries within this call
    if (!request.text.trim()) return this.fail(cur, "no-approved-text");
    if (this.deps.approve && !this.deps.approve(request.text)) return this.fail(cur, "unapproved");

    cur.timer = this.setTimer(() => this.fail(cur, "timeout"), START_TIMEOUT_MS);
    const tokenPromise = this.token ?? this.fetchToken();
    this.token = this.fetchToken(); // a single-use token is consumed by the socket below
    void tokenPromise.then((result) => {
      if (this.current !== cur) return;
      if (!result.ok) return this.fail(cur, result.reason);
      if (!result.token.voiceId) return this.fail(cur, "unconfigured");
      if (!result.token.modelId) return this.fail(cur, "model-unavailable");
      this.open(cur, result.token, request);
    });
  }

  interrupt(identity: TurnIdentity): void {
    const cur = this.current;
    if (!cur || !sameIdentity(cur.identity, identity)) return;
    this.current = null;
    this.teardown(cur);
    this.deps.playback.stop();
  }

  async disconnect(): Promise<void> {
    if (this.current) this.interrupt(this.current.identity);
    this.token = null;
    this.callId = null;
  }

  subscribe(listener: (e: SpeechEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.unsubscribePlayback();
  }

  // ---- One socket per line ------------------------------------------------------------------------

  private fetchToken(): Promise<TokenResult> {
    if (this.blocked) return noToken();
    return this.deps.fetchToken().catch(noToken);
  }

  private open(cur: Line, token: ElevenLabsToken, request: SpeechRequest): void {
    let ws: WebSocketLike;
    try {
      ws = new this.deps.WebSocket(streamInputUrl(this.base, token, request.language));
    } catch {
      return this.fail(cur, "websocket-failed");
    }
    cur.ws = ws;
    this.deps.playback.begin(request.identity, ELEVENLABS_SAMPLE_RATE);
    ws.onopen = () => {
      if (this.current !== cur) return;
      diag("tts-socket-open", { ms: since(cur.startedAt) });
      ws.send(
        JSON.stringify({
          text: " ",
          voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: request.slow ? SLOW_SPEED : 1 },
          generation_config: { chunk_length_schedule: [50, 120, 160, 290] },
        }),
      );
      ws.send(JSON.stringify({ text: `${request.text} `, flush: true })); // exactly the visible words
      ws.send(JSON.stringify({ text: "" })); // end of this line
    };
    ws.onmessage = (e) => {
      if (this.current !== cur) return;
      let msg: { audio?: string | null; isFinal?: boolean | null; error?: unknown; message?: unknown; code?: unknown };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.error) return this.fail(cur, providerReason(`${String(msg.error)} ${String(msg.message ?? "")}`));
      if (typeof msg.audio === "string" && msg.audio.length > 0) {
        let pcm: Int16Array;
        try {
          const bytes = base64ToBytes(msg.audio);
          pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
        } catch {
          return this.fail(cur, "playback-decode-failed");
        }
        this.deps.playback.enqueue(cur.identity, pcm);
      }
      if (msg.isFinal) {
        cur.done = true;
        this.deps.playback.finish(cur.identity);
        this.closeSocket(cur);
      }
    };
    ws.onerror = () => {
      if (this.current === cur && !cur.done) this.fail(cur, "websocket-failed");
    };
    ws.onclose = (e: { reason?: unknown } | undefined) => {
      if (this.current !== cur || cur.done) return;
      const reason = typeof e?.reason === "string" && e.reason ? providerReason(e.reason) : "websocket-failed";
      this.fail(cur, reason);
    };
  }

  private fail(cur: Line, code: SpeechFailureReason): void {
    if (this.current !== cur) return;
    this.current = null;
    const beforeAudio = !cur.audioBegan;
    if (TERMINAL_SPEECH_FAILURES.has(code)) {
      this.blocked = code;
      this.token = null; // nothing more is fetched this call
    }
    this.teardown(cur);
    this.deps.playback.stop();
    diag("tts-failed", { reason: code, beforeAudio, ms: since(cur.startedAt) });
    this.emit({ type: "failed", identity: cur.identity, beforeAudio, code });
  }

  private teardown(cur: Line): void {
    if (cur.timer) this.clearTimer(cur.timer);
    this.closeSocket(cur);
  }

  private closeSocket(cur: Line): void {
    const ws = cur.ws;
    cur.ws = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try {
      ws.close();
    } catch {
      // already closed
    }
  }

  private emit(e: SpeechEvent): void {
    this.listeners.forEach((l) => l(e));
  }
}

/** Our route's error codes, as reason codes. Anything else is "token-unavailable". */
const ROUTE_REASON: Record<string, SpeechFailureReason> = {
  voice_output_unconfigured: "unconfigured",
  voice_unavailable: "voice-unavailable",
  model_unavailable: "model-unavailable",
  quota_exceeded: "quota-exceeded",
};

/** Browser-side call to our own route. Never throws; failures carry a reason code only. */
export async function requestElevenLabsToken(): Promise<TokenResult> {
  const { elevenLabsTokenResponseSchema } = await import("@/lib/api/schemas");
  try {
    const res = await fetch("/api/voice/elevenlabs-token", { method: "POST", signal: AbortSignal.timeout(8000) });
    const parsed = elevenLabsTokenResponseSchema.safeParse(await res.json());
    if (!parsed.success) return { ok: false, reason: "token-unavailable" };
    if (parsed.data.ok) return { ok: true, token: parsed.data.data };
    return { ok: false, reason: ROUTE_REASON[parsed.data.error.code] ?? "token-unavailable" };
  } catch {
    return { ok: false, reason: "token-unavailable" };
  }
}
