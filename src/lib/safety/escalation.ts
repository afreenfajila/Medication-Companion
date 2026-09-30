import type { CopyKey } from "@/lib/content/translations";
import type { SafetyReason } from "@/types/content";

export type HelpActionId =
  | "try-again"
  | "pharmacy-demo"
  | "clinic-demo"
  | "trusted-helper-demo"
  | "urgent-care";

export type HelpAction = {
  id: HelpActionId;
  labelKey: CopyKey;
  /** No real call/message exists in this prototype, so every action is a demo. */
  implemented: boolean;
};

export type EscalationView = {
  urgent: boolean;
  labelKey: CopyKey;
  headingKey: CopyKey;
  bodyKey: CopyKey;
  reasonKey: CopyKey | null;
  /** Set when the one label retry is used up — only human help remains. */
  retryUsedKey: CopyKey | null;
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
): EscalationView {
  if (reason === "urgent-risk") {
    return {
      urgent: true,
      labelKey: "urgentLabel",
      headingKey: "urgentHeading",
      bodyKey: "urgentBody",
      reasonKey: "urgentNoCall",
      retryUsedKey: null,
      actions: [
        { id: "urgent-care", labelKey: "emergencyDemo", implemented: false },
        { id: "trusted-helper-demo", labelKey: "askHelper", implemented: false },
      ],
    };
  }

  const actions: HelpAction[] = [];
  const labelProblem = labelRouteSelected && LABEL_REASONS.includes(reason);
  if (labelProblem && canRetry) {
    actions.push({ id: "try-again", labelKey: "tryPhoto", implemented: true });
  }
  actions.push(
    { id: "pharmacy-demo", labelKey: "checkPharmacy", implemented: false },
    { id: "trusted-helper-demo", labelKey: "askHelper", implemented: false },
    { id: "clinic-demo", labelKey: "contactClinic", implemented: false },
  );

  const gentle = GENTLE_LABEL_REASONS.includes(reason);
  return {
    urgent: false,
    labelKey: "safetyLabel",
    headingKey: gentle ? "labelSafetyHeading" : "safetyHeading",
    bodyKey: gentle ? "labelSafetyBody" : "safetyBody",
    reasonKey: REASON_LINE[reason],
    retryUsedKey: labelProblem && !canRetry ? "retryUsed" : null,
    actions,
  };
}
