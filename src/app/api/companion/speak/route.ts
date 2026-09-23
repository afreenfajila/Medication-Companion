import { SpeechUnavailableError, synthesizeSpeechWav } from "@/lib/ai/speech";
import { fail, firstIssue, newRequestId } from "@/lib/api/envelope";
import { rateLimit } from "@/lib/api/rate-limit";
import { speakRequestSchema } from "@/lib/api/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/companion/speak — reads already-approved text aloud with Gemini,
 * so the voice sounds the same regardless of the visitor's browser/OS instead
 * of depending on whatever speech-synthesis voices happen to be installed.
 *
 * This route never decides what is said: `text` is exactly the fixed
 * copy-catalogue / record-backed wording the caller was already about to hand
 * to the browser's speechSynthesis — the same content, a different renderer.
 * On any failure it returns a JSON error (never fake/empty audio) so the
 * client can fall back to browser speech, which always still works.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return fail(403, "forbidden_origin", "This request was not allowed.", "return_home", requestId);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`speak:${ip}`, 30, 60_000)) {
    return fail(429, "rate_limited", "Please wait a moment and try again.", "retry", requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = speakRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "invalid_request", firstIssue(parsed.error), "retry", requestId);
  }

  try {
    const wav = await synthesizeSpeechWav(parsed.data.text);
    return new Response(new Uint8Array(wav), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    const reason = error instanceof SpeechUnavailableError ? error.reason : "unexpected";
    const detail = error instanceof SpeechUnavailableError ? ` — ${error.message}` : "";
    console.error(`[companion/speak] ${requestId} unavailable: ${reason}${detail}`);
    return fail(
      503,
      "speech_unavailable",
      "Voice playback isn’t available right now.",
      "retry",
      requestId,
    );
  }
}
