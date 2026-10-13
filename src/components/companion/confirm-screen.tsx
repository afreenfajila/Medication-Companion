"use client";

import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { RecordCard } from "@/components/ui/record-card";
import type { CandidateDisplay } from "@/types/content";
import { fillCandidate } from "@/lib/content/explanation";
import type { T } from "./screen-chrome";

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
      {/* design-standard §13: one plain question; the card below says "Possible match". */}
      <p className="text-center text-lg leading-snug">{fillCandidate(t("confirmHeading"), candidate)}</p>
      <h2 className="text-center text-[22px] font-bold leading-tight">{t("confirmQuestion")}</h2>

      <RecordCard
        candidate={candidate}
        labels={{
          possibleMatch: t("possibleMatch"),
          patient: t("fieldPatient"),
          medicine: t("fieldMedicine"),
          strength: t("fieldStrength"),
          form: t("fieldForm"),
          formValue: t("formTablet"),
          record: t("fieldRecord"),
          recordValue: t("recordFictional").replace("{name}", candidate.recordSource),
        }}
      />

      <p className="text-center text-lg leading-snug">{t("checkName")}</p>

      <div className="flex flex-col gap-3">
        <PrimaryButton onClick={() => onDecision("confirmed")}>{t("yesMedicine")}</PrimaryButton>
        <SecondaryButton onClick={() => onDecision("denied")}>{t("tryAgain")}</SecondaryButton>
        {/* "I'm not sure" is a real safety choice, not a small link (design-standard §12). */}
        <SecondaryButton onClick={() => onDecision("unsure")}>{t("unsure")}</SecondaryButton>
      </div>
    </div>
  );
}
