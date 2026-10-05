"use client";

import { Camera, Phone, Stethoscope, UserRound, UsersRound } from "lucide-react";
import { PrimaryButton, SecondaryButton, TextAction } from "@/components/ui/buttons";
import { SafetyCard } from "@/components/ui/safety-card";
import { helpLine } from "@/lib/content/help-lines";
import type { CopyKey } from "@/lib/content/translations";
import { mentionsSelfHarm } from "@/lib/safety/classify";
import { buildEscalation, type HelpActionId } from "@/lib/safety/escalation";
import { canRetryLabel, isMatchConfirmed, type HelpFlow, type HelpKind, type Session } from "@/lib/session/state-machine";
import type { T } from "./screen-chrome";

const ACTION_ICONS: Record<HelpActionId, React.ReactNode> = {
  "try-again": <Camera className="h-5 w-5" aria-hidden="true" />,
  "pharmacist-callback": <Phone className="h-5 w-5" aria-hidden="true" />,
  clinic: <Stethoscope className="h-5 w-5" aria-hidden="true" />,
  "trusted-helper": <UserRound className="h-5 w-5" aria-hidden="true" />,
  family: <UsersRound className="h-5 w-5" aria-hidden="true" />,
};

/**
 * A help request in progress (CLAUDE.md § H4), pinned on top of whichever step
 * offered it. Confirm (or consent) first; "sent" only after the service succeeds;
 * a failure offers another try or the pharmacy's own number. Yes and "not now"
 * carry equal weight, so nothing nudges towards sending.
 */
export function HelpFlowCard({
  t,
  flow,
  onConfirm,
  onRetry,
  onShowNumber,
  onDismiss,
}: {
  t: T;
  flow: HelpFlow;
  onConfirm: (granted: boolean) => void;
  onRetry: () => void;
  onShowNumber: () => void;
  onDismiss: () => void;
}) {
  const line = helpLine(t, flow);
  return (
    <div role="group" aria-label={line} className="flex flex-col gap-3">
      <p role={flow.stage === "sending" ? "status" : undefined} className="text-lg font-bold leading-snug">
        {line}
      </p>
      {flow.stage === "confirm" && (
        <>
          <SecondaryButton icon={ACTION_ICONS[flow.kind]} onClick={() => onConfirm(true)}>
            {t(flow.kind === "pharmacist-callback" ? "callbackYes" : "familyConsentYes")}
          </SecondaryButton>
          <SecondaryButton onClick={() => onConfirm(false)}>{t("notNow")}</SecondaryButton>
        </>
      )}
      {flow.stage === "failed" && (
        <>
          <SecondaryButton onClick={onRetry}>{t("sendAgain")}</SecondaryButton>
          <SecondaryButton icon={ACTION_ICONS["pharmacist-callback"]} onClick={onShowNumber}>
            {t("seePharmacyNumber")}
          </SecondaryButton>
          <TextAction className="self-center" onClick={onDismiss}>
            {t("notNow")}
          </TextAction>
        </>
      )}
      {(flow.stage === "sent" || flow.stage === "info") && (
        <PrimaryButton onClick={onDismiss}>{t("carryOn")}</PrimaryButton>
      )}
    </div>
  );
}

/**
 * 07-safety-escalation, as the pinned card for that step on the same call
 * screen. Says what is uncertain, that no instructions will be shown, and
 * offers human help. Every help option opens its own confirm step first.
 */
export function SafetyScreen({
  t,
  session,
  onTryAnother,
  onHelp,
  onReturn,
}: {
  t: T;
  session: Session;
  onTryAnother: () => void;
  onHelp: (kind: HelpKind) => void;
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

  const run = (id: HelpActionId) => (id === "try-again" ? onTryAnother() : onHelp(id));

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

        {!view.urgent && (
          <TextAction className="self-center" onClick={onReturn}>
            {/* Recovery: when they left mid-explanation, this goes back to exactly that step. */}
            {session.resumeExplainStep !== null && isMatchConfirmed(session) ? t("carryOn") : t("backToCall")}
          </TextAction>
        )}
      </div>
    </div>
  );
}
