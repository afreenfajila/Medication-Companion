import { z } from "zod";
import type { LabelInput } from "@/types/content";

/** Typed-label fallback: what a person can read off the label themselves. */
export const typedLabelSchema = z.object({
  medicineName: z.string().trim().min(1).max(80),
  strength: z.string().trim().min(1).max(20),
  patientName: z.string().trim().max(80).optional(),
});

export type TypedLabelResult =
  | { ok: true; input: Extract<LabelInput, { mode: "typed" }> }
  | { ok: false };

export function parseTypedLabel(raw: {
  medicineName: string;
  strength: string;
  patientName: string;
}): TypedLabelResult {
  const parsed = typedLabelSchema.safeParse({
    medicineName: raw.medicineName,
    strength: raw.strength,
    patientName: raw.patientName.trim() === "" ? undefined : raw.patientName,
  });
  if (!parsed.success) return { ok: false };
  return { ok: true, input: { mode: "typed", ...parsed.data } };
}
