import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackEvent } from "./playback-queue";
import { WebAudioPlaybackQueue, type AudioBufferLike, type BufferSourceLike, type PlaybackContextLike } from "./playback-queue";

class FakeSource implements BufferSourceLike {
  buffer: AudioBufferLike | null = null;
  startedAt: number | null = null;
  stopped = false;
  onended: (() => void) | null = null;
  connect() {
    return undefined;
  }
  start(when = 0) {
    this.startedAt = when;
  }
  stop() {
    this.stopped = true;
  }
}

function context(state = "running") {
  const sources: FakeSource[] = [];
  const ctx: PlaybackContextLike & { now: number; resumes: number; sources: FakeSource[] } = {
    now: 10,
    resumes: 0,
    sources,
    get currentTime() {
      return this.now;
    },
    state,
    destination: {},
    async resume() {
      this.resumes += 1;
    },
    createBuffer(_c, length, sampleRate) {
      const data = new Float32Array(length);
      return { duration: length / sampleRate, getChannelData: () => data };
    },
    createBufferSource() {
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
  };
  return ctx;
}

const id = (turnId: number) => ({ callId: 1, turnId });
const pcm = (n: number) => new Int16Array(n).fill(1000);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Web Audio playback queue", () => {
  it("schedules chunks back to back and reports 'started' only when the clock reaches the first one", () => {
    const ctx = context();
    const q = new WebAudioPlaybackQueue(() => ctx);
    const events: PlaybackEvent[] = [];
    q.subscribe((e) => events.push(e));
    q.begin(id(1), 24000);
    q.enqueue(id(1), pcm(24000)); // 1 s
    q.enqueue(id(1), pcm(12000)); // 0.5 s
    expect(ctx.sources.map((s) => s.startedAt)).toEqual([10.02, 11.02]);
    expect(events).toEqual([]); // requested, not yet heard
    vi.advanceTimersByTime(20);
    expect(events).toEqual([{ type: "started", identity: id(1) }]);
  });

  it("reports 'ended' only after finish() and the last source has played", () => {
    const ctx = context();
    const q = new WebAudioPlaybackQueue(() => ctx);
    const events: PlaybackEvent[] = [];
    q.subscribe((e) => events.push(e));
    q.begin(id(1), 24000);
    q.enqueue(id(1), pcm(2400));
    vi.advanceTimersByTime(20);
    ctx.sources[0].onended?.();
    expect(events.some((e) => e.type === "ended")).toBe(false); // more may come
    q.enqueue(id(1), pcm(2400));
    q.finish(id(1));
    ctx.sources[1].onended?.();
    expect(events.at(-1)).toEqual({ type: "ended", identity: id(1) });
  });

  it("drops chunks for any other identity and anything after stop()", () => {
    const ctx = context();
    const q = new WebAudioPlaybackQueue(() => ctx);
    q.begin(id(2), 24000);
    q.enqueue(id(1), pcm(100)); // a stale chunk from an earlier line
    expect(ctx.sources).toHaveLength(0);
    q.enqueue(id(2), pcm(100));
    q.stop();
    expect(ctx.sources[0].stopped).toBe(true);
    q.enqueue(id(2), pcm(100));
    expect(ctx.sources).toHaveLength(1);
  });

  it("a stream that finishes with nothing ever queued failed before audio; a stopped line reports nothing further", () => {
    const ctx = context();
    const q = new WebAudioPlaybackQueue(() => ctx);
    const events: PlaybackEvent[] = [];
    q.subscribe((e) => events.push(e));
    q.begin(id(1), 24000);
    q.finish(id(1));
    expect(events).toEqual([{ type: "failed", identity: id(1), beforeAudio: true }]);
    q.begin(id(2), 24000);
    q.enqueue(id(2), pcm(100));
    q.stop();
    vi.advanceTimersByTime(100);
    ctx.sources[0].onended?.();
    expect(events).toHaveLength(1);
  });

  it("resumes a suspended context; without any context the line fails before audio", async () => {
    const ctx = context("suspended");
    const q = new WebAudioPlaybackQueue(() => ctx);
    q.begin(id(1), 24000);
    expect(ctx.resumes).toBe(1);
    const none = new WebAudioPlaybackQueue(() => null);
    const events: PlaybackEvent[] = [];
    none.subscribe((e) => events.push(e));
    none.begin(id(1), 24000);
    expect(events).toEqual([{ type: "failed", identity: id(1), beforeAudio: true }]);
  });
});
