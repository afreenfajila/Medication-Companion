"use client";

import { useEffect, useRef, useState } from "react";
import type { ExplanationView } from "@/lib/content/explanation";
import type { Session } from "@/lib/session/state-machine";
import type { T } from "./screen-chrome";

export type FeedMessage = { id: string; speaker: "user" | "companion"; lines: string[] };

type Seen = {
  callCount: number;
  assistantSig: string;
  userSig: string;
  inExplain: boolean;
  explainSig: string;
};

function initialSeen(callCount: number): Seen {
  return { callCount, assistantSig: "", userSig: "", inExplain: false, explainSig: "" };
}

function explainStepLines(step: 0 | 1 | 2, e: ExplanationView["explanation"]): string[] {
  if (step === 0) return [e.title, e.purpose, e.sourceLine];
  if (step === 1) return [e.instructionIntro, e.instruction];
  return [e.caution, e.confirmationPrompt];
}

/**
 * Builds the single running conversation transcript for the whole call — this is
 * what makes the experience feel like one continuous exchange instead of a
 * sequence of separate screens. It only ever accumulates two kinds of content:
 *
 *  - the actual back-and-forth from the `listening` state (what the user said,
 *    what the companion said back), and
 *  - the record explanation, revealed one chunk at a time as `explainStep`
 *    advances (this is genuinely long-form content worth scrolling back to).
 *
 * Camera/confirm/safety/complete are not duplicated here — they show their own
 * rich card in the pinned action area below the feed while they're current;
 * this keeps the transcript readable rather than repeating every UI heading.
 * The feed clears when a new call starts and otherwise never rewrites history.
 */
export function useCallFeed(session: Session, t: T, explanation: ExplanationView | null): FeedMessage[] {
  const [entries, setEntries] = useState<FeedMessage[]>([]);
  const seen = useRef<Seen>(initialSeen(session.callCount));
  const idRef = useRef(0);

  useEffect(() => {
    let base = entries;
    if (seen.current.callCount !== session.callCount) {
      seen.current = initialSeen(session.callCount);
      base = [];
    }

    const additions: FeedMessage[] = [];
    const push = (speaker: FeedMessage["speaker"], ...lines: string[]) => {
      idRef.current += 1;
      additions.push({ id: `f${idRef.current}`, speaker, lines });
    };

    if (session.userText && session.userText !== seen.current.userSig) {
      seen.current.userSig = session.userText;
      push("user", session.userText);
    }

    const assistantSig = `${session.assistantKey}:${session.repeatCount}`;
    if (session.callActive && session.state === "listening" && assistantSig !== seen.current.assistantSig) {
      seen.current.assistantSig = assistantSig;
      push("companion", t(session.assistantKey));
    }

    if (session.state === "explain" && explanation) {
      if (!seen.current.inExplain) {
        seen.current.inExplain = true;
        seen.current.explainSig = "";
      }
      // Language is part of the signature: switching language while reading a
      // step re-says that step in the new language (content-only, per
      // design-standard — it never resets which step or whether it's confirmed).
      const explainSig = `${session.explainStep}:${session.language}`;
      if (explainSig !== seen.current.explainSig) {
        seen.current.explainSig = explainSig;
        push("companion", ...explainStepLines(session.explainStep, explanation.explanation));
      }
    } else {
      seen.current.inExplain = false;
    }

    if (additions.length > 0 || base !== entries) {
      setEntries([...base, ...additions]);
    }
    // `entries` intentionally excluded: this effect only ever reads the latest
    // value via closure to build the next one, and depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, t, explanation]);

  return entries;
}
