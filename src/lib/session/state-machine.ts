import type { CopyKey } from "@/lib/content/translations";
import type { LabelAnalysis } from "@/lib/api/schemas";
import { metforminRecord } from "@/lib/content/demo-record";
import { candidateDisplayFor, candidateIdFor, matchLabelInput } from "@/lib/matching/match-record";
import type { HelpActionId } from "@/lib/safety/escalation";
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
  repeatCount: number;
  helpAction: HelpActionId | null;
  audit: AuditEvent[];
  auditSeq: number;
};

export type SessionEvent =
  | { type: "SELECT_PERSONA"; persona: Persona }
  | { type: "SET_LANGUAGE"; language: UiLanguage }
  | { type: "CALL_START" }
  | { type: "USER_MESSAGE"; text: string }
  | { type: "SELECT_ROUTE"; route: ContextualActionId }
  | { type: "CAMERA_CONSENT"; granted: boolean }
  | { type: "CAMERA_FAILED"; issue: CameraIssue }
  | { type: "SUBMIT_LABEL"; input: LabelInput }
  | { type: "RESOLVE_ANALYSIS" } // deterministic demo/typed inputs (local)
  | { type: "ANALYSIS_RESULT"; analysis: LabelAnalysis } // image inputs (server-validated)
  | { type: "ANALYSIS_FAILED" }
  | {
      type: "CONFIRM_MATCH";
      candidateId: string;
      decision: "confirmed" | "denied" | "unsure";
    }
  | { type: "EXPLAIN_STEP"; direction: "next" | "back" }
  | { type: "UNDERSTOOD" }
  | { type: "NEW_MEDICINE" }
  | { type: "GET_HELP" }
  | { type: "TRY_ANOTHER_LABEL" }
  | { type: "RETURN_TO_CALL" }
  | { type: "HELP_ACTION"; action: Exclude<HelpActionId, "try-again"> }
  | { type: "REPEAT" }
  | { type: "END_CALL" };

export type ReduceContext = { now: string };

const AUDIT_LIMIT = 200;

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
    repeatCount: 0,
    helpAction: null,
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
      details: e.details ?? {},
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
    state: "safety",
    safetyReason: reason,
    contextualActions: [],
    helpAction: null,
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
  route: ContextualActionId,
  via: "button" | "message",
): Session {
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
          helpAction: null,
        },
        ctx,
        { eventType: "call-started", summary: "Call started", details: { callCount } },
      );
    }

    case "USER_MESSAGE": {
      const text = event.text.trim();
      if (!s.callActive || text.length === 0) return s;
      const routed = routeMessage(text, { matchConfirmed: isMatchConfirmed(s) });

      // Urgent-risk overrides the normal path from ANY active-call state.
      if (routed.intent === "urgent-risk") {
        return enterSafety({ ...s, userText: text }, ctx, "urgent-risk");
      }

      // Unsupported medical questions and human-help requests also leave the normal path
      // from any active state, so a spoken "should I stop taking it?" is never ignored.
      if (routed.safetyReason && s.state !== "listening") {
        if (s.state === "start" || s.state === "safety" || s.state === "analyzing") return s;
        const keep = s.matchStatus === "confirmed";
        return enterSafety(
          { ...s, userText: text },
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
      if (s.state !== "listening") return s;

      const base: Session = { ...s, userText: text };
      if (routed.safetyReason) {
        return enterSafety(base, ctx, routed.safetyReason, {}, { intent: routed.intent });
      }
      // "I want to show the medicine" / "my schedule": saying it is the choice.
      if (routed.route) return applyRoute(base, ctx, routed.route, "message");
      if (routed.toExplain && isMatchConfirmed(base)) {
        return enterExplain(base, ctx, 1);
      }
      return withAudit(
        {
          ...base,
          assistantKey: routed.assistantKey,
          contextualActions: routed.contextualActions,
        },
        ctx,
        {
          eventType: "message-classified",
          summary: `Typed message understood: ${routed.intent}`,
          actor: "system",
          route: "typed-input",
          validationStatus: "passed",
          details: {
            intent: routed.intent,
            actionsOffered: routed.contextualActions.join(",") || "none",
            characters: text.length, // length only — never the raw text
          },
        },
      );
    }

    case "SELECT_ROUTE": {
      // Button path: the action must have been offered during this active call.
      if (!s.callActive || s.state !== "listening") return s;
      if (!s.contextualActions.includes(event.route)) return s;
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
      return { ...s, explainStep: step as 0 | 1 | 2 };
    }

    case "UNDERSTOOD": {
      if (s.state !== "explain" || !isMatchConfirmed(s)) return s;
      return withAudit({ ...s, state: "complete" }, ctx, {
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
        labelRouteSelected: false,
        cameraMode: null,
        cameraIssue: null,
        candidate: null,
        matchStatus: null, // a new medicine must pass the confirmation gate again
        explainStep: 0,
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
      if (s.state !== "safety" || !s.labelRouteSelected || s.safetyReason === "urgent-risk") {
        return s;
      }
      return {
        ...s,
        state: "camera-guidance",
        safetyReason: null,
        helpAction: null,
        cameraMode: s.cameraMode ?? "fallback",
        candidate: null,
        matchStatus: null,
      };
    }

    case "RETURN_TO_CALL": {
      if (s.state !== "safety" || !s.callActive || s.safetyReason === "urgent-risk") return s;
      return {
        ...s,
        state: "listening",
        safetyReason: null,
        helpAction: null,
        assistantKey: "anotherMedicineGuide",
        contextualActions: [],
        labelRouteSelected: false,
      };
    }

    case "HELP_ACTION": {
      if (s.state !== "safety") return s;
      return withAudit({ ...s, helpAction: event.action }, ctx, {
        eventType: "help-requested",
        summary: `Demo help action selected: ${event.action} (nothing was sent)`,
        details: { action: event.action, implemented: false },
      });
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
        callCount: ended.callCount,
        sessionId: ended.sessionId,
        audit: ended.audit,
        auditSeq: ended.auditSeq,
      };
    }
  }
}
