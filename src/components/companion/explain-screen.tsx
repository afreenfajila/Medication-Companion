"use client";

import { Phone } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { RecordSourceLine } from "@/components/ui/record-card";
import type { T } from "./screen-chrome";

/**
 * 06-explain-and-confirm, as the pinned controls for that step. The record
 * content itself is revealed in the scrolling call feed above, one chunk per
 * `explainStep`. Moving on is part of the conversation, not a button: the
 * person says or types "next", "go back" or "I understand" — handled by the
 * same deterministic interpreter as speech (commands.ts), so every gate holds.
 * Language changes the same way ("中文", "English").
 */
export function ExplainScreen({
  t,
  step,
  recordConflict = false,
  onConflictChoice,
  sourceLine,
  onLabelCheck,
}: {
  t: T;
  step: 0 | 1 | 2;
  /** "BrightCare Pharmacy · checked <date>", filled from the record. */
  sourceLine?: string;
  /** Answer to "Does this match what's printed on your label?" (step 1). */
  onLabelCheck?: (matches: boolean) => void;
  /** The person disputed the record: offer pharmacist help or carrying on. */
  recordConflict?: boolean;
  onConflictChoice?: (choice: "pharmacist" | "carry-on") => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {recordConflict && onConflictChoice && (
        <div className="flex flex-col gap-2">
          <PrimaryButton icon={<Phone className="h-5 w-5" aria-hidden="true" />} onClick={() => onConflictChoice("pharmacist")}>
            {t("askPharmacistCall")}
          </PrimaryButton>
          {/* No "Carry on" button: saying or typing "carry on" / "next" does it, as the hint says. */}
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
      {/* No typing box or language switch here: the call-wide box handles "next", "go back",
          "I understand" and "中文"/"English", typed or spoken (conversation first). */}
    </div>
  );
}
