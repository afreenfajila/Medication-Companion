import type { CopyKey } from "./translations";

/** Bundled fictional label photos used as the "mock upload" (no real file picker). */
export const samplePhotos: ReadonlyArray<{ id: string; src: string; labelKey: CopyKey }> = [
  { id: "clear", src: "/samples/sample-metformin-label.png", labelKey: "sampleClear" },
  { id: "blurry", src: "/samples/sample-blurry-label.png", labelKey: "sampleBlurry" },
  { id: "different", src: "/samples/sample-different-medicine-label.png", labelKey: "sampleDifferent" },
];
