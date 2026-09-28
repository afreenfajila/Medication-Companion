import type { CopyKey } from "@/lib/content/translations";
import { introducesUnsafeLanguage } from "@/lib/content/rephrase-guard";
import type { ContextualActionId } from "@/types/content";

/**
 * Companion replies that Claude's bounded "understanding" pass may replace
 * with its own words (CLAUDE.md § Claude, task 3). These are exactly the
 * ordinary in-call replies to something the person said: none of them opens
 * a gate, states a record fact beyond the medicine's name, or is a safety,
 * help, consent or limitation message. The deterministic line for each key is
 * the fallback whenever the model is unavailable, slow, or fails the guard.
 */
export const UNDERSTAND_KEYS = [
  "clarificationPrompt",
  "showLabelQuestion",
  "prescriptionsListed",
  "medicineMentioned",
  "medicineNameCheck",
  "medicineNameRetry",
  "offTopicSocial",
  "offTopicWorld",
] as const satisfies readonly CopyKey[];
export type UnderstandKey = (typeof UNDERSTAND_KEYS)[number];

export function isUnderstandKey(key: CopyKey): key is UnderstandKey {
  return (UNDERSTAND_KEYS as readonly string[]).includes(key);
}

/** What the model may offer next — always from the two in-call doors, never a gate decision. */
export const UNDERSTAND_OFFERS = ["show-medicine", "show-medicine-or-schedule", "none"] as const;
export type UnderstandOffer = (typeof UNDERSTAND_OFFERS)[number];

export function actionsForOffer(offer: UnderstandOffer): ContextualActionId[] {
  if (offer === "show-medicine") return ["show-medicine"];
  if (offer === "show-medicine-or-schedule") return ["show-medicine", "ask-schedule"];
  return [];
}

// Anything that reads as a dose, timing, or strength. The model only ever
// knows the medicine's NAME before a confirmed label match, so any of these
// in its reply is invented — rejected outright rather than trusted.
const DOSING_PATTERNS: readonly RegExp[] = [
  /\d/,
  /\b(mg|mcg|milligrams?|micrograms?|tablets?|capsules?|doses?|dosage|dosing)\b/i,
  /\b(once|twice|daily|nightly|every (day|morning|evening|night)|times a day|with (meals|food)|before (meals|bed)|after (meals|food))\b/i,
  /毫克|片|剂量|每天|每日|一天|两次|饭前|饭后|随餐/,
];

// Claims only the label check + the person's own confirmation may make.
const MATCH_CLAIM_PATTERNS: readonly RegExp[] = [
  /\b(confirmed|verified|matches|matched)\b/i,
  /\b(this|that|it) (is|'s) (definitely |certainly )?(your|the right) (medicine|medication|pill|tablet)\b/i,
  /\bi can see\b/i,
  /已确认|就是您的药/,
];

// The reply is plain text read aloud and shown in a card — no markup, links or tool-ish output.
const FORMAT_PATTERNS: readonly RegExp[] = [/https?:|www\./i, /[<>*#`[\]{}|]/];

const MAX_REPLY_CHARS = 320;

/**
 * Accepts a model-written companion reply only when it cannot carry medicine
 * information: no numbers or dosing/timing words, no advice or invented
 * clinical claims (the same filters the rephrase path uses), no claim that a
 * medicine is confirmed, no markup, and a short spoken length. Anything else
 * is rejected and the caller uses the deterministic approved line.
 */
export function isSafeCompanionReply(text: string): boolean {
  const reply = text.trim();
  if (reply.length === 0 || reply.length > MAX_REPLY_CHARS) return false;
  if (introducesUnsafeLanguage(reply)) return false;
  if (DOSING_PATTERNS.some((p) => p.test(reply))) return false;
  if (MATCH_CLAIM_PATTERNS.some((p) => p.test(reply))) return false;
  if (FORMAT_PATTERNS.some((p) => p.test(reply))) return false;
  return true;
}
