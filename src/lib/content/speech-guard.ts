import { candidateDisplayFor } from "@/lib/matching/match-record";
import { metforminPurposeEn, metforminRecord, recordSource } from "./demo-record";
import { copy } from "./translations";
import { isSafeCompanionReply } from "./understand-guard";

// Every fixed string the companion may read aloud: the copy catalogue (both
// languages) and the record's own explanation fields. Longest first, so a
// longer phrase is consumed before any shorter phrase inside it.
const APPROVED: readonly string[] = [
  ...Object.values(copy).flatMap((c) => Object.values(c)),
  ...Object.values(metforminRecord.explanation).flatMap((field) => Object.values(field)),
  candidateDisplayFor(metforminRecord).medicineName,
  metforminRecord.identity.genericName,
  metforminPurposeEn,
  recordSource.displayLabel,
]
  .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
  .sort((a, b) => b.length - a.length);

/**
 * The voice layer (Gemini TTS) may only read approved text aloud. Accepts text
 * made entirely of approved catalogue/record strings (joined by spaces and
 * punctuation), or a short conversational line that passes the same guard as
 * AI-worded replies (no numbers, dosing, advice, match claims or markup).
 * Anything else is refused and the client falls back to browser speech of the
 * same (client-side approved) text — never to new content.
 */
export function isApprovedSpeech(text: string): boolean {
  let rest = text;
  for (const phrase of APPROVED) rest = rest.split(phrase).join(" ");
  if (/^[\s\p{P}]*$/u.test(rest)) return true;
  return isSafeCompanionReply(text);
}
