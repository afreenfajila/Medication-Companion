import type { z } from "zod";
import { apiFailureSchema, type ApiFailure, type SafeNextAction } from "./schemas";

/** Basic CSRF guard: a browser-sent cross-origin request (or an opaque "null" origin) is refused. */
export function isCrossOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true; // "null" or malformed
  }
}

/**
 * The request body, or null once it passes `max` bytes (reading stops there), so an
 * upload with no declared length still can't be buffered past the cap.
 */
export async function readCapped(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

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
