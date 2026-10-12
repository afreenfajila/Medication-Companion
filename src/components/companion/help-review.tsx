"use client";

import { Info, Mic } from "lucide-react";
import { useState } from "react";
import { TextAction } from "@/components/ui/buttons";
import { careContacts } from "@/lib/content/seed-record";
import type { CopyKey } from "@/lib/content/translations";
import { maskNumber } from "@/lib/dose-check/dose-check";
import type { HelpReason } from "@/lib/services/reasons";
import type { HelpKind } from "@/lib/session/state-machine";
import type { T } from "./screen-chrome";

/** The reason sent with the request, in plain words — exactly the code in the payload. */
export const HELP_REASON_TEXT: Record<HelpReason, CopyKey> = {
  "label-trouble": "helpReasonLabel",
  "medical-question": "helpReasonMedical",
  "record-conflict": "helpReasonConflict",
  wellbeing: "helpReasonWellbeing",
  "help-requested": "helpReasonGeneral",
};

/**
 * "Check before sharing" for anything sent to another party from the conversation: a
 * pharmacist callback, or a message to family or a trusted helper. It shows exactly what
 * the request carries (recipient, what is asked, the reason) and, for a callback, the
 * number the pharmacy will use from the record.
 *
 * There is no Send button (owner decision, 12 October 2026): sending is an explicit "send",
 * said or typed. "Don't send" — said, typed or tapped — closes it with nothing sent.
 */
export function HelpReviewPanel({
  t,
  kind,
  reason,
  onCancel,
}: {
  t: T;
  kind: HelpKind;
  reason: HelpReason;
  onCancel: () => void;
}) {
  const [showNumber, setShowNumber] = useState(false);
  const callback = kind === "pharmacist-callback";
  const to = callback
    ? t("doseRecipient")
    : t(kind === "trusted-helper" ? "helpToHelper" : "helpToFamily").replace(
        "{name}",
        kind === "trusted-helper" ? careContacts.trustedHelper.name : careContacts.family.name,
      );
  const rows: Array<[string, React.ReactNode]> = [
    [t("doseTo"), to],
    callback ? [t("helpRequestRow"), t("helpRequestValue")] : [t("helpMessageRow"), t("helpMessageValue")],
    [t("doseReason"), t(HELP_REASON_TEXT[reason])],
  ];
  if (callback) {
    rows.push([
      t("helpNumberFromRecord"),
      <span key="number" className="inline-flex flex-wrap items-center gap-2">
        <span>{showNumber ? careContacts.patientPhone : maskNumber(careContacts.patientPhone)}</span>
        <TextAction className="min-h-11 px-1" onClick={() => setShowNumber((v) => !v)}>
          {showNumber ? t("doseHideNumber") : t("doseShowNumber")}
        </TextAction>
      </span>,
    ]);
  }
  return (
    <section aria-labelledby="help-review-heading" className="flex flex-col gap-3">
      <h2 id="help-review-heading" className="text-[22px] font-bold leading-tight">
        {t("doseReviewHeading")}
      </h2>
      <dl className="divide-y divide-line rounded-lg border border-line bg-surface px-4">
        {rows.map(([term, value]) => (
          <div key={term} className="py-2">
            <dt className="text-base text-navy-700">{term}</dt>
            <dd className="text-lg font-bold leading-snug">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-base font-medium leading-snug text-navy-700">{t("helpShareNotice")}</p>
      <p className="flex items-start gap-2 text-lg font-bold leading-snug">
        <Mic className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{t("reviewSayToSend")}</span>
      </p>
      <TextAction className="self-center" onClick={onCancel}>
        {t("doseDontSend")}
      </TextAction>
      <p className="flex items-start gap-2 rounded-md bg-teal-100 px-3 py-2 text-base font-medium">
        <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t("dosePrototypeNotice")}</span>
      </p>
    </section>
  );
}
