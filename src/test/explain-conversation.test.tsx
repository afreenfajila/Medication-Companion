import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { unclearGuidanceKey } from "@/components/companion/use-conversation";
import { fillRecordFacts, resolveExplanation } from "@/lib/content/explanation";
import { isApprovedSpeech } from "@/lib/content/speech-guard";
import { t } from "@/lib/content/translations";
import { sessionStore } from "@/lib/session/session-store";
import { reduceSession } from "@/lib/session/state-machine";
import { interpretUtterance, spokenActions, type CommandContext } from "@/lib/voice/commands";
import { CTX, run, toExplain } from "./helpers";

/**
 * The explanation is a conversation, not a menu: questions get an answer (the
 * dose boundary with the record's own words), "can a pharmacist call me?" is
 * understood at any step, and a bare "yes" to an either/or question is asked
 * back instead of guessed.
 */

const explain = (step: 0 | 1 | 2): CommandContext => ({
  state: "explain",
  contextualActions: [],
  candidateId: "cand_med_metformin_500_demo",
  explainStep: step,
  cameraLive: false,
  pendingSpokenMedicineName: null,
});
const said = (text: string, step: 0 | 1 | 2) => {
  const r = interpretUtterance(text, explain(step));
  return r.kind === "event" ? r.event : r.kind === "reply" ? r.key : r.kind;
};

describe("questions during the explanation are answered", () => {
  it.each([
    "what should the next dosage be?",
    "What dose should I take now?",
    "how many tablets should I take",
    "我应该吃多少？",
    "剂量是多少",
    "i want to know the dosage",
    "tell me my dose",
    "I need to check the dosage",
    "我想知道剂量",
  ])(
    "%j is answered with the record's own instruction — never a skip ahead",
    (text) => {
      for (const step of [0, 1, 2] as const) expect(said(text, step)).toBe("explainDoseQuestion");
    },
  );

  it("the dose answer is exactly what the explanation shows — the record's own words, nothing chosen — and approved for the voice", () => {
    const view = resolveExplanation(toExplain(), "en")!;
    const line = fillRecordFacts(t("en", "explainDoseQuestion"), view, "en");
    expect(line).toBe(`${view.explanation.instructionIntro} ${view.explanation.instruction}`);
    expect(line).toBe("Your current pharmacy record says: Take 1 tablet twice daily with meals.");
    expect(line).not.toMatch(/pharmacist/); // no hand-off added
    expect(isApprovedSpeech(line)).toBe(true);
    const zhView = resolveExplanation(toExplain(), "zh-Hans")!;
    expect(fillRecordFacts(t("zh-Hans", "explainDoseQuestion"), zhView, "zh-Hans")).toBe(`${zhView.explanation.instructionIntro}${zhView.explanation.instruction}`);
    expect(isApprovedSpeech(fillRecordFacts(t("zh-Hans", "explainDoseQuestion"), resolveExplanation(toExplain(), "zh-Hans")!, "zh-Hans"))).toBe(true);
  });

  it.each([
    "Yes, that is my correct dosage. I will now take one tablet with the meal.",
    "my dosage is the same as the label",
    "the dose is fine",
    "剂量没问题",
  ])("a statement that mentions the dose (%j) is not a dose question: no boundary line, no hand-off", (text) => {
    for (const step of [0, 1, 2] as const) expect(said(text, step)).not.toBe("explainDoseQuestion");
  });

  it("not every 'how much' is a dose question", () => {
    expect(said("how much does it cost?", 0)).not.toBe("explainDoseQuestion");
    expect(said("这个多少钱？", 0)).not.toBe("explainDoseQuestion");
  });

  it("a clear question that fits nothing is not told it wasn't heard", () => {
    for (const step of [0, 1, 2] as const) {
      const key = unclearGuidanceKey({ state: "explain", explainStep: step }, true);
      expect(t("en", key)).toMatch(/^That’s a good question/);
      expect(t("en", key)).not.toMatch(/catch|follow/);
    }
    expect(t("en", unclearGuidanceKey({ state: "explain", explainStep: 0 }))).toMatch(/^Sorry, I didn’t follow that/);
  });

  it("the explanation's prompts no longer ask for exact quoted words", () => {
    for (const key of ["unclearExplain", "unclearExplainLast", "unclearLabelCheck", "unclearExplainQuestion", "unclearLabelCheckQuestion", "unclearExplainLastQuestion", "explainWhichOne"] as const) {
      expect(t("en", key), key).not.toMatch(/[“”"]/);
      expect(t("zh-Hans", key), key).not.toMatch(/[「」]/);
    }
  });
});

describe("'the dose isn't right' opens the label-vs-record check", () => {
  it.each([
    "the dosage is not right",
    "that dose isn't right",
    "the dose is wrong",
    "wrong dose",
    "that's not my dose",
    "I actually take a different amount",
    "the amount looks different",
    "剂量不对",
    "不是我的剂量",
  ])("%j", (text) => {
    expect(said(text, 0)).toBe("message");
    const s = reduceSession(toExplain(), { type: "USER_MESSAGE", text, via: "typed" }, CTX);
    expect(s.doseCheck).not.toBeNull();
  });
  it.each(["the dose is right", "yes, that is my correct dosage", "what's my dose?"])("%j does not", (text) => {
    expect(reduceSession(toExplain(), { type: "USER_MESSAGE", text, via: "typed" }, CTX).doseCheck).toBeNull();
  });
  it.each(["I took the wrong dose", "I took 2 instead of 1, the dose is wrong", "what if I take the wrong dose", "我吃错了剂量"])(
    "%j is a dose already taken (or about to be): the safety route, never the comparison",
    (text) => {
      const s = reduceSession(toExplain(), { type: "USER_MESSAGE", text, via: "typed" }, CTX);
      expect(s.state).toBe("safety");
      expect(s.doseCheck).toBeNull();
    },
  );
  it("'I take it twice a day' is not a safety worry", () => {
    expect(reduceSession(toExplain(), { type: "USER_MESSAGE", text: "I take it twice a day", via: "typed" }, CTX).state).toBe("explain");
  });
  it("the event only works on a confirmed explanation", () => {
    expect(reduceSession(toExplain(), { type: "START_DOSE_CHECK" }, CTX).doseCheck).not.toBeNull();
    const listening = run([{ type: "CALL_START" }]);
    expect(reduceSession(listening, { type: "START_DOSE_CHECK" }, CTX)).toBe(listening);
  });
});

describe("asking for a pharmacist callback before any medicine is checked", () => {
  const listening: CommandContext = { ...explain(0), state: "listening", candidateId: null };
  const said3 = (text: string) => {
    const r = interpretUtterance(text, listening);
    return r.kind === "event" ? r.event.type : r.kind;
  };
  it.each([
    "Can you help me to draft a message to pharmacies for callback?",
    "can the pharmacist call me back",
    "I'd like to contact my pharmacy",
    "please ask a pharmacist to ring me",
    "请药剂师给我回电",
  ])("%j opens the pharmacist step (confirm, then review, then 'send')", (text) => {
    expect(said3(text)).toBe("HELP_START");
    const s = reduceSession(run([{ type: "CALL_START" }]), { type: "HELP_START", kind: "pharmacist-callback" }, CTX);
    expect(s.helpFlow).toMatchObject({ kind: "pharmacist-callback", stage: "confirm" });
  });
  it.each(["what does my pharmacy record say", "my pharmacist changed my dose", "I don't want to call the pharmacy"])("%j does not", (text) => {
    expect(said3(text)).not.toBe("HELP_START");
  });
  it("on screen: the companion asks the pharmacist question; nothing is sent", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { enabled: false }, requestId: "r" }))));
    sessionStore.setForTest(run([{ type: "CALL_START" }]));
    render(<CompanionExperience />);
    fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: "Can you help me to draft a message to pharmacies for callback?" } });
    fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
    expect(screen.getByText(t("en", "callbackConfirm"))).toBeInTheDocument();
    expect(sessionStore.getSnapshot().helpFlow?.stage).toBe("confirm");
    expect(vi.mocked(fetch).mock.calls.some(([u]) => u === "/api/help/request")).toBe(false);
    vi.unstubAllGlobals();
  });
  it("the AI meaning-match can choose it on this step too", () => {
    expect(spokenActions(listening).map((a) => a.id)).toContain("pharmacist");
  });
});

describe("ending the call in words", () => {
  const at = (over: Partial<CommandContext>): CommandContext => ({ ...explain(1), ...over });
  const said2 = (text: string, ctx: CommandContext) => {
    const r = interpretUtterance(text, ctx);
    return r.kind === "event" ? r.event.type : r.kind;
  };
  it.each(["No, that's all for now.", "no thanks", "nothing else", "that's everything", "I'm good", "没有了", "no"])(
    "'Anything else I can help with?' → %j ends the call (no loop back to the explanation)",
    (text) => {
      expect(said2(text, at({ helpStage: "sent" }))).toBe("END_CALL");
      expect(said2(text, at({ state: "complete" }))).toBe("END_CALL");
    },
  );
  it("'yes' / 'carry on' after a request still goes back to where she was", () => {
    expect(said2("yes please", at({ helpStage: "sent" }))).toBe("HELP_DISMISS");
    expect(said2("carry on", at({ helpStage: "sent" }))).toBe("HELP_DISMISS");
  });
  it.each(["That's all, let's end it here.", "let's end the call", "end it now", "we're done here", "finish the call", "goodbye", "就到这里"])(
    "%j ends the call from any step",
    (text) => {
      for (const step of [0, 1, 2] as const) expect(said2(text, explain(step))).toBe("END_CALL");
      expect(said2(text, { ...explain(0), state: "listening" })).toBe("END_CALL");
    },
  );
  it("the AI meaning-match may also end the call when she says she needs nothing else", () => {
    expect(spokenActions(at({ helpStage: "sent" })).map((a) => a.id)).toContain("end");
  });
});

describe("'Does this match what's printed on your label?' is answered in words", () => {
  const label = (text: string) => {
    const r = interpretUtterance(text, explain(1));
    return r.kind === "event" && r.event.type === "LABEL_CHECK" ? (r.event.matches ? "matches" : "differs") : r.kind;
  };
  it.each(["yes, it matches", "yes", "it's the same", "my label says the same thing", "No, my label and the dosage you mentioned seem to be the same", "一样"])(
    "%j: the label matches",
    (text) => expect(label(text)).toBe("matches"),
  );
  it.each(["it looks different", "no", "it's different", "doesn't match", "不一样"])("%j: the label looks different (a person helps)", (text) =>
    expect(label(text)).toBe("differs"),
  );
  it("a description of a dose isn't taken as 'it matches' (it could hide a difference): asked again instead", () => {
    expect(label("it says take two tablets in the morning")).not.toBe("matches");
  });
});

describe("answering 'repeat that, or help you contact a pharmacist?'", () => {
  it.each(["yes please help me contact the pharmacist", "can the pharmacist call me", "I'd like a pharmacist to ring me", "请帮我联系药剂师"])(
    "%j opens the pharmacist step (at any step)",
    (text) => {
      for (const step of [0, 1, 2] as const) expect(said(text, step)).toEqual({ type: "HELP_START", kind: "pharmacist-callback" });
    },
  );

  it("a bare yes doesn't say which, so it is asked back instead of ending the explanation", () => {
    expect(said("yes", 2)).toBe("explainWhichOne");
    expect(said("okay", 2)).toBe("explainWhichOne");
  });

  it("'no thanks', 'that's all', 'got it' finish; 'say it again' repeats", () => {
    for (const text of ["no thanks", "that's all", "got it", "I'm fine", "不用了"]) expect(said(text, 2)).toEqual({ type: "UNDERSTOOD" });
    expect(said("can you repeat that", 2)).toEqual({ type: "REPEAT" });
  });

  it("'tell me more' carries on", () => {
    expect(said("tell me more", 0)).toEqual({ type: "EXPLAIN_STEP", direction: "next" });
  });

  it("the AI meaning-match can choose the pharmacist too (its own consent step follows)", () => {
    for (const step of [0, 1, 2] as const) {
      expect(spokenActions(explain(step)).map((a) => a.id)).toContain("pharmacist");
    }
  });
});

describe("the reducer: asking for a pharmacist during the explanation", () => {
  it("opens the confirm step only — nothing is requested until a clear yes", () => {
    const s = run([{ type: "EXPLAIN_STEP", direction: "next" }, { type: "LABEL_CHECK", matches: true }], toExplain());
    expect(s.explainStep).toBe(2);
    const next = reduceSession(s, { type: "HELP_START", kind: "pharmacist-callback" }, CTX);
    expect(next.helpFlow).toEqual({ kind: "pharmacist-callback", stage: "confirm", reason: "help-requested" });
    expect(next.state).toBe("explain"); // the explanation stays where it was
    expect(next.explainStep).toBe(2);
  });

  it("is not a way into family or clinic help from the explanation, nor into the dose check", () => {
    const s = toExplain();
    expect(reduceSession(s, { type: "HELP_START", kind: "family" }, CTX)).toBe(s);
    const dose = { ...s, doseCheck: { ...(run([{ type: "USER_MESSAGE", text: "My doctor changed my dose", via: "typed" }], s).doseCheck!) } };
    expect(reduceSession(dose, { type: "HELP_START", kind: "pharmacist-callback" }, CTX)).toBe(dose);
  });
});

describe("in the call", () => {
  beforeEach(() => {
    sessionStore.reset();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  });
  afterEach(() => vi.unstubAllGlobals());

  const type = (text: string) => {
    fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: text } });
    fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
  };

  it("'what should the next dosage be?' gets a real answer in the transcript, and the explanation doesn't move", () => {
    sessionStore.setForTest(toExplain());
    render(<CompanionExperience />);
    const before = sessionStore.getSnapshot();
    type("what should the next dosage be?");
    expect(screen.getByText("Your current pharmacy record says: Take 1 tablet twice daily with meals.")).toBeInTheDocument();
    expect(screen.queryByText(/didn’t quite catch that/)).toBeNull();
    expect(sessionStore.getSnapshot().explainStep).toBe(before.explainStep);
    expect(sessionStore.getSnapshot().state).toBe("explain");
  });

  it("'please help me contact the pharmacist' at the end opens the consent question; nothing is sent", () => {
    sessionStore.setForTest(run([{ type: "EXPLAIN_STEP", direction: "next" }, { type: "LABEL_CHECK", matches: true }], toExplain()));
    render(<CompanionExperience />);
    type("please help me contact the pharmacist");
    expect(screen.getByText(t("en", "callbackConfirm"))).toBeInTheDocument();
    expect(sessionStore.getSnapshot().helpFlow?.stage).toBe("confirm");
    expect(vi.mocked(fetch).mock.calls.some(([u]) => u === "/api/help/request")).toBe(false);
  });
});

describe("when the fixed phrases don't match: Claude works out the meaning", () => {
  /** A fake server: AI enabled, and the meaning-match answers with `answer`. */
  function stubIntent(answer: Record<string, unknown>) {
    const calls: Array<{ utterance: string; context?: string; actions: Array<{ id: string }> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/companion/understand" && (!init || init.method === "GET")) {
          return new Response(JSON.stringify({ ok: true, data: { enabled: true }, requestId: "r" }));
        }
        if (url === "/api/companion/intent") {
          calls.push(JSON.parse(init!.body as string));
          return new Response(JSON.stringify({ ok: true, data: { action: null, ...answer }, requestId: "r" }));
        }
        throw new Error("offline");
      }),
    );
    return calls;
  }
  const type = (text: string) => {
    fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: text } });
    fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
  };
  const atStep1 = () => run([{ type: "EXPLAIN_STEP", direction: "next" }], toExplain());
  async function settle() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }

  beforeEach(() => sessionStore.reset());
  afterEach(() => vi.unstubAllGlobals());

  it("gibberish: the companion asks them to say it again", async () => {
    stubIntent({ outcome: "unclear" });
    sessionStore.setForTest(toExplain());
    render(<CompanionExperience />);
    await settle();
    type("asdkjh blorp qwe");
    expect(await screen.findByText(t("en", "didntCatch"))).toBeInTheDocument();
  });

  it("an out-of-order request ('the earlier part') goes back — the steps aren't a fixed sequence", async () => {
    const calls = stubIntent({ outcome: "action", action: "back" });
    sessionStore.setForTest(atStep1());
    render(<CompanionExperience />);
    await settle();
    type("the earlier part, once more");
    await settle();
    expect(sessionStore.getSnapshot().explainStep).toBe(0);
    expect(calls[0].context).toBe("hearing their pharmacy record explained, part 2 of 3");
    expect(calls[0].actions.map((a) => a.id)).toEqual(expect.arrayContaining(["next", "back", "pharmacist", "label-differs"]));
  });

  it("understood but not an action: a natural reply, in the transcript and voiced — nothing moves", async () => {
    const line = "That sounds like a long day. Would you like me to carry on, or ask a pharmacist to call you?";
    stubIntent({ outcome: "reply", reply: line });
    sessionStore.setForTest(toExplain());
    render(<CompanionExperience />);
    await settle();
    const before = sessionStore.getSnapshot();
    type("I had a long day today");
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(sessionStore.getSnapshot().explainStep).toBe(before.explainStep);
    expect(sessionStore.getSnapshot().helpFlow).toBeNull();
  });

  it("asking for the dose in any wording: Claude can only pick the fixed record line, never write a dose", async () => {
    const calls = stubIntent({ outcome: "action", action: "dose" });
    sessionStore.setForTest(toExplain());
    render(<CompanionExperience />);
    await settle();
    type("uh I'm asking for those each, the amount");
    expect(await screen.findByText("Your current pharmacy record says: Take 1 tablet twice daily with meals.")).toBeInTheDocument();
    expect(calls[0].actions.map((a) => a.id)).toContain("dose");
    expect(sessionStore.getSnapshot().explainStep).toBe(0);
  });

  it("'that dose isn't right' in any wording: Claude can open the label-vs-record check (nothing decided)", async () => {
    stubIntent({ outcome: "action", action: "dose-wrong" });
    sessionStore.setForTest(toExplain());
    render(<CompanionExperience />);
    await settle();
    type("hmm, I don't think that's how many I'm meant to have");
    await settle();
    expect(sessionStore.getSnapshot().doseCheck).not.toBeNull();
    expect(sessionStore.getSnapshot().state).toBe("explain");
  });

  it("a new call starts with a clean chat: the last call's lines are never replayed into it", async () => {
    stubIntent({ outcome: "unclear" });
    sessionStore.setForTest(toExplain());
    render(<CompanionExperience />);
    await settle();
    type("hmm well I suppose it might be sort of");
    expect(await screen.findByText(t("en", "didntCatch"))).toBeInTheDocument();
    act(() => sessionStore.setForTest(run([{ type: "END_CALL" }, { type: "CALL_START" }], sessionStore.getSnapshot())));
    await settle();
    expect(sessionStore.getSnapshot().state).toBe("listening");
    expect(screen.queryByText(t("en", "didntCatch"))).toBeNull();
    expect(screen.queryByText("hmm well I suppose it might be sort of")).toBeNull();
  });

  it("a sentence is understood before anything is done: a keyword inside it doesn't steer the call", async () => {
    const line = "It’s good to take it slowly. Would you like to hear the next part, or go back?";
    const calls = stubIntent({ outcome: "reply", reply: line });
    sessionStore.setForTest(toExplain());
    render(<CompanionExperience />);
    await settle();
    type("I'm not ready for the next part yet, I was just thinking");
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(sessionStore.getSnapshot().explainStep).toBe(0); // "next" in the sentence didn't move her on
    expect(calls[0].actions.map((a) => a.id)).toEqual(expect.arrayContaining(["next", "repeat", "end-call", "get-help"]));
  });

  it("a short command still acts at once, without asking Claude", async () => {
    const calls = stubIntent({ outcome: "unclear" });
    sessionStore.setForTest(toExplain());
    render(<CompanionExperience />);
    await settle();
    type("next part please");
    expect(sessionStore.getSnapshot().explainStep).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it("a decision only she can make is never put to Claude, however long the sentence", async () => {
    const calls = stubIntent({ outcome: "reply", reply: "Shall we carry on?" });
    sessionStore.setForTest(atStep1());
    render(<CompanionExperience />);
    await settle();
    type("yes, it matches, the label says exactly the same thing as you just read");
    expect(sessionStore.getSnapshot().explainStep).toBe(2);
    expect(calls).toHaveLength(0);
  });

  it("no loop: a second miss on the same question gets one plain question, not the same words again", async () => {
    stubIntent({ outcome: "unclear" });
    sessionStore.setForTest(atStep1());
    render(<CompanionExperience />);
    await settle();
    type("hmm well I suppose it might be sort of");
    expect(await screen.findByText(t("en", "didntCatch"))).toBeInTheDocument();
    type("blorp the thing with the stuff");
    const plain = t("en", "crispYesNo").replace("{question}", t("en", "labelCheckPrompt"));
    expect(await screen.findByText(plain)).toBeInTheDocument();
    expect(screen.getAllByText(t("en", "didntCatch"))).toHaveLength(1);
  });

  it("no loop off a decision either: the second miss gets different words and a way out", async () => {
    stubIntent({ outcome: "unclear" });
    sessionStore.setForTest(toExplain());
    render(<CompanionExperience />);
    await settle();
    type("hmm well I suppose it might be sort of");
    expect(await screen.findByText(t("en", "didntCatch"))).toBeInTheDocument();
    type("blorp the thing with the stuff");
    expect(await screen.findByText(t("en", "stillNotSure"))).toBeInTheDocument();
  });

  it("a reply that fails the guard is never shown, even if it reaches the browser: the fixed line instead", async () => {
    stubIntent({ outcome: "reply", reply: "You should take 2 tablets tonight. Anything else?" });
    sessionStore.setForTest(toExplain());
    render(<CompanionExperience />);
    await settle();
    type("I had a long day today");
    expect(await screen.findByText(t("en", "unclearExplain"))).toBeInTheDocument();
    expect(screen.queryByText(/2 tablets tonight/)).toBeNull();
  });
});
