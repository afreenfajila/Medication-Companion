import { fillCandidate, fillRecordFacts, type ExplanationView } from "@/lib/content/explanation";
import type { CopyKey } from "@/lib/content/translations";
import type { CandidateDisplay } from "@/types/content";
import type { CallbackReason } from "@/lib/dose-check/dose-check";
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
    | "cameraIssue"
    | "labelRetries"
    | "recordConflict"
    | "language"
    | "userText"
    | "helpFlow"
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

  // A help request sits on top of whichever step asked it — but urgent guidance is always what's said.
  if (session.helpFlow && session.safetyReason !== "urgent-risk") return helpLine(t, session.helpFlow);

  switch (session.state) {
    case "listening":
      return listeningOverride !== undefined ? listeningOverride : t(session.assistantKey);
    case "camera-permission":
    case "camera-guidance":
    case "analyzing":
      return join(...showMedicineLines(session, t));
    case "confirm-match":
      if (!session.candidate) return null;
      return confirmLine(t, session.candidate);
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
    case "safety":
      return join(...safetyLines(session, t));
    case "complete":
      return join(t("completeHeading"), t("completeBody"));
    case "start":
    default:
      return null;
  }
}

/**
 * Showing the medicine, as messages in the conversation (owner decision, 14 October 2026): the
 * one consent question (camera or photo, and what is kept), then Take photo / Upload, what to do
 * with the camera open or off, and "let me have a look". Shown as short lines; said as one turn.
 * The only buttons are inside the "ready" (or camera-off) message, and in the open camera.
 */
export function showMedicineLines(
  session: Pick<Session, "state" | "cameraMode" | "cameraIssue">,
  t: (key: CopyKey) => string,
): string[] {
  if (session.state === "analyzing") return [t("analyzingHeading"), t("analyzingBody")];
  if (session.state === "camera-permission") return [t("cameraPermissionHeading"), t("cameraPermissionBody"), t("cameraPurpose")];
  if (session.cameraMode === "ready") return [t("cameraReady")];
  if (session.cameraMode === "preview") return [t("cameraGuidanceHeading"), t("cameraGuidanceBody"), t("cameraPrivacy")];
  const issue = session.cameraIssue;
  return [
    t(issue === "denied" ? "cameraDeniedHeading" : issue === "unavailable" ? "cameraUnavailableHeading" : "fallbackHeading"),
    t(issue === "denied" ? "cameraDeniedBody" : issue === "unavailable" ? "cameraUnavailableBody" : "fallbackBody"),
    t("spokenLabelHint"),
  ];
}

/**
 * Getting a person, as one message in the conversation (no card, no buttons): what happened, that
 * nothing will be guessed, and a question naming only the ways on that exist here — answered in
 * words. Shown as short paragraphs; said as one turn (`speakableText`).
 */
export function safetyLines(
  session: Pick<Session, "safetyReason" | "labelRouteSelected" | "labelRetries" | "userText">,
  t: (key: CopyKey) => string,
): string[] {
  const view = buildEscalation(
    session.safetyReason ?? "help-requested",
    session.labelRouteSelected,
    session.labelRetries < MAX_LABEL_RETRIES,
    mentionsSelfHarm(session.userText),
  );
  return [
    view.headingKey,
    view.reasonKey,
    view.retryUsedKey,
    view.bodyKey,
    view.crisisKey,
    view.noInstructionsKey,
    view.askKey,
  ].flatMap((key) => (key ? [t(key)] : []));
}

/** After a submitted request: "the difference" only when a difference was actually found. */
export function stillOpenKey(reason: CallbackReason): CopyKey {
  return reason === "instruction-discrepancy" ? "doseStillUnresolved" : "doseStillUnchecked";
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
  // Chinese sentences sit side by side with no space between them.
  const join = (...parts: Array<string | null>) => parts.filter((p): p is string => Boolean(p)).join(session.language === "zh-Hans" ? "" : " ");
  const source = fillRecordFacts(t("recordCheckedOn"), explanation, session.language);
  const fill = (key: CopyKey) =>
    fillRecordFacts(t(key), explanation, session.language).replace("{source}", source).replace("{reading}", d.reading ?? "");

  const cb = d.callback;
  if (cb && cb.status !== "cancelled" && d.step !== "label") {
    if (cb.status === "submitting") return t("doseSubmitting");
    // Each outcome ends with a question a plain yes or no can answer.
    if (cb.status === "submitted") return join(t("doseSubmitted"), t(stillOpenKey(cb.draft.reason)), t("doseAnythingElse"));
    if (cb.status === "failed") return join(t("doseFailed"), t("doseFailedBody"), t("doseRetryPrompt"));
    if (cb.status === "unknown") return join(t("doseUnknown"), t("doseUnknownBody"), t("doseRetryPrompt"));
    // Reviewing/editing: the summary read aloud (the callback number stays masked, so it isn't).
    const r = cb.draft;
    const last4 = r.callbackContact.replace(/\D/g, "").slice(-4);
    return join(
      t(cb.updated ? "doseReviewUpdated" : "doseReviewIntro"),
      `${t("doseTo")}: ${t("doseRecipient")}.`,
      `${t("doseReasonRow")}: ${r.concernSummary}`,
      `${t("doseMedicine")}: ${r.medicine.displayName} ${r.medicine.strengthText}.`,
      `${t("doseRecordRow")}: ${r.currentRecord ? `${r.currentRecord.instructionText} (${source}).` : `${t("doseNotAvailable")}.`}`,
      r.confirmedLabel ? `${t("doseLabelRow")}: ${r.confirmedLabel.instructionText}` : `${t("doseLabelWordingRow")}: ${t("doseLabelNotIncluded")}.`,
      t("doseNumberEnding").replace("{last4}", last4),
      t("doseShareNotice"),
      t("doseReviewPrompt"),
      t("doseDemoNotice"),
    );
  }
  // A correction waiting for confirmation comes before the summary it will update.
  if (d.step === "label" && d.reading) {
    if (d.labelSource === "fixture") return fill("doseReadingCheck");
    // Said back the way she gave it ("I heard…" / "You wrote…"), gently if she sounded unsure.
    return join(d.readingUnsure ? t("doseReadingNoRush") : null, fill(d.labelSource === "speech-transcript" ? "doseReadingHeardCheck" : "doseReadingTypedCheck"));
  }
  if (d.offer) return t("doseOffer");
  switch (d.step) {
    case "record-unavailable":
      return t("doseRecordUnavailable");
    case "label":
      // After a "no" to the read-back: ask again, without repeating the record she just heard.
      return d.labelRevision > 0 ? t("doseReadingAskAgain") : fill("doseRecordAndAsk");
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

/**
 * The medicine confirmation, said and shown in the conversation: "a possible match", the
 * name, strength, form and fictional source, and the question. Only a clear yes (said or
 * typed) confirms; "no" and "not sure" never unlock the record (PRD ID-01–03).
 */
export function confirmLine(t: (key: CopyKey) => string, candidate: CandidateDisplay): string {
  return fillCandidate(t("confirmSpoken"), candidate).replace("{source}", candidate.recordSource);
}
