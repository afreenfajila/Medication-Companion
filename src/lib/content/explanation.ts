import { metforminPurposeEn, metforminRecord, recordSource } from "./seed-record";
import { candidateIdFor } from "@/lib/matching/match-record";
import type { StudyCondition } from "@/lib/study/study-mode";
import { studyWrongInstruction } from "./fixtures";
import type {
  CandidateDisplay,
  LocalizedText,
  MatchStatus,
  UiLanguage,
} from "@/types/content";

export type ExplanationView = {
  recordSource: typeof recordSource.displayLabel;
  medicine: {
    name: string;
    strength: string;
    whatItIsFor: string;
    instructions: string;
  };
  explanation: {
    title: string;
    purpose: string;
    instructionIntro: string;
    instruction: string;
    sourceLine: string;
    caution: string;
    confirmationPrompt: string;
  };
};

function pick(text: LocalizedText, language: UiLanguage): string {
  return text[language] ?? text.en ?? "";
}

/**
 * The explanation gate. Returns content ONLY when the session holds a
 * confirmed candidate for the seeded record; otherwise null.
 * Every string comes from the local record — nothing is generated.
 */
export function resolveExplanation(
  session: { matchStatus: MatchStatus | null; candidate: CandidateDisplay | null },
  language: UiLanguage,
  /** Study mode only: `wrong-explanation` swaps in a fixed wrong instruction, after the same gate. */
  studyCondition: StudyCondition | null = null,
): ExplanationView | null {
  const { matchStatus, candidate } = session;
  if (matchStatus !== "confirmed" || !candidate) return null;
  if (candidate.candidateId !== candidateIdFor(metforminRecord)) return null;

  const e =
    studyCondition === "wrong-explanation"
      ? { ...metforminRecord.explanation, instruction: studyWrongInstruction }
      : metforminRecord.explanation;
  return {
    recordSource: recordSource.displayLabel,
    medicine: {
      name: metforminRecord.identity.genericName,
      strength: metforminRecord.identity.strength,
      whatItIsFor: language === "en" ? metforminPurposeEn : pick(e.purpose, language),
      instructions: pick(e.instruction, language),
    },
    explanation: {
      title: pick(e.title, language),
      purpose: pick(e.purpose, language),
      instructionIntro: pick(e.instructionIntro, language),
      instruction: pick(e.instruction, language),
      sourceLine: pick(e.sourceLine, language),
      caution: pick(e.caution, language),
      confirmationPrompt: pick(e.confirmationPrompt, language),
    },
  };
}

/** "I found a possible match: Metformin, 500 mg. …" — name and strength come from the candidate. */
export function fillCandidate(template: string, candidate: CandidateDisplay): string {
  return template
    .replace("{medicine}", candidate.medicineName.replace(` ${candidate.strength}`, ""))
    .replace("{strength}", candidate.strength);
}

/** The record's verified date, e.g. "21 September 2026" / "2026年9月21日". */
export function formatVerifiedDate(language: UiLanguage): string {
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "zh-CN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(recordSource.verifiedAt));
}

/**
 * Fills `{instruction}` and `{verifiedDate}` in approved copy from the confirmed
 * explanation. Copy never contains these facts itself, and a model never writes them.
 */
export function fillRecordFacts(template: string, view: ExplanationView, language: UiLanguage): string {
  return template
    .replace("{instruction}", view.explanation.instruction)
    .replace("{verifiedDate}", formatVerifiedDate(language));
}
