import { AiUnavailableError } from "@/lib/ai/claude";
import { rephraseConversationalLine } from "@/lib/ai/rephrase";
import { fail, firstIssue, newRequestId, ok } from "@/lib/api/envelope";
import { rateLimit } from "@/lib/api/rate-limit";
import { replyRephraseRequestSchema, replyRephraseResponseDataSchema } from "@/lib/api/schemas";
import { t } from "@/lib/content/translations";
import { isSafeRephrase } from "@/lib/content/rephrase-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/companion/reply-rephrase — optional, English-only naturalisation
 * of ONE approved in-call conversational line (see CONVERSATIONAL_REPHRASE_KEYS).
 * The client names which line by its copy key; the canonical text is looked up
 * here, never trusted from the client. Never fails from the caller's point of
 * view: on any AI/validation problem it returns the exact approved line
 * unchanged (`source: "fallback"`), which is what the client would show anyway.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return fail(403, "forbidden_origin", "This request was not allowed.", "return_home", requestId);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`reply-rephrase:${ip}`, 40, 60_000)) {
    return fail(429, "rate_limited", "Please wait a moment and try again.", "retry", requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = replyRephraseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "invalid_request", firstIssue(parsed.error), "retry", requestId);
  }

  const canonical = t("en", parsed.data.key);
  try {
    const candidate = await rephraseConversationalLine(canonical);
    const text = isSafeRephrase(canonical, candidate) ? candidate : canonical;
    return ok(
      replyRephraseResponseDataSchema.parse({ text, source: text === canonical ? "fallback" : "claude" }),
      requestId,
    );
  } catch (error) {
    const reason = error instanceof AiUnavailableError ? error.reason : "unexpected";
    const detail = error instanceof AiUnavailableError ? ` — ${error.message}` : "";
    console.error(`[companion/reply-rephrase] ${requestId} unavailable: ${reason}${detail}`);
    return ok(replyRephraseResponseDataSchema.parse({ text: canonical, source: "fallback" }), requestId);
  }
}
