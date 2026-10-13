import { formatVerifiedDate, type ExplanationView } from "@/lib/content/explanation";
import { careContacts, recordSource } from "@/lib/content/seed-record";
import type { CopyKey } from "@/lib/content/translations";
import { maskNumber, type InstructionField, type LabelSource } from "@/lib/dose-check/dose-check";
import type { HelpReason } from "@/lib/services/reasons";
import type { HelpFlow, Session } from "@/lib/session/state-machine";
import { doseCheckLine } from "@/lib/voice/speakable";
import type { T } from "./screen-chrome";

/**
 * Structured content inside one companion message: a short heading, the text (exact wording,
 * quoted where it is an instruction) and a small source note. Rendered with line breaks and
 * subtle dividers by the chat — never as a separate panel, never with buttons.
 */
export type FeedSection = { heading?: string; text: string; note?: string };

const FIELD_LABEL: Record<InstructionField, CopyKey> = { amount: "doseFieldAmount", perDay: "doseFieldPerDay", timing: "doseFieldTiming" };
const SOURCE_LABEL: Record<LabelSource, CopyKey> = { fixture: "doseSourceFixture", typed: "doseSourceTyped", "speech-transcript": "doseSourceSpeech" };

/** The reason sent with a help request, in plain words — exactly the code in the payload. */
export const HELP_REASON_TEXT: Record<HelpReason, CopyKey> = {
  "label-trouble": "helpReasonLabel",
  "medical-question": "helpReasonMedical",
  "record-conflict": "helpReasonConflict",
  wellbeing: "helpReasonWellbeing",
  "help-requested": "helpReasonGeneral",
};

const quote = (text: string) => `“${text}”`;
/** "Different:" → "Different" (the heading carries the colon's job). */
const heading = (label: string) => label.replace(/[:：]\s*$/, "");

/**
 * "Check before sharing" for a pharmacist callback or a family / trusted-helper message asked
 * for in the conversation: exactly what the request carries (recipient, what is asked, the
 * reason code in words) and, for a callback, the number on the record, masked. Shown once,
 * in the chat, under the companion's "here is the request" line.
 */
export function helpReviewSections(t: T, flow: HelpFlow): FeedSection[] {
  const callback = flow.kind === "pharmacist-callback";
  const to = callback
    ? t("doseRecipient")
    : t(flow.kind === "trusted-helper" ? "helpToHelper" : "helpToFamily").replace(
        "{name}",
        flow.kind === "trusted-helper" ? careContacts.trustedHelper.name : careContacts.family.name,
      );
  const out: FeedSection[] = [
    { heading: t("doseTo"), text: to },
    callback ? { heading: t("helpRequestRow"), text: t("helpRequestValue") } : { heading: t("helpMessageRow"), text: t("helpMessageValue") },
    { heading: t("doseReason"), text: t(HELP_REASON_TEXT[flow.reason]) },
  ];
  if (callback) out.push({ heading: t("helpNumberFromRecord"), text: maskNumber(careContacts.patientPhone) });
  out.push({ text: t("helpShareNotice") }, { text: t("dosePrototypeNotice") });
  return out;
}

/**
 * The dose-change check as chat messages (Assignment 4): the record, the box, the difference,
 * the callback summary to check, and the outcome — each a companion message in the one
 * conversation. `key` changes whenever the step's content does, so each is added once.
 * Record facts come from the confirmed record only; it shows the difference and never says
 * which instruction to follow.
 */
export function doseMessage(
  session: Pick<Session, "doseCheck" | "language">,
  t: T,
  explanation: ExplanationView,
): { key: string; lines: string[]; sections: FeedSection[] } | null {
  const d = session.doseCheck;
  const line = doseCheckLine(session, t, explanation);
  if (!d || !line) return null;
  const language = session.language;
  const sourceNote = (name: string, recordedAt: string) =>
    `${t("doseFictionalSource").replace("{name}", name)} · ${formatVerifiedDate(language, recordedAt)}`;
  const cb = d.callback;

  if (cb && cb.status !== "cancelled" && d.step !== "label") {
    const r = cb.draft;
    if (cb.status === "submitting") return { key: line, lines: [line], sections: [] };
    if (cb.status === "submitted" || cb.status === "failed" || cb.status === "unknown") {
      const status: CopyKey =
        cb.status === "submitted" ? "doseRequestSubmitted" : cb.status === "unknown" ? "doseRequestUnknown" : "doseRequestNotSubmitted";
      const sections: FeedSection[] = [
        // Two separate statuses: a sent request never means the medicine question is settled.
        { heading: t("doseRequestStatus"), text: t(status) },
        { heading: t("doseMedicationStatus"), text: t("doseUnresolved") },
      ];
      if (cb.status === "failed") sections.push({ heading: t("doseViewContact"), text: `${careContacts.pharmacy.name}: ${careContacts.pharmacy.phone}` });
      sections.push({ text: t("doseDemoNotice") });
      return { key: line, lines: cb.status === "submitted" ? [line] : [line, t("reviewSayToRetry")], sections };
    }
    // Reviewing: exactly the draft that "send the request" would share — no more, no less, in
    // design-standard §16 order. Keyed by revision too, so every corrected version is shown again.
    return {
      key: `${line}#${cb.revision}`,
      lines: [t(cb.updated ? "doseReviewUpdated" : "doseReviewIntro")],
      sections: [
        { heading: t("doseTo"), text: t("doseRecipient") },
        { heading: t("doseReasonRow"), text: r.concernSummary },
        { heading: t("doseMedicine"), text: `${r.medicine.displayName} ${r.medicine.strengthText}` },
        r.currentRecord
          ? { heading: t("doseRecordRow"), text: quote(r.currentRecord.instructionText), note: sourceNote(r.currentRecord.sourceName, r.currentRecord.recordedAt) }
          : { heading: t("doseRecordRow"), text: t("doseNotAvailable") },
        // "Label wording you confirmed" only when it was: otherwise marked, and not in the request.
        r.confirmedLabel
          ? { heading: t("doseLabelRow"), text: quote(r.confirmedLabel.instructionText) }
          : { heading: t("doseLabelWordingRow"), text: t("doseLabelNotIncluded") },
        { heading: t("doseNumberRow"), text: maskNumber(r.callbackContact) },
        { text: t("doseShareNotice") },
        { text: t("doseReviewPrompt") },
        { text: t("doseDemoNotice") },
      ],
    };
  }

  // Compared: the two instructions side by side, neither endorsed, and what differs or is missing.
  if (d.step === "compared" && !d.offer) {
    const c = d.comparison;
    const differing = c?.outcome === "conflict" ? c.differing : [];
    const missing = c?.outcome === "insufficient" || c?.outcome === "conflict" ? (c.missing ?? []) : [];
    const fields = (list: InstructionField[]) => list.map((f) => t(FIELD_LABEL[f])).join(", ");
    const sections: FeedSection[] = [
      { heading: t("doseRecordHeading"), text: quote(explanation.explanation.instruction), note: sourceNote(recordSource.name, recordSource.verifiedAt) },
      d.labelText
        ? { heading: t("doseLabelHeading"), text: quote(d.labelText), note: d.labelSource ? t(SOURCE_LABEL[d.labelSource]) : undefined }
        : { heading: t("doseLabelHeading"), text: t("doseNotConfirmed") },
    ];
    if (differing.length > 0) sections.push({ heading: heading(t("doseDiffers")), text: fields(differing) });
    if (missing.length > 0) sections.push({ heading: heading(t("doseMissing")), text: fields(missing) });
    return { key: line, lines: [line], sections };
  }

  // The label step quotes the record and the reading in its own words; the offer and an
  // unreachable record need nothing more than the line.
  return { key: line, lines: [line], sections: [] };
}
