import { pcm16ToFloat, sameIdentity, type TurnIdentity } from "./adapters";

/**
 * Gapless Web Audio playback of streamed PCM, one assistant turn at a time.
 * Chunks are scheduled back to back; `started` is reported when the clock
 * actually reaches the first chunk (not when it was requested), `ended` when
 * the last chunk of a finished stream has played, and `stop()` cuts everything
 * at once. A chunk for any identity other than the current one is dropped.
 */

export type PlaybackEvent =
  | { type: "started"; identity: TurnIdentity }
  | { type: "ended"; identity: TurnIdentity }
  | { type: "failed"; identity: TurnIdentity; beforeAudio: boolean };

export type BufferSourceLike = {
  buffer: AudioBufferLike | null;
  connect(node: unknown): unknown;
  start(when?: number): void;
  stop(): void;
  onended: (() => void) | null;
};
export type AudioBufferLike = { duration: number; copyToChannel?: (data: Float32Array, channel: number) => void; getChannelData(ch: number): Float32Array };
export type PlaybackContextLike = {
  readonly currentTime: number;
  readonly state: string;
  destination: unknown;
  resume(): Promise<void>;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): BufferSourceLike;
};

export interface PlaybackQueue {
  begin(identity: TurnIdentity, sampleRate: number): void;
  enqueue(identity: TurnIdentity, pcm16: Int16Array): void;
  /** No more chunks will come for this identity. */
  finish(identity: TurnIdentity): void;
  stop(): void;
  subscribe(listener: (e: PlaybackEvent) => void): () => void;
}

/** A little lead so the first chunk is not scheduled in the past. */
const LEAD_S = 0.02;

export class WebAudioPlaybackQueue implements PlaybackQueue {
  private listeners = new Set<(e: PlaybackEvent) => void>();
  private current: {
    identity: TurnIdentity;
    sampleRate: number;
    nextStart: number;
    sources: Set<BufferSourceLike>;
    started: boolean;
    finished: boolean;
    startTimer?: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(
    private readonly context: () => PlaybackContextLike | null,
    // Wrapped: a browser's setTimeout called as this.setTimer(...) throws "Illegal invocation".
    private readonly setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = (fn, ms) => setTimeout(fn, ms),
    private readonly clearTimer: (t: ReturnType<typeof setTimeout>) => void = (t) => clearTimeout(t),
  ) {}

  begin(identity: TurnIdentity, sampleRate: number): void {
    this.stop();
    const ctx = this.context();
    if (!ctx) {
      this.emit({ type: "failed", identity, beforeAudio: true });
      return;
    }
    this.current = { identity, sampleRate, nextStart: 0, sources: new Set(), started: false, finished: false };
    if (ctx.state !== "running") {
      void ctx.resume().catch(() => {
        if (sameIdentity(this.current?.identity, identity) && !this.current?.started) {
          this.stop();
          this.emit({ type: "failed", identity, beforeAudio: true });
        }
      });
    }
  }

  enqueue(identity: TurnIdentity, pcm16: Int16Array): void {
    const cur = this.current;
    const ctx = this.context();
    if (!cur || !ctx || !sameIdentity(cur.identity, identity) || cur.finished || pcm16.length === 0) return; // stale or late

    const floats = pcm16ToFloat(pcm16);
    const buffer = ctx.createBuffer(1, floats.length, cur.sampleRate);
    if (buffer.copyToChannel) buffer.copyToChannel(floats, 0);
    else buffer.getChannelData(0).set(floats);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + LEAD_S, cur.nextStart);
    const isFirst = cur.sources.size === 0 && !cur.started;
    cur.sources.add(source);
    source.onended = () => {
      cur.sources.delete(source);
      if (this.current === cur && cur.finished && cur.sources.size === 0) {
        this.current = null;
        this.emit({ type: "ended", identity });
      }
    };
    source.start(startAt);
    cur.nextStart = startAt + buffer.duration;

    if (isFirst) {
      // "Speaking…" only once the clock has reached the audio — never on request.
      const wait = Math.max(0, (startAt - ctx.currentTime) * 1000);
      cur.startTimer = this.setTimer(() => {
        if (this.current !== cur) return;
        cur.started = true;
        this.emit({ type: "started", identity });
      }, wait);
    }
  }

  finish(identity: TurnIdentity): void {
    const cur = this.current;
    if (!cur || !sameIdentity(cur.identity, identity)) return;
    cur.finished = true;
    if (cur.sources.size === 0) {
      // Nothing was ever queued (or all of it has played already).
      this.current = null;
      if (cur.startTimer) this.clearTimer(cur.startTimer);
      this.emit(cur.started ? { type: "ended", identity } : { type: "failed", identity, beforeAudio: true });
    }
  }

  stop(): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    if (cur.startTimer) this.clearTimer(cur.startTimer);
    cur.sources.forEach((s) => {
      s.onended = null;
      try {
        s.stop();
      } catch {
        // already stopped
      }
    });
    cur.sources.clear();
  }

  subscribe(listener: (e: PlaybackEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(e: PlaybackEvent): void {
    this.listeners.forEach((l) => l(e));
  }
}
