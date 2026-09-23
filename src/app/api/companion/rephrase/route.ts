import { AiUnavailableError } from "@/lib/ai/claude";
import { rephraseExplanationFields } from "@/lib/ai/rephrase";
import { fail, firstIssue, newRequestId, ok } from "@/lib/api/envelope";
import { rateLimit } from "@/lib/api/rate-limit";
import { rephraseRequestSchema, rephraseResponseDataSchema } from "@/lib/api/schemas";
import { metforminRecord } from "@/lib/content/demo-record";
import { applyValidatedRephrase, type RephraseFieldSet } from "@/lib/content/rephrase-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canonicalFields(): RephraseFieldSet {
  const e = metforminRecord.explanation;
  return {
    title: e.title.en!,
    purpose: e.purpose.en!,
    instructionIntro: e.instructionIntro.en!,
    caution: e.caution.en!,
    confirmationPrompt: e.confirmationPrompt.en!,
  };
}

/**
 * POST /api/companion/rephrase — optional, English-only enhancement of the
 * record explanation's non-dosing "flavour" text. Never fails from the
 * caller's point of view: on any AI/validation problem it returns the exact
 * approved text unchanged (`source: "fallback"`), which is what the client
 * would show anyway. The instruction and source-line fields are never sent to
 * Claude and never leave this route.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return fail(403, "forbidden_origin", "This request was not allowed.", "return_home", requestId);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`rephrase:${ip}`, 20, 60_000)) {
    return fail(429, "rate_limited", "Please wait a moment and try again.", "retry", requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = rephraseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "invalid_request", firstIssue(parsed.error), "retry", requestId);
  }

  const canonical = canonicalFields();
  try {
    const candidate = await rephraseExplanationFields(canonical);
    const fields = applyValidatedRephrase(canonical, candidate);
    return ok(rephraseResponseDataSchema.parse({ fields, source: "claude" }), requestId);
  } catch (error) {
    const reason = error instanceof AiUnavailableError ? error.reason : "unexpected";
    const detail = error instanceof AiUnavailableError ? ` — ${error.message}` : "";
    console.error(`[companion/rephrase] ${requestId} unavailable: ${reason}${detail}`);
    return ok(rephraseResponseDataSchema.parse({ fields: canonical, source: "fallback" }), requestId);
  }
}
