"use client";

import { Camera, Phone, Stethoscope, UserRound } from "lucide-react";
import { PrimaryButton, SecondaryButton, TextAction } from "@/components/ui/buttons";
import { CompanionOrb } from "@/components/ui/companion-orb";
import { DemoNotice } from "@/components/ui/notices";
import { SafetyCard } from "@/components/ui/safety-card";
import type { CopyKey } from "@/lib/content/translations";
import { buildEscalation, type HelpActionId } from "@/lib/safety/escalation";
import type { Session } from "@/lib/session/state-machine";
import type { T } from "./screen-chrome";

const ACTION_ICONS: Record<HelpActionId, React.ReactNode> = {
  "try-again": <Camera className="h-5 w-5" aria-hidden="true" />,
  "pharmacy-demo": <Phone className="h-5 w-5" aria-hidden="true" />,
  "clinic-demo": <Stethoscope className="h-5 w-5" aria-hidden="true" />,
  "trusted-helper-demo": <UserRound className="h-5 w-5" aria-hidden="true" />,
  "urgent-care": <Phone className="h-5 w-5" aria-hidden="true" />,
};

/**
 * 07-safety-escalation. Says what is uncertain, that no instructions will be
 * shown, and offers human options. Every non-"try again" action is a labelled
 * demo — nothing is called or sent.
 */
export function SafetyScreen({
  t,
  session,
  onTryAnother,
  onDemoAction,
  onReturn,
}: {
  t: T;
  session: Session;
  onTryAnother: () => void;
  onDemoAction: (id: Exclude<HelpActionId, "try-again">) => void;
  onReturn: () => void;
}) {
  const reason = session.safetyReason ?? "help-requested";
  const view = buildEscalation(reason, session.labelRouteSelected);
  const [main, ...rest] = view.actions;

  const run = (id: HelpActionId) =>
    id === "try-again" ? onTryAnother() : onDemoAction(id);

  const label = (key: CopyKey) => t(key);

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <div className="flex justify-center">
        <CompanionOrb size="sm" state="safety" />
      </div>

      <SafetyCard
        urgent={view.urgent}
        label={label(view.labelKey)}
        heading={label(view.headingKey)}
        body={label(view.bodyKey)}
        reason={view.reasonKey ? label(view.reasonKey) : null}
      >
        {!view.urgent && (
          <p className="mt-3 text-[15px] font-medium text-navy-700">{t("reasonNoInstructions")}</p>
        )}
      </SafetyCard>

      <div className="mt-auto flex flex-col gap-3">
        {main && (
          <PrimaryButton icon={ACTION_ICONS[main.id]} onClick={() => run(main.id)}>
            {label(main.labelKey)}
          </PrimaryButton>
        )}
        {rest.slice(0, 2).map((a) => (
          <SecondaryButton key={a.id} icon={ACTION_ICONS[a.id]} onClick={() => run(a.id)}>
            {label(a.labelKey)}
          </SecondaryButton>
        ))}
        {rest.slice(2).map((a) => (
          <TextAction key={a.id} className="self-center" onClick={() => run(a.id)}>
            {label(a.labelKey)}
          </TextAction>
        ))}

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
