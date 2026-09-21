"use client";

import { BookCheck } from "lucide-react";
import { CompanionOrb } from "@/components/ui/companion-orb";
import { PrimaryButton, TextAction } from "@/components/ui/buttons";
import { LanguageControl } from "@/components/ui/language-control";
import type { ExplanationView } from "@/lib/content/explanation";
import type { UiLanguage } from "@/types/content";
import { StateLabel, type T } from "./screen-chrome";

/**
 * 06-explain-and-confirm. One record-backed chunk at a time, all text at 18px+
 * (Chinese included). Every string comes from `ExplanationView`, which only
 * exists for a confirmed match. Repeat / Get help live in the call footer.
 */
export function ExplainScreen({
  t,
  language,
  explanation,
  step,
  repeatCount,
  onLanguageChange,
  onStep,
  onUnderstood,
}: {
  t: T;
  language: UiLanguage;
  explanation: ExplanationView;
  step: 0 | 1 | 2;
  repeatCount: number;
  onLanguageChange: (language: UiLanguage) => void;
  onStep: (direction: "next" | "back") => void;
  onUnderstood: () => void;
}) {
  const e = explanation.explanation;

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <div className="flex flex-col items-center gap-2 text-center">
        <CompanionOrb size="sm" state="matched" />
        <h1 className="text-[26px] font-bold leading-tight">{e.title}</h1>
      </div>

      <LanguageControl
        language={language}
        onChange={onLanguageChange}
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

      <section
        key={`${step}-${repeatCount}-${language}`}
        aria-live="polite"
        className="fade-in flex flex-col gap-3 rounded-lg border border-line bg-surface p-5 shadow-card"
      >
        {step === 0 && (
          <>
            <StateLabel>{t("explainWhatFor")}</StateLabel>
            <p className="text-[28px] font-bold leading-tight">
              {explanation.medicine.name} {explanation.medicine.strength}
            </p>
            <p className="text-[20px] leading-snug">{e.purpose}</p>
          </>
        )}
        {step === 1 && (
          <>
            <StateLabel>{t("explainHowTo")}</StateLabel>
            <p className="text-lg leading-snug">{e.instructionIntro}</p>
            <p className="text-[26px] font-bold leading-tight">{e.instruction}</p>
          </>
        )}
        {step === 2 && (
          <>
            <StateLabel>{t("explainWrapUp")}</StateLabel>
            <p className="text-lg leading-snug">{e.caution}</p>
            <p className="text-[20px] font-medium leading-snug">{e.confirmationPrompt}</p>
          </>
        )}
        <p className="flex items-start gap-2 border-t border-line pt-3 text-[15px] leading-snug text-navy-700">
          <BookCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-800" aria-hidden="true" />
          <span>{e.sourceLine}</span>
        </p>
      </section>

      <div className="flex items-center justify-center gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-2 rounded-pill transition-colors ${i === step ? "w-6 bg-navy-900" : "w-2 bg-line"}`}
          />
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        {step < 2 ? (
          <PrimaryButton onClick={() => onStep("next")}>{t("next")}</PrimaryButton>
        ) : (
          <PrimaryButton onClick={onUnderstood}>{t("iUnderstand")}</PrimaryButton>
        )}
        {step > 0 && (
          <TextAction className="self-center" onClick={() => onStep("back")}>
            {t("back")}
          </TextAction>
        )}
      </div>
    </div>
  );
}
