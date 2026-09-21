import { z } from "zod";

/**
 * Claude's label-extraction contract (content-model.md §9). Strict: unknown
 * keys are rejected, so an injected extra field can never reach the UI.
 * Strings are bounded because they are untrusted model output.
 */
const field = z.string().max(120).nullable();

export const claudeLabelExtractionSchema = z
  .object({
    status: z.enum(["readable", "unreadable", "ambiguous"]),
    extracted: z
      .object({
        patientName: field,
        medicineName: field,
        strength: field,
        dosageForm: field,
      })
      .strict(),
    imageQuality: z.enum(["good", "limited", "poor"]),
    ambiguityReason: z.string().max(300).nullable(),
    notesForUser: z.string().max(300),
  })
  .strict();

export type ClaudeLabelExtraction = z.infer<typeof claudeLabelExtractionSchema>;

/** Hand-written JSON Schema for `output_config.format` (no unsupported keywords like maxLength). */
export const claudeLabelExtractionJsonSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["readable", "unreadable", "ambiguous"] },
    extracted: {
      type: "object",
      properties: {
        patientName: { type: ["string", "null"] },
        medicineName: { type: ["string", "null"] },
        strength: { type: ["string", "null"] },
        dosageForm: { type: ["string", "null"] },
      },
      required: ["patientName", "medicineName", "strength", "dosageForm"],
      additionalProperties: false,
    },
    imageQuality: { type: "string", enum: ["good", "limited", "poor"] },
    ambiguityReason: { type: ["string", "null"] },
    notesForUser: { type: "string" },
  },
  required: ["status", "extracted", "imageQuality", "ambiguityReason", "notesForUser"],
  additionalProperties: false,
} as const;
