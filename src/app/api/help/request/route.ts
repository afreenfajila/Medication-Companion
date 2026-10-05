import { fail, firstIssue, newRequestId, ok } from "@/lib/api/envelope";
import { rateLimit } from "@/lib/api/rate-limit";
import { helpRequestSchema, helpResultSchema } from "@/lib/api/schemas";
import { patient } from "@/lib/content/seed-record";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/help/request — a pharmacist callback or a care-circle notification
 * (CLAUDE.md § H4), through the configured (simulated) services. The client
 * shows "sent" only on `ok`; any failure is the plain-language `serviceTrouble`
 * state. Never places a real call or message. Emergency routing is not here (§ I).
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return fail(403, "forbidden_origin", "This request was not allowed.", "return_home", requestId);
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`help:${ip}`, 20, 60_000)) {
    return fail(429, "rate_limited", "Please wait a moment and try again.", "retry", requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = helpRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, "invalid_request", firstIssue(parsed.error), "retry", requestId);
  const { kind, reason } = parsed.data;

  const services = getServices();
  const { patientId } = await services.identity.currentPatient();
  if (patientId !== patient.id) return fail(403, "unknown_patient", "This request was not allowed.", "get_help", requestId);

  if (kind === "pharmacist-callback") {
    const result = await services.pharmacy.requestCallback(patientId, reason);
    if (!result.ok) return unavailable(requestId);
    return ok(helpResultSchema.parse({ kind, reference: result.reference, expectedWindow: result.expectedWindow }), requestId);
  }

  // Care circle: the person has just said "Yes" on the consent step — that is what this request means.
  const result = await services.careCircle.notifyCaregiver(patientId, reason, true, kind);
  if (!result.ok) return unavailable(requestId);
  return ok(helpResultSchema.parse({ kind, contactName: result.caregiverName }), requestId);
}

function unavailable(requestId: string): Response {
  return fail(503, "service_unavailable", "That couldn’t be sent just now.", "retry", requestId);
}
