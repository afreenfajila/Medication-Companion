import { t as translate, type CopyKey } from "@/lib/content/translations";
import type { LabelAnalysis } from "@/lib/api/schemas";
import { resolveExplanation } from "@/lib/content/explanation";
import { metforminRecord, metforminRecordVersion, patient, recordMedicines, recordSource } from "@/lib/content/seed-record";
import {
  CALLBACK_RECIPIENT,
  DEFAULT_CALLBACK_NUMBER,
  DOSE_SCENARIOS,
  callbackRequestId,
  compareInstructions,
  isPlausibleNumber,
  parseInstruction,
  type CallbackDraft,
  type CallbackReason,
  type Comparison,
  type DoseScenario,
  type InstructionField,
  type LabelSource,
} from "@/lib/dose-check/dose-check";
import { candidateDisplayFor, candidateIdFor, matchLabelInput } from "@/lib/matching/match-record";
import type { HelpReason } from "@/lib/services/reasons";
import type { StudyCondition } from "@/lib/study/study-mode";
import type {
  AuditEvent,
  CandidateDisplay,
  CompanionState,
  ContextualActionId,
  LabelInput,
  MatchStatus,
  Persona,
  SafetyReason,
  UiLanguage,
} from "@/types/content";
import { namesRecordMedicine, routeMessage } from "./intent";

// Explicit, pure session state machine. Every transition is guarded: an event
// that is not legal in the current state returns the SAME session object
// (reference-equal), so callers/tests can detect a blocked transition.

export type HelpKind = "pharmacist-callback" | "family" | "trusted-helper" | "clinic";
export type HelpFlow = {
  kind: HelpKind;
  stage: "confirm" | "sending" | "sent" | "failed" | "info";
  reason: HelpReason;
  /** From the service on success: the callback reference, or who was told. */
  reference?: string;
  contactName?: string;
};

/**
 * The dose-change check (Assignment 4), layered on the call like `helpFlow`.
 * "identify" runs in `listening`/camera/confirm; every later step lives inside
 * `explain`, which is unreachable without a confirmed medicine. It compares the
 * box with the record and can prepare a pharmacist callback. It never resolves
 * the dose: medication status stays "unresolved" whatever happens.
 */
export type DoseCheck = {
  step: "identify" | "label" | "compared" | "record-unavailable";
  /**
   * Label wording waiting to be confirmed (a simulated camera reading, or
   * words typed or heard in the call). Never compared until confirmed.
   */
  reading: string | null;
  /** Where the current wording came from, shown beside it. */
  labelSource: LabelSource | null;
  /** Bumped whenever the label wording changes; a confirmation applies to one revision only. */
  labelRevision: number;
  /** What the person confirmed their box says. Kept apart from the record's own wording. */
  labelText: string | null;
  confirmedLabelRevision: number | null;
  /** The last comparison, tied to the record version and label revision it used. */
  comparison: ComparedResult | null;
  /** "I can prepare a summary..." is on screen. */
  offer: boolean;
  callback: CallbackState | null;
  notice: "nothing-shared" | "conflict-cleared" | null;
};

/** A comparison, stamped with exactly what was compared (site-contract §9, invariant 4). */
export type ComparedResult = Comparison & { recordVersion: string; labelRevision: number | null };

export type CallbackState = {
  /**
   * "failed": the service definitively did not deliver. "unknown": no definite
   * answer (timeout, error) — it may have gone through, so neither is claimed.
   */
  status: "reviewing" | "editing" | "submitting" | "submitted" | "failed" | "unknown" | "cancelled";
  draft: CallbackDraft;
  /** Bumped by any change to the draft: a new version needs a fresh review and has a new request ID. */
  revision: number;
  /** The version "Send" authorised. Cleared by any later change. */
  approvedRevision: number | null;
  reference?: string;
};

export type DoseAction =
  /** New label wording, typed into the panel: shown back for confirmation, never trusted as-is. */
  | { kind: "enter-label"; text: string }
  /** "Yes, that is what the label says" — for the revision on screen only. */
  | { kind: "confirm-label"; revision: number }
  | { kind: "reject-reading" }
  /** "I can't confirm it": nothing can be compared; no conflict is established. */
  | { kind: "cannot-confirm" }
  | { kind: "review-details" }
  | { kind: "offer-callback" }
  | { kind: "accept-offer" }
  | { kind: "decline-offer" }
  | { kind: "edit" }
  | { kind: "cancel-edit" }
  | { kind: "save"; changes: { callbackContact: string; concernSummary: string; labelInstruction: string } }
  | { kind: "send"; revision: number }
  /** Back to the conversation; the medication question is said to stay unresolved. */
  | { kind: "return-to-call" }
  | { kind: "result"; requestId: string; outcome: "submitted" | "failed" | "unknown"; reference?: string }
  | { kind: "dont-send" }
  | { kind: "review-summary" };

export type CameraMode = "preview" | "fallback";
export type CameraIssue = "denied" | "unavailable";

export type Session = {
  persona: Persona;
  language: UiLanguage;
  state: CompanionState;
  callActive: boolean;
  callCount: number;
  sessionId: string;
  /** Transient, in-memory only. Never written to the audit log. */
  userText: string | null;
  /** How `userText` arrived, so the understanding pass never "mishears" a typed message. */
  userInputVia: "typed" | "voice";
  assistantKey: CopyKey;
  contextualActions: ContextualActionId[];
  /** True once `Show medicine` was chosen inside the active call. */
  labelRouteSelected: boolean;
  /**
   * On the camera-permission step: "choose" asks camera, photo or typing (H2);
   * "camera" is the existing camera-consent question. Consent is only ever asked
   * after the person picked "Use camera".
   */
  showMethod: "choose" | "camera";
  cameraMode: CameraMode | null;
  /** Why the live camera is not in use (drives the fallback wording). */
  cameraIssue: CameraIssue | null;
  pendingLabel: LabelInput | null;
  candidate: CandidateDisplay | null;
  matchStatus: MatchStatus | null;
  safetyReason: SafetyReason | null;
  explainStep: 0 | 1 | 2;
  /**
   * The explanation step they were on when they left for safety/help, so
   * "Carry on" returns them to where they left off. Null otherwise.
   */
  resumeExplainStep: 0 | 1 | 2 | null;
  /**
   * The person disputed the record while it was explained ("my doctor said…").
   * The explanation stays; the companion answers from the record and offers
   * pharmacist help or carrying on.
   */
  recordConflict: boolean;
  repeatCount: number;
  /**
   * Increments on every accepted user message. The transcript keys each turn by
   * this, so asking two different questions that happen to get the SAME approved
   * reply still shows two replies — without it the second one looked like the
   * companion had ignored the person.
   */
  turnCount: number;
  /**
   * The user turn the current `listening` reply answers, or null when the line
   * wasn't caused by something the person said (greeting, "another medicine").
   * Only a reply to a turn may be re-worded by the understanding pass.
   */
  replyTo: number | null;
  /** The companion's last question was "did you mean <medicine>?" — a bare yes/no answers it. */
  nameCheckPending: boolean;
  /** Consecutive off-topic turns; the second gets a friendly wrap-up. Any other turn resets it. */
  offTopicStreak: number;
  /**
   * A help request in progress (CLAUDE.md § H4), shown on top of whichever step
   * offered it: confirm → sending → sent | failed, or an info card with a number.
   * Nothing is sent until the person confirms; "sent" only after the service succeeds.
   */
  helpFlow: HelpFlow | null;
  /** Study mode only (set from the server's cookie); null otherwise. Tags every audit event. */
  studyCondition: StudyCondition | null;
  /** Label retries used for the current medicine. One retry, then human help only. */
  labelRetries: number;
  doseCheck: DoseCheck | null;
  /**
   * The page reloaded mid-call (site-contract §10): the call is gone and is not
   * rebuilt. Said once on the start screen; cleared by the next call.
   */
  previousCallInterrupted: boolean;
  /** Reviewer demo page only: the fictional scenario behind the dose check. Null on /companion. */
  doseScenario: DoseScenario | null;
  audit: AuditEvent[];
  auditSeq: number;
};

export type SessionEvent =
  | { type: "SELECT_PERSONA"; persona: Persona }
  | { type: "SET_LANGUAGE"; language: UiLanguage }
  /** From the root layout, which reads the study cookie server-side (study mode only). */
  | { type: "SET_STUDY_CONDITION"; condition: StudyCondition | null }
  | { type: "CALL_START" }
  /** `via`: typed (exactly what she wrote) or voice (speech recognition). Defaults to voice. */
  | { type: "USER_MESSAGE"; text: string; via?: "typed" | "voice" }
  | { type: "SELECT_ROUTE"; route: ContextualActionId }
  /** "Use camera" on the show-medicine choice: next comes the camera-consent question. */
  | { type: "CHOOSE_CAMERA" }
  | { type: "CAMERA_CONSENT"; granted: boolean }
  | { type: "CAMERA_FAILED"; issue: CameraIssue }
  | { type: "SUBMIT_LABEL"; input: LabelInput }
  /** "Choose from my medicines": a medicine picked from the record list — still only a possible match. */
  | { type: "CHOOSE_MEDICINE"; medicineId: string }
  | { type: "RESOLVE_ANALYSIS" } // deterministic demo/typed inputs (local)
  | { type: "ANALYSIS_RESULT"; analysis: LabelAnalysis } // image inputs (server-validated)
  | { type: "ANALYSIS_FAILED" }
  | {
      type: "CONFIRM_MATCH";
      candidateId: string;
      decision: "confirmed" | "denied" | "unsure";
    }
  | { type: "EXPLAIN_STEP"; direction: "next" | "back" }
  | { type: "RECORD_CONFLICT_CHOICE"; choice: "pharmacist" | "carry-on" }
  /** "Does this match what's printed on your label?", asked beside the instruction. */
  | { type: "LABEL_CHECK"; matches: boolean }
  | { type: "UNDERSTOOD" }
  | { type: "NEW_MEDICINE" }
  | { type: "GET_HELP" }
  | { type: "TRY_ANOTHER_LABEL" }
  | { type: "RETURN_TO_CALL" }
  /** Opens a help flow: the confirm/consent step, or the clinic's number. */
  | { type: "HELP_START"; kind: HelpKind }
  | { type: "HELP_CONFIRM"; granted: boolean }
  /** The service's answer to a confirmed request (dispatched by the client after the API call). */
  | { type: "HELP_RESULT"; ok: boolean; reference?: string; contactName?: string }
  | { type: "HELP_RETRY" }
  | { type: "HELP_SHOW_NUMBER" }
  | { type: "HELP_DISMISS" }
  | { type: "REPEAT" }
  | { type: "END_CALL" }
  /** Dose-change check steps (Assignment 4). */
  | { type: "DOSE"; action: DoseAction }
  /** Reviewer controls only: pick a scenario; ends any call so it starts clean. */
  | { type: "SET_DOSE_SCENARIO"; scenario: DoseScenario | null }
  /**
   * The understanding pass's advisory result for one turn: which of the two
   * in-call doors to offer, and whether it asked a name check. The reply TEXT
   * never enters the session — it is display/speech only.
   */
  | {
      type: "AI_REPLY";
      turnCount: number;
      contextualActions: ContextualActionId[];
      checkingMedicineName: boolean;
    };

export type ReduceContext = { now: string };

const AUDIT_LIMIT = 200;
export const MAX_LABEL_RETRIES = 1;
/** After this many consecutive off-topic turns, the companion gently wraps up. */
export const OFF_TOPIC_TURN_CAP = 2;

export function canRetryLabel(s: Pick<Session, "labelRetries">): boolean {
  return s.labelRetries < MAX_LABEL_RETRIES;
}

export function createInitialSession(): Session {
  return {
    persona: "mei-ling",
    language: "en",
    state: "start",
    callActive: false,
    callCount: 0,
    sessionId: "demo-session",
    userText: null,
    userInputVia: "voice",
    assistantKey: "callGreeting",
    contextualActions: [],
    labelRouteSelected: false,
    showMethod: "choose",
    cameraMode: null,
    cameraIssue: null,
    pendingLabel: null,
    candidate: null,
    matchStatus: null,
    safetyReason: null,
    explainStep: 0,
    resumeExplainStep: null,
    recordConflict: false,
    repeatCount: 0,
    turnCount: 0,
    replyTo: null,
    nameCheckPending: false,
    offTopicStreak: 0,
    helpFlow: null,
    studyCondition: null,
    labelRetries: 0,
    doseCheck: null,
    doseScenario: null,
    previousCallInterrupted: false,
    audit: [],
    auditSeq: 0,
  };
}

type AuditInput = {
  eventType: AuditEvent["eventType"];
  summary: string;
  actor?: AuditEvent["actor"];
  route?: AuditEvent["route"];
  validationStatus?: AuditEvent["validationStatus"];
  details?: AuditEvent["details"];
};

function withAudit(s: Session, ctx: ReduceContext, ...events: AuditInput[]): Session {
  let seq = s.auditSeq;
  const added: AuditEvent[] = events.map((e) => {
    seq += 1;
    return {
      id: `evt_${seq}`,
      sessionId: s.sessionId,
      patientId: "patient_mei_ling_tan",
      timestamp: ctx.now,
      eventType: e.eventType,
      actor: e.actor ?? "primary-user",
      summary: e.summary,
      route: e.route ?? "deterministic",
      validationStatus: e.validationStatus ?? "not-applicable",
      // Study sessions tag every event, so the six signals can be read off the timeline.
      details: s.studyCondition ? { ...e.details, studyCondition: s.studyCondition } : (e.details ?? {}),
    };
  });
  return { ...s, auditSeq: seq, audit: [...s.audit, ...added].slice(-AUDIT_LIMIT) };
}

// ---- Selectors / guards -----------------------------------------------------

export function isMatchConfirmed(s: Pick<Session, "matchStatus" | "candidate">): boolean {
  return s.matchStatus === "confirmed" && s.candidate !== null;
}

/**
 * The URL never drives state. A requested `?state=` is honoured only when it
 * equals the session's authoritative state; otherwise the safe actual state
 * is rendered and the caller should redirect to it.
 */
export function guardRequestedState(
  session: Pick<Session, "state">,
  requested: string | null,
): { state: CompanionState; redirected: boolean } {
  const expected = session.state === "start" ? null : session.state;
  return { state: session.state, redirected: (requested ?? null) !== expected };
}

export function pathForState(state: CompanionState): string {
  return state === "start" ? "/companion" : `/companion?state=${state}`;
}

// ---- Transition helpers -----------------------------------------------------

/** Why help is being asked for, from where the person is (sent with the request, never their words). */
function helpReasonFor(s: Session): HelpReason {
  if (s.state === "explain") return "record-conflict";
  if (s.state === "listening") return "wellbeing";
  switch (s.safetyReason) {
    case "unreadable-label":
    case "record-mismatch":
    case "multiple-candidates":
    case "user-unsure":
    case "service-failure":
    case "label-differs":
      return "label-trouble";
    case "unsupported-medical-question":
    case "adverse-effect-question":
      return "medical-question";
    default:
      return "help-requested";
  }
}

/**
 * Closes a help flow. After a request was sent from the safety screen, "Carry on"
 * continues the call where it left off (Recovery); otherwise it just closes.
 */
function closeHelp(s: Session, ctx: ReduceContext, resume: boolean): Session {
  const closed: Session = { ...s, helpFlow: null };
  if (closed.state === "listening") {
    return { ...closed, assistantKey: "anotherMedicineGuide", contextualActions: [], replyTo: null };
  }
  if (resume && closed.state === "safety") return reduceSession(closed, { type: "RETURN_TO_CALL" }, ctx);
  return closed;
}

function enterSafety(
  s: Session,
  ctx: ReduceContext,
  reason: SafetyReason,
  extra: Partial<Session> = {},
  auditDetails: AuditEvent["details"] = {},
): Session {
  const urgent = reason === "urgent-risk";
  const next: Session = {
    ...s,
    ...extra,
    resumeExplainStep: s.state === "explain" ? s.explainStep : null,
    state: "safety",
    safetyReason: reason,
    contextualActions: [],
    helpFlow: null,
    recordConflict: false,
  };
  // The dose check pauses here; its confirmed context is kept for "Carry on".
  const paused: AuditInput[] =
    s.doseCheck && s.state === "explain"
      ? [{ eventType: "support-interruption", summary: "Dose-change check paused for support; context kept", actor: "system" }]
      : [];
  return withAudit(next, ctx, ...paused, {
    eventType: urgent ? "urgent-safety-triggered" : "help-requested",
    summary: urgent
      ? "Urgent-risk wording detected; urgent safety message shown"
      : `Safety escalation shown (${reason})`,
    actor: "system",
    route: "local-fallback",
    validationStatus: "blocked",
    details: { reason, ...auditDetails },
  });
}

function enterExplain(s: Session, ctx: ReduceContext, step: 0 | 1): Session {
  return withAudit(
    { ...s, state: "explain", explainStep: step, contextualActions: [], safetyReason: null },
    ctx,
    {
      eventType: "explanation-viewed",
      summary: `Record-backed explanation viewed (${s.language === "en" ? "English" : "Simplified Chinese"})`,
      actor: "system",
      validationStatus: "passed",
      details: { language: s.language },
    },
  );
}

/**
 * Applies a chosen route (button tap OR the person saying it). Both are an explicit
 * choice made inside an active call, so both may open the camera-permission step.
 */
function applyRoute(
  s: Session,
  ctx: ReduceContext,
  route: "show-medicine" | "ask-schedule",
  via: "button" | "message",
): Session {
  s = { ...s, replyTo: null, nameCheckPending: false, offTopicStreak: 0 };
  const audit: AuditInput = {
    eventType: "route-selected",
    summary:
      route === "show-medicine" ? "Chose “Show medicine”" : "Chose “Ask about my schedule”",
    details: { route, via },
  };
  if (route === "show-medicine") {
    return withAudit(
      { ...s, state: "camera-permission", labelRouteSelected: true, showMethod: "choose", contextualActions: [] },
      ctx,
      audit,
    );
  }
  // ask-schedule: only a confirmed record may authorise schedule content.
  if (isMatchConfirmed(s)) {
    return enterExplain(withAudit(s, ctx, audit), ctx, 1);
  }
  if (s.matchStatus === "possible" && s.candidate) {
    return withAudit({ ...s, state: "confirm-match", contextualActions: [] }, ctx, audit);
  }
  return withAudit(
    { ...s, assistantKey: "scheduleNeedsRecord", contextualActions: ["show-medicine"] },
    ctx,
    audit,
  );
}

// ---- Dose-change check ------------------------------------------------------

const ACTIVE_DRAFT: ReadonlyArray<CallbackState["status"]> = ["reviewing", "editing", "failed"];
const ALL_FIELDS: InstructionField[] = ["amount", "perDay", "timing"];

function labelCorrected(labelRevision: number): AuditInput {
  return { eventType: "label-corrected", summary: "Label wording changed; it needs confirming again", details: { labelRevision } };
}

function newDoseCheck(): DoseCheck {
  return {
    step: "identify",
    reading: null,
    labelSource: null,
    labelRevision: 0,
    labelText: null,
    confirmedLabelRevision: null,
    comparison: null,
    offer: false,
    callback: null,
    notice: null,
  };
}

/**
 * New wording on screen: a new revision, waiting for confirmation. The earlier
 * confirmation and the comparison built on it no longer apply (site-contract §8).
 */
function withReading(d: DoseCheck, text: string, source: LabelSource): DoseCheck {
  return {
    ...d,
    step: "label",
    reading: text.trim().slice(0, 200),
    labelSource: source,
    labelRevision: d.labelRevision + 1,
    labelText: null,
    confirmedLabelRevision: null,
    comparison: null,
  };
}

/**
 * Compared on the record's structured English wording; the person's label as they confirmed it.
 * Always the real fixture: study-mode's deliberately wrong explanation never reaches the dose check.
 */
function compareWithRecord(s: Session, labelText: string, labelRevision: number): ComparedResult {
  const view = resolveExplanation(s, "en");
  return {
    ...compareInstructions(parseInstruction(view?.explanation.instruction), parseInstruction(labelText)),
    recordVersion: metforminRecordVersion,
    labelRevision,
  };
}

/** The truthful reason for help, from what was (or couldn't be) compared. Null when nothing differs. */
function callbackReasonFor(d: DoseCheck): CallbackReason | null {
  if (d.step === "record-unavailable") return "record-unavailable";
  if (d.comparison?.outcome === "conflict") return "instruction-discrepancy";
  if (d.comparison?.outcome === "insufficient") return "comparison-incomplete";
  return null;
}

const CONCERN_KEY: Record<CallbackReason, CopyKey> = {
  "instruction-discrepancy": "doseConcernDefault",
  "comparison-incomplete": "doseConcernIncomplete",
  "record-unavailable": "doseConcernUnavailable",
};

/**
 * Record facts come from the confirmed record only; the person can't edit them.
 * Whatever wasn't available or confirmed is left out (null), never filled in.
 */
function newDraft(s: Session, d: DoseCheck, reason: CallbackReason): CallbackDraft | null {
  const view = resolveExplanation(s, s.language);
  if (!view || !s.candidate) return null;
  return {
    recipientId: CALLBACK_RECIPIENT.recipientId,
    patientId: patient.id,
    medicine: {
      medicineId: metforminRecord.id,
      displayName: metforminRecord.identity.genericName,
      strengthText: metforminRecord.identity.strength,
    },
    reason,
    concernSummary: translate(s.language, CONCERN_KEY[reason]),
    currentRecord:
      reason === "record-unavailable"
        ? null
        : {
            instructionText: view.explanation.instruction,
            sourceName: recordSource.name,
            recordedAt: recordSource.verifiedAt,
            recordVersion: metforminRecordVersion,
          },
    confirmedLabel:
      d.labelText !== null && d.confirmedLabelRevision !== null
        ? { instructionText: d.labelText, labelRevision: d.confirmedLabelRevision }
        : null,
    callbackContact: DEFAULT_CALLBACK_NUMBER,
    simulated: true,
  };
}

/** The medicine is confirmed: show the record (or say it can't be reached) and ask about the box. */
function enterDoseRecord(s: Session, ctx: ReduceContext): Session {
  const scenario = s.doseScenario ? DOSE_SCENARIOS[s.doseScenario] : null;
  const available = scenario?.recordAvailable ?? true;
  const base: DoseCheck = { ...(s.doseCheck ?? newDoseCheck()), step: available ? "label" : "record-unavailable" };
  // A reviewer scenario's reading stands in for the camera: still only a reading to confirm.
  const doseCheck = available && scenario?.labelReading ? withReading(base, scenario.labelReading, "fixture") : base;
  const next: Session = {
    ...s,
    state: "explain",
    explainStep: 0,
    contextualActions: [],
    safetyReason: null,
    recordConflict: false,
    doseCheck,
  };
  return withAudit(
    next,
    ctx,
    available
      ? {
          eventType: "explanation-viewed",
          summary: "Current record shown for comparison with the box label",
          actor: "system",
          validationStatus: "passed",
          details: { language: s.language, doseCheck: true, recordVersion: metforminRecordVersion },
        }
      : {
          eventType: "service-fallback-used",
          summary: "Pharmacy record unavailable; nothing compared, human help offered",
          actor: "system",
          route: "local-fallback",
          validationStatus: "blocked",
        },
  );
}

/**
 * Settles a comparison. A callback draft still being reviewed follows a new
 * conflict (a fresh version that needs a fresh review) or, if the difference is
 * gone, is set aside: there is nothing left to ask about.
 */
function settleComparison(
  s: Session,
  ctx: ReduceContext,
  d: DoseCheck,
  comparison: ComparedResult,
  label: { text: string; revision: number } | null,
): Session {
  const cb = d.callback;
  let callback: CallbackState | null = null;
  let notice: DoseCheck["notice"] = null;
  const newReason = callbackReasonFor({ ...d, step: "compared", comparison });
  if (cb && ACTIVE_DRAFT.includes(cb.status)) {
    // The summary only follows a correction that keeps the same reason. Otherwise
    // it no longer says what is true, and is set aside; a new one can be asked for.
    if (newReason === cb.draft.reason) {
      const draft: CallbackDraft = {
        ...cb.draft,
        confirmedLabel: label ? { instructionText: label.text, labelRevision: label.revision } : null,
      };
      const changed = JSON.stringify(draft) !== JSON.stringify(cb.draft);
      callback = {
        ...cb,
        draft,
        status: "reviewing",
        revision: changed ? cb.revision + 1 : cb.revision,
        approvedRevision: changed ? null : cb.approvedRevision,
      };
    } else {
      notice = "conflict-cleared";
    }
  }
  return withAudit(
    {
      ...s,
      doseCheck: {
        ...d,
        step: "compared",
        reading: null,
        labelText: label?.text ?? null,
        confirmedLabelRevision: label?.revision ?? null,
        comparison,
        offer: false,
        callback,
        notice,
      },
    },
    ctx,
    ...(label
      ? [{ eventType: "label-confirmed" as const, summary: "Label wording confirmed by the person (not clinical verification)", details: { labelRevision: label.revision } }]
      : []),
    {
      eventType: "comparison-completed",
      summary: `Box label compared with the record: ${comparison.outcome}`,
      actor: "system",
      validationStatus: comparison.outcome === "match" ? "passed" : "blocked",
      // Outcome, field names and versions only, never the wording.
      details: {
        outcome: comparison.outcome,
        fields:
          comparison.outcome === "conflict"
            ? comparison.differing.join(",")
            : comparison.outcome === "insufficient"
              ? comparison.missing.join(",")
              : null,
        recordVersion: comparison.recordVersion,
        labelRevision: comparison.labelRevision,
        draftSetAside: notice === "conflict-cleared",
      },
    },
  );
}

function reduceDose(s: Session, action: DoseAction, ctx: ReduceContext): Session {
  const d = s.doseCheck;
  if (!d || !s.callActive) return s;
  const cb = d.callback;
  const set = (patch: Partial<DoseCheck>): Session => ({ ...s, doseCheck: { ...d, ...patch } });
  const setCb = (patch: Partial<CallbackState>): Session => (cb ? set({ callback: { ...cb, ...patch } }) : s);
  const noLiveDraft = !cb || cb.status === "cancelled";

  // The service's answer lands even if she stepped away to the help screen meanwhile:
  // dropping it there left the request stuck on "Sending…" when she came back.
  // Late answers for an ended call, an edited draft, or a finished request are dropped.
  if (action.kind === "result") {
    if (cb?.status !== "submitting" || action.requestId !== callbackRequestId(s.sessionId, cb.revision)) return s;
    if (action.outcome === "failed") {
      return withAudit(setCb({ status: "failed" }), ctx, {
        eventType: "callback-failed",
        summary: "Callback request not delivered (simulated); no one notified, details kept",
        actor: "system",
        route: "local-fallback",
        validationStatus: "blocked",
        details: { draftRevision: cb.revision, simulated: true },
      });
    }
    if (action.outcome === "unknown") {
      return withAudit(setCb({ status: "unknown" }), ctx, {
        eventType: "callback-outcome-unknown",
        summary: "Callback request outcome could not be confirmed (simulated); details kept",
        actor: "system",
        route: "local-fallback",
        validationStatus: "not-applicable",
        details: { draftRevision: cb.revision, simulated: true },
      });
    }
    return withAudit(setCb({ status: "submitted", reference: action.reference }), ctx, {
      eventType: "callback-submitted",
      summary: `Pharmacist callback request submitted (simulated, ${action.reference ?? "no reference"}); medication still unresolved`,
      details: { draftRevision: cb.revision, reason: cb.draft.reason, simulated: true, reference: action.reference ?? null },
    });
  }

  // Every other step needs the confirmed medicine, on the call itself.
  if (s.state !== "explain" || !isMatchConfirmed(s)) return s;
  // Nothing about the label can change while a request is out, or after it went.
  const labelLocked = cb !== null && !ACTIVE_DRAFT.includes(cb.status) && cb.status !== "cancelled";

  switch (action.kind) {
    case "enter-label": {
      const text = action.text.trim();
      if (d.step !== "label" || !text || labelLocked) return s;
      const next = set(withReading(d, text, "typed"));
      return d.labelRevision > 0 ? withAudit(next, ctx, labelCorrected(d.labelRevision + 1)) : next;
    }
    case "confirm-label": {
      // Only the exact wording on screen: a stale tap for an older revision does nothing.
      if (d.step !== "label" || !d.reading || action.revision !== d.labelRevision || labelLocked) return s;
      const text = d.reading;
      return settleComparison(s, ctx, d, compareWithRecord(s, text, d.labelRevision), { text, revision: d.labelRevision });
    }
    case "reject-reading":
      return d.step === "label" && d.reading ? set({ reading: null }) : s;
    case "cannot-confirm":
      // Missing information never becomes agreement, and never a conflict either.
      if (d.step !== "label" || labelLocked) return s;
      return settleComparison(
        s,
        ctx,
        d,
        { outcome: "insufficient", missing: ALL_FIELDS, recordVersion: metforminRecordVersion, labelRevision: null },
        null,
      );
    case "review-details":
      if (d.step !== "compared" || !noLiveDraft) return s;
      return set({ step: "label", reading: d.labelText, offer: false, notice: null, callback: null });
    case "offer-callback":
      // A conflict, an incomplete comparison, or an unreachable record — never a match.
      if ((d.step !== "compared" && d.step !== "record-unavailable") || !callbackReasonFor(d) || !noLiveDraft) return s;
      return set({ offer: true, notice: null });
    case "decline-offer":
      return d.offer ? set({ offer: false, notice: "nothing-shared" }) : s;
    case "accept-offer": {
      const reason = callbackReasonFor(d);
      if (!d.offer || !reason) return s;
      const draft = newDraft(s, d, reason);
      if (!draft) return s;
      const revision = (cb?.revision ?? 0) + 1;
      return withAudit(
        set({ offer: false, notice: null, callback: { status: "reviewing", draft, revision, approvedRevision: null } }),
        ctx,
        { eventType: "callback-draft-created", summary: "Callback summary prepared for review", details: { reason, draftRevision: revision, simulated: true } },
      );
    }
    case "edit":
      return cb && (cb.status === "reviewing" || cb.status === "failed") ? setCb({ status: "editing" }) : s;
    case "cancel-edit":
      return cb?.status === "editing" ? setCb({ status: "reviewing" }) : s;
    case "save": {
      if (cb?.status !== "editing") return s;
      const callbackContact = action.changes.callbackContact.trim();
      const concernSummary = action.changes.concernSummary.trim().slice(0, 200);
      const labelInstruction = action.changes.labelInstruction.trim().slice(0, 200);
      if (!isPlausibleNumber(callbackContact) || !concernSummary) return s;
      if (cb.draft.confirmedLabel && !labelInstruction) return s;
      // The record is not in `changes`: nothing the person types can overwrite it.
      const draft: CallbackDraft = { ...cb.draft, callbackContact, concernSummary };
      const changed = JSON.stringify(draft) !== JSON.stringify(cb.draft);
      const callback: CallbackState = {
        ...cb,
        draft,
        status: "reviewing",
        revision: changed ? cb.revision + 1 : cb.revision,
        approvedRevision: changed ? null : cb.approvedRevision,
      };
      // New label wording is a correction: shown back as a new revision to confirm,
      // then compared again. The summary waits for that, unapproved.
      const edited: AuditInput[] = changed
        ? [{ eventType: "callback-draft-edited", summary: "Callback summary changed; it needs a fresh review", details: { draftRevision: callback.revision } }]
        : [];
      if (cb.draft.confirmedLabel && labelInstruction !== cb.draft.confirmedLabel.instructionText) {
        return withAudit(
          set({ ...withReading(d, labelInstruction, "typed"), callback: { ...callback, approvedRevision: null } }),
          ctx,
          ...edited,
          labelCorrected(d.labelRevision + 1),
        );
      }
      return withAudit(set({ callback }), ctx, ...edited);
    }
    case "send":
      // Send authorises exactly the version on screen; a stale or repeated tap does nothing.
      // From "unknown", trying again reuses the same request ID, so it can't make a second request.
      if (!cb || !["reviewing", "failed", "unknown"].includes(cb.status) || action.revision !== cb.revision) return s;
      if (d.step === "label") return s; // a label correction is still waiting to be confirmed
      return withAudit(
        setCb({ status: "submitting", approvedRevision: cb.revision }),
        ctx,
        { eventType: "callback-approved", summary: "Send pressed for the reviewed summary", details: { draftRevision: cb.revision, simulated: true } },
        ...(cb.status === "reviewing"
          ? []
          : [{ eventType: "callback-retried" as const, summary: "Same request tried again", details: { draftRevision: cb.revision, simulated: true } }]),
      );
    case "return-to-call":
      // Back to the conversation. The difference is not resolved, and the companion says so.
      if (cb?.status === "submitting" || (d.step !== "compared" && d.step !== "record-unavailable")) return s;
      return withAudit(
        { ...s, state: "listening", doseCheck: null, assistantKey: "doseBackToCall", contextualActions: [], replyTo: null },
        ctx,
        { eventType: "dose-check-left-unresolved", summary: "Back to the call; the medication question is still unresolved" },
      );
    case "dont-send":
      if (!cb || !ACTIVE_DRAFT.includes(cb.status)) return s;
      return withAudit(
        // A label correction still waiting for confirmation stays on screen to finish.
        set({ callback: { ...cb, status: "cancelled" }, notice: "nothing-shared" }),
        ctx,
        { eventType: "callback-cancelled", summary: "“Don’t send”: nothing shared", details: { draftRevision: cb.revision, simulated: true } },
      );
    case "review-summary":
      return cb?.status === "failed" ? setCb({ status: "reviewing" }) : s;
  }
}

// ---- Reducer ----------------------------------------------------------------

export function reduceSession(s: Session, event: SessionEvent, ctx: ReduceContext): Session {
  switch (event.type) {
    case "SELECT_PERSONA": {
      if (s.persona === event.persona && s.audit.some((e) => e.eventType === "persona-selected")) {
        return s;
      }
      return withAudit({ ...s, persona: event.persona }, ctx, {
        eventType: "persona-selected",
        summary: `Persona selected: ${event.persona}`,
        actor: event.persona === "caregiver" ? "caregiver" : "primary-user",
        details: { persona: event.persona },
      });
    }

    case "SET_LANGUAGE": {
      if (s.language === event.language) return s;
      // Language changes content only; state, candidate and confirmation persist.
      return withAudit({ ...s, language: event.language }, ctx, {
        eventType: "language-changed",
        summary: `Language changed to ${event.language}`,
        details: { language: event.language },
      });
    }

    case "SET_STUDY_CONDITION": {
      if (s.studyCondition === event.condition) return s;
      return { ...s, studyCondition: event.condition };
    }

    case "CALL_START": {
      if (s.state !== "start" || s.callActive) return s;
      const callCount = s.callCount + 1;
      return withAudit(
        {
          ...s,
          state: "listening",
          callActive: true,
          callCount,
          sessionId: `demo-call-${callCount}`,
          userText: null,
          assistantKey: "callGreeting",
          contextualActions: [],
          labelRouteSelected: false,
          cameraMode: null,
          cameraIssue: null,
          pendingLabel: null,
          candidate: null,
          matchStatus: null,
          safetyReason: null,
          explainStep: 0,
          helpFlow: null,
          labelRetries: 0,
          doseCheck: null,
          previousCallInterrupted: false,
        },
        ctx,
        { eventType: "call-started", summary: "Call started", details: { callCount } },
      );
    }

    case "USER_MESSAGE": {
      const text = event.text.trim();
      if (!s.callActive || text.length === 0) return s;
      const routed = routeMessage(text, {
        matchConfirmed: isMatchConfirmed(s),
        nameCheckPending: s.state === "listening" && s.nameCheckPending,
        explaining: s.state === "explain",
      });
      // One accepted message = one turn, whatever it routes to. Counted here so
      // every path below (safety, route, explain, ordinary reply) carries it.
      const heard: Session = {
        ...s,
        userText: text,
        userInputVia: event.via ?? "voice",
        turnCount: s.turnCount + 1,
        replyTo: null,
        nameCheckPending: false,
        offTopicStreak: routed.intent === "off-topic" ? s.offTopicStreak + 1 : 0,
        helpFlow: null, // moving on without answering a help question is a "not now"
      };

      // Urgent-risk overrides the normal path from ANY active-call state.
      if (routed.intent === "urgent-risk") {
        return enterSafety(heard, ctx, "urgent-risk");
      }

      // Unsupported medical questions and human-help requests also leave the normal path
      // from any active state, so a spoken "should I stop taking it?" is never ignored.
      if (routed.safetyReason && s.state !== "listening") {
        if (s.state === "start" || s.state === "safety" || s.state === "analyzing") return s;
        const keep = s.matchStatus === "confirmed";
        return enterSafety(
          heard,
          ctx,
          routed.safetyReason,
          {
            candidate: keep ? s.candidate : null,
            matchStatus: keep ? s.matchStatus : null,
            pendingLabel: null,
          },
          { intent: routed.intent },
        );
      }
      if (s.state === "explain" && isMatchConfirmed(s)) {
        // In the dose check, words said on the "what does your box say?" step are a
        // reading to confirm, never a confirmed label on their own.
        if (s.doseCheck) {
          if (s.doseCheck.step !== "label") return s;
          const read: Session = { ...heard, doseCheck: withReading(s.doseCheck, text, event.via === "typed" ? "typed" : "speech-transcript") };
          return s.doseCheck.labelRevision > 0 ? withAudit(read, ctx, labelCorrected(s.doseCheck.labelRevision + 1)) : read;
        }
        if (routed.intent === "dose-change") {
          return enterDoseRecord(
            withAudit({ ...heard, doseCheck: newDoseCheck() }, ctx, {
              eventType: "dose-check-started",
              summary: "Person said their medicine changed; label-vs-record check started",
            }),
            ctx,
          );
        }
      }
      // "My doctor said…": stay on the explanation and answer from the record itself.
      // The record is never changed, hidden or softened, and no model is asked.
      if (routed.intent === "record-conflict" && s.state === "explain" && isMatchConfirmed(s)) {
        return withAudit({ ...heard, recordConflict: true }, ctx, {
          eventType: "record-conflict-raised",
          summary: "Person said the record differs from what they were told; record shown with pharmacist option",
          details: { intent: routed.intent },
        });
      }
      if (s.state !== "listening") return s;

      const base: Session = heard;
      if (routed.safetyReason) {
        return enterSafety(base, ctx, routed.safetyReason, {}, { intent: routed.intent });
      }
      // "My doctor changed it, but the box says the old amount": compare, never resolve.
      if (routed.intent === "dose-change") {
        const started = withAudit({ ...base, doseCheck: newDoseCheck() }, ctx, {
          eventType: "dose-check-started",
          summary: "Person said their medicine changed; label-vs-record check started",
        });
        if (isMatchConfirmed(s)) return enterDoseRecord(started, ctx);
        // Named already: straight to "is this the medicine?", still only a possible match.
        if (namesRecordMedicine(text)) {
          const display = candidateDisplayFor(metforminRecord);
          return withAudit({ ...started, state: "confirm-match", candidate: display, matchStatus: "possible" }, ctx, {
            eventType: "candidate-presented",
            summary: `Possible match from the name said: ${display.medicineName}`,
            route: "typed-input",
            validationStatus: "passed",
          });
        }
        return { ...started, assistantKey: routed.assistantKey, contextualActions: routed.contextualActions, replyTo: null };
      }
      // "I want to show the medicine" / "my schedule": saying it is the choice.
      if (routed.route) return applyRoute(base, ctx, routed.route, "message");
      if (routed.toExplain && isMatchConfirmed(base)) {
        return enterExplain(base, ctx, 1);
      }
      // Two off-topic turns in a row: a friendly wrap-up instead of a third redirect.
      const wrapUp = base.offTopicStreak >= OFF_TOPIC_TURN_CAP;
      const assistantKey: CopyKey = wrapUp ? "offTopicWrapUp" : routed.assistantKey;
      const contextualActions: ContextualActionId[] = wrapUp ? ["show-medicine", "end-call"] : routed.contextualActions;
      return withAudit(
        {
          ...base,
          assistantKey,
          contextualActions,
          replyTo: base.turnCount,
          nameCheckPending: assistantKey === "medicineNameCheck",
        },
        ctx,
        {
          eventType: "message-classified",
          summary: `Typed message understood: ${routed.intent}`,
          actor: "system",
          route: "typed-input",
          validationStatus: "passed",
          // Off-topic and wellbeing turns keep the category only — nothing personal.
          details: routed.category
            ? { intent: routed.intent, category: routed.category, actionsOffered: contextualActions.join(",") }
            : {
                intent: routed.intent,
                actionsOffered: contextualActions.join(",") || "none",
                characters: text.length, // length only — never the raw text
              },
        },
      );
    }

    case "AI_REPLY": {
      // Only for the reply it was computed for: a later turn, a route taken, or
      // any state change since makes it stale, and it is dropped.
      if (!s.callActive || s.state !== "listening") return s;
      if (s.replyTo === null || s.replyTo !== event.turnCount || s.turnCount !== event.turnCount) return s;
      const actions = event.contextualActions.filter(
        (a, i, all): a is ContextualActionId =>
          (a === "show-medicine" || a === "ask-schedule") && all.indexOf(a) === i,
      );
      return withAudit(
        { ...s, contextualActions: actions, nameCheckPending: event.checkingMedicineName },
        ctx,
        {
          eventType: "message-classified",
          summary: "Reply worded by the understanding pass (advisory; no gate changed)",
          actor: "system",
          route: "claude-understanding",
          validationStatus: "passed",
          details: {
            actionsOffered: actions.join(",") || "none",
            nameCheck: event.checkingMedicineName,
          },
        },
      );
    }

    case "SELECT_ROUTE": {
      // Button path: the action must have been offered during this active call.
      if (!s.callActive || s.state !== "listening") return s;
      if (!s.contextualActions.includes(event.route)) return s;
      if (event.route === "end-call") return reduceSession(s, { type: "END_CALL" }, ctx);
      if (event.route === "carry-on") {
        return { ...s, assistantKey: "anotherMedicineGuide", contextualActions: [], replyTo: null };
      }
      if (event.route === "ask-family") return reduceSession(s, { type: "HELP_START", kind: "family" }, ctx);
      return applyRoute(s, ctx, event.route, "button");
    }

    case "CHOOSE_CAMERA": {
      if (s.state !== "camera-permission" || s.showMethod !== "choose") return s;
      return { ...s, showMethod: "camera" };
    }

    case "CAMERA_CONSENT": {
      // CAMERA_PERMISSION is only reachable via SELECT_ROUTE("show-medicine"), and the
      // consent question only after the person picked "Use camera".
      if (s.state !== "camera-permission" || !s.labelRouteSelected || s.showMethod !== "camera") return s;
      if (event.granted) {
        return withAudit(
          { ...s, state: "camera-guidance", cameraMode: "preview", cameraIssue: null },
          ctx,
          {
            eventType: "camera-consent-granted",
            summary: "Camera consent given (local preview only)",
            details: { consent: true },
          },
        );
      }
      // Denial is never a dead end: photo, record-list and typed fallbacks open.
      return withAudit({ ...s, state: "camera-guidance", cameraMode: "fallback", cameraIssue: null }, ctx, {
        eventType: "camera-consent-declined",
        summary: "Camera declined; photo, record-list and typed fallbacks offered",
        route: "local-fallback",
      });
    }

    case "CAMERA_FAILED": {
      // Only meaningful while a live preview was expected.
      if (s.state !== "camera-guidance" || s.cameraMode !== "preview") return s;
      return withAudit({ ...s, cameraMode: "fallback", cameraIssue: event.issue }, ctx, {
        eventType: "service-fallback-used",
        summary:
          event.issue === "denied"
            ? "Camera blocked by the browser; fallback options offered"
            : "No camera available; fallback options offered",
        actor: "system",
        route: "local-fallback",
        details: { issue: event.issue },
      });
    }

    case "SUBMIT_LABEL": {
      const input = event.input;
      // From the camera step, anything. From the show-medicine choice, only what
      // needs no camera: a chosen photo or typed details (a camera still can't get
      // here without consent).
      const noCamera = input.mode === "typed" || (input.mode === "image" && input.source === "upload");
      if (s.state !== "camera-guidance" && !(s.state === "camera-permission" && noCamera)) return s;
      return withAudit({ ...s, state: "analyzing", pendingLabel: input }, ctx, {
        eventType: "label-submitted",
        summary: "Label submitted for checking",
        route:
          input.mode === "demo"
            ? "deterministic"
            : input.mode === "typed"
              ? "typed-input"
              : "claude-vision",
        // Never the typed text or image content — only the input mode/source.
        details: {
          mode: input.mode,
          detail:
            input.mode === "demo"
              ? input.demoAssetId
              : input.mode === "image"
                ? input.source
                : null,
        },
      });
    }

    case "CHOOSE_MEDICINE": {
      // Offered beside the camera (after "Not now", or another try). Picking one is a
      // possible match like any other: it still has to be confirmed before anything is explained.
      if (s.state !== "camera-guidance") return s;
      const record = recordMedicines.find((m) => m.id === event.medicineId);
      if (!record) return s;
      const display = candidateDisplayFor(record);
      return withAudit({ ...s, state: "confirm-match", candidate: display, matchStatus: "possible" }, ctx, {
        eventType: "candidate-presented",
        summary: `Possible match chosen from the record list: ${display.medicineName}`,
        route: "record-list",
        validationStatus: "passed",
      });
    }

    case "ANALYSIS_RESULT": {
      if (s.state !== "analyzing" || s.pendingLabel?.mode !== "image") return s;
      const a = event.analysis;
      const routeAudit = { route: "claude-vision" as const, actor: "system" as const };

      if (a.outcome === "candidate") {
        // Trust nothing but the candidate id: display text comes from the LOCAL record.
        if (a.candidate?.candidateId !== candidateIdFor(metforminRecord)) {
          return reduceSession(s, { type: "ANALYSIS_FAILED" }, ctx);
        }
        const display = candidateDisplayFor(metforminRecord);
        return withAudit(
          { ...s, pendingLabel: null, state: "confirm-match", candidate: display, matchStatus: "possible" },
          ctx,
          {
            eventType: "label-analysis-complete",
            summary: "Label check complete: possible match found",
            validationStatus: "passed",
            details: { outcome: "candidate" },
            ...routeAudit,
          },
          {
            eventType: "candidate-presented",
            summary: `Possible match presented: ${display.medicineName}`,
            validationStatus: "passed",
            ...routeAudit,
          },
        );
      }

      const outcome = a.outcome === "no-match" || a.outcome === "ambiguous" ? a.outcome : "unreadable";
      const reason: SafetyReason =
        outcome === "unreadable"
          ? "unreadable-label"
          : outcome === "ambiguous"
            ? "multiple-candidates"
            : "record-mismatch";
      const analysed = withAudit({ ...s, pendingLabel: null }, ctx, {
        eventType: "label-analysis-complete",
        summary: `Label check complete: ${outcome}. Instructions blocked`,
        validationStatus: "blocked",
        details: { outcome, reasonCode: a.reasonCode ?? null },
        ...routeAudit,
      });
      return enterSafety(analysed, ctx, reason, { candidate: null, matchStatus: outcome });
    }

    case "ANALYSIS_FAILED": {
      // Service/network/validation failure: block instructions, offer fallbacks.
      if (s.state !== "analyzing") return s;
      const failed = withAudit({ ...s, pendingLabel: null }, ctx, {
        eventType: "service-fallback-used",
        summary: "Photo could not be read; local fallback options offered. Instructions blocked",
        actor: "system",
        route: "local-fallback",
        validationStatus: "blocked",
      });
      return enterSafety(failed, ctx, "service-failure", { candidate: null, matchStatus: null });
    }

    case "RESOLVE_ANALYSIS": {
      // Images are resolved only by ANALYSIS_RESULT (server-validated), never locally.
      if (s.state !== "analyzing" || !s.pendingLabel || s.pendingLabel.mode === "image") return s;
      const result = matchLabelInput(s.pendingLabel);
      const cleared: Partial<Session> = { pendingLabel: null };

      if (result.outcome === "candidate") {
        return withAudit(
          {
            ...s,
            ...cleared,
            state: "confirm-match",
            candidate: result.display,
            matchStatus: "possible",
          },
          ctx,
          {
            eventType: "label-analysis-complete",
            summary: "Label check complete: possible match found",
            actor: "system",
            validationStatus: "passed",
            details: { outcome: "candidate", score: result.score },
          },
          {
            eventType: "candidate-presented",
            summary: `Possible match presented: ${result.display.medicineName}`,
            actor: "system",
            validationStatus: "passed",
          },
        );
      }

      const reason: SafetyReason =
        result.outcome === "unreadable"
          ? "unreadable-label"
          : result.outcome === "ambiguous"
            ? "multiple-candidates"
            : "record-mismatch";
      const analysed = withAudit({ ...s, ...cleared }, ctx, {
        eventType: "label-analysis-complete",
        summary: `Label check complete: ${result.outcome}. Instructions blocked`,
        actor: "system",
        validationStatus: "blocked",
        details: { outcome: result.outcome, reason: result.reason },
      });
      return enterSafety(analysed, ctx, reason, {
        candidate: null,
        matchStatus: result.outcome,
      });
    }

    case "CONFIRM_MATCH": {
      // Confirmation gate: only a currently-presented possible candidate.
      if (
        s.state !== "confirm-match" ||
        s.matchStatus !== "possible" ||
        !s.candidate ||
        s.candidate.candidateId !== event.candidateId
      ) {
        return s;
      }
      if (event.decision === "confirmed") {
        const confirmed = withAudit({ ...s, matchStatus: "confirmed" }, ctx, {
          eventType: "candidate-confirmed",
          summary: "User confirmed the possible match",
          validationStatus: "passed",
        });
        return confirmed.doseCheck ? enterDoseRecord(confirmed, ctx) : enterExplain(confirmed, ctx, 0);
      }
      const denied = withAudit(s, ctx, {
        eventType: "candidate-denied",
        summary:
          event.decision === "denied"
            ? "User said this is not the medicine (“No, try again”)"
            : "User said they are not sure",
        validationStatus: "blocked",
        details: { decision: event.decision },
      });
      // Dose check: "No, that's not it" goes straight back to identifying the medicine (once).
      if (s.doseCheck && event.decision === "denied" && canRetryLabel(s)) {
        return {
          ...denied,
          state: "camera-permission",
          showMethod: "choose",
          labelRouteSelected: true,
          candidate: null,
          matchStatus: null,
          labelRetries: s.labelRetries + 1,
        };
      }
      return enterSafety(denied, ctx, "user-unsure", {
        candidate: null,
        matchStatus: event.decision,
      });
    }

    case "EXPLAIN_STEP": {
      if (s.state !== "explain" || !isMatchConfirmed(s) || s.doseCheck) return s;
      const step = Math.min(2, Math.max(0, s.explainStep + (event.direction === "next" ? 1 : -1)));
      if (step === s.explainStep) return s;
      return { ...s, explainStep: step as 0 | 1 | 2, recordConflict: false };
    }

    case "RECORD_CONFLICT_CHOICE": {
      if (s.state !== "explain" || !s.recordConflict || !isMatchConfirmed(s)) return s;
      if (event.choice === "carry-on") return { ...s, recordConflict: false };
      // "Ask a pharmacist to call me": the callback flow, on top of the explanation.
      return {
        ...s,
        recordConflict: false,
        helpFlow: { kind: "pharmacist-callback", stage: "confirm", reason: "record-conflict" },
      };
    }

    case "LABEL_CHECK": {
      // Asked beside the instruction (step 1), the only step that shows it.
      if (s.state !== "explain" || s.explainStep !== 1 || s.recordConflict || !isMatchConfirmed(s) || s.doseCheck) {
        return s;
      }
      const answered = withAudit(s, ctx, {
        eventType: "label-check-answered",
        summary: event.matches ? "Person said the label matches the record" : "Person said the label looks different",
        validationStatus: event.matches ? "passed" : "blocked",
        details: { matches: event.matches },
      });
      if (event.matches) return { ...answered, explainStep: 2 };
      // A label that disagrees with the record: the record isn't trusted for this medicine any more.
      return enterSafety(answered, ctx, "label-differs", { candidate: null, matchStatus: null });
    }

    case "UNDERSTOOD": {
      if (s.state !== "explain" || !isMatchConfirmed(s) || s.doseCheck) return s;
      return withAudit({ ...s, state: "complete", recordConflict: false }, ctx, {
        eventType: "understanding-confirmed",
        summary: "User said “I understand”",
      });
    }

    case "NEW_MEDICINE": {
      if (!s.callActive || (s.state !== "explain" && s.state !== "complete")) return s;
      return {
        ...s,
        state: "listening",
        userText: null,
        assistantKey: "anotherMedicineGuide",
        contextualActions: [],
        replyTo: null,
        nameCheckPending: false,
        labelRouteSelected: false,
        cameraMode: null,
        cameraIssue: null,
        candidate: null,
        matchStatus: null, // a new medicine must pass the confirmation gate again
        explainStep: 0,
        recordConflict: false,
        labelRetries: 0,
        doseCheck: null,
      };
    }

    case "GET_HELP": {
      if (!s.callActive || s.state === "start" || s.state === "safety") return s;
      // A merely-possible candidate is dropped; a confirmed one is kept.
      const keepCandidate = s.matchStatus === "confirmed";
      return enterSafety(s, ctx, "help-requested", {
        candidate: keepCandidate ? s.candidate : null,
        matchStatus: keepCandidate ? s.matchStatus : null,
        pendingLabel: null,
      });
    }

    case "TRY_ANOTHER_LABEL": {
      if (
        s.state !== "safety" ||
        !s.labelRouteSelected ||
        s.safetyReason === "urgent-risk" ||
        !canRetryLabel(s)
      ) {
        return s;
      }
      return {
        ...s,
        labelRetries: s.labelRetries + 1,
        resumeExplainStep: null,
        state: "camera-guidance",
        safetyReason: null,
        helpFlow: null,
        cameraMode: s.cameraMode ?? "fallback",
        candidate: null,
        matchStatus: null,
      };
    }

    case "RETURN_TO_CALL": {
      if (s.state !== "safety" || !s.callActive || s.safetyReason === "urgent-risk") return s;
      // Recovery: back to the explanation step they left, when the record is still confirmed.
      if (s.resumeExplainStep !== null && isMatchConfirmed(s)) {
        return {
          ...s,
          state: "explain",
          explainStep: s.resumeExplainStep,
          resumeExplainStep: null,
          safetyReason: null,
          helpFlow: null,
          contextualActions: [],
        };
      }
      return {
        ...s,
        state: "listening",
        safetyReason: null,
        helpFlow: null,
        assistantKey: "anotherMedicineGuide",
        contextualActions: [],
        replyTo: null,
        nameCheckPending: false,
        labelRouteSelected: false,
        resumeExplainStep: null,
      };
    }

    case "HELP_START": {
      // Offered on the non-urgent safety options (all kinds), and as "Let my family
      // know" after the wellbeing reply. Never on the urgent path (§ I, on hold).
      const fromSafety = s.state === "safety" && s.safetyReason !== "urgent-risk";
      const fromWellbeing =
        s.state === "listening" && event.kind === "family" && s.contextualActions.includes("ask-family");
      if (!s.callActive || s.helpFlow || !(fromSafety || fromWellbeing)) return s;
      return {
        ...s,
        helpFlow: { kind: event.kind, stage: event.kind === "clinic" ? "info" : "confirm", reason: helpReasonFor(s) },
      };
    }

    case "HELP_CONFIRM": {
      if (s.helpFlow?.stage !== "confirm") return s;
      if (!event.granted) return closeHelp(s, ctx, false);
      // Consent given: the client now sends the request. Nothing is "sent" until the service says so.
      return { ...s, helpFlow: { ...s.helpFlow, stage: "sending" } };
    }

    case "HELP_RESULT": {
      const flow = s.helpFlow;
      if (flow?.stage !== "sending") return s;
      if (!event.ok) {
        return withAudit({ ...s, helpFlow: { ...flow, stage: "failed" } }, ctx, {
          eventType: "service-fallback-used",
          summary: "Help request couldn’t be sent; try again or the pharmacy’s number offered",
          actor: "system",
          route: "local-fallback",
          validationStatus: "blocked",
          details: { kind: flow.kind },
        });
      }
      const sent: HelpFlow = { ...flow, stage: "sent", reference: event.reference, contactName: event.contactName };
      return withAudit(
        { ...s, helpFlow: sent },
        ctx,
        flow.kind === "pharmacist-callback"
          ? {
              eventType: "pharmacist-callback-requested",
              summary: `Pharmacist callback requested (simulated service, ref ${event.reference ?? "—"})`,
              details: { reason: flow.reason },
            }
          : {
              // Only ever after an explicit "Yes" on the consent step.
              eventType: "caregiver-help-requested",
              summary: `${flow.kind === "family" ? "Family" : "Trusted helper"} told Mei Ling would like help (simulated service)`,
              details: { kind: flow.kind, consent: true, reason: flow.reason },
            },
      );
    }

    case "HELP_RETRY": {
      if (s.helpFlow?.stage !== "failed") return s;
      return { ...s, helpFlow: { ...s.helpFlow, stage: "sending" } };
    }

    case "HELP_SHOW_NUMBER": {
      // From the failure state: the pharmacy's own number, to call themselves.
      if (s.helpFlow?.stage !== "failed") return s;
      return { ...s, helpFlow: { ...s.helpFlow, stage: "info" } };
    }

    case "HELP_DISMISS": {
      if (!s.helpFlow || s.helpFlow.stage === "sending") return s;
      return closeHelp(s, ctx, s.helpFlow.stage === "sent");
    }

    case "REPEAT": {
      if (!s.callActive) return s;
      return { ...s, repeatCount: s.repeatCount + 1 };
    }

    case "END_CALL": {
      if (!s.callActive) return s;
      const ended = withAudit(s, ctx, { eventType: "call-ended", summary: "Call ended" });
      // Back to START; active-call controls and any candidate are gone.
      return {
        ...createInitialSession(),
        persona: ended.persona,
        language: ended.language,
        studyCondition: ended.studyCondition,
        doseScenario: ended.doseScenario,
        callCount: ended.callCount,
        sessionId: ended.sessionId,
        audit: ended.audit,
        auditSeq: ended.auditSeq,
      };
    }

    case "DOSE":
      return reduceDose(s, event.action, ctx);

    case "SET_DOSE_SCENARIO": {
      const ended = s.callActive ? reduceSession(s, { type: "END_CALL" }, ctx) : s;
      return { ...ended, doseScenario: event.scenario, doseCheck: null };
    }
  }
}
