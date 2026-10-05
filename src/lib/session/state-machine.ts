import type { CopyKey } from "@/lib/content/translations";
import type { LabelAnalysis } from "@/lib/api/schemas";
import { metforminRecord, recordMedicines } from "@/lib/content/seed-record";
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
import { routeMessage } from "./intent";

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
  assistantKey: CopyKey;
  contextualActions: ContextualActionId[];
  /** True once `Show medicine` was chosen inside the active call. */
  labelRouteSelected: boolean;
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
  audit: AuditEvent[];
  auditSeq: number;
};

export type SessionEvent =
  | { type: "SELECT_PERSONA"; persona: Persona }
  | { type: "SET_LANGUAGE"; language: UiLanguage }
  /** From the root layout, which reads the study cookie server-side (study mode only). */
  | { type: "SET_STUDY_CONDITION"; condition: StudyCondition | null }
  | { type: "CALL_START" }
  | { type: "USER_MESSAGE"; text: string }
  | { type: "SELECT_ROUTE"; route: ContextualActionId }
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
      route: e.route ?? "deterministic-demo",
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
  return withAudit(next, ctx, {
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
      { ...s, state: "camera-permission", labelRouteSelected: true, contextualActions: [] },
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

    case "CAMERA_CONSENT": {
      // CAMERA_PERMISSION is only reachable via SELECT_ROUTE("show-medicine").
      if (s.state !== "camera-permission" || !s.labelRouteSelected) return s;
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
      // Denial is never a dead end: typed/demo-label fallback opens.
      return withAudit({ ...s, state: "camera-guidance", cameraMode: "fallback", cameraIssue: null }, ctx, {
        eventType: "camera-consent-declined",
        summary: "Camera declined; demo-label fallback offered",
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
      if (s.state !== "camera-guidance") return s;
      const input = event.input;
      return withAudit({ ...s, state: "analyzing", pendingLabel: input }, ctx, {
        eventType: "label-submitted",
        summary: "Label submitted for checking",
        route:
          input.mode === "demo"
            ? "deterministic-demo"
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
        return enterExplain(confirmed, ctx, 0);
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
      return enterSafety(denied, ctx, "user-unsure", {
        candidate: null,
        matchStatus: event.decision,
      });
    }

    case "EXPLAIN_STEP": {
      if (s.state !== "explain" || !isMatchConfirmed(s)) return s;
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
      if (s.state !== "explain" || s.explainStep !== 1 || s.recordConflict || !isMatchConfirmed(s)) return s;
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
      if (s.state !== "explain" || !isMatchConfirmed(s)) return s;
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
        callCount: ended.callCount,
        sessionId: ended.sessionId,
        audit: ended.audit,
        auditSeq: ended.auditSeq,
      };
    }
  }
}
