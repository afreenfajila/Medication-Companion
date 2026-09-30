"use client";

import { Phone } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { LanguageControl } from "@/components/ui/language-control";
import { RecordSourceLine } from "@/components/ui/record-card";
import type { UiLanguage } from "@/types/content";
import { TypedInput } from "./listening-screen";
import type { T } from "./screen-chrome";

/**
 * 06-explain-and-confirm, as the pinned controls for that step. The record
 * content itself is revealed in the scrolling call feed above, one chunk per
 * `explainStep`. Moving on is part of the conversation, not a button: the
 * person says or types "next", "go back" or "I understand" — handled by the
 * same deterministic interpreter as speech (commands.ts), so every gate holds.
 * Only the language switch stays a button.
 */
export function ExplainScreen({
  t,
  language,
  step,
  recordConflict = false,
  onConflictChoice,
  sourceLine,
  onLabelCheck,
  onLanguageChange,
  onSend,
}: {
  t: T;
  language: UiLanguage;
  step: 0 | 1 | 2;
  /** "BrightCare Pharmacy — demo record · checked <date>", filled from the record. */
  sourceLine?: string;
  /** Answer to "Does this match what's printed on your label?" (step 1). */
  onLabelCheck?: (matches: boolean) => void;
  /** The person disputed the record: offer pharmacist help or carrying on. */
  recordConflict?: boolean;
  onConflictChoice?: (choice: "pharmacist" | "carry-on") => void;
  onLanguageChange: (language: UiLanguage) => void;
  onSend: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {recordConflict && onConflictChoice && (
        <div className="flex flex-col gap-2">
          <PrimaryButton icon={<Phone className="h-5 w-5" aria-hidden="true" />} onClick={() => onConflictChoice("pharmacist")}>
            {t("checkWithPharmacist")}
          </PrimaryButton>
          <SecondaryButton onClick={() => onConflictChoice("carry-on")}>{t("carryOn")}</SecondaryButton>
        </div>
      )}
      {step === 1 && !recordConflict && onLabelCheck && (
        <div role="group" aria-label={t("labelCheckPrompt")} className="flex flex-col gap-2">
          {sourceLine && <RecordSourceLine>{sourceLine}</RecordSourceLine>}
          <p className="text-lg font-bold leading-snug">{t("labelCheckPrompt")}</p>
          {/* Equal weight on purpose: a filled "yes" would invite agreeing without looking. */}
          <div className="grid grid-cols-2 gap-2">
            <SecondaryButton compact onClick={() => onLabelCheck(true)}>
              {t("labelMatches")}
            </SecondaryButton>
            <SecondaryButton compact onClick={() => onLabelCheck(false)}>
              {t("labelLooksDifferent")}
            </SecondaryButton>
          </div>
        </div>
      )}
      <LanguageControl
        language={language}
        onChange={onLanguageChange}
        showMore={false}
        labels={{
          groupLabel: t("languageControlLabel"),
          english: t("languageEnglish"),
          chinese: t("languageChinese"),
          moreLanguages: t("moreLanguages"),
          comingSoon: t("comingSoon"),
          malay: t("malay"),
          tamil: t("tamil"),
        }}
      />
      <TypedInput
        t={t}
        label={step < 2 ? t("explainHintNext") : t("explainHintDone")}
        placeholder={step < 2 ? t("next") : t("iUnderstand")}
        onSend={onSend}
      />
    </div>
  );
}
