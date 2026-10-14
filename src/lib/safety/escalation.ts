import type { CopyKey } from "@/lib/content/translations";
import type { HelpKind } from "@/lib/session/state-machine";
import type { SafetyReason } from "@/types/content";

/** "Try another photo", or one of the help flows (CLAUDE.md § H4) — each confirms before sending. */
export type HelpActionId = "try-again" | HelpKind;

export type HelpAction = { id: HelpActionId; labelKey: CopyKey };

export type EscalationView = {
  urgent: boolean;
  labelKey: CopyKey;
  headingKey: CopyKey;
  bodyKey: CopyKey;
  reasonKey: CopyKey | null;
  /** Set when the one label retry is used up — only human help remains. */
  retryUsedKey: CopyKey | null;
  /** Self-harm wording: crisis line numbers shown (and read) as text — never a claimed call. */
  crisisKey: CopyKey | null;
  /** "I won't show any medicine instructions until we're sure", when instructions were held back. */
  noInstructionsKey: CopyKey | null;
  /** The question that ends the message, naming only the options that really exist here. */
  askKey: CopyKey | null;
  actions: HelpAction[];
};

const REASON_LINE: Record<SafetyReason, CopyKey | null> = {
  "unreadable-label": "reasonUnreadable",
  "record-mismatch": "reasonMismatch",
  "multiple-candidates": "reasonMismatch",
  "user-unsure": "reasonUnsure",
  "unsupported-medical-question": "reasonMedicalQuestion",
  "adverse-effect-question": "reasonMedicalQuestion",
  "urgent-risk": null,
  "service-failure": "reasonService",
  "help-requested": "reasonHelp",
  "label-differs": null, // `labelDiffers` says it all
};

// Non-urgent label outcomes get gentler, no-fault wording (CLAUDE.md § Assignment 3, B):
// a blurry photo shouldn't feel like an alarm. Urgent and service-failure keep theirs.
const GENTLE_LABEL_REASONS: readonly SafetyReason[] = [
  "unreadable-label",
  "record-mismatch",
  "multiple-candidates",
  "user-unsure",
];

const LABEL_REASONS: readonly SafetyReason[] = [
  "unreadable-label",
  "record-mismatch",
  "multiple-candidates",
  "user-unsure",
  "service-failure",
  // Not "label-differs": the "Incorrect output" state leads to a person, not another photo.
];

/**
 * Builds what the safety screen may show. Never contains medicine instructions.
 * `labelRouteSelected` gates "Try another photo": it only makes sense once the
 * user has already chosen Show medicine in this call. `canRetry` is false once
 * the single retry is used — then only the human-help options remain.
 */
export function buildEscalation(
  reason: SafetyReason,
  labelRouteSelected: boolean,
  canRetry = true,
  selfHarm = false,
): EscalationView {
  if (reason === "urgent-risk") {
    return {
      urgent: true,
      labelKey: "urgentLabel",
      headingKey: "urgentHeading",
      bodyKey: "urgentBody",
      reasonKey: "urgentNoCall",
      retryUsedKey: null,
      crisisKey: selfHarm ? "crisisLines" : null,
      noInstructionsKey: null,
      askKey: null,
      // No actions on the urgent path until amendment I's research and trial are done:
      // no emergency button, and no help flow that would amount to urgent routing.
      actions: [],
    };
  }

  const actions: HelpAction[] = [];
  const labelProblem = labelRouteSelected && LABEL_REASONS.includes(reason);
  if (labelProblem && canRetry) {
    actions.push({ id: "try-again", labelKey: "tryPhoto" });
  }
  // Two ways to a person (owner decision, 13 October 2026): a pharmacist callback, or family.
  // Clinic and trusted helper are no longer offered here; each still asks before anything is sent.
  actions.push(
    { id: "pharmacist-callback", labelKey: "askPharmacistCall" },
    { id: "family", labelKey: "contactFamily" },
  );

  const gentle = GENTLE_LABEL_REASONS.includes(reason) || reason === "label-differs";
  const asked = reason === "help-requested"; // she asked for a person: no "not sure enough" framing
  return {
    urgent: false,
    labelKey: "safetyLabel",
    headingKey: asked ? "helpRequestedHeading" : gentle ? "labelSafetyHeading" : "safetyHeading",
    bodyKey: asked ? "helpRequestedBody" : reason === "label-differs" ? "labelDiffers" : gentle ? "labelSafetyBody" : "safetyBody",
    reasonKey: asked ? null : REASON_LINE[reason],
    retryUsedKey: labelProblem && !canRetry ? "retryUsed" : null,
    crisisKey: null,
    noInstructionsKey: asked ? null : "reasonNoInstructions",
    askKey: actions.some((a) => a.id === "try-again") ? "safetyAskRetry" : "safetyAsk",
    actions,
  };
}
