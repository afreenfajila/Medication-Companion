/**
 * Turns a spoken sentence like "It's Metformin, five hundred milligrams" into
 * the same {medicineName, strength} shape the typed-label form produces —
 * so saying the label out loud is just another way to fill in that form, not
 * a new way of deciding a match. The result still goes through the exact same
 * deterministic matcher (`matchLabelInput`) as camera/typed/demo input.
 *
 * Deliberately NOT fuzzy: if speech recognition mishears the medicine name
 * badly enough that no strength+name pair can be pulled out, this returns
 * null and the person is guided to try again, spell it out by typing, or use
 * the demo label — never a guessed/loosened match. Two real medicines can
 * sound alike (e.g. hydroxyzine/hydralazine); guessing here would be unsafe.
 */

const STRENGTH = /(\d+(?:\.\d+)?)\s*(milligrams?|micrograms?|millilit(?:re|er)s?|grams?|mg|mcg|ml|g)\b/i;

// Trimmed from the front only, and only ever whole leading phrases — never
// mid-sentence, so we don't accidentally eat part of a real medicine name.
const LEADING_FILLER =
  /^(it'?s|its|that'?s|thats|this is|i (?:have|take|am (?:on|taking))|my medicine is(?: called)?|the medicine is(?: called)?|it is called|called)(?:\s+|$)/i;

function normalizeUnitWord(unit: string): string {
  const u = unit.toLowerCase();
  if (u.startsWith("milligram")) return "mg";
  if (u.startsWith("microgram")) return "mcg";
  if (u.startsWith("millilit")) return "ml";
  if (u.startsWith("gram")) return "g";
  return u; // already an abbreviation: mg / mcg / ml / g
}

export type SpokenLabel = { medicineName: string; strength: string };

export function parseSpokenLabel(utterance: string): SpokenLabel | null {
  const strengthMatch = STRENGTH.exec(utterance);
  if (!strengthMatch) return null;

  const strength = `${strengthMatch[1]} ${normalizeUnitWord(strengthMatch[2])}`;

  let name = utterance.slice(0, strengthMatch.index).trim();
  name = name.replace(LEADING_FILLER, "").trim();
  name = name.replace(/[,.;:!?]+$/, "").trim(); // trailing punctuation right before the strength

  if (!name) return null;
  return { medicineName: name, strength };
}

/**
 * Pulls out just the strength, for the follow-up turn once the name has
 * already been given ("500 milligrams" answering "what strength does it
 * say?"). Anywhere in the utterance, not just a fixed position.
 */
export function extractSpokenStrength(utterance: string): string | null {
  const m = STRENGTH.exec(utterance);
  if (!m) return null;
  return `${m[1]} ${normalizeUnitWord(m[2])}`;
}

const QUESTION_WORD = /\b(what|why|how|when|where|who|which)\b/i;

/**
 * A medicine name said with no strength attached ("It's Metformin"). Used to
 * start the two-turn flow: ask for the strength next, rather than treating a
 * bare name as enough to try a match. Deliberately conservative — anything
 * that reads as a question, or runs long, is left as `null` so the caller
 * falls back to its normal "didn't catch that" handling instead of guessing.
 */
export function extractSpokenMedicineNameOnly(utterance: string): string | null {
  if (STRENGTH.test(utterance)) return null; // has a strength — parseSpokenLabel handles it
  if (QUESTION_WORD.test(utterance)) return null;

  let name = utterance.trim().replace(LEADING_FILLER, "").trim();
  name = name.replace(/[,.;:!?]+$/, "").trim();
  if (!name) return null;
  if (name.split(/\s+/).length > 5) return null;
  return name;
}
