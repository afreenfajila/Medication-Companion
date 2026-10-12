import type { UiLanguage } from "@/types/content";
import type { SpeechAdapter, SpeechEvent, SpeechRequest, TranscriptionAdapter, TranscriptionEvent, TurnIdentity } from "./adapters";
import { VoiceError, type SpeechVoiceProvider } from "./provider";

/**
 * The browser's own speech engines behind the provider-neutral contracts, as the
 * explicitly degraded fallback: used only when the realtime providers are not
 * configured or fail before any audio. Not realtime AI voice — the browser
 * vendor's recognition (in Chrome, Google's service) and installed synthesis
 * voices, exactly as before.
 */

/** How long the browser voice gets to actually start before the line counts as not voiced. */
export const BROWSER_START_TIMEOUT_MS = 8000;

export class BrowserTranscriptionAdapter implements TranscriptionAdapter {
  readonly id = "browser" as const;
  /** Owns its microphone and endpointing: PCM frames are not for it. */
  readonly streamsAudio = false;
  private listeners = new Set<(e: TranscriptionEvent) => void>();
  private turn: TurnIdentity | null = null;
  private callId = 0;
  private unbind: (() => void) | null = null;

  constructor(private readonly provider: SpeechVoiceProvider) {}

  async connect(context: { callId: number }): Promise<boolean> {
    void this.disconnect(); // its body is synchronous: the engine is bound before connect() returns
    if (!this.provider.capabilities.recognition) return false;
    this.callId = context.callId;
    const offs = [
      this.provider.onInterim((text) => {
        if (this.turn) this.emit({ type: "interim", identity: this.turn, text });
      }),
      this.provider.onTranscript((text, confidence) => {
        const turn = this.turn;
        if (!turn) return;
        if (text.trim()) this.turn = null; // one committed utterance per turn; an empty one leaves it open
        this.emit({ type: "final", identity: turn, text, confidence });
      }),
      this.provider.onListeningChange((on) => {
        const turn = this.turn;
        if (on || !turn) return;
        this.turn = null;
        this.emit({ type: "turn-closed", identity: turn });
      }),
      this.provider.onError((error) => {
        this.turn = null;
        this.emit({ type: "error", callId: this.callId, code: error instanceof VoiceError ? error.code : "unknown" });
      }),
    ];
    this.unbind = () => offs.forEach((off) => off());
    return true;
  }

  beginTurn(identity: TurnIdentity, options: { language: UiLanguage }): void {
    if (identity.callId !== this.callId) return;
    this.turn = identity;
    this.provider.startListening(options.language);
  }

  appendAudio(): void {
    // The browser engine listens to the microphone itself.
  }

  commitTurn(identity: TurnIdentity): void {
    if (this.turn && this.turn.turnId === identity.turnId) this.provider.commitListening?.();
  }

  cancelTurn(identity: TurnIdentity): void {
    if (this.turn && this.turn.turnId === identity.turnId) this.turn = null;
    this.provider.stopListening();
  }

  async disconnect(): Promise<void> {
    this.turn = null;
    this.unbind?.();
    this.unbind = null;
    this.provider.stopListening();
  }

  subscribe(listener: (e: TranscriptionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(e: TranscriptionEvent): void {
    this.listeners.forEach((l) => l(e));
  }
}

export class BrowserSpeechAdapter implements SpeechAdapter {
  readonly id = "browser" as const;
  private listeners = new Set<(e: SpeechEvent) => void>();
  private current: { identity: TurnIdentity; started: boolean; timer?: ReturnType<typeof setTimeout> } | null = null;
  private unbind: (() => void) | null = null;

  constructor(
    private readonly provider: SpeechVoiceProvider,
    // Wrapped: a browser's setTimeout called as this.setTimer(...) throws "Illegal invocation".
    private readonly setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = (fn, ms) => setTimeout(fn, ms),
    private readonly clearTimer: (t: ReturnType<typeof setTimeout>) => void = (t) => clearTimeout(t),
  ) {}

  async connect(): Promise<boolean> {
    void this.disconnect(); // its body is synchronous: the engine is bound before connect() returns
    if (!this.provider.capabilities.synthesis) return false;
    this.unbind = this.provider.onSpeakingChange((on) => {
      const cur = this.current;
      if (!cur) return;
      if (on) {
        if (cur.timer) this.clearTimer(cur.timer);
        cur.started = true;
        this.emit({ type: "started", identity: cur.identity });
      } else if (cur.started) {
        this.current = null;
        this.emit({ type: "ended", identity: cur.identity });
      } else {
        // The utterance errored before it ever started: not voiced.
        this.current = null;
        if (cur.timer) this.clearTimer(cur.timer);
        this.emit({ type: "failed", identity: cur.identity, beforeAudio: true, code: "engine-failed" });
      }
    });
    return true;
  }

  speak(request: SpeechRequest): void {
    if (this.current) this.interrupt(this.current.identity);
    const cur: NonNullable<typeof this.current> = { identity: request.identity, started: false };
    this.current = cur;
    cur.timer = this.setTimer(() => {
      if (this.current !== cur) return;
      this.current = null;
      this.provider.stopSpeaking();
      this.emit({ type: "failed", identity: cur.identity, beforeAudio: true, code: "timeout" });
    }, BROWSER_START_TIMEOUT_MS);
    this.provider.speak(request.text, request.language, request.slow);
  }

  interrupt(identity: TurnIdentity): void {
    const cur = this.current;
    if (!cur || cur.identity.turnId !== identity.turnId || cur.identity.callId !== identity.callId) return;
    this.current = null; // first, so the stop below is seen as stale
    if (cur.timer) this.clearTimer(cur.timer);
    this.provider.stopSpeaking();
  }

  async disconnect(): Promise<void> {
    if (this.current) this.interrupt(this.current.identity);
    this.unbind?.();
    this.unbind = null;
    this.provider.stopSpeaking();
  }

  subscribe(listener: (e: SpeechEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(e: SpeechEvent): void {
    this.listeners.forEach((l) => l(e));
  }
}
