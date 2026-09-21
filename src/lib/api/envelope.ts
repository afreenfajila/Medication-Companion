import type { z } from "zod";
import { apiFailureSchema, type ApiFailure, type SafeNextAction } from "./schemas";

export function newRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

/** JSON success envelope. */
export function ok<T>(data: T, requestId: string, init?: ResponseInit): Response {
  return Response.json({ ok: true, data, requestId }, init);
}

/** JSON failure envelope with plain-language message and a safe next action. Validated before send. */
export function fail(
  status: number,
  code: string,
  message: string,
  safeNextAction: SafeNextAction,
  requestId: string,
): Response {
  const body: ApiFailure = apiFailureSchema.parse({
    ok: false,
    error: { code, message, safeNextAction },
    requestId,
  });
  return Response.json(body, { status });
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request.";
}
