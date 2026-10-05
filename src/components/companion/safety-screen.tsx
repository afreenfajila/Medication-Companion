"use client";

import { Camera, Phone, Stethoscope, UserRound, UsersRound } from "lucide-react";
import { PrimaryButton, SecondaryButton, TextAction } from "@/components/ui/buttons";
import { DemoNotice } from "@/components/ui/notices";
import { SafetyCard } from "@/components/ui/safety-card";
import type { CopyKey } from "@/lib/content/translations";
import { mentionsSelfHarm } from "@/lib/safety/classify";
import { buildEscalation, type HelpActionId } from "@/lib/safety/escalation";
import { canRetryLabel, type Session } from "@/lib/session/state-machine";
import type { T } from "./screen-chrome";

const ACTION_ICONS: Record<HelpActionId, React.ReactNode> = {
  "try-again": <Camera className="h-5 w-5" aria-hidden="true" />,
  "pharmacy-demo": <Phone className="h-5 w-5" aria-hidden="true" />,
  "clinic-demo": <Stethoscope className="h-5 w-5" aria-hidden="true" />,
  "trusted-helper-demo": <UserRound className="h-5 w-5" aria-hidden="true" />,
  "ask-family": <UsersRound className="h-5 w-5" aria-hidden="true" />,
  "urgent-care": <Phone className="h-5 w-5" aria-hidden="true" />,
};

/**
 * "Shall I let your family know you'd like some help?" — asked every time
 * family help is chosen, from the safety options or the wellbeing reply.
 * Only "Yes" records anything; "Not now" leaves no trace.
 */
export function FamilyConsent({ t, onAnswer }: { t: T; onAnswer: (granted: boolean) => void }) {
  return (
    <div role="group" aria-label={t("familyConsent")} className="flex flex-col gap-3">
      <p className="text-lg font-bold leading-snug">{t("familyConsent")}</p>
      {/* Consent: "yes" and "not now" carry equal weight — nothing nudges towards sharing. */}
      <SecondaryButton icon={<UsersRound className="h-5 w-5" aria-hidden="true" />} onClick={() => onAnswer(true)}>
        {t("familyConsentYes")}
      </SecondaryButton>
      <SecondaryButton onClick={() => onAnswer(false)}>{t("notNow")}</SecondaryButton>
    </div>
  );
}

/**
 * 07-safety-escalation, as the pinned card for that step on the same call
 * screen. Says what is uncertain, that no instructions will be shown, and
 * offers human options. Every non-"try again" action is a labelled demo —
 * nothing is called or sent.
 */
export function SafetyScreen({
  t,
  session,
  onTryAnother,
  onAskFamily,
  onDemoAction,
  onReturn,
}: {
  t: T;
  session: Session;
  onTryAnother: () => void;
  onAskFamily: () => void;
  onDemoAction: (id: Exclude<HelpActionId, "try-again" | "ask-family">) => void;
  onReturn: () => void;
}) {
  const reason = session.safetyReason ?? "help-requested";
  const view = buildEscalation(
    reason,
    session.labelRouteSelected,
    canRetryLabel(session),
    mentionsSelfHarm(session.userText),
  );
  // At most two buttons in view; the other human-help options wait one tap
  // away behind "More ways to get help" (native <details>, no state).
  const [main, second, ...more] = view.actions;

  const run = (id: HelpActionId) =>
    id === "try-again" ? onTryAnother() : id === "ask-family" ? onAskFamily() : onDemoAction(id);

  const label = (key: CopyKey) => t(key);

  return (
    <div className="flex flex-col gap-4">
      <SafetyCard
        urgent={view.urgent}
        label={label(view.labelKey)}
        heading={label(view.headingKey)}
        body={label(view.bodyKey)}
        reason={view.reasonKey ? label(view.reasonKey) : null}
      >
        {view.retryUsedKey && <p className="mt-3 text-lg leading-snug">{t(view.retryUsedKey)}</p>}
        {view.crisisKey && <p className="mt-3 text-lg font-bold leading-snug">{t(view.crisisKey)}</p>}
        {!view.urgent && (
          <p className="mt-3 text-[15px] font-medium text-navy-700">{t("reasonNoInstructions")}</p>
        )}
      </SafetyCard>

      <div className="flex flex-col gap-3">
        {main && (
          <PrimaryButton icon={ACTION_ICONS[main.id]} onClick={() => run(main.id)}>
            {label(main.labelKey)}
          </PrimaryButton>
        )}
        {second && (
          <SecondaryButton icon={ACTION_ICONS[second.id]} onClick={() => run(second.id)}>
            {label(second.labelKey)}
          </SecondaryButton>
        )}
        {more.length > 0 && (
          <details className="self-center text-center">
            <summary className="inline-flex min-h-11 cursor-pointer items-center px-3 text-base font-medium text-teal-800 underline underline-offset-4">
              {t("moreHelpOptions")}
            </summary>
            <div className="flex flex-col items-center">
              {more.map((a) => (
                <TextAction key={a.id} icon={ACTION_ICONS[a.id]} onClick={() => run(a.id)}>
                  {label(a.labelKey)}
                </TextAction>
              ))}
            </div>
          </details>
        )}

        {session.helpAction && (
          <DemoNotice role="status">{t("demoActionNotice")}</DemoNotice>
        )}

        {!view.urgent && (
          <TextAction className="self-center" onClick={onReturn}>
            {t("backToCall")}
          </TextAction>
        )}
      </div>
    </div>
  );
}
