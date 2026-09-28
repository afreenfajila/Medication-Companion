import { describe, expect, it } from "vitest";
import { resolveExplanation } from "@/lib/content/explanation";
import {
  askUnknown,
  chooseShowMedicine,
  grantCamera,
  resolve,
  run,
  startCall,
  submitDemo,
  toConfirmMatch,
  toExplain,
  CTX,
} from "@/test/helpers";
import { routeMessage } from "./intent";
import {
  createInitialSession,
  guardRequestedState,
  pathForState,
  reduceSession,
  type SessionEvent,
} from "./state-machine";

const blocked = (events: SessionEvent[], from = createInitialSession()) => {
  const next = events.reduce((s, e) => reduceSession(s, e, CTX), from);
  return next === from;
};

describe("call-start gate", () => {
  it("begins at START with no call controls and no contextual actions", () => {
    const s = createInitialSession();
    expect(s.state).toBe("start");
    expect(s.callActive).toBe(false);
    expect(s.contextualActions).toEqual([]);
  });

  it("LISTENING is impossible until Call with companion is selected", () => {
    expect(blocked([{ type: "USER_MESSAGE", text: "What is this for?" }])).toBe(true);
    expect(blocked([{ type: "SELECT_ROUTE", route: "show-medicine" }])).toBe(true);
    expect(blocked([{ type: "GET_HELP" }, { type: "REPEAT" }, { type: "END_CALL" }])).toBe(true);
  });

  it("CALL_START moves to listening and activates the call once", () => {
    const s = run([startCall]);
    expect(s.state).toBe("listening");
    expect(s.callActive).toBe(true);
    expect(s.contextualActions).toEqual([]);
    expect(blocked([startCall], s)).toBe(true);
  });

  it("END_CALL returns to START, removes call controls, clears the candidate, keeps the audit trail", () => {
    const s = run([{ type: "END_CALL" }], toExplain());
    expect(s.state).toBe("start");
    expect(s.callActive).toBe(false);
    expect(s.candidate).toBeNull();
    expect(s.matchStatus).toBeNull();
    expect(s.contextualActions).toEqual([]);
    expect(s.audit.at(-1)?.eventType).toBe("call-ended");
    expect(s.audit.some((e) => e.eventType === "call-started")).toBe(true);
    expect(resolveExplanation(s, "en")).toBeNull();
  });
});

describe("conversation routing and contextual actions", () => {
  const confirmed = { matchConfirmed: true };
  const none = { matchConfirmed: false };

  it("unknown medicine question → only Show medicine", () => {
    for (const text of ["What is this for?", "What is this medicine for? When do I take it?", "这是什么药？"]) {
      const r = routeMessage(text, none);
      expect(r.intent).toBe("unknown-medicine-question");
      expect(r.contextualActions).toEqual(["show-medicine"]);
      expect(r.assistantKey).toBe("showLabelQuestion");
    }
  });

  it("'what are my prescriptions' names what's on file (from the record), distinct from identifying a pill", () => {
    for (const text of [
      "What are my prescriptions?",
      "What medicines do I have?",
      "what am I prescribed",
      "list my medications",
      "我的处方是什么",
      "我在吃什么药",
    ]) {
      const r = routeMessage(text, none);
      expect(r.intent).toBe("list-prescriptions");
      expect(r.assistantKey).toBe("prescriptionsListed");
      expect(r.contextualActions).toEqual(["show-medicine"]);
      // Naming what's on file is not the same as explaining it — no shortcut to the gated content.
      expect(r.toExplain).toBeUndefined();
      expect(r.safetyReason).toBeUndefined();
    }
  });

  it("a mishearing of the record medicine is checked with the person, not assumed", () => {
    for (const text of ["I do have met for pain with me", "it's met forming", "med for men"]) {
      const r = routeMessage(text, none);
      expect(r.intent).toBe("medicine-mentioned");
      expect(r.assistantKey).toBe("medicineNameCheck");
      // The label is an alternative, not the next step it jumps to.
      expect(r.route).toBeUndefined();
      expect(r.toExplain).toBeUndefined();
    }
  });

  it("answering the name check: yes acknowledges the name, no asks again, anything else is understood fresh", () => {
    const afterCheck = { matchConfirmed: false, nameCheckPending: true };
    expect(routeMessage("yes", afterCheck).assistantKey).toBe("medicineMentioned");
    expect(routeMessage("Yes, that's right", afterCheck).assistantKey).toBe("medicineMentioned");
    expect(routeMessage("是", afterCheck).assistantKey).toBe("medicineMentioned");
    expect(routeMessage("no", afterCheck).assistantKey).toBe("medicineNameRetry");
    expect(routeMessage("No, not that", afterCheck).assistantKey).toBe("medicineNameRetry");
    // Saying the name again instead of yes/no.
    expect(routeMessage("metformin", afterCheck).assistantKey).toBe("medicineMentioned");
    // A bare "yes" means nothing special when the name check wasn't the last question.
    expect(routeMessage("yes", none).assistantKey).toBe("clarificationPrompt");
    // Safety still comes first, even as an answer to the check.
    expect(routeMessage("yes, I can't breathe", afterCheck).intent).toBe("urgent-risk");
  });

  it("the name spelled out letter by letter is understood", () => {
    expect(routeMessage("M E T F O R M I N", none).assistantKey).toBe("medicineMentioned");
    expect(routeMessage("it's m-e-t-f-o-r-m-i-n", none).assistantKey).toBe("medicineMentioned");
  });

  it("the record medicine named correctly is acknowledged, and still sent to the label check", () => {
    for (const text of ["I have my metformin here", "It's Metformin", "我带着二甲双胍"]) {
      const r = routeMessage(text, none);
      expect(r.intent).toBe("medicine-mentioned");
      expect(r.assistantKey).toBe("medicineMentioned");
      expect(r.contextualActions).toEqual(["show-medicine"]);
      // Hearing the name is never a match: no route taken, nothing unlocked.
      expect(r.route).toBeUndefined();
      expect(r.toExplain).toBeUndefined();
    }
  });

  it("a medicine in hand without a recognised name gets the label question, not the two-way prompt", () => {
    for (const text of ["I have a pill with me", "I'm holding a bottle", "我手里有一瓶药"]) {
      const r = routeMessage(text, none);
      expect(r.assistantKey).toBe("showLabelQuestion");
      expect(r.contextualActions).toEqual(["show-medicine"]);
    }
  });

  it("after a confirmed match, naming the medicine in a schedule question still reaches the explanation", () => {
    const r = routeMessage("When do I take my metformin?", { matchConfirmed: true });
    expect(r.intent).toBe("schedule-question");
    expect(r.toExplain).toBe(true);
  });

  it("'what are my prescriptions' is checked before the looser unknown-medicine pattern", () => {
    // "what medicine(s)" alone would otherwise match UNKNOWN_MEDICINE first.
    expect(routeMessage("What medicines do I have?", none).intent).toBe("list-prescriptions");
    expect(routeMessage("What medicine is this?", none).intent).toBe("unknown-medicine-question");
  });

  it("an off-topic question (e.g. the weather) is acknowledged and redirected, not answered", () => {
    const r = routeMessage("What will happen if I ask about the weather today?", none);
    expect(r.intent).toBe("off-topic");
    expect(r.assistantKey).toBe("offTopicWorld");
    // Redirection still lands on the spine's two doors, and answers nothing.
    expect(r.contextualActions).toEqual(["show-medicine", "ask-schedule"]);
    expect(r.safetyReason).toBeUndefined();
    expect(r.toExplain).toBeUndefined();
    expect(r.route).toBeUndefined();
  });

  it("schedule question without a confirmed record → approved clarification with both actions", () => {
    const r = routeMessage("When do I take my medicine?", none);
    expect(r.intent).toBe("schedule-question");
    expect(r.assistantKey).toBe("clarificationPrompt");
    expect(r.contextualActions).toEqual(["show-medicine", "ask-schedule"]);
    expect(r.toExplain).toBeUndefined();
  });

  it("schedule question with a confirmed record → record-backed route only", () => {
    const r = routeMessage("When do I take my medicine?", confirmed);
    expect(r.toExplain).toBe(true);
    expect(r.contextualActions).toEqual([]);
  });

  it("broad/unclear request → the same clarification with both actions", () => {
    const r = routeMessage("I need something", none);
    expect(r.intent).toBe("general");
    expect(r.assistantKey).toBe("clarificationPrompt");
    expect(r.contextualActions).toEqual(["show-medicine", "ask-schedule"]);
  });

  it("human-help request → safety; unsafe/urgent → safety with no actions", () => {
    expect(routeMessage("I want to speak to a pharmacist", none).safetyReason).toBe("help-requested");
    expect(routeMessage("Should I stop taking it?", none).safetyReason).toBe("unsupported-medical-question");
    expect(routeMessage("chest pain", none).safetyReason).toBe("urgent-risk");
  });

  it("reveals contextual actions only inside the active call, and hides them after selection", () => {
    const listening = run([startCall, askUnknown]);
    expect(listening.state).toBe("listening");
    expect(listening.contextualActions).toEqual(["show-medicine"]);

    const afterSelect = run([chooseShowMedicine], listening);
    expect(afterSelect.state).toBe("camera-permission");
    expect(afterSelect.contextualActions).toEqual([]);
  });

  it("only an OFFERED action can be selected", () => {
    const s = run([startCall]); // nothing offered yet
    expect(blocked([chooseShowMedicine, { type: "SELECT_ROUTE", route: "ask-schedule" }], s)).toBe(true);
    const oneOffered = run([askUnknown], s);
    expect(blocked([{ type: "SELECT_ROUTE", route: "ask-schedule" }], oneOffered)).toBe(true);
  });

  it("Ask about my schedule without a confirmed record does not reveal any schedule", () => {
    const s = run([
      startCall,
      { type: "USER_MESSAGE", text: "When do I take it?" },
      { type: "SELECT_ROUTE", route: "ask-schedule" },
    ]);
    expect(s.state).toBe("listening");
    expect(s.assistantKey).toBe("scheduleNeedsRecord");
    expect(s.contextualActions).toEqual(["show-medicine"]);
    expect(resolveExplanation(s, "en")).toBeNull();
  });

  it("never stores the raw typed text in the audit log", () => {
    const s = run([startCall, { type: "USER_MESSAGE", text: "My secret question about pills" }]);
    expect(JSON.stringify(s.audit)).not.toContain("secret");
  });
});

describe("camera permission gate", () => {
  it("CAMERA_PERMISSION requires Show medicine chosen inside the call", () => {
    expect(blocked([grantCamera], run([startCall]))).toBe(true);
    expect(blocked([grantCamera])).toBe(true);
    const s = run([startCall, askUnknown, chooseShowMedicine]);
    expect(s.state).toBe("camera-permission");
    expect(s.labelRouteSelected).toBe(true);
  });

  it("granting moves to guidance; declining opens the demo-label fallback (no dead end)", () => {
    const base = run([startCall, askUnknown, chooseShowMedicine]);
    const granted = run([grantCamera], base);
    expect(granted.state).toBe("camera-guidance");
    expect(granted.cameraMode).toBe("preview");

    const declined = run([{ type: "CAMERA_CONSENT", granted: false }], base);
    expect(declined.state).toBe("camera-guidance");
    expect(declined.cameraMode).toBe("fallback");
    expect(declined.audit.some((e) => e.eventType === "camera-consent-declined")).toBe(true);

    const continued = run([submitDemo(), resolve], declined);
    expect(continued.state).toBe("confirm-match");
  });

  it("labels can only be submitted from camera guidance", () => {
    expect(blocked([submitDemo()], run([startCall]))).toBe(true);
    expect(blocked([submitDemo()], run([startCall, askUnknown, chooseShowMedicine]))).toBe(true);
  });
});

describe("match → confirmation gate → explanation", () => {
  it("a matching demo label yields a POSSIBLE candidate and no explanation", () => {
    const s = toConfirmMatch();
    expect(s.state).toBe("confirm-match");
    expect(s.matchStatus).toBe("possible");
    expect(s.candidate?.status).toBe("possible");
    expect(resolveExplanation(s, "en")).toBeNull();
  });

  it("EXPLAIN is unreachable without a confirmed candidate", () => {
    expect(blocked([{ type: "EXPLAIN_STEP", direction: "next" }, { type: "UNDERSTOOD" }], toConfirmMatch())).toBe(true);
    expect(blocked([{ type: "UNDERSTOOD" }], run([startCall]))).toBe(true);
    expect(blocked([{ type: "EXPLAIN_STEP", direction: "next" }])).toBe(true);
  });

  it("confirming with the presented candidate unlocks the explanation", () => {
    const s = toExplain();
    expect(s.state).toBe("explain");
    expect(s.matchStatus).toBe("confirmed");
    const view = resolveExplanation(s, "en");
    expect(view?.explanation.instruction).toBe("Take 1 tablet twice daily with meals.");
    expect(view?.recordSource).toBe("BrightCare Pharmacy — demo record");
  });

  it("rejects confirmation for the wrong candidate id or outside confirm-match", () => {
    const pending = toConfirmMatch();
    expect(
      blocked([{ type: "CONFIRM_MATCH", candidateId: "cand_other", decision: "confirmed" }], pending),
    ).toBe(true);
    expect(
      blocked(
        [{ type: "CONFIRM_MATCH", candidateId: pending.candidate!.candidateId, decision: "confirmed" }],
        run([startCall]),
      ),
    ).toBe(true);
    // Cannot re-confirm once past the gate.
    const done = toExplain();
    expect(
      blocked([{ type: "CONFIRM_MATCH", candidateId: "cand_med_metformin_500_demo", decision: "confirmed" }], done),
    ).toBe(true);
  });

  it.each(["denied", "unsure"] as const)("'%s' → safety, candidate cleared, no explanation", (decision) => {
    const pending = toConfirmMatch();
    const s = run([{ type: "CONFIRM_MATCH", candidateId: pending.candidate!.candidateId, decision }], pending);
    expect(s.state).toBe("safety");
    expect(s.safetyReason).toBe("user-unsure");
    expect(s.candidate).toBeNull();
    expect(s.matchStatus).toBe(decision);
    expect(resolveExplanation(s, "en")).toBeNull();
    expect(s.audit.some((e) => e.eventType === "candidate-denied")).toBe(true);
  });

  it("stepping through the explanation is bounded and stays gated", () => {
    let s = toExplain();
    expect(s.explainStep).toBe(0);
    s = run([{ type: "EXPLAIN_STEP", direction: "next" }, { type: "EXPLAIN_STEP", direction: "next" }], s);
    expect(s.explainStep).toBe(2);
    expect(blocked([{ type: "EXPLAIN_STEP", direction: "next" }], s)).toBe(true);
    s = run([{ type: "UNDERSTOOD" }], s);
    expect(s.state).toBe("complete");
  });

  it("changing language changes content only — state and confirmation persist", () => {
    const before = toExplain();
    const after = run([{ type: "SET_LANGUAGE", language: "zh-Hans" }], before);
    expect(after.state).toBe("explain");
    expect(after.matchStatus).toBe("confirmed");
    expect(after.candidate).toEqual(before.candidate);
    expect(resolveExplanation(after, "zh-Hans")?.explanation.instruction).toBe("随餐每日服用一片，每日两次。");
    // ...and is not a state reset when done in a blocked state either.
    expect(run([{ type: "SET_LANGUAGE", language: "zh-Hans" }], run([startCall])).state).toBe("listening");
  });

  it("a schedule question with a CONFIRMED record goes to the record-backed explanation", () => {
    const s = run([{ type: "NEW_MEDICINE" }], toExplain());
    expect(s.matchStatus).toBeNull(); // a new medicine must be confirmed again
    const confirmed = toExplain();
    const inCall = { ...confirmed, state: "listening" as const };
    const asked = run([{ type: "USER_MESSAGE", text: "When do I take it?" }], inCall);
    expect(asked.state).toBe("explain");
    expect(asked.explainStep).toBe(1);
  });
});

describe("safety states block instructions", () => {
  it.each([
    ["sample_unreadable_label", "unreadable", "unreadable-label"],
    ["sample_mismatch_label", "no-match", "record-mismatch"],
  ] as const)("%s → safety with no candidate", (asset, status, reason) => {
    const s = run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo(asset), resolve]);
    expect(s.state).toBe("safety");
    expect(s.matchStatus).toBe(status);
    expect(s.safetyReason).toBe(reason);
    expect(s.candidate).toBeNull();
    expect(resolveExplanation(s, "en")).toBeNull();
    expect(resolveExplanation(s, "zh-Hans")).toBeNull();
  });

  it("from safety the user can try another label (no second permission) or return to the call", () => {
    const s = run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo("sample_mismatch_label"), resolve]);
    const again = run([{ type: "TRY_ANOTHER_LABEL" }], s);
    expect(again.state).toBe("camera-guidance");
    expect(run([submitDemo(), resolve], again).state).toBe("confirm-match");

    const back = run([{ type: "RETURN_TO_CALL" }], s);
    expect(back.state).toBe("listening");
    expect(back.callActive).toBe(true);
  });

  it("urgent-risk wording overrides normal routing from ANY active-call state and locks the exits", () => {
    for (const s of [run([startCall]), toConfirmMatch(), toExplain()]) {
      const urgent = run([{ type: "USER_MESSAGE", text: "I have chest pain" }], s);
      expect(urgent.state).toBe("safety");
      expect(urgent.safetyReason).toBe("urgent-risk");
      expect(urgent.audit.at(-1)?.eventType).toBe("urgent-safety-triggered");
      expect(blocked([{ type: "RETURN_TO_CALL" }, { type: "TRY_ANOTHER_LABEL" }], urgent)).toBe(true);
    }
    // ...but never from START (no active call).
    expect(blocked([{ type: "USER_MESSAGE", text: "I have chest pain" }])).toBe(true);
  });

  it("unsupported medical questions escalate without calling anything", () => {
    const s = run([startCall, { type: "USER_MESSAGE", text: "Should I stop taking my pills?" }]);
    expect(s.state).toBe("safety");
    expect(s.safetyReason).toBe("unsupported-medical-question");
    expect(resolveExplanation(s, "en")).toBeNull();
  });

  it("Get help drops a merely-possible candidate; explanation stays unreachable", () => {
    const s = run([{ type: "GET_HELP" }], toConfirmMatch());
    expect(s.state).toBe("safety");
    expect(s.candidate).toBeNull();
    expect(resolveExplanation(s, "en")).toBeNull();
  });

  it("demo help actions are audited as not implemented", () => {
    const s = run(
      [{ type: "HELP_ACTION", action: "pharmacy-demo" }],
      run([startCall, { type: "GET_HELP" }]),
    );
    expect(s.helpAction).toBe("pharmacy-demo");
    expect(s.audit.at(-1)?.details).toMatchObject({ action: "pharmacy-demo", implemented: false });
  });
});

describe("URL cannot bypass state guards", () => {
  it("a requested state that is not the session's authoritative state is redirected", () => {
    const fresh = createInitialSession();
    for (const requested of ["explain", "listening", "camera-permission", "camera-guidance", "confirm-match", "safety", "start"]) {
      const g = guardRequestedState(fresh, requested);
      expect(g.state).toBe("start");
      expect(g.redirected).toBe(true);
    }
    expect(guardRequestedState(fresh, null).redirected).toBe(false);
    expect(pathForState("start")).toBe("/companion");
  });

  it("honours the requested state only when it equals the real state", () => {
    const s = toExplain();
    expect(guardRequestedState(s, "explain").redirected).toBe(false);
    expect(guardRequestedState(s, "start").redirected).toBe(true);
    expect(pathForState("explain")).toBe("/companion?state=explain");
  });
});

describe("audit trail", () => {
  it("records the happy-path route selections and decisions with unique ids", () => {
    const s = toExplain();
    const types = s.audit.map((e) => e.eventType);
    expect(types).toEqual(
      expect.arrayContaining([
        "call-started",
        "message-classified",
        "route-selected",
        "camera-consent-granted",
        "label-submitted",
        "label-analysis-complete",
        "candidate-presented",
        "candidate-confirmed",
        "explanation-viewed",
      ]),
    );
    expect(new Set(s.audit.map((e) => e.id)).size).toBe(s.audit.length);
  });
});

describe("understanding pass (AI_REPLY) is advisory and can't move a gate", () => {
  const misheard: SessionEvent = { type: "USER_MESSAGE", text: "I do have met for pain with me" };
  const aiReply = (turnCount: number, extra: Partial<Extract<SessionEvent, { type: "AI_REPLY" }>> = {}): SessionEvent => ({
    type: "AI_REPLY",
    turnCount,
    contextualActions: ["show-medicine", "ask-schedule"],
    checkingMedicineName: false,
    ...extra,
  });

  it("a user message marks the reply as answering that turn; the greeting answers none", () => {
    expect(run([startCall]).replyTo).toBeNull();
    const s = run([startCall, misheard]);
    expect(s.replyTo).toBe(s.turnCount);
    expect(s.nameCheckPending).toBe(true); // the router's own reply is "did you mean Metformin?"
  });

  it("updates only the offered doors and the pending name check — never the state or the record", () => {
    const before = run([startCall, misheard]);
    const after = run([aiReply(before.turnCount)], before);
    expect(after.state).toBe("listening");
    expect(after.contextualActions).toEqual(["show-medicine", "ask-schedule"]);
    expect(after.nameCheckPending).toBe(false);
    expect(after.candidate).toBeNull();
    expect(after.matchStatus).toBeNull();
    expect(after.audit.at(-1)?.route).toBe("claude-understanding");
  });

  it("is dropped for a stale turn, outside listening, or when the line wasn't a reply", () => {
    const s = run([startCall, misheard]);
    expect(blocked([aiReply(s.turnCount - 1)], s)).toBe(true);
    expect(blocked([aiReply(s.turnCount + 1)], s)).toBe(true);
    expect(blocked([aiReply(0)], run([startCall]))).toBe(true);
    const inCamera = run([chooseShowMedicine], s);
    expect(blocked([aiReply(s.turnCount)], inCamera)).toBe(true);
  });

  it("can't inject an action that isn't one of the two in-call doors", () => {
    const s = run([startCall, misheard]);
    const after = run(
      [aiReply(s.turnCount, { contextualActions: ["show-medicine", "explain" as never, "show-medicine"] })],
      s,
    );
    expect(after.contextualActions).toEqual(["show-medicine"]);
  });

  it("an AI-offered door still goes through the normal route guards", () => {
    const heard = run([startCall, misheard]);
    const s = run([aiReply(heard.turnCount, { contextualActions: ["ask-schedule"] })], heard);
    // Offered, so selectable — but schedule content still needs a confirmed record.
    const chosen = run([{ type: "SELECT_ROUTE", route: "ask-schedule" }], s);
    expect(chosen.state).toBe("listening");
    expect(chosen.assistantKey).toBe("scheduleNeedsRecord");
    // Not offered by the AI, so not selectable.
    expect(blocked([{ type: "SELECT_ROUTE", route: "show-medicine" }], s)).toBe(true);
  });

  it("the AI's name check makes a following 'yes' answer it", () => {
    const s = run([startCall, { type: "USER_MESSAGE", text: "hello there" }]);
    const checking = run([aiReply(s.turnCount, { contextualActions: ["show-medicine"], checkingMedicineName: true })], s);
    const yes = run([{ type: "USER_MESSAGE", text: "yes" }], checking);
    expect(yes.assistantKey).toBe("medicineMentioned");
    expect(yes.state).toBe("listening"); // acknowledged — the label check is still ahead
  });
});
