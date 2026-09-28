import type { CopyKey } from "@/lib/content/translations";
import { unsupportedMedicalPatterns, urgentPatterns } from "@/lib/safety/classify";

/**
 * Fields Claude is allowed to touch: the surrounding "flavour" text only.
 * `instruction` (the actual dose/frequency/timing sentence) and `sourceLine`
 * (provenance) are never sent to Claude and never overridden — CLAUDE.md
 * permits Claude only to "rephrase server-provided, approved record content",
 * and those two fields are exactly where an invented word would be dangerous
 * or would undermine trust in the record's source.
 */
export const REPHRASE_FIELDS = [
  "title",
  "purpose",
  "instructionIntro",
  "caution",
  "confirmationPrompt",
] as const;
export type RephraseField = (typeof REPHRASE_FIELDS)[number];
export type RephraseFieldSet = Record<RephraseField, string>;
export type RephraseCandidate = Partial<Record<RephraseField, string>>;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "is", "are", "for", "with",
  "your", "you", "this", "that", "it", "i", "can", "will", "would", "like",
  "me", "please", "record", "says", "say", "here", "what", "there",
]);

function significantTerms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOPWORDS.has(w));
}

/** Loose stem match (first 5 chars) so plural/tense changes don't cause false rejections. */
export function preservesKeyTerms(canonical: string, candidate: string, minOverlap = 0.5): boolean {
  const terms = significantTerms(canonical);
  if (terms.length === 0) return true;
  const lower = candidate.toLowerCase();
  const stems = terms.map((w) => w.slice(0, Math.min(5, w.length)));
  const kept = stems.filter((stem) => lower.includes(stem));
  return kept.length / stems.length >= minOverlap;
}

function numberSet(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? []);
}

/** Rejects a rephrase that introduces a number not present in the approved text. */
export function introducesNewNumbers(canonical: string, candidate: string): boolean {
  const allowed = numberSet(canonical);
  for (const n of numberSet(candidate)) {
    if (!allowed.has(n)) return true;
  }
  return false;
}

// Patterns aimed at AI-AUTHORED text specifically: an invented claim can be phrased
// as a plain statement ("...may cause dizziness"), not just a user-style question,
// so this is broader than the safety classifier's user-question patterns below.
const AI_INVENTED_CLAIM_PATTERNS: readonly RegExp[] = [
  /\byou should (stop|start|change|double|skip)\b/i,
  /\b(may|can|could|might)\s+cause\b/i,
  /\bside effects?\b/i,
  /\ballerg(y|ic|ies)\b/i,
  /\binteracts?\s+with\b/i,
  /\boverdose\b/i,
  /\bwarning\b/i,
  /\bdo not (take|use|combine)\b/i,
  /可能(导致|引起)|副作用|过敏|警告/,
];

/** Reuses the safety classifier's patterns plus AI-output-specific ones as a negative filter. */
export function introducesUnsafeLanguage(candidate: string): boolean {
  return (
    urgentPatterns.some((p) => p.test(candidate)) ||
    unsupportedMedicalPatterns.some((p) => p.test(candidate)) ||
    AI_INVENTED_CLAIM_PATTERNS.some((p) => p.test(candidate))
  );
}

function reasonableLength(canonical: string, candidate: string): boolean {
  const c = canonical.trim().length;
  const d = candidate.trim().length;
  if (d === 0) return false;
  const ratio = d / Math.max(c, 1);
  // Short approved sentences need proportionally more room for a natural rephrase,
  // so allow either a generous ratio or a flat character allowance, whichever is kinder.
  return ratio >= 0.4 && (ratio <= 3.0 || d - c <= 80);
}

/**
 * A rephrased sentence is accepted only if it plausibly preserves the same
 * facts as the approved original: no unsafe/medical-advice phrasing, no new
 * numbers, the same key topic words, and a sane length. Anything that fails
 * any check is rejected — the caller falls back to the exact approved text.
 */
export function isSafeRephrase(canonical: string, candidate: string): boolean {
  const text = candidate.trim();
  if (!text) return false;
  if (!reasonableLength(canonical, text)) return false;
  if (introducesUnsafeLanguage(text)) return false;
  if (introducesNewNumbers(canonical, text)) return false;
  if (!preservesKeyTerms(canonical, text)) return false;
  return true;
}

/**
 * Applies a Claude-proposed rephrase field-by-field, keeping the exact approved
 * text for any field that is missing or fails validation. Never returns
 * anything the guard hasn't checked; the result always has every field.
 */
export function applyValidatedRephrase(
  canonical: RephraseFieldSet,
  candidate: RephraseCandidate | null,
): RephraseFieldSet {
  if (!candidate) return canonical;
  const result = { ...canonical };
  for (const field of REPHRASE_FIELDS) {
    const value = candidate[field];
    if (typeof value === "string" && isSafeRephrase(canonical[field], value)) {
      result[field] = value;
    }
  }
  return result;
}

/**
 * In-call conversational lines the natural-language rephrase is allowed to
 * vary the wording of ("what if I ask something else while on the call" →
 * make that feel less scripted). Deliberately excludes:
 *  - `showLabelQuestion` and `clarificationPrompt` — CLAUDE.md's "Required
 *    in-call routing" pins these two sentences verbatim; rephrasing them would
 *    drift from the project's own required copy.
 *  - anything safety/urgent/escalation/consent-related (`urgentHeading`,
 *    `safetyHeading`, `reasonHelp`, `cameraPermissionBody`, …) — reviewed,
 *    high-stakes wording that a model never touches.
 *  - the record explanation — already has its own, more tightly scoped
 *    rephrase path above (`REPHRASE_FIELDS`).
 */
export const CONVERSATIONAL_REPHRASE_KEYS = [
  "scheduleNeedsRecord",
  "prescriptionsListed",
  "anotherMedicineGuide",
  // Spine redirections: the two lines whose whole purpose is to not sound like a
  // canned refusal, so hearing the identical sentence twice is the failure mode.
  // `offTopicCapability` is excluded — it states a limitation and names a concrete
  // control ("Tap Get help"), which is reviewed wording, not flavour text.
  "offTopicSocial",
  "offTopicWorld",
  // "Did I hear you right?" turns: repeated when recognition keeps mishearing,
  // so varied wording keeps it sounding like a conversation, not a loop.
  "medicineNameCheck",
  "medicineNameRetry",
] as const satisfies readonly CopyKey[];
export type ConversationalRephraseKey = (typeof CONVERSATIONAL_REPHRASE_KEYS)[number];

export function isConversationalRephraseKey(key: CopyKey): key is ConversationalRephraseKey {
  return (CONVERSATIONAL_REPHRASE_KEYS as readonly string[]).includes(key);
}
