import { describe, expect, it, vi } from "vitest";
import type { AudioFrame } from "./adapters";
import { FRAME_SAMPLES, MIC_CONSTRAINTS, RING_MS, WorkletAudioCapture, type CaptureContextLike, type MediaStreamLike, type WorkletNodeLike } from "./audio-capture";

function fakeDeps(opts: { deny?: string; settings?: Record<string, unknown> } = {}) {
  const tracks = [{ stopped: 0, stop() { this.stopped += 1; }, getSettings: () => opts.settings ?? { echoCancellation: true, noiseSuppression: false, autoGainControl: true, sampleRate: 24000 } }];
  const stream: MediaStreamLike = { getTracks: () => tracks };
  const nodes: WorkletNodeLike[] = [];
  const ctx: CaptureContextLike & { modules: string[] } = {
    sampleRate: 24000,
    state: "suspended",
    destination: {},
    modules: [],
    async resume() {
      this.state = "running";
    },
    audioWorklet: { addModule: async (url) => void ctx.modules.push(url) },
    createMediaStreamSource: () => ({ connect: () => undefined, disconnect: () => undefined }),
    createGain: () => ({ gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined }),
  };
  const getUserMedia = vi.fn(async (c: MediaStreamConstraints) => {
    void c;
    if (opts.deny) throw Object.assign(new Error(opts.deny), { name: opts.deny });
    return stream;
  });
  const deps = {
    getUserMedia,
    context: () => ctx,
    createWorkletNode: (_ctx: CaptureContextLike, _name: string, options: { processorOptions: { frameSize: number } }) => {
      const node: WorkletNodeLike & { options: typeof options; disconnected: boolean } = {
        options,
        disconnected: false,
        port: { onmessage: null },
        connect: () => undefined,
        disconnect() {
          this.disconnected = true;
        },
      };
      nodes.push(node);
      return node;
    },
    moduleUrl: (source: string) => `blob:${source.length}`,
  };
  return { deps, ctx, tracks, nodes, getUserMedia };
}

describe("AudioWorklet microphone capture", () => {
  it("asks for a mono track with echo cancellation, noise suppression and gain control, and reports only what the track says", async () => {
    const { deps, ctx, getUserMedia, nodes } = fakeDeps();
    const cap = new WorkletAudioCapture(deps);
    const result = await cap.start();
    expect(getUserMedia).toHaveBeenCalledWith(MIC_CONSTRAINTS);
    expect(MIC_CONSTRAINTS.audio).toEqual({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 });
    expect(result).toEqual({ ok: true, diagnostics: { echoCancellation: true, noiseSuppression: false, autoGainControl: true, sampleRate: 24000 } });
    expect(ctx.state).toBe("running");
    expect(ctx.modules).toHaveLength(1);
    expect((nodes[0] as unknown as { options: { processorOptions: { frameSize: number } } }).options.processorOptions.frameSize).toBe(FRAME_SAMPLES);
  });

  it("delivers worklet frames to listeners with a running timestamp and keeps a bounded pre-roll of copies", async () => {
    const { deps, nodes } = fakeDeps();
    const cap = new WorkletAudioCapture(deps);
    await cap.start();
    const frames: AudioFrame[] = [];
    cap.onFrame((f) => frames.push(f));
    const port = nodes[0].port;
    for (let i = 0; i < 40; i++) port.onmessage?.({ data: new Float32Array(FRAME_SAMPLES).fill(i / 100) });
    expect(frames).toHaveLength(40);
    expect(frames[1].at).toBe(64);
    expect(frames[1].sampleRate).toBe(24000);
    const pre = cap.preRoll(300);
    expect(pre.map((f) => f.at)).toEqual([35 * 64, 36 * 64, 37 * 64, 38 * 64, 39 * 64]); // oldest first, ≥ 300 ms
    pre[0].samples[0] = 99;
    expect(frames[35].samples[0]).not.toBe(99); // a copy, not the live buffer
    const whole = cap.preRoll(10_000);
    expect(whole.length * 64).toBeLessThanOrEqual(RING_MS + 64); // the ring is bounded
  });

  it("stop() releases the tracks and the worklet, clears the pre-roll and drops a late frame from the disposed worklet", async () => {
    const { deps, tracks, nodes } = fakeDeps();
    const cap = new WorkletAudioCapture(deps);
    await cap.start();
    const frames: AudioFrame[] = [];
    cap.onFrame((f) => frames.push(f));
    const port = nodes[0].port;
    const late = port.onmessage!;
    port.onmessage?.({ data: new Float32Array(FRAME_SAMPLES) });
    cap.stop();
    expect(tracks[0].stopped).toBe(1);
    expect((nodes[0] as unknown as { disconnected: boolean }).disconnected).toBe(true);
    expect(cap.preRoll(1000)).toEqual([]);
    late({ data: new Float32Array(FRAME_SAMPLES) });
    expect(frames).toHaveLength(1);
  });

  it("maps a refused or missing microphone to the voice error codes", async () => {
    expect(await new WorkletAudioCapture(fakeDeps({ deny: "NotAllowedError" }).deps).start()).toEqual({ ok: false, code: "permission-denied" });
    expect(await new WorkletAudioCapture(fakeDeps({ deny: "NotFoundError" }).deps).start()).toEqual({ ok: false, code: "no-microphone" });
    const noCtx = new WorkletAudioCapture({ ...fakeDeps().deps, context: () => null });
    expect(await noCtx.start()).toEqual({ ok: false, code: "unsupported" });
  });

  it("a stop() while the permission prompt is open releases the stream it then receives", async () => {
    const { deps, tracks } = fakeDeps();
    const cap = new WorkletAudioCapture(deps);
    const pending = cap.start();
    cap.stop();
    expect(await pending).toEqual({ ok: false, code: "unknown" });
    expect(tracks[0].stopped).toBe(1);
  });
});
