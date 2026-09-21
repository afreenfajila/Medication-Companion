import { AiUnavailableError, extractLabelWithClaude } from "@/lib/ai/claude";
import { fail, firstIssue, newRequestId, ok } from "@/lib/api/envelope";
import { rateLimit } from "@/lib/api/rate-limit";
import { labelAnalysisSchema, labelAnalyzeFieldsSchema } from "@/lib/api/schemas";
import { analyzeExtraction } from "@/lib/label/analyze";
import { MAX_IMAGE_BYTES, sniffImageType, validateImage } from "@/lib/label/image-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024; // image + multipart overhead

/**
 * POST /api/label/analyze (multipart: sessionId, inputMode="image", image).
 * The image is held in memory for this request only — never written anywhere.
 * Claude extracts text; the deterministic matcher decides the outcome. The
 * route never returns medication instructions.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  // Basic CSRF guard: a browser-sent cross-origin request is refused.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return fail(403, "forbidden_origin", "This request was not allowed.", "return_home", requestId);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`analyze:${ip}`)) {
    return fail(429, "rate_limited", "That was a lot of photos at once. Please wait a moment and try again.", "retry", requestId);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return fail(413, "image_too_large", "That photo is over 5 MB. Please choose a smaller one.", "use_demo_label", requestId);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "invalid_request", "I couldn’t read that upload. Please try again.", "retry", requestId);
  }

  const fields = labelAnalyzeFieldsSchema.safeParse({
    sessionId: form.get("sessionId"),
    inputMode: form.get("inputMode"),
  });
  if (!fields.success) {
    return fail(400, "invalid_request", firstIssue(fields.error), "retry", requestId);
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return fail(400, "missing_image", "No photo was included. Please try again.", "use_demo_label", requestId);
  }
  const check = validateImage(image);
  if (!check.ok) {
    const message =
      check.error === "size"
        ? "That photo is over 5 MB. Please choose a smaller one."
        : check.error === "empty"
          ? "That file looks empty. Please choose another photo."
          : "Please use a JPEG, PNG or WebP photo.";
    return fail(check.error === "size" ? 413 : 400, `image_${check.error}`, message, "use_demo_label", requestId);
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (!sniffed || sniffed !== check.mimeType) {
    return fail(400, "image_type", "That file doesn’t look like the photo type it says it is.", "use_demo_label", requestId);
  }

  try {
    const extraction = await extractLabelWithClaude({ bytes, mimeType: sniffed });
    // Validate our own response too: nothing unvalidated leaves the server.
    const analysis = labelAnalysisSchema.parse(analyzeExtraction(extraction));
    return ok(analysis, requestId);
  } catch (error) {
    // Log a redacted reason only (no image, no model text).
    const reason = error instanceof AiUnavailableError ? error.reason : "unexpected";
    const detail = error instanceof AiUnavailableError ? ` — ${error.message}` : "";
    console.error(`[label/analyze] ${requestId} extraction unavailable: ${reason}${detail}`);
    return fail(
      503,
      "ai_unavailable",
      "I can’t read photos right now. You can type what the label says or use the demo label.",
      "type_label",
      requestId,
    );
  }
}
