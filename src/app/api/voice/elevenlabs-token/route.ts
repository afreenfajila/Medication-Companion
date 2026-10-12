import { fail, isCrossOrigin, newRequestId, ok } from "@/lib/api/envelope";
import { rateLimit } from "@/lib/api/rate-limit";
import { elevenLabsTokenSchema } from "@/lib/api/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DEFAULT_TTS_MODEL = "eleven_flash_v2_5";
const API = "https://api.elevenlabs.io/v1";
const TOKEN_URL = `${API}/single-use-token/tts_websocket`;
/** How long a voice/model check is trusted (per server instance). Failures are re-checked sooner. */
export const CHECK_OK_TTL_MS = 10 * 60_000;
export const CHECK_FAIL_TTL_MS = 60_000;

type Outcome = "ok" | "voice_unavailable" | "model_unavailable" | "quota_exceeded" | "key_rejected";
const checks = new Map<string, { outcome: Outcome; until: number }>();

/** Test seam: forget cached voice/model checks. */
export function resetVoiceCheckCache(): void {
  checks.clear();
}

/** The provider's documented error code, from `{detail: {status|code}}` or `{error}`; never logged raw. */
async function errorCode(res: Response): Promise<string> {
  const json = (await res.json().catch(() => null)) as { detail?: { status?: unknown; code?: unknown } | unknown; error?: unknown } | null;
  const detail = json && typeof json.detail === "object" && json.detail ? (json.detail as { status?: unknown; code?: unknown }) : null;
  const code = detail?.status ?? detail?.code ?? json?.error;
  return typeof code === "string" ? code : "";
}

/**
 * Pre-flight for a free account: is the configured voice usable through the API,
 * and is the model available? Metadata calls only — no characters are spent.
 * A key without read permission can't be checked; that is not proof the voice
 * is unavailable, so the token is still minted and the socket will tell.
 */
async function checkVoice(apiKey: string, voiceId: string, modelId: string): Promise<Outcome> {
  const key = `${voiceId}|${modelId}`;
  const cached = checks.get(key);
  if (cached && cached.until > Date.now()) return cached.outcome;

  const headers = { "xi-api-key": apiKey };
  let outcome: Outcome = "ok";
  const voice = await fetch(`${API}/voices/${encodeURIComponent(voiceId)}`, { headers, signal: AbortSignal.timeout(6000) });
  if (voice.status === 401) outcome = "key_rejected";
  else if (voice.status === 402) outcome = "quota_exceeded";
  else if ([400, 404, 422].includes(voice.status)) outcome = "voice_unavailable";
  else if (voice.status === 403) {
    const code = await errorCode(voice);
    // A scoped key may simply lack voice-read permission: unverified, not unavailable.
    if (/subscription_required|feature_not_available|paid_plan|voice/.test(code)) outcome = "voice_unavailable";
  }
  if (outcome === "ok") {
    const models = await fetch(`${API}/models`, { headers, signal: AbortSignal.timeout(6000) });
    if (models.ok) {
      const list = (await models.json().catch(() => null)) as Array<{ model_id?: unknown; can_do_text_to_speech?: unknown }> | null;
      const model = Array.isArray(list) ? list.find((m) => m.model_id === modelId) : undefined;
      if (Array.isArray(list) && (!model || model.can_do_text_to_speech === false)) outcome = "model_unavailable";
    }
  }
  checks.set(key, { outcome, until: Date.now() + (outcome === "ok" ? CHECK_OK_TTL_MS : CHECK_FAIL_TTL_MS) });
  return outcome;
}

/**
 * POST /api/voice/elevenlabs-token — mints one single-use ElevenLabs token for
 * one text-to-speech WebSocket, so the browser can stream the companion's
 * approved words to the voice directly. The permanent `ELEVENLABS_API_KEY` stays
 * here; the token is consumed by the socket that uses it.
 *
 * Before minting, the configured voice and model are checked once (cached), so
 * a voice a free account can't use through the API fails here — before any
 * playback — with a reason code the browser maps to its fallback.
 *
 * This route never sees the text. What may be voiced is decided in the browser
 * by the approved-wording guard (`isApprovedSpeech`), on the exact on-screen string.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  if (isCrossOrigin(request)) {
    return fail(403, "forbidden_origin", "This request was not allowed.", "return_home", requestId);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // One token per spoken line, so a call needs many; still a cost guard.
  if (!rateLimit(`elevenlabs-token:${ip}`, 120, 60_000)) {
    return fail(429, "rate_limited", "Please wait a moment and try again.", "retry", requestId);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return fail(503, "voice_output_unconfigured", "The streaming voice isn’t configured.", "retry", requestId);
  }
  const modelId = process.env.ELEVENLABS_TTS_MODEL || DEFAULT_TTS_MODEL;
  const unavailable = "The streaming voice isn’t available right now.";

  try {
    const outcome = await checkVoice(apiKey, voiceId, modelId);
    if (outcome !== "ok") {
      console.error(`[voice/elevenlabs-token] ${requestId} pre-flight ${outcome}`);
      const code = outcome === "key_rejected" ? "token_unavailable" : outcome;
      return fail(503, code, unavailable, "retry", requestId);
    }

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => null)) as { token?: unknown } | null;
    if (!res.ok || !json || typeof json.token !== "string" || json.token.length === 0 || json.token === apiKey) {
      console.error(`[voice/elevenlabs-token] ${requestId} provider status ${res.status}`);
      return fail(503, res.status === 402 ? "quota_exceeded" : "token_unavailable", unavailable, "retry", requestId);
    }
    return ok(elevenLabsTokenSchema.parse({ token: json.token, voiceId, modelId }), requestId, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[voice/elevenlabs-token] ${requestId} ${error instanceof Error ? error.name : "error"}`);
    return fail(503, "token_unavailable", unavailable, "retry", requestId);
  }
}
