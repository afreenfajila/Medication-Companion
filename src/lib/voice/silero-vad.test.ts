import { describe, expect, it, vi } from "vitest";
import { loadSileroVad, SileroVad, VAD_WINDOW, Windower, type OrtLike, type SessionLike, type TensorLike } from "./silero-vad";

class FakeTensor implements TensorLike {
  constructor(
    public type: string,
    public data: Float32Array | bigint[] | number[],
    public dims?: number[],
  ) {}
}

function fakeOrt(probabilities: number[] = [0.8]) {
  const runs: Array<Record<string, FakeTensor>> = [];
  let n = 0;
  const session: SessionLike & { released: boolean } = {
    released: false,
    async run(feeds) {
      runs.push(feeds as Record<string, FakeTensor>);
      const p = probabilities[Math.min(n++, probabilities.length - 1)];
      return { output: new FakeTensor("float32", new Float32Array([p])), stateN: new FakeTensor("float32", new Float32Array(256).fill(n), [2, 1, 128]) };
    },
    async release() {
      this.released = true;
    },
  };
  const ort: OrtLike & { created: Array<[unknown, unknown]> } = {
    created: [],
    env: { wasm: {} },
    Tensor: FakeTensor,
    InferenceSession: {
      create: async (model, options) => {
        ort.created.push([model, options]);
        return session;
      },
    },
  };
  return { ort, session, runs };
}

describe("Silero VAD through ONNX Runtime Web", () => {
  it("feeds a 64-sample context plus the 512-sample window, the carried state and sr=16000", async () => {
    const { ort, session, runs } = fakeOrt([0.2, 0.9]);
    const vad = new SileroVad(ort, session);
    const w1 = new Float32Array(VAD_WINDOW).fill(0.5);
    expect(await vad.probability(w1)).toBeCloseTo(0.2, 6);
    const feeds = runs[0];
    expect(feeds.input.dims).toEqual([1, 64 + VAD_WINDOW]);
    expect(Array.from((feeds.input.data as Float32Array).subarray(0, 64))).toEqual(new Array(64).fill(0)); // first window: empty context
    expect(feeds.state.dims).toEqual([2, 1, 128]);
    expect(feeds.sr.type).toBe("int64");
    expect(feeds.sr.data).toEqual([BigInt(16000)]);

    expect(await vad.probability(new Float32Array(VAD_WINDOW).fill(-0.5))).toBeCloseTo(0.9, 6);
    expect(Array.from((runs[1].input.data as Float32Array).subarray(0, 64))).toEqual(new Array(64).fill(0.5)); // the last 64 of w1
    expect((runs[1].state.data as Float32Array)[0]).toBe(1); // stateN from the previous run
  });

  it("clamps odd outputs to 0..1 and returns 0 once disposed; reset clears the memory", async () => {
    const { ort, session, runs } = fakeOrt([7, Number.NaN, 0.4]);
    const vad = new SileroVad(ort, session);
    expect(await vad.probability(new Float32Array(VAD_WINDOW))).toBe(1);
    expect(await vad.probability(new Float32Array(VAD_WINDOW))).toBe(0);
    vad.reset();
    await vad.probability(new Float32Array(VAD_WINDOW));
    expect((runs[2].state.data as Float32Array)[0]).toBe(0);
    vad.dispose();
    expect(await vad.probability(new Float32Array(VAD_WINDOW))).toBe(0);
    expect(session.released).toBe(true);
  });

  it("loads lazily from the same-origin asset path with the single-threaded wasm backend", async () => {
    const { ort } = fakeOrt();
    const importOrt = vi.fn(async () => ort);
    const model = await loadSileroVad({ importOrt, assetPath: "/vad/" });
    expect(model).not.toBeNull();
    expect(ort.env?.wasm).toEqual({ wasmPaths: "/vad/", numThreads: 1 });
    expect(ort.created).toEqual([["/vad/silero_vad_v5.onnx", { executionProviders: ["wasm"] }]]);
  });

  it("resolves null (never throws) when the runtime or the model cannot be loaded", async () => {
    expect(await loadSileroVad({ importOrt: async () => Promise.reject(new Error("blocked by CSP")) })).toBeNull();
    const { ort } = fakeOrt();
    ort.InferenceSession = { create: async () => Promise.reject(new Error("404")) };
    expect(await loadSileroVad({ importOrt: async () => ort })).toBeNull();
  });

  it("the windower hands out whole 512-sample windows and keeps the remainder", () => {
    const w = new Windower();
    expect(w.push(new Float32Array(300))).toEqual([]);
    const out = w.push(new Float32Array(1000));
    expect(out.map((x) => x.length)).toEqual([512, 512]);
    expect(w.push(new Float32Array(236)).length).toBe(1); // 276 + 236 = 512
  });
});
