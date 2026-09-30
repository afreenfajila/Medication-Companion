import type { CopyKey } from "@/lib/content/translations";
import { introducesUnsafeLanguage } from "@/lib/content/rephrase-guard";
import type { ContextualActionId, UiLanguage } from "@/types/content";

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

// Tone contract rule 6 (CLAUDE.md § Assignment 3, A): nobody is at fault, and we
// never tell her what to do. Applies to fixed copy too (see content.test.ts).
const TONE_PATTERNS: readonly RegExp[] = [
  /\b(error|fail(ed)?|invalid|wrong|incorrect|mistakes?|must|should)\b/i,
  /错误|失败|无效|不对|错了|必须|应该/,
];

export function usesBlameWords(text: string): boolean {
  return TONE_PATTERNS.some((p) => p.test(text));
}

// Advice phrased as an instruction. "take a look" is the common harmless exception.
const ADVICE_PATTERNS: readonly RegExp[] = [
  /\byou (need to|have to|ought to)\b/i,
  /\b(take(?! a (quick |little )?look)|stop|skip|double|increase|reduce|halve)\b[^.?!]{0,30}\b(tablets?|pills?|capsules?|dose|medicine|medication)\b/i,
  /停药|停止服用|不要吃|别吃|不用吃|加倍|多吃|少吃|减量|加量/,
];

const MAX_REPLY_CHARS = 320;
const CJK = /[一-鿿]/;

/**
 * Accepts a model-written companion reply only when it cannot carry medicine
 * information: no numbers or dosing/timing words, no advice or invented
 * clinical claims (the same filters the rephrase path uses), no claim that a
 * medicine is confirmed, no markup, and a short spoken length. Anything else
 * is rejected and the caller uses the deterministic approved line.
 *
 * With `language` (a fresh model reply for this turn), it must also be written
 * in that language and end with a gentle question, as the prompt's tone rules ask.
 */
export function isSafeCompanionReply(text: string, language?: UiLanguage): boolean {
  const reply = text.trim();
  if (reply.length === 0 || reply.length > MAX_REPLY_CHARS) return false;
  if (introducesUnsafeLanguage(reply)) return false;
  if (DOSING_PATTERNS.some((p) => p.test(reply))) return false;
  if (MATCH_CLAIM_PATTERNS.some((p) => p.test(reply))) return false;
  if (FORMAT_PATTERNS.some((p) => p.test(reply))) return false;
  if (usesBlameWords(reply)) return false;
  if (ADVICE_PATTERNS.some((p) => p.test(reply))) return false;
  if (language) {
    if (CJK.test(reply) !== (language === "zh-Hans")) return false;
    if (!/[?？]$/.test(reply)) return false;
  }
  return true;
}
