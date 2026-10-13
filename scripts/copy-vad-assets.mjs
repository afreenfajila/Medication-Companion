// Copies the local speech-detection assets (Silero VAD model + ONNX Runtime wasm) into
// public/vad/ so they are served same-origin. Runs before `next dev` / `next build`.
// Nothing here is a secret; public/vad/ is git-ignored because it is derived from node_modules.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "vad");
const files = [
  ["node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx", "silero_vad_v5.onnx"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.wasm"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.mjs"],
];

mkdirSync(out, { recursive: true });
let copied = 0;
for (const [from, to] of files) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.warn(`copy-vad-assets: missing ${from} (automatic interruption will fall back to push-to-talk)`);
    continue;
  }
  copyFileSync(src, join(out, to));
  copied += 1;
}
console.log(`copy-vad-assets: ${copied}/${files.length} files in public/vad/`);
