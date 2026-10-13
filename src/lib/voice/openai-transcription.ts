import type { UiLanguage } from "@/types/content";
import {
  bytesToBase64,
  floatToPcm16,
  resample,
  sameIdentity,
  type AudioFrame,
  type TranscriptionAdapter,
  type TranscriptionEvent,
  type TurnIdentity,
} from "./adapters";
import type { VoiceErrorCode } from "./provider";

/**
 * Speech input through OpenAI's Realtime transcription session, over a browser
 * WebSocket authenticated with a short-lived client secret minted by our own
 * server (the permanent key never reaches the page).
 *
 * This adapter transcribes and nothing else: it is handed PCM only while a turn
 * is open (so the companion's own playback is never sent), it commits a turn
 * only when told to (the session runs with `turn_detection: null`; the local
 * detector decides where a turn ends), and it reports words — interim text for
 * display, one final text per turn. No medicine record, instruction or prompt
 * is attached to the session.
 */

export const OPENAI_INPUT_SAMPLE_RATE = 24000;
/** Less audio than this is not worth a request (a tap on the mic, a breath). */
export const MIN_COMMIT_MS = 120;
/** How long after a commit the final may still arrive; then the turn is closed quietly. */
export const FINAL_TIMEOUT_MS = 6000;

export type OpenAiSessionCredential = {
  clientSecret: string;
  model: string;
  wsUrl: string;
  expiresAt: number;
};

/** The slice of the WebSocket API used here; the browser's own class and the tests' fake both fit. */
export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onopen: ((this: any, e: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onmessage: ((this: any, e: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((this: any, e: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onclose: ((this: any, e: any) => void) | null;
};
export type WebSocketCtor = new (url: string, protocols?: string | string[]) => WebSocketLike;

export type OpenAiTranscriptionDeps = {
  /** Our server route; null when OpenAI is not configured. */
  fetchSession: (language: UiLanguage) => Promise<OpenAiSessionCredential | null>;
  WebSocket: WebSocketCtor;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
};

const OPEN = 1;

/** Both supported languages are always offered, with the current one first. */
export function languageHints(language: UiLanguage): string[] {
  return language === "zh-Hans" ? ["zh", "en"] : ["en", "zh"];
}

export function sessionUpdateMessage(model: string, language: UiLanguage): Record<string, unknown> {
  return {
    type: "session.update",
    session: {
      type: "transcription",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: OPENAI_INPUT_SAMPLE_RATE },
          transcription: { model, languages: languageHints(language) },
          noise_reduction: { type: "near_field" },
          turn_detection: null,
        },
      },
    },
  };
}

export class OpenAiRealtimeTranscription implements TranscriptionAdapter {
  readonly id = "openai-realtime" as const;
  readonly streamsAudio = true;
  private listeners = new Set<(e: TranscriptionEvent) => void>();
  private ws: WebSocketLike | null = null;
  private callId = 0;
  private turn: TurnIdentity | null = null;
  private appendedMs = 0;
  private interim = "";
  /** Commits whose final has not arrived yet, oldest first. */
  private pending: Array<{ identity: TurnIdentity; timer: ReturnType<typeof setTimeout> }> = [];
  private finalised = new Set<string>();
  private readonly setTimer: NonNullable<OpenAiTranscriptionDeps["setTimer"]>;
  private readonly clearTimer: NonNullable<OpenAiTranscriptionDeps["clearTimer"]>;

  constructor(private readonly deps: OpenAiTranscriptionDeps) {
    // Wrapped: a browser's setTimeout called as this.setTimer(...) throws "Illegal invocation".
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((t) => clearTimeout(t));
  }

  async connect(context: { callId: number; language: UiLanguage }): Promise<boolean> {
    await this.disconnect();
    this.callId = context.callId;
    const credential = await this.deps.fetchSession(context.language).catch(() => null);
    if (!credential || this.callId !== context.callId) return false;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      let ws: WebSocketLike;
      try {
        ws = new this.deps.WebSocket(credential.wsUrl, ["realtime", `openai-insecure-api-key.${credential.clientSecret}`]);
      } catch {
        return settle(false);
      }
      this.ws = ws;
      ws.onopen = () => {
        if (this.ws !== ws) return;
        ws.send(JSON.stringify(sessionUpdateMessage(credential.model, context.language)));
        this.emit({ type: "ready", callId: context.callId });
        settle(true);
      };
      ws.onmessage = (e) => {
        if (this.ws === ws) this.handle(e.data);
      };
      ws.onerror = () => {
        if (this.ws !== ws) return;
        if (!settled) settle(false);
        else this.failed("network");
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        if (!settled) settle(false);
        else this.failed("network");
      };
    });
  }

  beginTurn(identity: TurnIdentity): void {
    if (!this.ws || identity.callId !== this.callId) return;
    this.turn = identity;
    this.appendedMs = 0;
    this.interim = "";
    this.send({ type: "input_audio_buffer.clear" }); // nothing stale rides along with this turn
  }

  appendAudio(frame: AudioFrame): void {
    if (!this.turn || !this.ws || this.ws.readyState !== OPEN) return;
    const pcm = floatToPcm16(resample(frame.samples, frame.sampleRate, OPENAI_INPUT_SAMPLE_RATE));
    this.appendedMs += (pcm.length / OPENAI_INPUT_SAMPLE_RATE) * 1000;
    this.send({ type: "input_audio_buffer.append", audio: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)) });
  }

  commitTurn(identity: TurnIdentity): void {
    if (!sameIdentity(this.turn, identity)) return;
    const turn = this.turn!;
    this.turn = null;
    if (this.appendedMs < MIN_COMMIT_MS) {
      this.send({ type: "input_audio_buffer.clear" });
      this.emit({ type: "turn-closed", identity: turn });
      return;
    }
    this.send({ type: "input_audio_buffer.commit" });
    const timer = this.setTimer(() => {
      this.pending = this.pending.filter((p) => p.identity !== turn);
      this.emit({ type: "turn-closed", identity: turn });
    }, FINAL_TIMEOUT_MS);
    this.pending.push({ identity: turn, timer });
  }

  cancelTurn(identity: TurnIdentity): void {
    if (sameIdentity(this.turn, identity)) {
      this.turn = null;
      this.interim = "";
      this.send({ type: "input_audio_buffer.clear" });
    }
    this.pending = this.pending.filter((p) => {
      if (!sameIdentity(p.identity, identity)) return true;
      this.clearTimer(p.timer);
      return false;
    });
  }

  async disconnect(): Promise<void> {
    const ws = this.ws;
    this.ws = null;
    this.turn = null;
    this.pending.forEach((p) => this.clearTimer(p.timer));
    this.pending = [];
    this.finalised.clear();
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
    }
  }

  subscribe(listener: (e: TranscriptionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ---- Server events --------------------------------------------------------------------------

  private handle(raw: unknown): void {
    let msg: { type?: string; delta?: string; transcript?: string; error?: { code?: string } };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    switch (msg.type) {
      case "conversation.item.input_audio_transcription.delta": {
        // Live words for the open turn only; never delivered as a transcript.
        if (!this.turn || typeof msg.delta !== "string") return;
        this.interim += msg.delta;
        this.emit({ type: "interim", identity: this.turn, text: this.interim.replace(/\s+/g, " ").trim() });
        return;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const owner = this.pending.shift();
        if (!owner) return; // a final for a turn that was cancelled: dropped
        this.clearTimer(owner.timer);
        const key = `${owner.identity.callId}:${owner.identity.turnId}`;
        if (this.finalised.has(key)) return; // exactly one final per turn
        this.finalised.add(key);
        // Untrusted provider text: plain words only, bounded like a typed message.
        const text = String(msg.transcript ?? "")
          .replace(/[<>`*#[\]{}|]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300);
        this.emit({ type: "final", identity: owner.identity, text });
        return;
      }
      case "conversation.item.input_audio_transcription.failed": {
        const owner = this.pending.shift();
        if (owner) {
          this.clearTimer(owner.timer);
          this.emit({ type: "turn-closed", identity: owner.identity });
        }
        return;
      }
      case "error":
        this.failed(/auth|token|secret|expired/i.test(msg.error?.code ?? "") ? "network" : "unknown");
        return;
      default:
        return; // session.created / session.updated / input_audio_buffer.* acknowledgements
    }
  }

  private failed(code: VoiceErrorCode): void {
    this.turn = null;
    this.pending.forEach((p) => this.clearTimer(p.timer));
    this.pending = [];
    this.emit({ type: "error", callId: this.callId, code });
  }

  private send(message: Record<string, unknown>): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== OPEN) return;
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // closing
    }
  }

  private emit(e: TranscriptionEvent): void {
    this.listeners.forEach((l) => l(e));
  }
}

/** Browser-side call to our own route. Returns null when OpenAI is not configured or the call fails. */
export async function requestOpenAiSession(language: UiLanguage): Promise<OpenAiSessionCredential | null> {
  const { openAiSessionResponseSchema } = await import("@/lib/api/schemas");
  try {
    const res = await fetch("/api/voice/openai-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
      signal: AbortSignal.timeout(8000),
    });
    const parsed = openAiSessionResponseSchema.safeParse(await res.json());
    return parsed.success && parsed.data.ok ? parsed.data.data : null;
  } catch {
    return null;
  }
}
