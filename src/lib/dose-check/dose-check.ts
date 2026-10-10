// Dose-change check (Assignment 4): compare the instruction on a medicine box
// with the current (fictional) pharmacy record, and help prepare a pharmacist
// callback summary. It NEVER decides which instruction is right, never says
// which to follow, and never treats the newer record as clinically correct.
// Deterministic only: no model reads, writes or compares anything here.

import { careContacts } from "@/lib/content/seed-record";
import type { SimulatedOutcome } from "@/lib/services/dose-callback";

// ---- Structured instruction -------------------------------------------------

export type Timing = "with-meals" | "before-meals" | "after-meals" | "bedtime" | "morning";
export type InstructionField = "amount" | "perDay" | "timing";
export type ParsedInstruction = { amount: number | null; perDay: number | null; timing: Timing | null };

const WORD_NUMBERS: Record<string, number> = {
  one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, half: 0.5, "1/2": 0.5,
  一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 半: 0.5,
};
const num = (raw: string): number | null => WORD_NUMBERS[raw] ?? (Number.isFinite(Number(raw)) ? Number(raw) : null);

const AMOUNT_EN = /\b(\d+(?:\.\d+)?|1\/2|one|two|three|four|half|an?)\s+(?:of\s+an?\s+)?(?:tablets?|tabs?|capsules?|caps?|pills?)\b/;
const AMOUNT_ZH = /([一两二三四半\d])\s*(?:片|粒)/;
const PER_DAY_ZH = /(?:每日|每天|一天|一日)\s*([一两二三四\d])\s*次/;
const TIMING: Array<[RegExp, Timing]> = [
  [/\bwith (meals?|food)\b|随餐|与餐同服|吃饭时/, "with-meals"],
  [/\bbefore (meals?|food|eating)\b|饭前|餐前/, "before-meals"],
  [/\bafter (meals?|food|eating)\b|饭后|餐后/, "after-meals"],
  [/\b(at )?bedtime\b|\bat night\b|睡前/, "bedtime"],
  [/\b(in the |every )?morning\b|早上|早晨/, "morning"],
];

function perDayEn(n: string): number | null {
  if (/\b(three times|thrice)\b/.test(n)) return 3;
  if (/\b(twice|two times)\b/.test(n)) return 2;
  if (/\b(once|one time)\b/.test(n)) return 1;
  const times = n.match(/\b(\d)\s*(?:x|times)\s*(?:a|per|each)?\s*day\b/);
  if (times) return Number(times[1]);
  if (/\b(daily|every day|each day|a day)\b/.test(n)) return 1;
  return null;
}

/**
 * Reads the fields that matter for comparison. Anything it can't read is null,
 * which later makes the comparison "insufficient", never a guess.
 * ponytail: a small pattern set for the demo record's wording (EN + zh-Hans);
 * a real product needs a reviewed label grammar, not regexes.
 */
export function parseInstruction(text: string | null | undefined): ParsedInstruction {
  const n = (text ?? "").toLowerCase().replace(/[.,;:!?"“”'’()]/g, " ").replace(/\s+/g, " ").trim();
  const amountMatch = n.match(AMOUNT_EN) ?? n.match(AMOUNT_ZH);
  const zhPerDay = n.match(PER_DAY_ZH);
  return {
    amount: amountMatch ? num(amountMatch[1]) : null,
    perDay: zhPerDay ? num(zhPerDay[1]) : perDayEn(n),
    timing: TIMING.find(([p]) => p.test(n))?.[1] ?? null,
  };
}

export type Comparison =
  | { outcome: "match" }
  | { outcome: "conflict"; differing: InstructionField[] }
  | { outcome: "insufficient"; missing: InstructionField[] };

const FIELDS: readonly InstructionField[] = ["amount", "perDay", "timing"];
const REQUIRED: readonly InstructionField[] = ["amount", "perDay"];

/**
 * Field-by-field, never string-by-string: "Take 1 tablet twice daily with
 * meals." and "TAKE ONE TABLET TWO TIMES A DAY WITH MEALS" are the same.
 * A field read on both sides that differs is a conflict. Otherwise, a field
 * missing from either side (amount and times-a-day always required) means
 * there isn't enough to compare.
 */
export function compareInstructions(record: ParsedInstruction, label: ParsedInstruction): Comparison {
  const differing = FIELDS.filter((f) => record[f] !== null && label[f] !== null && record[f] !== label[f]);
  if (differing.length > 0) return { outcome: "conflict", differing };
  const missing = FIELDS.filter(
    (f) => (record[f] === null) !== (label[f] === null) || (REQUIRED.includes(f) && record[f] === null),
  );
  if (missing.length > 0) return { outcome: "insufficient", missing };
  return { outcome: "match" };
}

// ---- Reviewer scenarios (fictional, for interaction testing only) -----------

export type DoseScenario =
  | "conflict-sent"
  | "conflict-fails"
  | "misread-label"
  | "label-matches"
  | "record-unavailable"
  | "conflict-unknown";

export const DOSE_SCENARIOS: Record<
  DoseScenario,
  { title: string; summary: string; labelReading: string | null; recordAvailable: boolean; callbackOutcome: SimulatedOutcome }
> = {
  "conflict-sent": {
    title: "1. Record and label differ → callback submitted",
    summary: "The box reads the old amount. Review and send the callback request.",
    labelReading: "Take 2 tablets twice daily with meals",
    recordAvailable: true,
    callbackOutcome: "success",
  },
  "conflict-fails": {
    title: "2. Record and label differ → submission fails",
    summary: "The first send fails; nothing is lost and Try again sends the same request.",
    labelReading: "Take 2 tablets twice daily with meals",
    recordAvailable: true,
    callbackOutcome: "fail-once",
  },
  "misread-label": {
    title: "3. Misread label → correction → comparison updated",
    summary: "The camera misreads “1” as “7”. Choose “No, let me correct it” and type the real wording.",
    labelReading: "Take 7 tablet twice daily with meals",
    recordAvailable: true,
    callbackOutcome: "success",
  },
  "label-matches": {
    title: "4. Label matches record → no false conflict",
    summary: "Different capitals and wording, same instruction.",
    labelReading: "TAKE ONE TABLET TWO TIMES A DAY WITH MEALS.",
    recordAvailable: true,
    callbackOutcome: "success",
  },
  "record-unavailable": {
    title: "5. Record unavailable → limitation and help",
    summary: "The pharmacy record can’t be reached, so nothing is compared.",
    labelReading: null,
    recordAvailable: false,
    callbackOutcome: "success",
  },
  "conflict-unknown": {
    title: "6. Record and label differ → outcome unknown",
    summary: "The first send gets no definite answer. Try again reuses the same request, so nothing is sent twice.",
    labelReading: "Take 2 tablets twice daily with meals",
    recordAvailable: true,
    callbackOutcome: "unknown-once",
  },
};

// ---- Label wording ----------------------------------------------------------

/**
 * Where the current label wording came from (content-model §4 InputSource).
 * "fixture" stands in for a camera reading in the reviewer scenarios.
 */
export type LabelSource = "fixture" | "typed" | "speech-transcript";

// ---- Callback draft & payload (content-model §13) ---------------------------

export const CALLBACK_RECIPIENT = { recipientId: "brightcare-pharmacy-fictional", displayName: "BrightCare Pharmacy" } as const;
/** Fictional and non-routable, like every number in the seed data. */
export const DEFAULT_CALLBACK_NUMBER = careContacts.patientPhone;

/**
 * Exactly what "Check before sharing" shows, and therefore exactly what may be
 * sent. Built only from the confirmed record and the person's confirmed label;
 * only `concernSummary` and `callbackContact` are free for her to edit.
 */
/** Why help is asked for — always the truthful one for what was (or couldn't be) compared. */
export type CallbackReason = "instruction-discrepancy" | "comparison-incomplete" | "record-unavailable";

export type CallbackDraft = {
  recipientId: typeof CALLBACK_RECIPIENT.recipientId;
  patientId: string;
  medicine: { medicineId: string; displayName: string; strengthText: string };
  reason: CallbackReason;
  /** User-reported: her own words (or the default), never a record fact. */
  concernSummary: string;
  /** Null when the record couldn't be reached: nothing is invented to fill it. */
  currentRecord: { instructionText: string; sourceName: string; recordedAt: string; recordVersion: string } | null;
  /** Null when no label wording was confirmed. */
  confirmedLabel: { instructionText: string; labelRevision: number } | null;
  callbackContact: string;
  simulated: true;
};

export type CallbackPayload = CallbackDraft & { requestId: string };

/**
 * The only fields that leave the call, copied one by one from an allowlist —
 * never the session, the transcript, the label photo or audio.
 */
export function buildCallbackPayload(draft: CallbackDraft, requestId: string): CallbackPayload {
  return {
    requestId,
    recipientId: draft.recipientId,
    patientId: draft.patientId,
    medicine: {
      medicineId: draft.medicine.medicineId,
      displayName: draft.medicine.displayName,
      strengthText: draft.medicine.strengthText,
    },
    reason: draft.reason,
    concernSummary: draft.concernSummary,
    currentRecord: draft.currentRecord && {
      instructionText: draft.currentRecord.instructionText,
      sourceName: draft.currentRecord.sourceName,
      recordedAt: draft.currentRecord.recordedAt,
      recordVersion: draft.currentRecord.recordVersion,
    },
    confirmedLabel: draft.confirmedLabel && {
      instructionText: draft.confirmedLabel.instructionText,
      labelRevision: draft.confirmedLabel.labelRevision,
    },
    callbackContact: draft.callbackContact,
    simulated: true,
  };
}

/** One logical request per reviewed version: a retry of the same version reuses its ID. */
export function callbackRequestId(sessionId: string, revision: number): string {
  return `${sessionId}-callback-r${revision}`;
}

export function maskNumber(n: string): string {
  const digits = n.replace(/\D/g, "");
  return digits.length <= 4 ? "••••" : `•••• ${digits.slice(-4)}`;
}

export const isPlausibleNumber = (n: string) => /^\+?[\d\s-]{8,16}$/.test(n.trim());
