/**
 * What may be sent to Claude (CLAUDE.md §7, §15). Everything a person says or types — and any
 * prompt text the browser supplies — passes through here on the server before a model sees it:
 *  - invisible and control characters are removed and spacing is made plain;
 *  - text that tries to give the model instructions ("ignore your previous instructions",
 *    "system prompt", role tags) is not sent at all: the fixed line is used instead;
 *  - phone numbers, emails and ID numbers are masked: no step needs them to work out a meaning.
 * Pure (no server-only import) so the reply guard can reuse the instruction check on output.
 */

const INSTRUCTION_PATTERNS: readonly RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\s+(all\s+|any\s+)?(of\s+)?(the\s+)?((previous|prior|above|earlier|your|system|these|those)\s+){1,2}(instructions?|rules?|prompts?|guidelines?|guardrails?)\b/i,
  /\b(system|developer)\s+(prompt|message|instructions?)\b/i,
  /\b(jailbreak|dan mode|developer mode|god mode)\b/i,
  /\b(you are now (a|an|the|my)|pretend (to be|you are)|role-?play as)\b/i,
  /\b(system|assistant|developer)\s*:/i,
  /<\/?\s*(system|assistant|user|instructions?|prompt)\b/i,
  /忽略[^。？！]{0,10}(指令|指示|规则|提示)|系统提示|你现在是|假装你是|扮演/,
];

/** True when text reads as instructions to the model rather than something said on the call. */
export function triesToInstruct(text: string): boolean {
  const plain = text.normalize("NFKC");
  return INSTRUCTION_PATTERNS.some((p) => p.test(plain));
}

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/gi;
const SG_ID = /\b[STFGM]\d{7}[A-Z]\b/gi;
const DIGIT_RUN = /\+?\d[\d\s-]{5,}\d/g;

/** Masks contact and ID details. A run counts as a phone number only with 7+ digits ("500 mg" stays). */
export function maskPersonalDetails(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(SG_ID, "[id]")
    .replace(DIGIT_RUN, (m) => (m.replace(/\D/g, "").length >= 7 ? "[number]" : m));
}

export type ModelInput = { ok: true; text: string } | { ok: false; reason: "empty" | "instructions" };

/** The one way text reaches a prompt. `reason` is a code, safe to log; the text never is. */
export function prepareForModel(raw: string): ModelInput {
  const text = raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim();
  if (!text) return { ok: false, reason: "empty" };
  if (triesToInstruct(text)) return { ok: false, reason: "instructions" };
  return { ok: true, text: maskPersonalDetails(text) };
}
