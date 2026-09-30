import { ArrowRight, CalendarClock, PhoneOff, Pill, UsersRound, type LucideIcon } from "lucide-react";
import type { ContextualActionId } from "@/types/content";
import { cn } from "@/lib/utils/cn";
import { PrimaryButton, SecondaryButton } from "./buttons";

export type ContextualChoice = { id: ContextualActionId; label: string };

const ICON: Record<ContextualActionId, LucideIcon> = {
  "show-medicine": Pill,
  "ask-schedule": CalendarClock,
  "end-call": PhoneOff,
  "carry-on": ArrowRight,
  "ask-family": UsersRound,
};

/**
 * Temporary, in-call decision controls. Rendered only directly beneath a
 * companion question that explains the choice, and unmounted as soon as a
 * route is selected. Never permanent navigation, never on the start state.
 *
 * Only "Show medicine" is ever filled: it is the one next step the companion
 * leads towards. Everything else — including family help, which needs consent —
 * gets equal, secondary weight so nothing nudges the person.
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
      {choices.map((choice) => {
        const Icon = ICON[choice.id];
        const Button = choice.id === "show-medicine" ? PrimaryButton : SecondaryButton;
        return (
          // Compact and side by side: these share the pinned area with the typed
          // fallback, and stacked full-width they pushed the conversation off
          // screen. A long label wraps inside its pill rather than stacking the pills.
          <Button
            key={choice.id}
            compact
            icon={<Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            onClick={() => onSelect(choice.id)}
          >
            {choice.label}
          </Button>
        );
      })}
    </div>
  );
}
