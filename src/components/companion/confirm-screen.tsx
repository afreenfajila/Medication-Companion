"use client";

import { CompanionOrb } from "@/components/ui/companion-orb";
import { PrimaryButton, SecondaryButton, TextAction } from "@/components/ui/buttons";
import { RecordCard } from "@/components/ui/record-card";
import type { CandidateDisplay } from "@/types/content";
import { StateLabel, type T } from "./screen-chrome";

/**
 * 05-confirm-medicine. Shows the candidate identity as a *possible* match and
 * nothing else — no instruction is reachable from here until confirmation.
 */
export function ConfirmScreen({
  t,
  candidate,
  onDecision,
}: {
  t: T;
  candidate: CandidateDisplay;
  onDecision: (decision: "confirmed" | "denied" | "unsure") => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-5 py-2">
      <div className="flex flex-col items-center gap-2 text-center">
        <CompanionOrb size="sm" state="matched" />
        <StateLabel>{t("possibleMatch")}</StateLabel>
        <h1 className="text-[28px] font-bold leading-tight">{t("confirmHeading")}</h1>
      </div>

      <RecordCard
        candidate={candidate}
        labels={{
          possibleMatch: t("possibleMatch"),
          patient: t("fieldPatient"),
          medicine: t("fieldMedicine"),
          strength: t("fieldStrength"),
          form: t("fieldForm"),
          formValue: t("formTablet"),
        }}
      />

      <p className="text-center text-lg leading-snug">{t("checkName")}</p>

      <div className="mt-auto flex flex-col gap-3">
        <PrimaryButton onClick={() => onDecision("confirmed")}>{t("yesMedicine")}</PrimaryButton>
        <SecondaryButton onClick={() => onDecision("denied")}>{t("tryAgain")}</SecondaryButton>
        <TextAction className="self-center" onClick={() => onDecision("unsure")}>
          {t("unsure")}
        </TextAction>
      </div>
    </div>
  );
}
