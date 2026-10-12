"use client";

import { useEffect, useRef, useState } from "react";
import { fillRecordFacts, type ExplanationView } from "@/lib/content/explanation";
import type { Session } from "@/lib/session/state-machine";
import type { AssistantTurn } from "@/lib/voice/coordinator";
import { helpLine } from "@/lib/content/help-lines";
import { confirmLine, doseCheckLine } from "@/lib/voice/speakable";
import type { T } from "./screen-chrome";

export type FeedMessage = {
  id: string;
  speaker: "user" | "companion";
  lines: string[];
  /** Record content (the explanation, or a conflict reply quoting it): hidden while escalated. */
  record?: boolean;
};

type Seen = {
  callCount: number;
  assistantSig: string;
  userSig: string;
  inExplain: boolean;
  explainSig: string;
  conflictSig: string;
  noticeTurn: number;
  confirmSig: string;
  helpSig: string;
  userLineId: number;
  /** The current step's line, shown in its panel and not yet in the chat. */
  pendingStep: { sig: string; line: string } | null;
  /** The step line already moved into the chat (so it isn't added twice). */
  flushedStepSig: string;
};

function initialSeen(callCount: number): Seen {
  return { callCount, assistantSig: "", userSig: "", inExplain: false, explainSig: "", conflictSig: "", noticeTurn: 0, confirmSig: "", helpSig: "", userLineId: 0, pendingStep: null, flushedStepSig: "" };
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
 *
 * `listeningLine` is what to actually show for a `listening`-state reply: the
 * approved copy immediately for most lines, or — for the small set eligible
 * for natural rephrasing (see `CONVERSATIONAL_REPHRASE_KEYS`) — `null` while
 * that decision is still pending, so the transcript never shows the approved
 * line only to silently swap it moments later; it appears once, already final.
 */
export function useCallFeed(
  session: Session,
  t: T,
  explanation: ExplanationView | null,
  listeningLine: string | null,
  /** The companion's voice hasn't started yet — hold its new words until it does. */
  held = false,
  /** Fixed lines said outside the session's own text ("didn't catch that"): every spoken line is visible here. */
  notices: AssistantTurn[] = [],
  /** Her turns that the session doesn't record as a message ("yes", "next", a misheard phrase). */
  userLines: Array<{ id: number; text: string }> = [],
  /** What the companion says on the current step (the same string the voice renders). */
  stepLine: string | null = null,
): FeedMessage[] {
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
    const pushRecord = (...lines: string[]) => {
      idRef.current += 1;
      additions.push({ id: `f${idRef.current}`, speaker: "companion", lines, record: true });
    };

    // The companion's line on the steps that show it in their own panel (camera, photo
    // reading, help screen, wrap-up). While the panel shows it, the chat doesn't repeat
    // it; as soon as the conversation moves on — she answers, a remark is said, or the
    // step changes — it goes into the chat in its place, so the history is complete.
    const ownStep = session.state === "listening" || session.state === "explain" || session.state === "confirm-match" || session.state === "start";
    const helpSpeaks = session.helpFlow !== null && session.safetyReason !== "urgent-risk";
    const stepNow = session.callActive && !ownStep && !helpSpeaks && stepLine && !held ? { sig: `${session.state}|${stepLine}`, line: stepLine } : null;
    const flushStep = () => {
      const pending = seen.current.pendingStep;
      if (!pending) return;
      seen.current.pendingStep = null;
      seen.current.flushedStepSig = pending.sig;
      push("companion", pending.line);
    };
    if (seen.current.pendingStep && seen.current.pendingStep.sig !== stepNow?.sig) flushStep(); // the step changed
    const herNewTurn =
      userLines.some((l) => l.id > seen.current.userLineId) || (session.userText !== null && `${session.turnCount}` !== seen.current.userSig);
    const newNotice = !held && notices.some((n) => n.id.turnId > seen.current.noticeTurn);
    if (herNewTurn || newNotice) flushStep(); // the conversation moved on within the step

    // Her answers and commands, in the order she gave them (ids only grow).
    for (const line of userLines) {
      if (line.id > seen.current.userLineId) {
        seen.current.userLineId = line.id;
        if (line.text) push("user", line.text);
      }
    }

    // Keyed by turn, not by text: saying the same thing twice is two turns, and
    // must look like two turns.
    const userSig = `${session.turnCount}`;
    if (session.userText && userSig !== seen.current.userSig) {
      seen.current.userSig = userSig;
      push("user", session.userText);
    }

    // The turn is part of the signature for the same reason: two different
    // questions can legitimately get the same approved reply, and the second
    // reply must still appear — otherwise the companion looks like it ignored
    // the person, which is precisely what it must never look like.
    const assistantSig = `${session.assistantKey}:${session.repeatCount}:${session.turnCount}`;
    if (
      session.callActive &&
      !held &&
      session.state === "listening" &&
      assistantSig !== seen.current.assistantSig &&
      listeningLine !== null
    ) {
      seen.current.assistantSig = assistantSig;
      push("companion", listeningLine);
    }

    // A help request's question and status ("Shall I send the request?", "…was submitted"): lines in
    // the conversation, each once per stage and language (no card).
    if (session.callActive && session.helpFlow && !held) {
      const f = session.helpFlow;
      const helpSig = `${f.kind}:${f.stage}:${f.reference ?? ""}:${f.contactName ?? ""}:${session.language}`;
      if (helpSig !== seen.current.helpSig) {
        seen.current.helpSig = helpSig;
        push("companion", helpLine(t, f));
      }
    } else if (!session.helpFlow) {
      seen.current.helpSig = "";
    }

    // "I found a possible match… Is this the medicine you have?": the confirmation is part of
    // the conversation, once per candidate and language (no separate panel).
    if (session.state === "confirm-match" && session.candidate && !held) {
      const confirmSig = `${session.candidate.candidateId}:${session.language}:${session.turnCount}`;
      if (confirmSig !== seen.current.confirmSig) {
        seen.current.confirmSig = confirmSig;
        push("companion", confirmLine(t, session.candidate));
      }
    }

    if (session.state === "explain" && explanation && !held) {
      if (!seen.current.inExplain) {
        seen.current.inExplain = true;
        seen.current.explainSig = "";
      }
      // Language is part of the signature: switching language while reading a
      // step re-says that step in the new language (content-only, per
      // design-standard — it never resets which step or whether it's confirmed).
      // Dose check: one line per step (keyed by its text), instead of the step-by-step explanation.
      const doseLine = session.doseCheck ? doseCheckLine(session, t, explanation) : null;
      const explainSig = session.doseCheck ? `dose:${doseLine}` : `${session.explainStep}:${session.language}`;
      if (session.doseCheck) {
        if (doseLine && explainSig !== seen.current.explainSig) {
          seen.current.explainSig = explainSig;
          pushRecord(doseLine);
        }
      } else if (explainSig !== seen.current.explainSig) {
        seen.current.explainSig = explainSig;
        pushRecord(...explainStepLines(session.explainStep, explanation.explanation));
      }
      // "My doctor said…" is answered from the record, once per turn and language.
      const conflictSig = `${session.turnCount}:${session.language}`;
      if (session.recordConflict && conflictSig !== seen.current.conflictSig) {
        seen.current.conflictSig = conflictSig;
        pushRecord(fillRecordFacts(t("recordConflict"), explanation, session.language));
      }
    } else if (session.state !== "explain") {
      seen.current.inExplain = false;
    }

    // Turn ids only grow, so each notice is added once, in the order it was said —
    // and, like every line, once its voice has started (or the wait is over).
    for (const n of held ? [] : notices) {
      if (n.id.turnId > seen.current.noticeTurn) {
        seen.current.noticeTurn = n.id.turnId;
        push("companion", n.text);
      }
    }

    // This step's line waits in its panel until the conversation moves on.
    if (stepNow && stepNow.sig !== seen.current.flushedStepSig && seen.current.pendingStep?.sig !== stepNow.sig) {
      seen.current.pendingStep = stepNow;
    }

    if (additions.length > 0 || base !== entries) {
      setEntries([...base, ...additions]);
    }
    // `entries` intentionally excluded: this effect only ever reads the latest
    // value via closure to build the next one, and depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, t, explanation, listeningLine, held, notices, userLines, stepLine]);

  return entries;
}
