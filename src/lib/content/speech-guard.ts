import { candidateDisplayFor } from "@/lib/matching/match-record";
import { sentencePieces } from "@/lib/voice/sentences";
import { careContacts, metforminPurposeEn, metforminRecord, recordSource } from "./seed-record";
import { formatVerifiedDate } from "./explanation";
import { studyWrongInstruction } from "./fixtures";
import { copy } from "./translations";
import { isSafeCompanionReply } from "./understand-guard";

// Every fixed string the companion may read aloud: the copy catalogue (both
// languages) and the record's own explanation fields. Longest first, so a
// longer phrase is consumed before any shorter phrase inside it.
const APPROVED: readonly string[] = [
  // Copy with {placeholders} is approved piece by piece; the filled-in facts are
  // approved below (record fields and the verified date).
  ...Object.values(copy).flatMap((c) => Object.values(c).flatMap((line) => line.split(/\{\w+\}/))),
  ...Object.values(metforminRecord.explanation).flatMap((field) => Object.values(field)),
  formatVerifiedDate("en"),
  formatVerifiedDate("zh-Hans"),
  // Study mode's fixed wrong instruction: same voice in both conditions, so voice isn't a confound.
  ...Object.values(studyWrongInstruction),
  // Help flows: the fictional care circle's names and numbers.
  ...Object.values(careContacts).flatMap((c) => Object.values(c)),
  candidateDisplayFor(metforminRecord).medicineName,
  metforminRecord.identity.genericName,
  metforminRecord.identity.strength, // "I found a possible match: Metformin, 500 mg."
  metforminPurposeEn,
  recordSource.displayLabel,
]
  .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
  // The voice speaks long lines one sentence at a time, so each sentence of approved text is approved too.
  .flatMap((s) => [s, ...sentencePieces(s)])
  .sort((a, b) => b.length - a.length);

/**
 * The streaming voice (ElevenLabs) may only read approved text aloud. Accepts text
 * made entirely of approved catalogue/record strings (joined by spaces and
 * punctuation), or a short conversational line that passes the same guard as
 * AI-worded replies (no numbers, dosing, advice, match claims or markup).
 * Anything else is refused and the browser's own voice says the same visible
 * text instead — never new content.
 */
export function isApprovedSpeech(text: string): boolean {
  let rest = text;
  for (const phrase of APPROVED) rest = rest.split(phrase).join(" ");
  // A callback reference from the pharmacy service ("BC-482913") is data, not wording.
  rest = rest.replace(/\bBC-\d{6}\b/g, " ");
  if (/^[\s\p{P}]*$/u.test(rest)) return true;
  return isSafeCompanionReply(text) || quotesOwnWords(text, rest);
}

/** Up to two of her own 200-character fields (label wording, her note) inside one line. */
const MAX_OWN_WORDS = 400;
const visible = (s: string) => s.replace(/[\s\p{P}]/gu, "").length;

/**
 * Dose-check lines read her own words back ("I noted from your label: “…”", the
 * callback summary). Those words are hers, not the companion's, so they may be
 * voiced — but only inside approved wording that makes up most of the line, only a
 * bounded amount, and never links or markup. Text with no approved frame is refused.
 */
function quotesOwnWords(text: string, rest: string): boolean {
  if (/https?:|www\.|[<>`{}[\]|]/i.test(rest)) return false;
  const own = visible(rest);
  return own <= MAX_OWN_WORDS && visible(text) - own >= own;
}
