import { labelAnalyzeResponseSchema, type LabelAnalysis } from "@/lib/api/schemas";

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * POSTs one image to /api/label/analyze and validates the response envelope.
 * Returns null for ANY failure (network, timeout, server error, invalid JSON) —
 * the caller routes null to the safe fallback, never to an explanation.
 */
export async function requestLabelAnalysis(
  image: Blob,
  sessionId: string,
  signal?: AbortSignal,
): Promise<LabelAnalysis | null> {
  try {
    const form = new FormData();
    form.set("sessionId", sessionId);
    form.set("inputMode", "image");
    form.set("image", image, "label");

    // One controller for both the caller's abort and our own timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    signal?.addEventListener("abort", () => controller.abort());
    try {
      const res = await fetch("/api/label/analyze", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const parsed = labelAnalyzeResponseSchema.safeParse(await res.json());
      return parsed.success && parsed.data.ok ? parsed.data.data : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
