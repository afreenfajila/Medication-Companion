import { fail, isCrossOrigin, firstIssue, newRequestId, ok } from "@/lib/api/envelope";
import { rateLimit } from "@/lib/api/rate-limit";
import { openAiSessionRequestSchema, openAiSessionSchema } from "@/lib/api/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DEFAULT_TRANSCRIBE_MODEL = "gpt-live-transcribe";
/** How long the browser's credential lives. The socket it opens outlives it; a new call mints a new one. */
export const SESSION_TTL_S = 600;
export const OPENAI_REALTIME_WS = "wss://api.openai.com/v1/realtime";
const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

/**
 * POST /api/voice/openai-session — mints a short-lived OpenAI Realtime client
 * secret for one *transcription-only* session, so the browser can stream
 * microphone audio to OpenAI directly. The permanent `OPENAI_API_KEY` stays here.
 *
 * Transcription is all this session can do: no instructions, no model replies,
 * no tools, and nothing about the person or their medicines is attached. Server
 * turn detection is off because the app's own local detector decides where a
 * turn ends. This route never sees audio or words.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  if (isCrossOrigin(request)) {
    return fail(403, "forbidden_origin", "This request was not allowed.", "return_home", requestId);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`openai-session:${ip}`, 20, 60_000)) {
    return fail(429, "rate_limited", "Please wait a moment and try again.", "retry", requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = openAiSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "invalid_request", firstIssue(parsed.error), "retry", requestId);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fail(503, "voice_input_unavailable", "Realtime voice input isn’t configured.", "retry", requestId);
  }
  const model = process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL;
  const languages = parsed.data.language === "zh-Hans" ? ["zh", "en"] : ["en", "zh"];

  try {
    const res = await fetch(CLIENT_SECRETS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: SESSION_TTL_S },
        session: {
          type: "transcription",
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              transcription: { model, languages },
              noise_reduction: { type: "near_field" },
              turn_detection: null,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => null)) as { value?: unknown; expires_at?: unknown } | null;
    if (!res.ok || !json || typeof json.value !== "string" || !json.value.startsWith("ek_")) {
      console.error(`[voice/openai-session] ${requestId} provider status ${res.status}`);
      return fail(503, "voice_input_unavailable", "Realtime voice input isn’t available right now.", "retry", requestId);
    }
    const data = openAiSessionSchema.parse({
      clientSecret: json.value,
      model,
      wsUrl: OPENAI_REALTIME_WS,
      expiresAt: typeof json.expires_at === "number" ? json.expires_at : Math.floor(Date.now() / 1000) + SESSION_TTL_S,
    });
    return ok(data, requestId, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[voice/openai-session] ${requestId} ${error instanceof Error ? error.name : "error"}`);
    return fail(503, "voice_input_unavailable", "Realtime voice input isn’t available right now.", "retry", requestId);
  }
}
