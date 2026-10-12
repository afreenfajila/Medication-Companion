"use client";

import { Pill, Send, UsersRound, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import type { Session } from "@/lib/session/state-machine";
import type { ContextualActionId } from "@/types/content";
import type { T } from "./screen-chrome";

/**
 * At most one contextual action in the open conversation, and only when the
 * companion's last line led to it (the reducer offers it):
 *
 *  - "Show medicine" when the companion asked to see the medicine;
 *  - otherwise "Let my family know" when the companion asked about family help
 *    (secondary weight: it opens a consent step, it never sends).
 *
 * Everything else it offers (schedule, carry on, ending the call) is answered
 * by saying or typing it, or by the call controls, so the call never shows a row
 * of competing suggestions.
 */
export function listeningAction(session: Session): "show-medicine" | "ask-family" | null {
  if (session.contextualActions.includes("show-medicine")) return "show-medicine";
  if (session.contextualActions.includes("ask-family")) return "ask-family";
  return null;
}

export function ListeningActions({
  t,
  session,
  hidden = false,
  onSelectRoute,
}: {
  t: T;
  session: Session;
  /** Held back while the companion is still working out its reply. */
  hidden?: boolean;
  onSelectRoute: (route: ContextualActionId) => void;
}) {
  const action = hidden ? null : listeningAction(session);
  if (action === "show-medicine") {
    return (
      <PrimaryButton icon={<Pill className="h-5 w-5 shrink-0" aria-hidden="true" />} onClick={() => onSelectRoute("show-medicine")}>
        {t("showMedicine")}
      </PrimaryButton>
    );
  }
  if (action === "ask-family") {
    return (
      <SecondaryButton icon={<UsersRound className="h-5 w-5 shrink-0" aria-hidden="true" />} onClick={() => onSelectRoute("ask-family")}>
        {t("letFamilyKnow")}
      </SecondaryButton>
    );
  }
  return null;
}

/** The one compact text box: whatever is typed is handled like a spoken turn. */
export function TypedInput({
  t,
  label,
  placeholder,
  onSend,
  onClose,
  autoFocus = false,
}: {
  t: T;
  label: string;
  placeholder: string;
  onSend: (text: string) => void;
  /** Opened on request ("Type instead"): it can be closed again. */
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    // After the sheet that opened it has closed and handed focus back.
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [autoFocus]);

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
        <label htmlFor={inputId} className="text-[15px] font-bold text-navy-700">
          {label}
        </label>
        <div className="flex items-stretch gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={draft}
            maxLength={300}
            autoComplete="off"
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-12 min-w-0 flex-1 rounded-pill border border-navy-700/30 bg-surface px-4 text-[17px] placeholder:text-navy-700/70"
          />
          <button
            type="submit"
            data-variant="secondary"
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-pill border border-teal-600/30 bg-teal-100 px-4 text-[16px] font-bold hover:bg-[#d7ebe9]"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            <span>{t("send")}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("closeTyping")}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill text-navy-900 hover:bg-teal-100"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
  );
}
