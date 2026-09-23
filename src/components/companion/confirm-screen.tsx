"use client";

import { PrimaryButton, SecondaryButton, TextAction } from "@/components/ui/buttons";
import { RecordCard } from "@/components/ui/record-card";
import type { CandidateDisplay } from "@/types/content";
import { StateLabel, type T } from "./screen-chrome";

/**
 * 05-confirm-medicine, as the pinned card for that step on the same call screen.
 * Shows the candidate identity as a *possible* match and nothing else — no
 * instruction is reachable from here until confirmation.
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
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <StateLabel>{t("possibleMatch")}</StateLabel>
        <h2 className="mt-1 text-[22px] font-bold leading-tight">{t("confirmHeading")}</h2>
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

      <div className="flex flex-col gap-3">
        <PrimaryButton onClick={() => onDecision("confirmed")}>{t("yesMedicine")}</PrimaryButton>
        <SecondaryButton onClick={() => onDecision("denied")}>{t("tryAgain")}</SecondaryButton>
        <TextAction className="self-center" onClick={() => onDecision("unsure")}>
          {t("unsure")}
        </TextAction>
      </div>
    </div>
  );
}
