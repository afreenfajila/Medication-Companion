import { fillRecordFacts, type ExplanationView } from "@/lib/content/explanation";
import type { CopyKey } from "@/lib/content/translations";
import { mentionsSelfHarm } from "@/lib/safety/classify";
import { buildEscalation } from "@/lib/safety/escalation";
import { MAX_LABEL_RETRIES, type Session } from "@/lib/session/state-machine";

/**
 * What the companion may read aloud for the current screen. It is exactly the
 * approved on-screen wording (copy catalogue + record-backed explanation) —
 * spoken output is never generated. Medicine content is spoken ONLY when a
 * confirmed-match `explanation` is supplied; any other state returns
 * non-medical wording or nothing.
 */
export function speakableText(
  session: Pick<
    Session,
    | "state"
    | "assistantKey"
    | "safetyReason"
    | "labelRouteSelected"
    | "explainStep"
    | "candidate"
    | "cameraMode"
    | "labelRetries"
    | "recordConflict"
    | "language"
    | "userText"
    | "familyConsentPending"
  >,
  t: (key: CopyKey) => string,
  explanation: ExplanationView | null,
  /**
   * Overrides the "listening" line — used only for the small set of eligible
   * conversational lines (see `CONVERSATIONAL_REPHRASE_KEYS`) that may be
   * naturalised by Claude. `undefined` (the default — every other caller,
   * including all existing tests) keeps the exact previous behaviour. `null`
   * means "eligible, but not decided yet" and deliberately speaks nothing
   * yet, rather than speaking the approved line and then a naturalised one
   * moments later — one clean line per turn, never two.
   */
  listeningOverride?: string | null,
): string | null {
  const join = (...parts: Array<string | null | undefined>) =>
    parts.filter((p): p is string => Boolean(p)).join(" ");

  // The family-consent question sits on top of whichever step asked it.
  if (session.familyConsentPending) return t("familyConsent");

  switch (session.state) {
    case "listening":
      return listeningOverride !== undefined ? listeningOverride : t(session.assistantKey);
    case "camera-permission":
      return join(t("cameraPermissionHeading"), t("cameraPermissionBody"));
    case "camera-guidance":
      return session.cameraMode === "preview"
        ? t("cameraGuidanceHeading")
        : t("fallbackHeading");
    case "analyzing":
      return t("analyzingHeading");
    case "confirm-match":
      return join(
        t("possibleMatch") + ".",
        t("confirmHeading"),
        session.candidate?.medicineName ? session.candidate.medicineName + "." : null,
        t("checkName"),
      );
    case "explain": {
      if (!explanation) return null; // gate: no confirmed match → nothing medical is spoken
      if (session.recordConflict) return fillRecordFacts(t("recordConflict"), explanation, session.language);
      const e = explanation.explanation;
      if (session.explainStep === 0) return join(e.title, e.purpose, e.sourceLine);
      if (session.explainStep === 1) {
        return join(
          e.instructionIntro,
          e.instruction,
          fillRecordFacts(t("recordCheckedOn"), explanation, session.language) + ".",
          t("labelCheckPrompt"),
        );
      }
      return join(e.caution, e.confirmationPrompt);
    }
    case "safety": {
      const view = buildEscalation(
        session.safetyReason ?? "help-requested",
        session.labelRouteSelected,
        session.labelRetries < MAX_LABEL_RETRIES,
        mentionsSelfHarm(session.userText),
      );
      return join(
        t(view.headingKey),
        view.reasonKey ? t(view.reasonKey) : null,
        view.retryUsedKey ? t(view.retryUsedKey) : null,
        t(view.bodyKey),
        view.crisisKey ? t(view.crisisKey) : null,
      );
    }
    case "complete":
      return join(t("completeHeading"), t("completeBody"));
    case "start":
    default:
      return null;
  }
}
