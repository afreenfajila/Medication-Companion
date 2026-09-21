import { metforminPurposeEn, metforminRecord, recordSource } from "./demo-record";
import { candidateIdFor } from "@/lib/matching/match-record";
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
): ExplanationView | null {
  const { matchStatus, candidate } = session;
  if (matchStatus !== "confirmed" || !candidate) return null;
  if (candidate.candidateId !== candidateIdFor(metforminRecord)) return null;

  const e = metforminRecord.explanation;
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
