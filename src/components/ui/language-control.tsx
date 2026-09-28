import { Globe } from "lucide-react";
import type { UiLanguage } from "@/types/content";
import { cn } from "@/lib/utils/cn";

export type LanguageLabels = {
  groupLabel: string;
  english: string;
  chinese: string;
  moreLanguages: string;
  comingSoon: string;
  malay: string;
  tamil: string;
};

/**
 * One-tap English / 中文. Changing language changes content only — the
 * confirmation and safety state live in the session and are untouched.
 * Malay and Tamil are shown as unavailable, never as working options.
 */
export function LanguageControl({
  language,
  onChange,
  labels,
}: {
  language: UiLanguage;
  onChange: (language: UiLanguage) => void;
  labels: LanguageLabels;
}) {
  const option = (value: UiLanguage, text: string, lang: string) => (
    <button
      type="button"
      lang={lang}
      aria-pressed={language === value}
      onClick={() => onChange(value)}
      className={cn(
        "min-h-11 min-w-[5.5rem] flex-1 rounded-pill px-4 text-base font-bold transition-colors",
        language === value ? "bg-navy-900 text-white" : "text-navy-900 hover:bg-teal-100",
      )}
    >
      {text}
    </button>
  );

  return (
    <div>
      <div
        role="group"
        aria-label={labels.groupLabel}
        className="flex items-center gap-1 rounded-pill border border-line bg-surface p-1"
      >
        <Globe className="ml-3 h-4 w-4 shrink-0 text-teal-800" aria-hidden="true" />
        {option("en", labels.english, "en")}
        {option("zh-Hans", labels.chinese, "zh-Hans")}
      </div>
      <details className="mt-1 text-sm text-navy-700">
        <summary className="inline-flex min-h-11 cursor-pointer items-center px-3 underline underline-offset-4">
          {labels.moreLanguages}
        </summary>
        <ul className="px-3 pb-2">
          {[labels.malay, labels.tamil].map((name) => (
            <li key={name} className="flex items-center justify-between py-1.5">
              <span>{name}</span>
              <span className="rounded-pill bg-line px-2 py-0.5 text-xs font-medium">
                {labels.comingSoon}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
