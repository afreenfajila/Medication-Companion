import { CalendarClock, Pill } from "lucide-react";
import type { ContextualActionId } from "@/types/content";
import { cn } from "@/lib/utils/cn";
import { PrimaryButton, SecondaryButton } from "./buttons";

export type ContextualChoice = { id: ContextualActionId; label: string };

/**
 * Temporary, in-call decision controls. Rendered only directly beneath a
 * companion question that explains the choice, and unmounted as soon as a
 * route is selected. Never permanent navigation, never on the start state.
 */
export function ContextualChoiceGroup({
  choices,
  groupLabel,
  onSelect,
}: {
  choices: ContextualChoice[];
  groupLabel: string;
  onSelect: (id: ContextualActionId) => void;
}) {
  if (choices.length === 0) return null;
  return (
    <div role="group" aria-label={groupLabel} className={cn("fade-in grid gap-2", choices.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
      {choices.map((choice, i) => {
        const icon =
          choice.id === "show-medicine" ? (
            <Pill className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          );
        const Button = i === 0 ? PrimaryButton : SecondaryButton;
        return (
          // Compact and side by side: these share the pinned area with the typed
          // fallback, and stacked full-width they pushed the conversation off
          // screen. A long label wraps inside its pill rather than stacking the pills.
          <Button key={choice.id} compact icon={icon} onClick={() => onSelect(choice.id)}>
            {choice.label}
          </Button>
        );
      })}
    </div>
  );
}
