import type { SpeechAdapterId, SpeechFailureReason, TranscriptionAdapterId } from "./adapters";

/**
 * Development-only voice diagnostics for checking the real browser demo.
 *
 * Only stage names, elapsed milliseconds, booleans, internal reason codes and
 * engine ids can be logged. The types allow nothing else, and `sanitize` drops
 * anything else at run time too, so a transcript, an assistant line, a medicine
 * name, a token, a key, audio or callback content can never be printed — even
 * by mistake. In production builds and in tests it is silent.
 */

export type VoiceStage =
  | "call-start"
  | "call-end"
  | "input-ready"
  | "output-ready"
  | "tts-token"
  | "tts-socket-open"
  | "tts-first-audio"
  | "tts-ended"
  | "tts-failed"
  | "tts-skipped"
  | "fallback"
  | "stt-commit"
  | "stt-final"
  | "barge-in"
  | "mute";

type Engine = SpeechAdapterId | TranscriptionAdapterId;
type Value = number | boolean | SpeechFailureReason | Engine;
export type DiagnosticFields = Record<string, Value>;

const REASONS: ReadonlySet<string> = new Set<SpeechFailureReason>([
  "unconfigured",
  "token-unavailable",
  "voice-unavailable",
  "model-unavailable",
  "quota-exceeded",
  "websocket-failed",
  "playback-decode-failed",
  "timeout",
  "engine-failed",
  "not-allowed",
  "no-approved-text",
  "unapproved",
]);
const ENGINES: ReadonlySet<string> = new Set<Engine>(["elevenlabs", "browser", "text-only", "openai-realtime"]);
const FIELD_NAME = /^[a-zA-Z]{1,24}$/;

/** Keeps numbers, booleans and known codes; drops every other string, object or oddly named field. */
export function sanitize(fields: Record<string, unknown>): DiagnosticFields {
  const out: DiagnosticFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!FIELD_NAME.test(key)) continue;
    if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = Math.round(value);
    else if (typeof value === "string" && (REASONS.has(value) || ENGINES.has(value))) out[key] = value as Value;
  }
  return out;
}

let sink: ((line: string) => void) | null =
  typeof process !== "undefined" && process.env.NODE_ENV === "development" && typeof window !== "undefined"
    ? (line) => console.debug(line)
    : null;

/** Test seam: capture what would be logged (or `null` to silence). */
export function setDiagnosticsSinkForTest(next: ((line: string) => void) | null): void {
  sink = next;
}

export function diag(stage: VoiceStage, fields: DiagnosticFields = {}): void {
  if (!sink) return;
  const safe = sanitize(fields);
  const parts = Object.entries(safe).map(([k, v]) => `${k}=${v}`);
  sink(`[voice] ${stage}${parts.length ? ` ${parts.join(" ")}` : ""}`);
}

/** Milliseconds since `start`, for stage timings. */
export function since(start: number): number {
  return Date.now() - start;
}
