import { z } from "zod";
import { CONVERSATIONAL_REPHRASE_KEYS } from "@/lib/content/rephrase-guard";

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
      sourceLabel: z.literal("BrightCare Pharmacy — demo record"),
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

export const rephraseRequestSchema = z.object({
  sessionId: z.string().min(1).max(64),
});

const rephraseFieldSetSchema = z.object({
  title: z.string(),
  purpose: z.string(),
  instructionIntro: z.string(),
  caution: z.string(),
  confirmationPrompt: z.string(),
});

/** Always `ok`: worst case is `source: "fallback"` with the exact approved text. */
export const rephraseResponseDataSchema = z.object({
  fields: rephraseFieldSetSchema,
  source: z.enum(["claude", "fallback"]),
});
export type RephraseResponseData = z.infer<typeof rephraseResponseDataSchema>;

export const rephraseResponseSchema = z.discriminatedUnion("ok", [
  apiSuccessSchema(rephraseResponseDataSchema),
  apiFailureSchema,
]);

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
 * In-call conversational rephrase: the client names WHICH approved line it
 * wants naturalised (never sends its own text) — the server looks up the
 * canonical English copy itself, so a client can't smuggle arbitrary text
 * through as if it were already-approved. English only, same as the
 * explanation rephrase (Chinese already has reviewed static translations).
 */
export const replyRephraseRequestSchema = z.object({
  key: z.enum(CONVERSATIONAL_REPHRASE_KEYS),
});
export const replyRephraseResponseDataSchema = z.object({
  text: z.string(),
  source: z.enum(["claude", "fallback"]),
});
export type ReplyRephraseResponseData = z.infer<typeof replyRephraseResponseDataSchema>;
export const replyRephraseResponseSchema = z.discriminatedUnion("ok", [
  apiSuccessSchema(replyRephraseResponseDataSchema),
  apiFailureSchema,
]);
