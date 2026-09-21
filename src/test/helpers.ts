import {
  createInitialSession,
  reduceSession,
  type Session,
  type SessionEvent,
} from "@/lib/session/state-machine";

export const CTX = { now: "2026-09-21T10:00:00.000Z" };

export function run(events: SessionEvent[], from: Session = createInitialSession()): Session {
  return events.reduce((s, e) => reduceSession(s, e, CTX), from);
}

export const startCall: SessionEvent = { type: "CALL_START" };
export const askUnknown: SessionEvent = { type: "USER_MESSAGE", text: "What is this for?" };
export const chooseShowMedicine: SessionEvent = { type: "SELECT_ROUTE", route: "show-medicine" };
export const grantCamera: SessionEvent = { type: "CAMERA_CONSENT", granted: true };
export const submitDemo = (
  asset: "sample_metformin_label" | "sample_unreadable_label" | "sample_mismatch_label" = "sample_metformin_label",
): SessionEvent => ({ type: "SUBMIT_LABEL", input: { mode: "demo", demoAssetId: asset } });
export const resolve: SessionEvent = { type: "RESOLVE_ANALYSIS" };

/** Start → call → unknown question → Show medicine → camera → demo label → possible match. */
export function toConfirmMatch(): Session {
  return run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo(), resolve]);
}

export function toExplain(): Session {
  const s = toConfirmMatch();
  return run(
    [{ type: "CONFIRM_MATCH", candidateId: s.candidate!.candidateId, decision: "confirmed" }],
    s,
  );
}
