import type { SpeechProbabilityModel } from "./adapters";

/**
 * Silero VAD (v5/v6 weights) through ONNX Runtime Web, entirely in the browser:
 * no audio leaves the device for this. One 512-sample window at 16 kHz in, one
 * speech probability out. The model keeps a small recurrent state and a
 * 64-sample context from the previous window, exactly as the reference
 * implementation does.
 *
 * Everything is injected so tests run with a fake runtime: the real app loads
 * `onnxruntime-web` lazily when a call starts (it is a large download) and the
 * model file from /vad/, copied there from node_modules by scripts/copy-vad-assets.mjs.
 */

export const VAD_SAMPLE_RATE = 16000;
export const VAD_WINDOW = 512;
const CONTEXT = 64;
const STATE_SHAPE: [number, number, number] = [2, 1, 128];

/** The slice of onnxruntime-web this module uses. */
export type OrtLike = {
  env?: { wasm?: { wasmPaths?: string | Record<string, string>; numThreads?: number } };
  Tensor: new (type: string, data: Float32Array | bigint[] | number[], dims?: number[]) => TensorLike;
  InferenceSession: { create(model: string | ArrayBuffer | Uint8Array, options?: unknown): Promise<SessionLike> };
};
export type TensorLike = { data: ArrayLike<number> | ArrayLike<bigint>; dispose?: () => void };
export type SessionLike = { run(feeds: Record<string, TensorLike>): Promise<Record<string, TensorLike>>; release?: () => Promise<void> };

export const DEFAULT_VAD_ASSET_PATH = "/vad/";
export const VAD_MODEL_FILE = "silero_vad_v5.onnx";

export class SileroVad implements SpeechProbabilityModel {
  private state: TensorLike;
  private context = new Float32Array(CONTEXT);
  private readonly sr: TensorLike;
  private disposed = false;

  constructor(
    private readonly ort: OrtLike,
    private readonly session: SessionLike,
  ) {
    this.state = this.freshState();
    this.sr = new ort.Tensor("int64", [BigInt(VAD_SAMPLE_RATE)]);
  }

  async probability(window16k: Float32Array): Promise<number> {
    if (this.disposed) return 0;
    const input = new Float32Array(CONTEXT + window16k.length);
    input.set(this.context, 0);
    input.set(window16k, CONTEXT);
    this.context = window16k.slice(-CONTEXT);
    const out = await this.session.run({
      input: new this.ort.Tensor("float32", input, [1, input.length]),
      state: this.state,
      sr: this.sr,
    });
    if (this.disposed) return 0;
    if (out.stateN) this.state = out.stateN;
    const p = Number(out.output?.data?.[0] ?? 0);
    return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
  }

  reset(): void {
    this.state = this.freshState();
    this.context = new Float32Array(CONTEXT);
  }

  dispose(): void {
    this.disposed = true;
    void this.session.release?.().catch(() => undefined);
  }

  private freshState(): TensorLike {
    return new this.ort.Tensor("float32", new Float32Array(2 * 128), STATE_SHAPE);
  }
}

export type LoadVadOptions = {
  /** `() => import("onnxruntime-web")` in the app; a fake in tests. */
  importOrt: () => Promise<OrtLike>;
  assetPath?: string;
};

/** Resolves null when the runtime or the model can't be loaded — the caller then disables automatic interruption. */
export async function loadSileroVad(options: LoadVadOptions): Promise<SpeechProbabilityModel | null> {
  const assetPath = options.assetPath ?? DEFAULT_VAD_ASSET_PATH;
  try {
    const ort = await options.importOrt();
    if (ort.env?.wasm) {
      ort.env.wasm.wasmPaths = assetPath;
      ort.env.wasm.numThreads = 1; // no SharedArrayBuffer / cross-origin isolation needed
    }
    const session = await ort.InferenceSession.create(`${assetPath}${VAD_MODEL_FILE}`, { executionProviders: ["wasm"] });
    return new SileroVad(ort, session);
  } catch {
    return null;
  }
}

/** Collects 16 kHz samples and hands out whole 512-sample windows. */
export class Windower {
  private pending = new Float32Array(0);

  push(samples16k: Float32Array): Float32Array[] {
    const joined = new Float32Array(this.pending.length + samples16k.length);
    joined.set(this.pending, 0);
    joined.set(samples16k, this.pending.length);
    const out: Float32Array[] = [];
    let at = 0;
    while (joined.length - at >= VAD_WINDOW) {
      out.push(joined.slice(at, at + VAD_WINDOW));
      at += VAD_WINDOW;
    }
    this.pending = joined.slice(at);
    return out;
  }

  reset(): void {
    this.pending = new Float32Array(0);
  }
}
