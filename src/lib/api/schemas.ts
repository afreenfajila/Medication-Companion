import { z } from "zod";

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
