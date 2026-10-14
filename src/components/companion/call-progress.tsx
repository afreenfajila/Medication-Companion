import { Lock } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { PROGRESS_STEPS, STAGE_CHIPS, explainUnlocked, progressIndex, type CallStage } from "@/lib/session/call-stage";
import { cn } from "@/lib/utils/cn";
import type { T } from "./screen-chrome";

/**
 * The call's safety progress at the top of the chat: Ask · Show · Check · Confirm · Explain, the
 * current step highlighted, "Explain" dimmed with a lock until she has confirmed the medicine.
 * Blocked or handing off to a pharmacist, the row gives way to that chip instead of advancing.
 * The stage is derived from the reducer (call-stage.ts); this only draws it.
 */
export function CallProgress({ stage, t }: { stage: CallStage; t: T }) {
  if (stage === "idle") return null;
  const current = progressIndex(stage);
  const chip = STAGE_CHIPS[stage];
  const unlocked = explainUnlocked(stage);
  // One polite announcement per change: the chip where there is one, otherwise the step's name.
  const spoken = chip ? t(chip.key) : current !== null ? t(PROGRESS_STEPS[current]) : "";
  return (
    <div data-progress={stage} className="flex shrink-0 justify-center px-4 pb-1 pt-2">
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
      {current === null ? (
        chip && <StatusChip label={t(chip.key)} tone={chip.tone} />
      ) : (
        <ol aria-label={t("progressLabel")} className="flex flex-wrap items-center justify-center gap-x-1.5 text-[13px] leading-tight">
          {PROGRESS_STEPS.map((key, i) => {
            const isExplain = i === PROGRESS_STEPS.length - 1;
            const locked = isExplain && !unlocked;
            const isCurrent = i === current;
            return (
              <li key={key} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span aria-hidden="true" className="text-navy-700/50">
                    ·
                  </span>
                )}
                <span
                  data-step={key}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5",
                    isCurrent ? "bg-navy-900 font-bold text-white" : i < current ? "font-medium text-teal-800" : "text-navy-700",
                    // Dimmed by weight and the lock, not by fading: the words stay AA-readable.
                    locked && "font-normal italic",
                  )}
                >
                  {locked && <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />}
                  {t(key)}
                  {locked && <span className="sr-only"> ({t("progressLocked")})</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
