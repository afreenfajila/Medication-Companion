"use client";

import { AlertTriangle, CheckCircle2, CircleHelp, Equal, FileText, Info, Package, Phone, Volume2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { PrimaryButton, SecondaryButton, TextAction } from "@/components/ui/buttons";
import { formatVerifiedDate } from "@/lib/content/explanation";
import { careContacts } from "@/lib/content/seed-record";
import type { CopyKey } from "@/lib/content/translations";
import { isPlausibleNumber, maskNumber, type InstructionField, type LabelSource } from "@/lib/dose-check/dose-check";
import type { CallbackState, DoseAction, DoseCheck } from "@/lib/session/state-machine";
import type { UiLanguage } from "@/types/content";
import type { T } from "./screen-chrome";

const inputClass =
  "min-h-12 w-full rounded-md border border-navy-700/30 bg-surface px-4 text-lg placeholder:text-navy-700/70";

const FIELD_LABEL: Record<InstructionField, CopyKey> = {
  amount: "doseFieldAmount",
  perDay: "doseFieldPerDay",
  timing: "doseFieldTiming",
};

const SOURCE_LABEL: Record<LabelSource, CopyKey> = {
  fixture: "doseSourceFixture",
  typed: "doseSourceTyped",
  "speech-transcript": "doseSourceSpeech",
};

/** The record's instruction and where it comes from; null when the record can't be reached. */
export type DoseRecordView = { instruction: string; sourceName: string; recordedAt: string };

/**
 * The dose-change check (Assignment 4) as the pinned panel of the call — one
 * step at a time: what the record says, what the box says, the difference, and
 * a callback summary to check before sharing. It shows the difference; it never
 * says which instruction to follow. Record facts arrive already resolved from
 * the confirmed record (`record`); nothing typed here can change them.
 */
export function DoseCheckPanel({
  t,
  language,
  dose,
  record,
  onAction,
  onGetHelp,
  onRepeat,
  onEnd,
}: {
  t: T;
  language: UiLanguage;
  dose: DoseCheck;
  record: DoseRecordView | null;
  onAction: (action: DoseAction) => void;
  onGetHelp: () => void;
  /** "Read this to me": the existing repeat, which re-says the current line. */
  onRepeat: () => void;
  onEnd: () => void;
}) {
  const cb = dose.callback;
  const liveDraft = cb && cb.status !== "cancelled";
  const returnToCall = (
    <TextAction className="self-center" onClick={() => onAction({ kind: "return-to-call" })}>
      {t("doseReturnToCall")}
    </TextAction>
  );
  const askCallback = (
    <PrimaryButton icon={<Phone className="h-5 w-5" aria-hidden="true" />} onClick={() => onAction({ kind: "offer-callback" })}>
      {t("doseAskCallback")}
    </PrimaryButton>
  );

  if (liveDraft && dose.step !== "label") {
    return <CallbackPanel t={t} language={language} cb={cb} onAction={onAction} onRepeat={onRepeat} onEnd={onEnd} />;
  }
  if (dose.offer) {
    return (
      <div className="flex flex-col gap-3">
        <PrimaryButton onClick={() => onAction({ kind: "accept-offer" })}>{t("doseOfferYes")}</PrimaryButton>
        <SecondaryButton onClick={() => onAction({ kind: "decline-offer" })}>{t("notNow")}</SecondaryButton>
      </div>
    );
  }
  if (dose.step === "record-unavailable" || !record) {
    // Nothing to compare and nothing invented: a question for the pharmacist, or a person.
    return (
      <div className="flex flex-col gap-3">
        {dose.notice === "nothing-shared" && (
          <StatusLine icon={<Info className="h-5 w-5" aria-hidden="true" />}>{t("doseNothingShared")}</StatusLine>
        )}
        <StatusLine icon={<CircleHelp className="h-5 w-5" aria-hidden="true" />}>{t("doseOutcomeInsufficient")}</StatusLine>
        {askCallback}
        <SecondaryButton onClick={onGetHelp}>{t("getHelp")}</SecondaryButton>
        {returnToCall}
      </div>
    );
  }

  const recordBlock = (
    <InstructionBlock
      heading={t("doseRecordHeading")}
      icon={<FileText className="h-5 w-5" aria-hidden="true" />}
      text={record.instruction}
      meta={[
        [t("doseSourceLabel"), t("doseFictionalSource").replace("{name}", record.sourceName)],
        [t("doseRecordDate"), formatVerifiedDate(language, record.recordedAt)],
      ]}
    />
  );

  // A label correction waiting to be confirmed comes first, even with a summary in progress.
  if (dose.step === "label") {
    // Keyed by revision: new wording (heard, typed or corrected) closes any open edit.
    return (
      <div className="flex flex-col gap-3">
        {recordBlock}
        <LabelStep key={dose.labelRevision} t={t} dose={dose} onAction={onAction} />
      </div>
    );
  }
  // Compared.
  const c = dose.comparison;
  const differing = c?.outcome === "conflict" ? c.differing : [];
  const missing = c?.outcome === "insufficient" ? c.missing : [];
  return (
    <div className="flex flex-col gap-3">
      {dose.notice === "nothing-shared" && (
        <StatusLine icon={<Info className="h-5 w-5" aria-hidden="true" />}>{t("doseNothingShared")}</StatusLine>
      )}
      {c?.outcome === "conflict" && (
        <StatusLine icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />} strong>
          {t("doseOutcomeConflict")}
        </StatusLine>
      )}
      {/* No checkmark: matching wording is not a clinical all-clear. */}
      {c?.outcome === "match" && (
        <StatusLine icon={<Equal className="h-5 w-5" aria-hidden="true" />}>{t("doseOutcomeMatch")}</StatusLine>
      )}
      {c?.outcome === "insufficient" && (
        <StatusLine icon={<CircleHelp className="h-5 w-5" aria-hidden="true" />}>{t("doseOutcomeInsufficient")}</StatusLine>
      )}
      {recordBlock}
      <InstructionBlock
        heading={t("doseLabelHeading")}
        icon={<Package className="h-5 w-5" aria-hidden="true" />}
        text={dose.labelText}
        emptyText={t("doseNotConfirmed")}
        meta={dose.labelSource && dose.labelText ? [[t("doseSourceLabel"), t(SOURCE_LABEL[dose.labelSource])]] : []}
      />
      {differing.length > 0 && (
        <p className="text-lg font-bold">
          {t("doseDiffers")} {differing.map((f) => t(FIELD_LABEL[f])).join(", ")}
        </p>
      )}
      {missing.length > 0 && (
        <p className="text-lg font-bold">
          {t("doseMissing")} {missing.map((f) => t(FIELD_LABEL[f])).join(", ")}
        </p>
      )}
      {/* A difference or a gap can go to a pharmacist; a match doesn't invent a reason to. */}
      {(c?.outcome === "conflict" || c?.outcome === "insufficient") && askCallback}
      <TextAction className="self-center" onClick={() => onAction({ kind: "review-details" })}>
        {c?.outcome === "conflict" ? t("doseReviewDetails") : t("doseChangeWording")}
      </TextAction>
      {returnToCall}
    </div>
  );
}

/** "Please check what I read": the wording, where it came from, and three full-size choices. */
function LabelStep({ t, dose, onAction }: { t: T; dose: DoseCheck; onAction: (a: DoseAction) => void }) {
  const [editing, setEditing] = useState(false);
  const reading = dose.reading;
  if (reading && !editing) {
    return (
      <section aria-labelledby="dose-reading-heading" className="flex flex-col gap-3">
        <h2 id="dose-reading-heading" className="text-[22px] font-bold leading-tight">
          {t("doseCheckReadingHeading")}
        </h2>
        <InstructionBlock
          heading={t("doseReadingHeading")}
          icon={<CircleHelp className="h-5 w-5" aria-hidden="true" />}
          text={reading}
          meta={dose.labelSource ? [[t("doseSourceLabel"), t(SOURCE_LABEL[dose.labelSource])]] : []}
          unconfirmed
        />
        {/* Full size and equal weight: this is a confirmation, and a filled "yes" would invite agreeing without looking. */}
        <SecondaryButton onClick={() => onAction({ kind: "confirm-label", revision: dose.labelRevision })}>
          {t("doseReadingYes")}
        </SecondaryButton>
        <SecondaryButton onClick={() => setEditing(true)}>{t("doseReadingNo")}</SecondaryButton>
        <SecondaryButton onClick={() => onAction({ kind: "cannot-confirm" })}>{t("doseCannotConfirm")}</SecondaryButton>
      </section>
    );
  }
  return (
    <WordingForm
      t={t}
      initial={reading ?? ""}
      onSubmit={(text) => onAction({ kind: "enter-label", text })}
      onCancel={editing ? () => setEditing(false) : () => onAction({ kind: "cannot-confirm" })}
      cancelLabel={editing ? t("doseCancelEdit") : t("doseCannotConfirm")}
    />
  );
}

function WordingForm({
  t,
  initial,
  onSubmit,
  onCancel,
  cancelLabel,
}: {
  t: T;
  initial: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  cancelLabel: string;
}) {
  const [text, setText] = useState(initial);
  const id = useId();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text);
      }}
    >
      <label htmlFor={id} className="text-lg font-bold leading-snug">
        {t("doseLabelQuestion")}
      </label>
      <input
        id={id}
        className={inputClass}
        value={text}
        maxLength={200}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
      />
      <SecondaryButton type="submit" disabled={!text.trim()}>
        {t("doseUseWording")}
      </SecondaryButton>
      <TextAction className="self-center" onClick={onCancel}>
        {cancelLabel}
      </TextAction>
    </form>
  );
}

/** "Check before sharing": exactly the draft that Send would share — no more, no less. */
function CallbackPanel({
  t,
  language,
  cb,
  onAction,
  onRepeat,
  onEnd,
}: {
  t: T;
  language: UiLanguage;
  cb: CallbackState;
  onAction: (a: DoseAction) => void;
  onRepeat: () => void;
  onEnd: () => void;
}) {
  const [showSummary, setShowSummary] = useState(false);
  const d = cb.draft;
  if (cb.status === "editing") return <EditDraft t={t} cb={cb} onAction={onAction} />;

  const rows: Array<[string, ReactNode]> = [
    [t("doseTo"), t("doseRecipient")],
    [t("doseReason"), d.concernSummary],
    [t("doseMedicine"), `${d.medicine.displayName} ${d.medicine.strengthText}`],
    [
      t("doseRecordRow"),
      d.currentRecord ? (
        <span key="record">
          {d.currentRecord.instructionText}
          <span className="mt-1 block text-base font-medium text-navy-700">
            {t("doseFictionalSource").replace("{name}", d.currentRecord.sourceName)} ·{" "}
            {formatVerifiedDate(language, d.currentRecord.recordedAt)}
          </span>
        </span>
      ) : (
        t("doseNotAvailable")
      ),
    ],
    [t("doseLabelRow"), d.confirmedLabel ? d.confirmedLabel.instructionText : t("doseNotConfirmed")],
    [
      t("doseNumberRow"),
      <span key="number" className="inline-flex items-center gap-2">
        <span>{maskNumber(d.callbackContact)}</span>
        {(cb.status === "reviewing" || cb.status === "failed") && (
          <TextAction className="min-h-11 px-1" onClick={() => onAction({ kind: "edit" })}>
            {t("doseChange")}
          </TextAction>
        )}
      </span>,
    ],
  ];

  const summary = (
    <dl className="divide-y divide-line rounded-lg border border-line bg-surface px-4">
      {rows.map(([term, value]) => (
        <div key={term} className="py-2">
          <dt className="text-base text-navy-700">{term}</dt>
          <dd className="text-lg font-bold leading-snug">{value}</dd>
        </div>
      ))}
    </dl>
  );

  const prototypeNotice = (
    <p className="flex items-start gap-2 rounded-md bg-teal-100 px-3 py-2 text-base font-medium">
      <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t("dosePrototypeNotice")}</span>
    </p>
  );

  if (cb.status === "submitted" || cb.status === "failed" || cb.status === "unknown") {
    const sent = cb.status === "submitted";
    const unknown = cb.status === "unknown";
    const [heading, body, requestStatus] = sent
      ? (["doseSubmitted", "doseStillUnresolved", "doseRequestSubmitted"] as const)
      : unknown
        ? (["doseUnknown", "doseUnknownBody", "doseRequestUnknown"] as const)
        : (["doseFailed", "doseFailedBody", "doseRequestNotSubmitted"] as const);
    // A checkmark may label the (simulated) submission only — never the medication.
    const statusIcon = sent ? (
      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
    ) : unknown ? (
      <CircleHelp className="h-5 w-5" aria-hidden="true" />
    ) : (
      <AlertTriangle className="h-5 w-5" aria-hidden="true" />
    );
    return (
      <div className="flex flex-col gap-3">
        <p className="text-lg font-bold leading-snug">{t(heading)}</p>
        <p className="text-lg leading-snug">{t(body)}</p>
        {/* Two separate statuses: a sent request never means the medicine question is settled. */}
        <dl className="grid grid-cols-1 gap-2">
          <StatusRow term={t("doseRequestStatus")} value={t(requestStatus)} icon={statusIcon} />
          <StatusRow
            term={t("doseMedicationStatus")}
            value={t("doseUnresolved")}
            icon={<CircleHelp className="h-5 w-5" aria-hidden="true" />}
          />
        </dl>
        {prototypeNotice}
        {sent && (
          <>
            <SecondaryButton aria-expanded={showSummary} onClick={() => setShowSummary((v) => !v)}>
              {t("doseReviewRequest")}
            </SecondaryButton>
            {showSummary && summary}
          </>
        )}
        {!sent && (
          <>
            <PrimaryButton onClick={() => onAction({ kind: "send", revision: cb.revision })}>{t("sendAgain")}</PrimaryButton>
            {/* After an unknown outcome the summary isn't reopened for editing: it may already have been sent. */}
            {!unknown && (
              <SecondaryButton onClick={() => onAction({ kind: "review-summary" })}>{t("doseReviewSummary")}</SecondaryButton>
            )}
            <details className="self-center text-center">
              <summary className="inline-flex min-h-11 cursor-pointer items-center px-3 text-base font-medium text-teal-800 underline underline-offset-4">
                {t("doseViewContact")}
              </summary>
              <p className="text-lg font-bold">
                {careContacts.pharmacy.name}: {careContacts.pharmacy.phone}
              </p>
            </details>
          </>
        )}
        {/* Ending the call doesn't cancel anything already sent, and neither resolves the medicine question. */}
        <div className="flex flex-wrap justify-center gap-x-4">
          <TextAction onClick={() => onAction({ kind: "return-to-call" })}>{t("doseReturnToCall")}</TextAction>
          <TextAction onClick={onEnd}>{t("endCall")}</TextAction>
        </div>
      </div>
    );
  }

  const submitting = cb.status === "submitting";
  return (
    <section aria-labelledby="dose-review-heading" className="flex flex-col gap-3">
      <h2 id="dose-review-heading" className="text-[22px] font-bold leading-tight">
        {t("doseReviewHeading")}
      </h2>
      {summary}
      <p className="text-base font-medium leading-snug text-navy-700">{t("doseShareNotice")}</p>
      {/* Disabled while sending: a second tap can't create a second request. */}
      <PrimaryButton
        disabled={submitting}
        aria-busy={submitting}
        onClick={() => onAction({ kind: "send", revision: cb.revision })}
      >
        {submitting ? t("doseSubmitting") : t("doseSend")}
      </PrimaryButton>
      {!submitting && (
        <>
          <SecondaryButton onClick={() => onAction({ kind: "edit" })}>{t("doseChangeSomething")}</SecondaryButton>
          <TextAction className="self-center" onClick={() => onAction({ kind: "dont-send" })}>
            {t("doseDontSend")}
          </TextAction>
          <TextAction className="self-center" icon={<Volume2 className="h-5 w-5" aria-hidden="true" />} onClick={onRepeat}>
            {t("doseReadSummary")}
          </TextAction>
        </>
      )}
      {/* Order per design-standard §16: content, boundary, actions, then the simulation notice. */}
      {prototypeNotice}
    </section>
  );
}

/** Only her own details are editable. The record is shown, never an input. */
function EditDraft({ t, cb, onAction }: { t: T; cb: CallbackState; onAction: (a: DoseAction) => void }) {
  const [callbackContact, setNumber] = useState(cb.draft.callbackContact);
  const [concernSummary, setConcern] = useState(cb.draft.concernSummary);
  const hasLabel = cb.draft.confirmedLabel !== null;
  const [labelInstruction, setLabel] = useState(cb.draft.confirmedLabel?.instructionText ?? "");
  const ids = { num: useId(), hint: useId(), concern: useId(), label: useId() };
  const numberOk = isPlausibleNumber(callbackContact);
  const ready = numberOk && concernSummary.trim() !== "" && (!hasLabel || labelInstruction.trim() !== "");
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onAction({ kind: "save", changes: { callbackContact, concernSummary, labelInstruction } });
      }}
    >
      <h2 className="text-[22px] font-bold leading-tight">{t("doseChangeSomething")}</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.num} className="text-base font-bold text-navy-700">
          {t("doseNumberRow")}
        </label>
        <input
          id={ids.num}
          className={inputClass}
          type="tel"
          inputMode="tel"
          value={callbackContact}
          maxLength={16}
          autoComplete="off"
          aria-invalid={!numberOk}
          aria-describedby={ids.hint}
          onChange={(e) => setNumber(e.target.value)}
        />
        <p id={ids.hint} className="text-base text-navy-700">
          {t("doseNumberHint")}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.concern} className="text-base font-bold text-navy-700">
          {t("doseEditConcern")}
        </label>
        <textarea
          id={ids.concern}
          className={`${inputClass} py-2`}
          rows={2}
          value={concernSummary}
          maxLength={200}
          onChange={(e) => setConcern(e.target.value)}
        />
      </div>
      {hasLabel && (
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.label} className="text-base font-bold text-navy-700">
            {t("doseLabelRow")}
          </label>
          <input
            id={ids.label}
            className={inputClass}
            value={labelInstruction}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      )}
      <PrimaryButton type="submit" disabled={!ready}>
        {t("doseSave")}
      </PrimaryButton>
      <TextAction className="self-center" onClick={() => onAction({ kind: "cancel-edit" })}>
        {t("doseCancelEdit")}
      </TextAction>
    </form>
  );
}

/** One source of an instruction. Record and label share the same neutral treatment: neither is endorsed. */
function InstructionBlock({
  heading,
  icon,
  text,
  emptyText,
  meta = [],
  unconfirmed = false,
}: {
  heading: string;
  icon: ReactNode;
  text: string | null;
  emptyText?: string;
  meta?: Array<[string, string]>;
  unconfirmed?: boolean;
}) {
  return (
    <section
      aria-label={heading}
      className={`rounded-lg border bg-surface p-4 ${unconfirmed ? "border-dashed border-navy-700/50" : "border-navy-700/30"}`}
    >
      <p className="flex items-center gap-2 text-base font-bold text-navy-700">
        {icon}
        <span>{heading}</span>
      </p>
      {text ? (
        <p className="mt-1 text-xl font-bold leading-snug">“{text}”</p>
      ) : (
        <p className="mt-1 text-lg font-medium italic">{emptyText}</p>
      )}
      {meta.length > 0 && (
        <dl className="mt-1 text-base text-navy-700">
          {meta.map(([term, value]) => (
            <div key={term} className="flex flex-wrap gap-x-1">
              <dt className="font-bold">{term}:</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function StatusLine({ icon, children, strong = false }: { icon: ReactNode; children: string; strong?: boolean }) {
  return (
    <p className={`flex items-center gap-2 text-lg leading-snug ${strong ? "font-bold" : "font-medium"}`}>
      {icon}
      <span>{children}</span>
    </p>
  );
}

function StatusRow({ term, value, icon }: { term: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-2">
      <dt className="text-base text-navy-700">{term}</dt>
      <dd className="flex items-center gap-2 text-lg font-bold">
        {icon}
        <span>{value}</span>
      </dd>
    </div>
  );
}
