import { z } from "zod";
import { UNDERSTAND_KEYS } from "@/lib/content/understand-guard";
import { HELP_REASONS } from "@/lib/services/reasons";

// Shared request/response contracts (site-contract.md §8). Used by the route
// to build responses and by the client to validate what it receives.

export const safeNextActionSchema = z.enum([
  "retry",
  "use_demo_label",
  "type_label",
  "get_help",
  "return_home",
]);
export type SafeNextAction = z.infer<typeof safeNextActionSchema>;

export const apiFailureSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    safeNextAction: safeNextActionSchema,
  }),
  requestId: z.string(),
});
export type ApiFailure = z.infer<typeof apiFailureSchema>;

export function apiSuccessSchema<T extends z.ZodType>(data: T) {
  return z.object({ ok: z.literal(true), data, requestId: z.string() });
}

export const labelAnalysisSchema = z.object({
  outcome: z.enum(["candidate", "no-match", "ambiguous", "unreadable", "blocked"]),
  userMessage: z.string(),
  nextState: z.enum(["confirm-match", "safety"]),
  candidate: z
    .object({
      candidateId: z.string(),
      patientName: z.string(),
      medicineName: z.string(),
      strength: z.string(),
      dosageForm: z.string(),
      sourceLabel: z.literal("BrightCare Pharmacy"),
      matchStatus: z.literal("possible"),
    })
    .optional(),
  reasonCode: z
    .enum(["low-confidence", "conflict", "missing-fields", "multiple-candidates", "unsafe-request"])
    .optional(),
});
export type LabelAnalysis = z.infer<typeof labelAnalysisSchema>;

export const labelAnalyzeResponseSchema = z.discriminatedUnion("ok", [
  apiSuccessSchema(labelAnalysisSchema),
  apiFailureSchema,
]);
export type LabelAnalyzeResponse = z.infer<typeof labelAnalyzeResponseSchema>;

/** Non-file fields of the multipart request. The image itself is validated separately. */
export const labelAnalyzeFieldsSchema = z.object({
  sessionId: z.string().min(1).max(64),
  inputMode: z.literal("image"),
});

/**
 * Help requests (CLAUDE.md § H4): a pharmacist callback or a care-circle
 * notification, through the simulated services. "Sent" may only be shown
 * after this returns `ok`.
 */
export const HELP_KINDS = ["pharmacist-callback", "family", "trusted-helper"] as const;
export const helpRequestSchema = z.object({
  sessionId: z.string().min(1).max(64),
  kind: z.enum(HELP_KINDS),
  reason: z.enum(HELP_REASONS),
});
export const helpResultSchema = z.object({
  kind: z.enum(HELP_KINDS),
  reference: z.string().optional(),
  contactName: z.string().optional(),
});
export type HelpResult = z.infer<typeof helpResultSchema>;
export const helpResponseSchema = z.discriminatedUnion("ok", [apiSuccessSchema(helpResultSchema), apiFailureSchema]);

/**
 * Speech output: renders already-approved text to audio (never generates
 * content). Success returns the raw WAV bytes directly (Content-Type:
 * audio/wav), not a JSON envelope — only failures use the standard envelope.
 */
export const speakRequestSchema = z.object({
  text: z.string().min(1).max(600),
  language: z.enum(["en", "zh-Hans"]),
});

/**
 * In-call understanding (Claude task 3): the person's own message plus a short
 * window of the conversation. `key` names the deterministic reply the router
 * already chose; the server looks up its approved text itself and returns it
 * unchanged whenever the model is unavailable or its reply fails the guard.
 */
const understandTurnSchema = z.object({
  speaker: z.enum(["user", "companion"]),
  text: z.string().trim().min(1).max(600),
});
export const understandRequestSchema = z.object({
  message: z.string().trim().min(1).max(300),
  key: z.enum(UNDERSTAND_KEYS),
  language: z.enum(["en", "zh-Hans"]),
  /** The deterministic router's offered actions — echoed back unchanged on fallback. */
  offered: z.array(z.enum(["show-medicine", "ask-schedule"])).max(2),
  /** Whether the deterministic reply is itself a "did you mean…?" name check. */
  checkingMedicineName: z.boolean().default(false),
  history: z.array(understandTurnSchema).max(8).default([]),
  /** Typed is exactly what she wrote; spoken came through speech recognition. */
  via: z.enum(["typed", "voice"]).default("voice"),
});
export const understandResponseDataSchema = z.object({
  text: z.string(),
  contextualActions: z.array(z.enum(["show-medicine", "ask-schedule"])).max(2),
  checkingMedicineName: z.boolean(),
  source: z.enum(["claude", "fallback"]),
});
export type UnderstandResponseData = z.infer<typeof understandResponseDataSchema>;
export const understandResponseSchema = z.discriminatedUnion("ok", [
  apiSuccessSchema(understandResponseDataSchema),
  apiFailureSchema,
]);
export const understandCapabilitySchema = z.object({ enabled: z.boolean() });
export const understandCapabilityResponseSchema = z.discriminatedUnion("ok", [
  apiSuccessSchema(understandCapabilitySchema),
  apiFailureSchema,
]);
