import { fillCandidate, fillRecordFacts, type ExplanationView } from "@/lib/content/explanation";
import type { CopyKey } from "@/lib/content/translations";
import { helpLine } from "@/lib/content/help-lines";
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
    | "helpFlow"
    | "showMethod"
    | "doseCheck"
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

  // A help request sits on top of whichever step asked it.
  if (session.helpFlow) return helpLine(t, session.helpFlow);

  switch (session.state) {
    case "listening":
      return listeningOverride !== undefined ? listeningOverride : t(session.assistantKey);
    case "camera-permission":
      // The photo note is said first, before any picker opens (H2).
      return session.showMethod === "choose"
        ? join(t("showMedicineHeading"), t("photoIntro"))
        : join(t("cameraPermissionHeading"), t("cameraPermissionBody"));
    case "camera-guidance":
      return session.cameraMode === "preview"
        ? t("cameraGuidanceHeading")
        : t("fallbackHeading");
    case "analyzing":
      return join(t("analyzingHeading"), t("analyzingBody"));
    case "confirm-match":
      if (!session.candidate) return null;
      return join(fillCandidate(t("confirmHeading"), session.candidate), t("confirmQuestion"), t("checkName"));
    case "explain": {
      if (!explanation) return null; // gate: no confirmed match → nothing medical is spoken
      if (session.doseCheck) return doseCheckLine(session, t, explanation);
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

/**
 * The companion's line for the current dose-check step (Assignment 4) — the
 * same text is spoken, announced and added to the transcript. Record facts are
 * filled from the confirmed record; the box wording is the person's own. It
 * shows the difference and never says which instruction to follow.
 */
export function doseCheckLine(
  session: Pick<Session, "doseCheck" | "language">,
  t: (key: CopyKey) => string,
  explanation: ExplanationView,
): string | null {
  const d = session.doseCheck;
  if (!d) return null;
  const join = (...parts: Array<string | null>) => parts.filter((p): p is string => Boolean(p)).join(" ");
  const source = fillRecordFacts(t("recordCheckedOn"), explanation, session.language);
  const fill = (key: CopyKey) =>
    fillRecordFacts(t(key), explanation, session.language).replace("{source}", source).replace("{reading}", d.reading ?? "");

  const cb = d.callback;
  if (cb && cb.status !== "cancelled" && d.step !== "label") {
    if (cb.status === "submitting") return t("doseSubmitting");
    if (cb.status === "submitted") return join(t("doseSubmitted"), t("doseStillUnresolved"));
    if (cb.status === "failed") return join(t("doseFailed"), t("doseFailedBody"));
    if (cb.status === "unknown") return join(t("doseUnknown"), t("doseUnknownBody"));
    // Reviewing/editing: the summary read aloud (the callback number stays masked, so it isn't).
    const r = cb.draft;
    return join(
      t("doseReviewIntro"),
      `${t("doseTo")}: ${t("doseRecipient")}.`,
      `${t("doseReason")}: ${r.concernSummary}`,
      `${t("doseMedicine")}: ${r.medicine.displayName} ${r.medicine.strengthText}.`,
      `${t("doseRecordRow")}: ${r.currentRecord ? `${r.currentRecord.instructionText} (${source}).` : `${t("doseNotAvailable")}.`}`,
      `${t("doseLabelRow")}: ${r.confirmedLabel ? r.confirmedLabel.instructionText : `${t("doseNotConfirmed")}.`}`,
      t("doseShareNotice"),
      t("dosePrototypeNotice"),
    );
  }
  // A correction waiting for confirmation comes before the summary it will update.
  if (d.step === "label" && d.reading) {
    return fill(d.labelSource === "fixture" ? "doseReadingCheck" : "doseReadingTypedCheck");
  }
  if (d.offer) return t("doseOffer");
  switch (d.step) {
    case "record-unavailable":
      return t("doseRecordUnavailable");
    case "label":
      return fill("doseRecordAndAsk");
    case "compared": {
      const outcome = d.comparison?.outcome;
      return join(
        d.notice === "conflict-cleared" ? t("doseConflictCleared") : d.notice === "nothing-shared" ? t("doseNothingShared") : null,
        outcome === "conflict" ? t("doseConflict") : outcome === "match" ? t("doseMatch") : t("doseInsufficient"),
      );
    }
    default:
      return null;
  }
}
