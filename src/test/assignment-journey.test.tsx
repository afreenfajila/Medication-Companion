import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { resolveExplanation } from "@/lib/content/explanation";
import { isApprovedSpeech } from "@/lib/content/speech-guard";
import { t } from "@/lib/content/translations";
import { classifySafety } from "@/lib/safety/classify";
import { sessionStore } from "@/lib/session/session-store";
import { guardRequestedState, type Session } from "@/lib/session/state-machine";
import { speakableText } from "@/lib/voice/speakable";
import { askUnknown, chooseShowMedicine, grantCamera, resolve, run, startCall, submitDemo, toConfirmMatch, toExplain } from "./helpers";

// One test per claim in the Assignment 02 concept deck, in deck order.

beforeEach(() => {
  vi.useFakeTimers();
  sessionStore.reset();
});
afterEach(() => vi.useRealTimers());

const send = (text: string) => {
  fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: text } });
  fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
};
const typeIn = (text: string) => {
  const box = screen.getByRole("textbox");
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest("form")!);
};
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const INSTRUCTION = /Take 1 tablet|每日两次/;

describe("1. landing has one prominent CTA only", () => {
  it("exactly one primary button, and it is Call with companion", () => {
    const { container } = render(<CompanionExperience />);
    const primaries = container.querySelectorAll('[data-variant="primary"]');
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent("Call with companion");
    expect(screen.queryByRole("button", { name: /show medicine|schedule|repeat|get help|end call/i })).toBeNull();
  });
});

describe("2. a call must start before contextual options appear", () => {
  it("the reducer refuses routes and messages before the call starts", () => {
    const s = run([askUnknown, chooseShowMedicine]);
    expect(s.state).toBe("start");
    expect(s.contextualActions).toEqual([]);
  });
});

describe("primary journey (deck): question → Show medicine → camera → possible match → confirm → bilingual explanation → I understand", () => {
  it("runs end to end on the demo label with no network, camera or AI", () => {
    render(<CompanionExperience />);
    click(/call with companion/i);
    send("What is this for? When do I take it?");
    expect(screen.getByText("Let’s check this together. Would you like to show me the medicine label?")).toBeInTheDocument();
    click(/show medicine/i);
    click(/yes, switch camera/i); // consent before the camera
    click(/use demo label/i); // jsdom has no camera → demo/sample/typed fallback
    act(() => void vi.advanceTimersByTime(1000));

    expect(screen.getByText("I think this may be your Metformin 500 mg. Is this the one you’re holding?")).toBeInTheDocument(); // possible match, not certain
    expect(screen.queryByText(INSTRUCTION)).toBeNull();
    click(/yes, this is my medicine/i);
    // Moving on is said or typed — only the language switch is a button.
    expect(screen.queryByRole("button", { name: /^(next|back|i understand)$/i })).toBeNull();
    typeIn("next");
    expect(screen.getByText("Take 1 tablet twice daily with meals.")).toBeInTheDocument();
    click("中文");
    expect(screen.getByText("随餐每日服用一片，每日两次。")).toBeInTheDocument();
    typeIn("下一步");
    typeIn("我明白了");
    expect(screen.getByText(t("zh-Hans", "completeHeading"))).toBeInTheDocument();
  });

  it("switches language by itself when the person uses Chinese, and back for English", () => {
    render(<CompanionExperience />);
    click(/call with companion/i);
    typeIn("这个药是做什么用的？");
    expect(screen.getByLabelText(t("zh-Hans", "typeLabel"))).toBeInTheDocument();
    typeIn("What is this for please");
    expect(screen.getByLabelText(t("en", "typeLabel"))).toBeInTheDocument();
  });
});

describe("3. explanation cannot appear before confirmation", () => {
  it("no explanation for a possible match, and ?state=explain cannot open it", () => {
    const possible = toConfirmMatch();
    expect(resolveExplanation(possible, "en")).toBeNull();
    expect(run([{ type: "EXPLAIN_STEP", direction: "next" }, { type: "UNDERSTOOD" }], possible).state).toBe("confirm-match");
    expect(guardRequestedState(possible, "explain")).toEqual({ state: "confirm-match", redirected: true });
  });
});

describe("4. no-match / unreadable blocks instructions — one retry, then human help only", () => {
  const toGuidance = () => run([startCall, askUnknown, chooseShowMedicine, grantCamera]);

  it.each(["sample_unreadable_label", "sample_mismatch_label"] as const)("%s → safety with no instruction", (asset) => {
    const s = run([submitDemo(asset), resolve], toGuidance());
    expect(s.state).toBe("safety");
    expect(resolveExplanation(s, "en")).toBeNull();
    expect(speakableText(s, (k) => t("en", k), null)).not.toMatch(INSTRUCTION);
  });

  it("No, try again → one retry → a second failure leaves only demo-labelled human help", () => {
    render(<CompanionExperience />);
    click(/call with companion/i);
    send("What is this for?");
    click(/show medicine/i);
    click(/yes, switch camera/i);
    click(/use demo label/i);
    act(() => void vi.advanceTimersByTime(1000));
    click("No, try again");

    click("Try another photo"); // the one retry
    click(/use demo label/i);
    act(() => void vi.advanceTimersByTime(1000));
    click("No, try again");

    expect(screen.queryByRole("button", { name: "Try another photo" })).toBeNull();
    expect(screen.getByText(t("en", "retryUsed"))).toBeInTheDocument();
    for (const name of ["Check with pharmacy — demo", "Ask a trusted helper — demo", "Contact clinic — demo"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByText(INSTRUCTION)).toBeNull();
  });

  it("the reducer enforces the limit too, not just the UI", () => {
    const deny = (s: Session) =>
      run([{ type: "CONFIRM_MATCH", candidateId: s.candidate!.candidateId, decision: "denied" }], s);
    const once = run([{ type: "TRY_ANOTHER_LABEL" }, submitDemo(), resolve], deny(toConfirmMatch()));
    const blocked = deny(once);
    expect(run([{ type: "TRY_ANOTHER_LABEL" }], blocked)).toBe(blocked);
  });
});

describe("5. safety triggers route unsupported and urgent questions correctly", () => {
  it.each([
    ["Can I double my dose?", "unsupported-medical-question"],
    ["I missed a dose", "unsupported-medical-question"],
    ["Does it have side effects?", "adverse-effect-question"],
    ["I have chest pain", "urgent-risk"],
  ] as const)("%s → %s", (text, reason) => {
    expect(classifySafety(text)).toMatchObject({ reason });
    const s = run([startCall, { type: "USER_MESSAGE", text }]);
    expect(s.state).toBe("safety");
    expect(s.safetyReason).toBe(reason);
  });

  it("urgent wording shows the urgent message with no Try another photo", () => {
    render(<CompanionExperience />);
    click(/call with companion/i);
    send("I can't breathe");
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(t("en", "urgentHeading"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try another photo" })).toBeNull();
  });
});

describe("6. English/Chinese toggle changes explanation content without resetting confirmation", () => {
  it("same step, still confirmed, different language", () => {
    const en = run([{ type: "EXPLAIN_STEP", direction: "next" }], toExplain());
    const zh = run([{ type: "SET_LANGUAGE", language: "zh-Hans" }], en);
    expect(zh.state).toBe("explain");
    expect(zh.matchStatus).toBe("confirmed");
    expect(zh.explainStep).toBe(1);
    expect(resolveExplanation(zh, "zh-Hans")!.explanation.instruction).not.toBe(
      resolveExplanation(en, "en")!.explanation.instruction,
    );
  });
});

describe("voice layer speaks approved text only", () => {
  it("every line the companion says on the journey passes the server's speech allowlist", () => {
    const explain = toExplain();
    const states: Session[] = [
      run([startCall]),
      run([startCall, askUnknown]),
      run([startCall, askUnknown, chooseShowMedicine]),
      run([startCall, askUnknown, chooseShowMedicine, grantCamera]),
      toConfirmMatch(),
      explain,
      run([{ type: "EXPLAIN_STEP", direction: "next" }], explain),
      run([{ type: "EXPLAIN_STEP", direction: "next" }, { type: "EXPLAIN_STEP", direction: "next" }], explain),
      run([{ type: "UNDERSTOOD" }], explain),
      run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo("sample_unreadable_label"), resolve]),
      run([startCall, { type: "USER_MESSAGE", text: "I have chest pain" }]),
    ];
    for (const lang of ["en", "zh-Hans"] as const) {
      for (const s of states) {
        const line = speakableText(s, (k) => t(lang, k), resolveExplanation(s, lang));
        if (line) expect(isApprovedSpeech(line), line).toBe(true);
      }
    }
  });
});
