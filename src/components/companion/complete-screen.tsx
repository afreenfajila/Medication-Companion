"use client";

import { PrimaryButton } from "@/components/ui/buttons";
import { CompanionOrb } from "@/components/ui/companion-orb";
import type { T } from "./screen-chrome";

/** Wrap-up after "I understand". Ending the call is in the call footer. */
export function CompleteScreen({ t, onAnother }: { t: T; onAnother: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 py-4 text-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <CompanionOrb state="matched" />
        <div>
          <h1 className="text-[28px] font-bold leading-tight">{t("completeHeading")}</h1>
          <p className="mx-auto mt-3 max-w-[21rem] text-lg leading-normal">{t("completeBody")}</p>
        </div>
      </div>
      <div className="w-full">
        <PrimaryButton onClick={onAnother}>{t("anotherMedicine")}</PrimaryButton>
      </div>
    </div>
  );
}
