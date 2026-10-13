import { AiUnavailableError } from "@/lib/ai/claude";
import { prepareForModel } from "@/lib/ai/input-guard";
import { chooseIntent } from "@/lib/ai/intent";
import { fail, firstIssue, isCrossOrigin, newRequestId, ok } from "@/lib/api/envelope";
import { rateLimit } from "@/lib/api/rate-limit";
import { intentDataSchema, intentRequestSchema } from "@/lib/api/schemas";
import { isSafeCompanionReply } from "@/lib/content/understand-guard";
import { classifySafety } from "@/lib/safety/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/companion/intent — what the person meant on this step, by meaning, when
 * the fixed phrases didn't match: one of the on-screen actions (in any order), "unclear"
 * (ask them to repeat), or a short natural reply. A reply is returned only if it passes
 * the same guard as every AI-worded line (no numbers, dosing, advice or match claims;
 * their language; ends with a question). Never fails from the caller's point of view:
 * no AI, a safety-classified message, a failed guard, or any error is "none", and the
 * companion uses its fixed line. Nothing the person said is logged.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  if (isCrossOrigin(request)) {
    return fail(403, "forbidden_origin", "This request was not allowed.", "return_home", requestId);
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`intent:${ip}`, 40, 60_000)) {
    return fail(429, "rate_limited", "Please wait a moment and try again.", "retry", requestId);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = intentRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, "invalid_request", firstIssue(parsed.error), "retry", requestId);
  const { utterance, language, actions, context } = parsed.data;
  const none = () => ok(intentDataSchema.parse({ action: null, outcome: "none" }), requestId);

  // Belt and braces: safety wording is handled before this is ever asked, and never by a model.
  if (classifySafety(utterance).level !== "none" || actions.length === 0) return none();
  // Checked before Claude sees anything: cleaned and masked, or not sent at all.
  const said = prepareForModel(utterance);
  const where = context === undefined ? undefined : prepareForModel(context);
  const offered = actions.map((a) => ({ id: a.id, meaning: prepareForModel(a.description) }));
  const refused = [said, where, ...offered.map((a) => a.meaning)].find((c) => c && !c.ok);
  if (refused && !refused.ok) {
    console.error(`[companion/intent] ${requestId} input refused: ${refused.reason}`);
    return none();
  }
  try {
    const result = await chooseIntent({
      utterance: said.ok ? said.text : "",
      language,
      actions: offered.map((a) => ({ id: a.id, description: a.meaning.ok ? a.meaning.text : "" })),
      context: where?.ok ? where.text : undefined,
    });
    if (result.outcome === "action") return ok(intentDataSchema.parse({ action: result.action, outcome: "action" }), requestId);
    if (result.outcome === "unclear") return ok(intentDataSchema.parse({ action: null, outcome: "unclear" }), requestId);
    if (result.outcome === "reply" && isSafeCompanionReply(result.reply, language)) {
      return ok(intentDataSchema.parse({ action: null, outcome: "reply", reply: result.reply }), requestId);
    }
    if (result.outcome === "reply") console.error(`[companion/intent] ${requestId} reply refused by guard`);
    return none();
  } catch (error) {
    const reason = error instanceof AiUnavailableError ? error.reason : "unexpected";
    const detail = error instanceof AiUnavailableError ? ` — ${error.message}` : "";
    console.error(`[companion/intent] ${requestId} unavailable: ${reason}${detail}`);
    return none();
  }
}
