"use client";

import { Send } from "lucide-react";
import { useId, useState } from "react";
import { ContextualChoiceGroup } from "@/components/ui/contextual-choice-group";
import type { Session } from "@/lib/session/state-machine";
import type { ContextualActionId } from "@/types/content";
import type { T } from "./screen-chrome";

/**
 * Pinned controls for the `listening` state: the temporary contextual choices
 * (only when the companion's last question needs them) and the always-available
 * typed fallback. The conversation itself is shown in the scrolling call feed
 * above, not here — this component owns only "what can I do right now".
 */
export function ListeningActions({
  t,
  session,
  hideChoices = false,
  onSend,
  onSelectRoute,
}: {
  t: T;
  session: Session;
  /** Held back until the companion's voice starts saying the question they answer. */
  hideChoices?: boolean;
  onSend: (text: string) => void;
  onSelectRoute: (route: ContextualActionId) => void;
}) {
  const choices = (hideChoices ? [] : session.contextualActions).map((id) => ({
    id,
    label: id === "show-medicine" ? t("showMedicine") : t("askSchedule"),
  }));

  return (
    <div className="flex flex-col gap-2">
      <ContextualChoiceGroup
        choices={choices}
        groupLabel={t("companionSays")}
        onSelect={onSelectRoute}
      />
      <TypedInput t={t} label={t("typeLabel")} placeholder={t("typePlaceholder")} onSend={onSend} />
    </div>
  );
}

/** The always-available typed fallback: whatever is typed is handled like a spoken turn. */
export function TypedInput({
  t,
  label,
  placeholder,
  onSend,
}: {
  t: T;
  label: string;
  placeholder: string;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();

  return (
      <form
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          onSend(text);
          setDraft("");
        }}
      >
        {/* Kept visible rather than hidden: the label is what tells someone the
            typed route exists at all. Reduced, not removed. */}
        <label htmlFor={inputId} className="text-[12px] font-bold text-navy-700">
          {label}
        </label>
        <div className="flex items-stretch gap-2">
          <input
            id={inputId}
            type="text"
            value={draft}
            maxLength={300}
            autoComplete="off"
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-pill border border-navy-700/30 bg-surface px-4 text-base placeholder:text-navy-700/70"
          />
          <button
            type="submit"
            data-variant="secondary"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-pill border border-teal-600/30 bg-teal-100 px-4 text-base font-bold hover:bg-[#d7ebe9]"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            <span>{t("send")}</span>
          </button>
        </div>
      </form>
  );
}
