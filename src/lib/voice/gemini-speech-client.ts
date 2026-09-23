import type { UiLanguage } from "@/types/content";

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * POSTs already-approved text to /api/companion/speak and returns the audio as
 * a Blob. Returns null for ANY failure (network, timeout, non-audio response,
 * server error) — the caller falls back to browser speech, never to silence.
 */
export async function requestGeminiSpeech(
  text: string,
  language: UiLanguage,
  signal?: AbortSignal,
): Promise<Blob | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    signal?.addEventListener("abort", () => controller.abort());
    try {
      const res = await fetch("/api/companion/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("audio/")) return null;
      const blob = await res.blob();
      return blob.size > 0 ? blob : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
