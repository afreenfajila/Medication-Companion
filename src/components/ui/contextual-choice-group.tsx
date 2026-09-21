import { CalendarClock, Pill } from "lucide-react";
import type { ContextualActionId } from "@/types/content";
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
    <div role="group" aria-label={groupLabel} className="fade-in flex flex-col gap-3">
      {choices.map((choice, i) => {
        const icon =
          choice.id === "show-medicine" ? (
            <Pill className="h-5 w-5" aria-hidden="true" />
          ) : (
            <CalendarClock className="h-5 w-5" aria-hidden="true" />
          );
        const Button = i === 0 ? PrimaryButton : SecondaryButton;
        return (
          <Button key={choice.id} icon={icon} onClick={() => onSelect(choice.id)}>
            {choice.label}
          </Button>
        );
      })}
    </div>
  );
}
