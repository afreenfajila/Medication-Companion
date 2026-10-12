import { fireEvent, render, screen } from "@testing-library/react";
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
  it.each(["what should the next dosage be?", "What dose should I take now?", "how many tablets should I take", "我应该吃多少？", "剂量是多少"])(
    "%j gets the dose boundary with the record's own words — never a skip ahead",
    (text) => {
      for (const step of [0, 1, 2] as const) expect(said(text, step)).toBe("explainDoseQuestion");
    },
  );

  it("the dose answer quotes the confirmed record, chooses no dose, and is approved for the voice", () => {
    const view = resolveExplanation(toExplain(), "en")!;
    const line = fillRecordFacts(t("en", "explainDoseQuestion"), view, "en");
    expect(line).toMatch(/^I can’t decide your dose for you\./);
    expect(line).toContain(`“${view.explanation.instruction}”`);
    expect(line).toMatch(/a pharmacist can check it with you/);
    expect(isApprovedSpeech(line)).toBe(true);
    expect(isApprovedSpeech(fillRecordFacts(t("zh-Hans", "explainDoseQuestion"), resolveExplanation(toExplain(), "zh-Hans")!, "zh-Hans"))).toBe(true);
  });

  it("not every 'how much' is a dose question", () => {
    expect(said("how much does it cost?", 0)).not.toBe("explainDoseQuestion");
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
    fireEvent.change(screen.getByLabelText(/type it here/i), { target: { value: text } });
    fireEvent.submit(screen.getByLabelText(/type it here/i).closest("form")!);
  };

  it("'what should the next dosage be?' gets a real answer in the transcript, and the explanation doesn't move", () => {
    sessionStore.setForTest(toExplain());
    render(<CompanionExperience />);
    const before = sessionStore.getSnapshot();
    type("what should the next dosage be?");
    expect(screen.getByText(/^I can’t decide your dose for you\. Your pharmacy record, checked on .*, says: “Take 1 tablet twice daily with meals\.”/)).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText(/type it here/i), { target: { value: text } });
    fireEvent.submit(screen.getByLabelText(/type it here/i).closest("form")!);
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
