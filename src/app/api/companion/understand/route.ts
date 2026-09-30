import { AiUnavailableError } from "@/lib/ai/claude";
import { understandMessage } from "@/lib/ai/understand";
import { fail, firstIssue, newRequestId, ok } from "@/lib/api/envelope";
import { rateLimit } from "@/lib/api/rate-limit";
import {
  understandCapabilitySchema,
  understandRequestSchema,
  understandResponseDataSchema,
} from "@/lib/api/schemas";
import { t } from "@/lib/content/translations";
import { actionsForOffer, isSafeCompanionReply } from "@/lib/content/understand-guard";
import { classifySafety } from "@/lib/safety/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/companion/understand — optional natural-language understanding of
 * one ordinary in-call message (CLAUDE.md § Claude, task 3). The reply is
 * advisory: it can change what the companion SAYS and which of the two in-call
 * doors it offers, never a gate. Never fails from the caller's point of view —
 * on any AI, safety or validation problem it returns the deterministic approved
 * reply and the router's own actions (`source: "fallback"`).
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return fail(403, "forbidden_origin", "This request was not allowed.", "return_home", requestId);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`understand:${ip}`, 40, 60_000)) {
    return fail(429, "rate_limited", "Please wait a moment and try again.", "retry", requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = understandRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "invalid_request", firstIssue(parsed.error), "retry", requestId);
  }
  const { message, key, language, offered, checkingMedicineName, history } = parsed.data;
  const approved = t(language, key);
  const fallback = () =>
    ok(
      understandResponseDataSchema.parse({
        text: approved,
        contextualActions: offered,
        checkingMedicineName,
        source: "fallback",
      }),
      requestId,
    );

  // Belt and braces: the reducer already sends safety-classified messages to the
  // safety screen, but the model is never asked about one, whatever the client says.
  if (classifySafety(message).level !== "none") return fallback();

  try {
    const out = await understandMessage({ language, message, history, routerReply: approved });
    if (!isSafeCompanionReply(out.reply, language)) return fallback();
    return ok(
      understandResponseDataSchema.parse({
        text: out.reply.trim(),
        contextualActions: actionsForOffer(out.offer),
        checkingMedicineName: out.checkingMedicineName,
        source: "claude",
      }),
      requestId,
    );
  } catch (error) {
    const reason = error instanceof AiUnavailableError ? error.reason : "unexpected";
    const detail = error instanceof AiUnavailableError ? ` — ${error.message}` : "";
    console.error(`[companion/understand] ${requestId} unavailable: ${reason}${detail}`);
    return fallback();
  }
}

/**
 * GET /api/companion/understand — whether the understanding pass is available
 * (an Anthropic key is configured). Lets the client skip it outright, so a
 * deployment without AI answers instantly instead of pausing to "think" and
 * then falling back. Reveals nothing about the key itself.
 */
export async function GET(): Promise<Response> {
  const requestId = newRequestId();
  return ok(understandCapabilitySchema.parse({ enabled: Boolean(process.env.ANTHROPIC_API_KEY) }), requestId);
}
