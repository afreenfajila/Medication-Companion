"use client";

import { PrimaryButton, TextAction } from "@/components/ui/buttons";
import { LanguageControl } from "@/components/ui/language-control";
import type { UiLanguage } from "@/types/content";
import type { T } from "./screen-chrome";

/**
 * 06-explain-and-confirm, as the pinned controls for that step. The record
 * content itself (title/purpose/instruction/caution) is revealed as it happens
 * in the scrolling call feed above, one chunk per `explainStep` — this
 * component owns only the language switch and moving forward/back/finishing.
 */
export function ExplainScreen({
  t,
  language,
  step,
  onLanguageChange,
  onStep,
  onUnderstood,
}: {
  t: T;
  language: UiLanguage;
  step: 0 | 1 | 2;
  onLanguageChange: (language: UiLanguage) => void;
  onStep: (direction: "next" | "back") => void;
  onUnderstood: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex items-center justify-center gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-2 rounded-pill transition-colors ${i === step ? "w-6 bg-navy-900" : "w-2 bg-line"}`}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
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
