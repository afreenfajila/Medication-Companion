import type { AudioCapture, AudioFrame, CaptureDiagnostics } from "./adapters";
import type { VoiceErrorCode } from "./provider";

/**
 * Microphone capture through an AudioWorklet: mono PCM frames of a fixed size,
 * delivered to listeners and kept in a short ring buffer (the "pre-roll") so the
 * first syllables of an interruption, said before it was confirmed, are not lost.
 *
 * Nothing here is stored beyond the ring buffer, which is dropped on stop().
 */

/** 64 ms at 24 kHz: two whole 512-sample VAD windows after resampling to 16 kHz. */
export const FRAME_SAMPLES = 1536;
export const CAPTURE_SAMPLE_RATE = 24000;
/** How much recent audio the ring keeps; enough for detection latency plus the pre-roll. */
export const RING_MS = 1500;

// The processor only batches samples; all decisions happen on the main thread.
const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = (options.processorOptions && options.processorOptions.frameSize) || 1536;
    this.buffer = new Float32Array(this.size);
    this.n = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.n++] = channel[i];
      if (this.n === this.size) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(this.size);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

// Minimal structural types so tests can hand in fakes.
export type WorkletNodeLike = {
  port: { onmessage: ((e: { data: Float32Array }) => void) | null; close?: () => void };
  connect(node: unknown): unknown;
  disconnect(): void;
};
export type CaptureContextLike = {
  sampleRate: number;
  state: string;
  destination: unknown;
  resume(): Promise<void>;
  audioWorklet: { addModule(url: string): Promise<void> };
  createMediaStreamSource(stream: MediaStreamLike): { connect(node: unknown): unknown; disconnect(): void };
  createGain(): { gain: { value: number }; connect(node: unknown): unknown; disconnect(): void };
};
export type MediaStreamLike = {
  getTracks(): Array<{ stop(): void; getSettings?: () => Record<string, unknown> }>;
};
export type CaptureDeps = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStreamLike>;
  context: () => CaptureContextLike | null;
  createWorkletNode: (ctx: CaptureContextLike, name: string, options: { processorOptions: { frameSize: number } }) => WorkletNodeLike;
  /** Turns the processor source into a URL `addModule` can load. */
  moduleUrl?: (source: string) => string;
};

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
};

function errorCode(e: unknown): VoiceErrorCode {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "permission-denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-microphone";
  return "unknown";
}

export class WorkletAudioCapture implements AudioCapture {
  private listeners = new Set<(f: AudioFrame) => void>();
  private ring: AudioFrame[] = [];
  private ringMs = 0;
  private generation = 0;
  private cleanup: (() => void) | null = null;
  private samplesSeen = 0;

  constructor(private readonly deps: CaptureDeps) {}

  async start(): Promise<{ ok: true; diagnostics: CaptureDiagnostics } | { ok: false; code: VoiceErrorCode }> {
    this.stop();
    const generation = ++this.generation;
    const ctx = this.deps.context();
    if (!ctx) return { ok: false, code: "unsupported" };

    let stream: MediaStreamLike;
    try {
      stream = await this.deps.getUserMedia(MIC_CONSTRAINTS);
    } catch (e) {
      return { ok: false, code: errorCode(e) };
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop()); // stopped while the permission prompt was open
      return { ok: false, code: "unknown" };
    }

    const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
    try {
      await ctx.resume().catch(() => undefined);
      const url = (this.deps.moduleUrl ?? defaultModuleUrl)(WORKLET_SOURCE);
      await ctx.audioWorklet.addModule(url);
      if (generation !== this.generation) {
        stopTracks();
        return { ok: false, code: "unknown" };
      }
      const source = ctx.createMediaStreamSource(stream);
      const node = this.deps.createWorkletNode(ctx, "pcm-capture", { processorOptions: { frameSize: FRAME_SAMPLES } });
      const sink = ctx.createGain();
      sink.gain.value = 0; // the graph must reach the destination to run; nothing is heard
      node.port.onmessage = (e) => {
        if (generation !== this.generation) return; // a disposed worklet's late frame
        this.push({ samples: e.data, sampleRate: ctx.sampleRate, at: (this.samplesSeen / ctx.sampleRate) * 1000 });
        this.samplesSeen += e.data.length;
      };
      source.connect(node);
      node.connect(sink);
      sink.connect(ctx.destination);
      this.cleanup = () => {
        node.port.onmessage = null;
        node.port.close?.();
        node.disconnect();
        sink.disconnect();
        source.disconnect();
        stopTracks();
      };
    } catch {
      stopTracks();
      return { ok: false, code: "unsupported" };
    }

    const settings = stream.getTracks()[0]?.getSettings?.() ?? {};
    return {
      ok: true,
      diagnostics: {
        echoCancellation: settings.echoCancellation === true,
        noiseSuppression: settings.noiseSuppression === true,
        autoGainControl: settings.autoGainControl === true,
        sampleRate: ctx.sampleRate,
      },
    };
  }

  onFrame(listener: (frame: AudioFrame) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  preRoll(ms: number): AudioFrame[] {
    const out: AudioFrame[] = [];
    let total = 0;
    for (let i = this.ring.length - 1; i >= 0 && total < ms; i--) {
      const f = this.ring[i];
      out.unshift({ samples: f.samples.slice(), sampleRate: f.sampleRate, at: f.at });
      total += (f.samples.length / f.sampleRate) * 1000;
    }
    return out;
  }

  stop(): void {
    this.generation += 1;
    this.cleanup?.();
    this.cleanup = null;
    this.ring = [];
    this.ringMs = 0;
    this.samplesSeen = 0;
  }

  /** Test seam and the worklet's delivery path. */
  push(frame: AudioFrame): void {
    this.ring.push(frame);
    this.ringMs += (frame.samples.length / frame.sampleRate) * 1000;
    while (this.ring.length > 1 && this.ringMs > RING_MS) {
      const dropped = this.ring.shift()!;
      this.ringMs -= (dropped.samples.length / dropped.sampleRate) * 1000;
    }
    this.listeners.forEach((l) => l(frame));
  }
}

function defaultModuleUrl(source: string): string {
  return URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
}

/** The real browser wiring, or null where the pieces don't exist (then the call has no local audio). */
export function browserCaptureDeps(context: () => CaptureContextLike | null): CaptureDeps | null {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") return null;
  return {
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c) as unknown as Promise<MediaStreamLike>,
    context,
    createWorkletNode: (ctx, name, options) => new AudioWorkletNode(ctx as unknown as BaseAudioContext, name, options) as unknown as WorkletNodeLike,
  };
}
