"use client";

import { PrimaryButton } from "@/components/ui/buttons";
import type { T } from "./screen-chrome";

/** Wrap-up after "I understand", as the pinned card. Ending the call is in the call footer. */
export function CompleteScreen({ t, onAnother }: { t: T; onAnother: () => void }) {
  return (
    <div className="flex flex-col gap-4 text-center">
      <div>
        <h2 className="text-[22px] font-bold leading-tight">{t("completeHeading")}</h2>
        <p className="mx-auto mt-2 max-w-[21rem] text-lg leading-normal">{t("completeBody")}</p>
      </div>
      <PrimaryButton onClick={onAnother}>{t("anotherMedicine")}</PrimaryButton>
    </div>
  );
}
