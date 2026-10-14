import type { CopyKey } from "@/lib/content/translations";
import type { Session } from "./state-machine";

/**
 * Where the call is in its safety progress, for display only (the progress row and the status
 * chips). It is DERIVED from the reducer's own state on every render — never stored, never set by
 * a model — so it can't drift from what the gates actually allow.
 */
export type CallStage =
  | "idle"
  | "asking"
  | "capturing"
  | "comparing"
  | "possibleMatch"
  | "confirmed"
  | "explaining"
  | "done"
  | "blocked"
  | "handoff";

type StageInput = Pick<Session, "callActive" | "state" | "explainStep" | "doseCheck" | "helpFlow">;

/** A pharmacist callback waiting for her review (dose check summary, or the help request). */
function pharmacistReview(s: StageInput): boolean {
  const cb = s.doseCheck?.callback;
  if (cb && (cb.status === "reviewing" || cb.status === "editing")) return true;
  return s.helpFlow?.kind === "pharmacist-callback" && (s.helpFlow.stage === "confirm" || s.helpFlow.stage === "review");
}

export function callStage(s: StageInput): CallStage {
  if (!s.callActive || s.state === "start") return "idle";
  if (pharmacistReview(s)) return "handoff";
  switch (s.state) {
    case "safety":
      return "blocked";
    case "camera-permission":
    case "camera-guidance":
      return "capturing";
    case "analyzing":
      return "comparing";
    case "confirm-match":
      return "possibleMatch";
    case "explain":
      // Only reachable with a confirmed match (reducer gate). The first part of the explanation is
      // the "unlocked" moment; the rest, and the dose check, are read from the record.
      return s.explainStep === 0 && !s.doseCheck ? "confirmed" : "explaining";
    case "complete":
      return "done";
    default:
      return "asking";
  }
}

export type ChipTone = "neutral" | "coral" | "teal" | "blue";
export type StageChip = { key: CopyKey; tone: ChipTone };

/** The status chip each stage shows (text and colour, never colour alone). */
export const STAGE_CHIPS: Partial<Record<CallStage, StageChip>> = {
  capturing: { key: "chipPhotoTaken", tone: "neutral" },
  comparing: { key: "chipChecking", tone: "neutral" },
  possibleMatch: { key: "chipPossibleMatch", tone: "coral" },
  confirmed: { key: "chipConfirmed", tone: "teal" },
  explaining: { key: "chipFromPlan", tone: "teal" },
  blocked: { key: "chipBlocked", tone: "coral" },
  handoff: { key: "chipHandoff", tone: "blue" },
};

/** The progress row: Ask · Show · Check · Confirm · Explain. */
export const PROGRESS_STEPS: CopyKey[] = ["progressAsk", "progressShow", "progressCheck", "progressConfirm", "progressExplain"];

/** Which progress step is current; null when the row gives way to a chip (blocked, handoff) or is hidden. */
export function progressIndex(stage: CallStage): number | null {
  switch (stage) {
    case "asking":
      return 0;
    case "capturing":
      return 1;
    case "comparing":
      return 2;
    case "possibleMatch":
      return 3;
    case "confirmed":
    case "explaining":
    case "done":
      return 4;
    default:
      return null;
  }
}

/** "Explain" stays locked (dimmed, with a lock) until she has confirmed the medicine. */
export function explainUnlocked(stage: CallStage): boolean {
  return stage === "confirmed" || stage === "explaining" || stage === "done";
}
