import type { UiLanguage } from "@/types/content";

const HAN = /\p{Script=Han}/u;
const LATIN_WORD = /\b[a-z]{2,}\b/gi;

/**
 * Which supported language someone is using, from what they typed or what
 * speech recognition heard — or null when it isn't clear. Any Chinese
 * character means Chinese. English needs two or more English words and no
 * digits, so a medicine name or "Metformin 500 mg" said in Chinese mode
 * doesn't flip the language.
 */
export function detectInputLanguage(text: string): UiLanguage | null {
  if (HAN.test(text)) return "zh-Hans";
  if (/\d/.test(text)) return null;
  return (text.match(LATIN_WORD)?.length ?? 0) >= 2 ? "en" : null;
}
