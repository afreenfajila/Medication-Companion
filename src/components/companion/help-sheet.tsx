"use client";

import { HandHelping, Keyboard, RotateCcw } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";
import { AboutLink, type T } from "./screen-chrome";

/**
 * What "Get help" opens during a call: one simple sheet. Opening or closing it
 * changes nothing in the call — no request, no step, no approval — and closing
 * it returns to the same place in the transcript. Each choice is an existing,
 * guarded action:
 *
 *  - "Get help from a person": the existing help route, which offers the
 *    pharmacist, clinic or family options that fit, each with its own confirm step;
 *  - "Repeat slowly": re-says the companion's current line (never new text);
 *  - "Type instead": opens the one compact text box;
 *  - "Interrupt by voice": the full-duplex setting, only when it applies;
 *  - "About this prototype".
 */
export function HelpSheet({
  t,
  open,
  onClose,
  canTalkToPerson,
  onTalkToPerson,
  onRepeat,
  canTypeInstead,
  onTypeInstead,
  duplex,
  autoInterrupt,
  onToggleAutoInterrupt,
}: {
  t: T;
  open: boolean;
  onClose: () => void;
  /** Already on the help step: nothing to open. */
  canTalkToPerson: boolean;
  onTalkToPerson: () => void;
  onRepeat: () => void;
  /** The text box is already showing. */
  canTypeInstead: boolean;
  onTypeInstead: () => void;
  duplex: boolean;
  autoInterrupt: boolean;
  onToggleAutoInterrupt: () => void;
}) {
  const icon = "h-5 w-5 shrink-0";
  const then = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <Sheet open={open} onClose={onClose} title={t("getHelp")} closeLabel={t("close")}>
      <div className="flex flex-col gap-3">
        {canTalkToPerson && (
          <PrimaryButton icon={<HandHelping className={icon} aria-hidden="true" />} onClick={then(onTalkToPerson)}>
            {t("helpTalkToPerson")}
          </PrimaryButton>
        )}
        <SecondaryButton icon={<RotateCcw className={icon} aria-hidden="true" />} onClick={then(onRepeat)}>
          {t("repeat")}
        </SecondaryButton>
        {canTypeInstead && (
          <SecondaryButton icon={<Keyboard className={icon} aria-hidden="true" />} onClick={then(onTypeInstead)}>
            {t("typeInstead")}
          </SecondaryButton>
        )}
        {duplex && (
          // A setting, not an action: the sheet stays open so the new state can be read.
          // The words say the state ("on"/"off"), so no aria-pressed on top of them.
          <SecondaryButton onClick={onToggleAutoInterrupt}>
            {autoInterrupt ? t("voiceInterruptOn") : t("voiceInterruptOff")}
          </SecondaryButton>
        )}
        <AboutLink t={t} className="inline-flex min-h-11 items-center self-center px-2 text-base" />
      </div>
    </Sheet>
  );
}
