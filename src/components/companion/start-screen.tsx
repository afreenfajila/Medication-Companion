"use client";

import { Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PrimaryButton, TextAction } from "@/components/ui/buttons";
import { CompanionOrb } from "@/components/ui/companion-orb";
import { LanguageControl } from "@/components/ui/language-control";
import { DemoNotice } from "@/components/ui/notices";
import { Sheet } from "@/components/ui/sheet";
import type { UiLanguage } from "@/types/content";
import type { T } from "./screen-chrome";

type SheetName = "help" | "language" | "settings" | null;

/**
 * 01-start-call. Deliberately quiet: one orb, one greeting, ONE prominent
 * action. Help · Language · Settings are small text utilities, not shortcuts.
 * There is no Show medicine / schedule / repeat / get-help / end-call here.
 */
export function StartScreen({
  t,
  language,
  onCall,
  onLanguageChange,
  interrupted = false,
}: {
  t: T;
  language: UiLanguage;
  /** The page reloaded mid-call: say so once, without guessing what happened to a request. */
  interrupted?: boolean;
  onCall: () => void;
  onLanguageChange: (language: UiLanguage) => void;
}) {
  const [sheet, setSheet] = useState<SheetName>(null);
  const close = () => setSheet(null);

  return (
    <div className="flex flex-1 flex-col items-center py-4 text-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-7 py-4">
        <CompanionOrb state="idle" />
        <div>
          <h1 className="text-[31px] font-bold leading-[1.18]">{t("welcome")}</h1>
          <p className="mx-auto mt-3 max-w-[21rem] text-lg leading-normal text-navy-700">
            {t("startSupport")}
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        {interrupted && <p className="rounded-md bg-teal-100 px-3 py-2 text-base leading-snug">{t("callInterrupted")}</p>}
        <PrimaryButton
          onClick={onCall}
          icon={<Phone className="h-5 w-5" aria-hidden="true" />}
        >
          {t("callWithCompanion")}
        </PrimaryButton>
        <p className="text-[15px] text-navy-700">{t("inputReassurance")}</p>

        <nav aria-label="Utilities" className="mt-1 flex items-center justify-center gap-1">
          <TextAction onClick={() => setSheet("help")}>{t("help")}</TextAction>
          <span aria-hidden="true" className="text-line">
            ·
          </span>
          <TextAction onClick={() => setSheet("language")}>{t("language")}</TextAction>
          <span aria-hidden="true" className="text-line">
            ·
          </span>
          <TextAction onClick={() => setSheet("settings")}>{t("settings")}</TextAction>
        </nav>
      </div>

      <Sheet open={sheet === "help"} onClose={close} title={t("helpSheetTitle")} closeLabel={t("close")}>
        <p className="text-lg leading-normal">{t("helpSheetBody")}</p>
        <DemoNotice>{t("helpSheetLimit")}</DemoNotice>
      </Sheet>

      <Sheet
        open={sheet === "language"}
        onClose={close}
        title={t("languageSheetTitle")}
        closeLabel={t("close")}
      >
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
      </Sheet>

      <Sheet
        open={sheet === "settings"}
        onClose={close}
        title={t("settingsSheetTitle")}
        closeLabel={t("close")}
      >
        <ul className="flex flex-col gap-3 text-base leading-snug">
          <li>{t("settingsPersona")}</li>
          <li>{t("settingsMotion")}</li>
          <li>{t("settingsDemo")}</li>
        </ul>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-base font-medium text-teal-800 underline underline-offset-4"
        >
          {t("settingsSwitchPersona")}
        </Link>
      </Sheet>
    </div>
  );
}
