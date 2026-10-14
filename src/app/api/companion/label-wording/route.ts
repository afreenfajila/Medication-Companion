import { AiUnavailableError } from "@/lib/ai/claude";
import { prepareForModel } from "@/lib/ai/input-guard";
import { extractLabelWording } from "@/lib/ai/label-wording";
import { fail, firstIssue, isCrossOrigin, newRequestId, ok } from "@/lib/api/envelope";
import { rateLimit } from "@/lib/api/rate-limit";
import { labelWordingDataSchema, labelWordingRequestSchema } from "@/lib/api/schemas";
import { isVerbatimSubset } from "@/lib/dose-check/label-wording";
import { classifySafety } from "@/lib/safety/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/companion/label-wording — on the "what does your box say?" step, the label wording
 * she read, from how she actually said it. Only her own words, in her order (checked here, not
 * trusted). Never fails from the caller's point of view: no AI, safety wording, refused input or
 * any error is "none", and the app's own clean-up is used. The result is only a reading: it is
 * read back and needs her "yes". Nothing she said is logged.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  if (isCrossOrigin(request)) {
    return fail(403, "forbidden_origin", "This request was not allowed.", "return_home", requestId);
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`label-wording:${ip}`, 40, 60_000)) {
    return fail(429, "rate_limited", "Please wait a moment and try again.", "retry", requestId);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = labelWordingRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, "invalid_request", firstIssue(parsed.error), "retry", requestId);
  const { utterance, language } = parsed.data;
  const none = () => ok(labelWordingDataSchema.parse({ outcome: "none" }), requestId);

  // Safety wording is never a model's to handle.
  if (classifySafety(utterance).level !== "none") return none();
  const said = prepareForModel(utterance);
  if (!said.ok) {
    console.error(`[companion/label-wording] ${requestId} input refused: ${said.reason}`);
    return none();
  }
  try {
    const wording = await extractLabelWording({ utterance: said.text, language });
    if (!wording) return ok(labelWordingDataSchema.parse({ outcome: "no-wording" }), requestId);
    // Checked again against exactly what she said (belt and braces).
    if (!isVerbatimSubset(wording, utterance)) return none();
    return ok(labelWordingDataSchema.parse({ outcome: "wording", wording }), requestId);
  } catch (error) {
    const reason = error instanceof AiUnavailableError ? error.reason : "unexpected";
    console.error(`[companion/label-wording] ${requestId} unavailable: ${reason}`);
    return none();
  }
}
