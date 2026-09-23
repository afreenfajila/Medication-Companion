import { z } from "zod";

/**
 * Output shape for the conversational-rephrase task. Same field set as
 * `REPHRASE_FIELDS` in `rephrase-guard.ts` — the "flavour" text only, never the
 * dose/frequency/timing instruction or the record source line.
 */
export const rephraseFieldsSchema = z
  .object({
    title: z.string().max(200),
    purpose: z.string().max(300),
    instructionIntro: z.string().max(300),
    caution: z.string().max(300),
    confirmationPrompt: z.string().max(300),
  })
  .strict();

export type RephraseFieldsOutput = z.infer<typeof rephraseFieldsSchema>;

export const rephraseJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    purpose: { type: "string" },
    instructionIntro: { type: "string" },
    caution: { type: "string" },
    confirmationPrompt: { type: "string" },
  },
  required: ["title", "purpose", "instructionIntro", "caution", "confirmationPrompt"],
  additionalProperties: false,
} as const;
