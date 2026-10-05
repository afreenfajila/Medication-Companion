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
import { buildEscalation } from "@/lib/safety/escalation";
import { buildTimeline, deriveRecordStatus } from "./audit-view";
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

  it("contacting the clinic shows its number; nothing is sent", () => {
    const s = run([{ type: "HELP_START", kind: "clinic" }], run([startCall, { type: "GET_HELP" }]));
    expect(s.helpFlow).toMatchObject({ kind: "clinic", stage: "info" });
    expect(blocked([{ type: "HELP_CONFIRM", granted: true }], s)).toBe(true);
  });
});

describe("help flows: confirm, then sent only on service success (Assignment 3, H4)", () => {
  const safety = () => run([startCall, { type: "GET_HELP" }]);
  const helpEvents = (s: ReturnType<typeof run>) =>
    s.audit.filter((e) => e.eventType === "pharmacist-callback-requested" || e.eventType === "caregiver-help-requested");

  it("a pharmacist callback confirms first, sends, and is 'sent' with a reference only after success", () => {
    const asked = run([{ type: "HELP_START", kind: "pharmacist-callback" }], safety());
    expect(asked.helpFlow).toMatchObject({ kind: "pharmacist-callback", stage: "confirm", reason: "help-requested" });
    const sending = run([{ type: "HELP_CONFIRM", granted: true }], asked);
    expect(sending.helpFlow?.stage).toBe("sending");
    expect(helpEvents(sending)).toHaveLength(0); // nothing claimed yet

    const sent = run([{ type: "HELP_RESULT", ok: true, reference: "BC-123456" }], sending);
    expect(sent.helpFlow).toMatchObject({ stage: "sent", reference: "BC-123456" });
    expect(helpEvents(sent).map((e) => e.eventType)).toEqual(["pharmacist-callback-requested"]);
    expect(deriveRecordStatus(buildTimeline(sent.audit))).toBe("Needs help");
  });

  it("a service failure shows the failure state, never 'sent'; try again or see the pharmacy's number", () => {
    const sending = run([{ type: "HELP_START", kind: "pharmacist-callback" }, { type: "HELP_CONFIRM", granted: true }], safety());
    const failed = run([{ type: "HELP_RESULT", ok: false }], sending);
    expect(failed.helpFlow?.stage).toBe("failed");
    expect(helpEvents(failed)).toHaveLength(0);
    expect(run([{ type: "HELP_RETRY" }], failed).helpFlow?.stage).toBe("sending");
    expect(run([{ type: "HELP_SHOW_NUMBER" }], failed).helpFlow?.stage).toBe("info");
  });

  it("a result that arrives when nothing is being sent is ignored", () => {
    expect(blocked([{ type: "HELP_RESULT", ok: true, reference: "BC-1" }], safety())).toBe(true);
  });

  it("after 'sent', carry on continues the call where it left off", () => {
    const atInstruction = run([{ type: "EXPLAIN_STEP", direction: "next" }], toExplain());
    const flow = run(
      [
        { type: "GET_HELP" },
        { type: "HELP_START", kind: "trusted-helper" },
        { type: "HELP_CONFIRM", granted: true },
        { type: "HELP_RESULT", ok: true, contactName: "Mrs Lim" },
        { type: "HELP_DISMISS" },
      ],
      atInstruction,
    );
    expect(flow.state).toBe("explain");
    expect(flow.explainStep).toBe(1);
    expect(flow.helpFlow).toBeNull();
  });

  it("is not offered on the urgent path", () => {
    const urgent = run([startCall, { type: "USER_MESSAGE", text: "I have chest pain" }]);
    expect(blocked([{ type: "HELP_START", kind: "pharmacist-callback" }], urgent)).toBe(true);
  });

  it("the record conflict's 'Ask a pharmacist to call me' opens the callback on top of the explanation", () => {
    const s = run(
      [{ type: "USER_MESSAGE", text: "That's not right" }, { type: "RECORD_CONFLICT_CHOICE", choice: "pharmacist" }],
      toExplain(),
    );
    expect(s.state).toBe("explain");
    expect(s.helpFlow).toMatchObject({ kind: "pharmacist-callback", stage: "confirm", reason: "record-conflict" });
  });
});

describe("record conflict (“my doctor said…”)", () => {
  const dispute = (text: string, from = toExplain()) => run([{ type: "USER_MESSAGE", text }], from);

  it.each([
    "My doctor said to take it at night",
    "That's not right",
    "I thought it was once a day",
    "It's not the same as my label",
    "医生说要晚上吃",
    "不是这样的",
  ])("'%s' stays on the explanation and answers from the record", (text) => {
    const s = dispute(text);
    expect(s.state).toBe("explain");
    expect(s.recordConflict).toBe(true);
    expect(s.matchStatus).toBe("confirmed"); // the record is never hidden
    const last = s.audit.at(-1)!;
    expect(last.eventType).toBe("record-conflict-raised");
    expect(last.details).toEqual({ intent: "record-conflict" }); // intent only, never the words
    expect(JSON.stringify(s.audit)).not.toContain(text);
  });

  it("'My doctor said I can stop it' is a dose question first: unsupported-medical, not record-conflict", () => {
    const s = dispute("My doctor said I can stop it");
    expect(s.state).toBe("safety");
    expect(s.safetyReason).toBe("unsupported-medical-question");
    expect(s.recordConflict).toBe(false);
  });

  it("only applies while a confirmed record is explained", () => {
    const listening = run([{ type: "USER_MESSAGE", text: "My doctor said something else" }], run([startCall]));
    expect(listening.recordConflict).toBe(false);
    expect(routeMessage("That's not right", { matchConfirmed: false, explaining: true }).intent).not.toBe("record-conflict");
  });

  it("offers a pharmacist callback (on top of the explanation) or carrying on", () => {
    const raised = dispute("That's not right");
    const help = run([{ type: "RECORD_CONFLICT_CHOICE", choice: "pharmacist" }], raised);
    expect(help.state).toBe("explain");
    expect(help.helpFlow).toMatchObject({ kind: "pharmacist-callback", stage: "confirm" });
    expect(help.recordConflict).toBe(false);

    const carry = run([{ type: "RECORD_CONFLICT_CHOICE", choice: "carry-on" }], raised);
    expect(carry.state).toBe("explain");
    expect(carry.recordConflict).toBe(false);
    expect(carry.explainStep).toBe(raised.explainStep);
  });

  it("a choice with no conflict raised is ignored", () => {
    expect(blocked([{ type: "RECORD_CONFLICT_CHOICE", choice: "pharmacist" }], toExplain())).toBe(true);
  });
});

describe("off-topic cap, health signals and wellbeing (Assignment 3, E)", () => {
  const say = (text: string) => ({ type: "USER_MESSAGE", text }) as const;

  it("the second off-topic turn in a row wraps up, offering Show medicine and End call", () => {
    const once = run([startCall, say("What's the weather like?")]);
    expect(once.assistantKey).toBe("offTopicWorld");
    const twice = run([say("Do you like football?")], once);
    expect(twice.assistantKey).toBe("offTopicWrapUp");
    expect(twice.contextualActions).toEqual(["show-medicine", "end-call"]);

    const ended = run([{ type: "SELECT_ROUTE", route: "end-call" }], twice);
    expect(ended.state).toBe("start");
    expect(ended.callActive).toBe(false);
  });

  it("any on-spine turn resets the count", () => {
    const s = run([startCall, say("What's the weather like?"), say("What is this for?"), say("Do you like football?")]);
    expect(s.assistantKey).toBe("offTopicWorld");
    expect(s.offTopicStreak).toBe(1);
  });

  it("health-signal talk gets the limitation + pharmacist/clinic path, not a label redirect", () => {
    const s = run([startCall, say("I've been feeling really tired lately")]);
    expect(s.state).toBe("safety");
    expect(s.safetyReason).toBe("unsupported-medical-question");
  });

  it("loneliness gets the warm wellbeing reply with Carry on, and the audit keeps the category only", () => {
    const s = run([startCall, say("I feel so lonely these days")]);
    expect(s.state).toBe("listening");
    expect(s.assistantKey).toBe("wellbeing");
    expect(s.contextualActions).toContain("carry-on");
    expect(s.audit.at(-1)?.details).toEqual({
      intent: "wellbeing",
      category: "wellbeing",
      actionsOffered: "ask-family,carry-on",
    });

    const on = run([{ type: "SELECT_ROUTE", route: "carry-on" }], s);
    expect(on.assistantKey).toBe("anotherMedicineGuide");
    expect(on.contextualActions).toEqual([]);
  });

  it("off-topic audit keeps the category, never the words or their length", () => {
    const s = run([startCall, say("What's the weather like?")]);
    expect(s.audit.at(-1)?.details).toEqual({
      intent: "off-topic",
      category: "world",
      actionsOffered: "show-medicine,ask-schedule",
    });
  });
});

describe("family help needs consent every time (Assignment 3, F)", () => {
  const lonely = () => run([startCall, { type: "USER_MESSAGE", text: "I feel lonely" }]);
  const asked = (s = lonely()) => run([{ type: "SELECT_ROUTE", route: "ask-family" }], s);
  const familyEvents = (s: ReturnType<typeof run>) =>
    s.audit.filter((e) => e.eventType === "caregiver-help-requested");

  const yes = [
    { type: "HELP_CONFIRM", granted: true },
    { type: "HELP_RESULT", ok: true, contactName: "Daniel" },
  ] as const;

  it("choosing 'Let my family know' only asks — nothing is recorded yet", () => {
    const s = asked();
    expect(s.helpFlow).toMatchObject({ kind: "family", stage: "confirm", reason: "wellbeing" });
    expect(familyEvents(s)).toHaveLength(0);
  });

  it("'Not now' leaves no trace", () => {
    const s = run([{ type: "HELP_CONFIRM", granted: false }], asked());
    expect(s.helpFlow).toBeNull();
    expect(familyEvents(s)).toHaveLength(0);
  });

  it("only 'Yes' (and the service's success) writes caregiver-help-requested, shown as Needs help", () => {
    const s = run([...yes], asked());
    expect(familyEvents(s)).toHaveLength(1);
    expect(familyEvents(s)[0].details).toEqual({ kind: "family", consent: true, reason: "wellbeing" });
    expect(s.helpFlow).toMatchObject({ stage: "sent", contactName: "Daniel" });
    expect(deriveRecordStatus(buildTimeline(s.audit))).toBe("Needs help");
  });

  it("is on the non-urgent safety options too, and asks again every time", () => {
    const once = run([{ type: "HELP_START", kind: "family" }, ...yes, { type: "HELP_DISMISS" }], run([startCall, { type: "GET_HELP" }]));
    expect(familyEvents(once)).toHaveLength(1);
    const again = run([{ type: "GET_HELP" }, { type: "HELP_START", kind: "family" }], once);
    expect(again.helpFlow?.stage).toBe("confirm");
    expect(familyEvents(again)).toHaveLength(1); // nothing new until a second "Yes"
  });

  it("can't be opened where it wasn't offered", () => {
    expect(blocked([{ type: "HELP_START", kind: "family" }], run([startCall]))).toBe(true);
    expect(blocked([{ type: "HELP_CONFIRM", granted: true }], lonely())).toBe(true);
  });
});

describe("choose from my medicines (Assignment 3, H3)", () => {
  const guidance = () => run([startCall, askUnknown, chooseShowMedicine, { type: "CAMERA_CONSENT", granted: false }]);
  const id = "med_metformin_500_demo";

  it("after 'Not now', picking from the record list is a possible match that still needs confirming", () => {
    const s = run([{ type: "CHOOSE_MEDICINE", medicineId: id }], guidance());
    expect(s.state).toBe("confirm-match");
    expect(s.matchStatus).toBe("possible");
    expect(resolveExplanation(s, "en")).toBeNull(); // nothing explained before confirmation
    expect(s.audit.at(-1)).toMatchObject({ eventType: "candidate-presented", route: "record-list" });
  });

  it("only from the camera step, and only for a medicine on the record", () => {
    expect(blocked([{ type: "CHOOSE_MEDICINE", medicineId: id }], run([startCall]))).toBe(true);
    expect(blocked([{ type: "CHOOSE_MEDICINE", medicineId: "med_other" }], guidance())).toBe(true);
  });
});

describe("recovery: carry on where they left off", () => {
  it("help from mid-explanation, then carry on, returns to the same step with the record still confirmed", () => {
    const atInstruction = run([{ type: "EXPLAIN_STEP", direction: "next" }], toExplain());
    const help = run([{ type: "GET_HELP" }], atInstruction);
    expect(help.state).toBe("safety");
    expect(help.resumeExplainStep).toBe(1);

    const back = run([{ type: "RETURN_TO_CALL" }], help);
    expect(back.state).toBe("explain");
    expect(back.explainStep).toBe(1);
    expect(back.matchStatus).toBe("confirmed");
    expect(back.resumeExplainStep).toBeNull();
  });

  it("without a confirmed record (e.g. the label looked different) it returns to the conversation", () => {
    const differs = run(
      [{ type: "EXPLAIN_STEP", direction: "next" }, { type: "LABEL_CHECK", matches: false }],
      toExplain(),
    );
    const back = run([{ type: "RETURN_TO_CALL" }], differs);
    expect(back.state).toBe("listening");
    expect(resolveExplanation(back, "en")).toBeNull();
  });

  it("'It looks different' leads to a person, not another photo (Incorrect output)", () => {
    const differs = run(
      [{ type: "EXPLAIN_STEP", direction: "next" }, { type: "LABEL_CHECK", matches: false }],
      toExplain(),
    );
    const actions = buildEscalation(differs.safetyReason!, differs.labelRouteSelected).actions.map((a) => a.id);
    expect(actions).not.toContain("try-again");
  });
});

describe("label check beside the instruction", () => {
  const atInstruction = () => run([{ type: "EXPLAIN_STEP", direction: "next" }], toExplain());

  it("'Yes, it matches' moves on and is audited", () => {
    const s = run([{ type: "LABEL_CHECK", matches: true }], atInstruction());
    expect(s.state).toBe("explain");
    expect(s.explainStep).toBe(2);
    expect(s.audit.at(-1)).toMatchObject({ eventType: "label-check-answered", details: { matches: true } });
  });

  it("'It looks different' reaches safety, drops the record, and offers human help only", () => {
    const s = run([{ type: "LABEL_CHECK", matches: false }], atInstruction());
    expect(s.state).toBe("safety");
    expect(s.safetyReason).toBe("label-differs");
    expect(s.candidate).toBeNull();
    expect(resolveExplanation(s, "en")).toBeNull();
    expect(s.audit.map((e) => e.eventType)).toContain("label-check-answered");
  });

  it("is only asked beside the instruction", () => {
    expect(blocked([{ type: "LABEL_CHECK", matches: false }], toExplain())).toBe(true); // step 0
    expect(blocked([{ type: "LABEL_CHECK", matches: false }], toConfirmMatch())).toBe(true);
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
