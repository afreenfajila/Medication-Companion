import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallProgress } from "@/components/companion/call-progress";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { t } from "@/lib/content/translations";
import { STAGE_CHIPS, callStage, explainUnlocked, progressIndex, type CallStage } from "@/lib/session/call-stage";
import { dispatch, sessionStore } from "@/lib/session/session-store";
import type { Session } from "@/lib/session/state-machine";
import { askUnknown, chooseShowMedicine, grantCamera, resolve, run, startCall, submitDemo, toConfirmMatch, toExplain } from "./helpers";

/**
 * The call's safety progress (owner brief, slide 8): a stage derived from the reducer, chips at the
 * moments the gates move, a progress row with Explain locked until she confirms — and no dose,
 * timing or instruction text anywhere before that.
 */
const INSTRUCTION = /Take 1 tablet|twice daily|with meals/i;
const en = (key: Parameters<typeof t>[1]) => t("en", key);

describe("stage → chip", () => {
  it("each stage shows its own words and colour (never colour alone)", () => {
    const shown = Object.fromEntries(Object.entries(STAGE_CHIPS).map(([stage, c]) => [stage, [en(c!.key).toUpperCase(), c!.tone]]));
    expect(shown).toEqual({
      capturing: ["LABEL PHOTO TAKEN", "neutral"],
      comparing: ["CHECKING LABEL AGAINST YOUR RECORD", "neutral"],
      possibleMatch: ["POSSIBLE MATCH · NOT VERIFIED", "coral"],
      confirmed: ["CONFIRMED BY YOU · UNLOCKED", "teal"],
      explaining: ["FROM YOUR VERIFIED PLAN", "teal"],
      blocked: ["BLOCKED · NO INSTRUCTIONS", "coral"],
      handoff: ["PHARMACIST REQUEST · REVIEW BEFORE SENDING", "blue"],
    });
    for (const stage of ["idle", "asking", "done"] as CallStage[]) expect(STAGE_CHIPS[stage]).toBeUndefined();
  });
});

describe("the stage is derived from the reducer, never stored", () => {
  it("follows the journey: ask → show → check → possible match → confirmed → explaining", () => {
    expect(callStage(run([]))).toBe("idle");
    expect(callStage(run([startCall, askUnknown]))).toBe("asking");
    expect(callStage(run([startCall, askUnknown, chooseShowMedicine]))).toBe("capturing");
    expect(callStage(run([startCall, askUnknown, chooseShowMedicine, grantCamera]))).toBe("capturing");
    expect(callStage(run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo()]))).toBe("comparing");
    expect(callStage(toConfirmMatch())).toBe("possibleMatch");
    expect(callStage(toExplain())).toBe("confirmed");
    expect(callStage(run([{ type: "EXPLAIN_STEP", direction: "next" }], toExplain()))).toBe("explaining");
  });

  it.each(["unsure", "denied"] as const)("'%s' at the possible match is blocked (or back to the label), never confirmed", (decision) => {
    const s = toConfirmMatch();
    const after = callStage(run([{ type: "CONFIRM_MATCH", candidateId: s.candidate!.candidateId, decision }], s));
    expect(["blocked", "capturing"]).toContain(after);
  });

  it("an unreadable label is blocked; a pharmacist request under review is a handoff", () => {
    expect(callStage(run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo("sample_unreadable_label"), resolve]))).toBe("blocked");
    const asking = run([startCall, askUnknown]);
    const review = run([{ type: "HELP_START", kind: "pharmacist-callback" }, { type: "HELP_CONFIRM", granted: true }], run([{ type: "GET_HELP" }], asking));
    expect(review.helpFlow?.stage).toBe("review");
    expect(callStage(review)).toBe("handoff");
  });
});

describe("the progress row", () => {
  const tt = (k: Parameters<typeof t>[1]) => t("en", k);

  it("'Explain' is locked until the medicine is confirmed", () => {
    for (const stage of ["asking", "capturing", "comparing", "possibleMatch", "blocked", "handoff"] as CallStage[]) {
      expect(explainUnlocked(stage), stage).toBe(false);
    }
    for (const stage of ["confirmed", "explaining", "done"] as CallStage[]) expect(explainUnlocked(stage), stage).toBe(true);

    const { rerender } = render(<CallProgress stage="possibleMatch" t={tt} />);
    const explain = () => document.querySelector('[data-step="progressExplain"]')!;
    expect(explain().querySelector(".lucide-lock")).not.toBeNull();
    expect(explain()).toHaveTextContent("locked until you confirm the medicine");
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent("Confirm");
    rerender(<CallProgress stage="explaining" t={tt} />);
    expect(explain().querySelector(".lucide-lock")).toBeNull();
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent("Explain");
  });

  it("blocked or handing off: the matching chip instead of advancing; announced politely", () => {
    for (const stage of ["blocked", "handoff"] as CallStage[]) {
      expect(progressIndex(stage)).toBeNull();
      const { unmount } = render(<CallProgress stage={stage} t={tt} />);
      expect(document.querySelector("ol")).toBeNull();
      expect(screen.getAllByText(tt(STAGE_CHIPS[stage]!.key))).toHaveLength(2); // the chip, and the polite announcement
      expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(tt(STAGE_CHIPS[stage]!.key));
      unmount();
    }
  });
});

describe("in the call", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStore.reset();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const chips = () => [...document.querySelectorAll("[data-transcript] [data-chip]")].map((c) => c.textContent);

  const blockedStages: [string, () => Session][] = [
    ["asking", () => run([startCall, askUnknown])],
    ["capturing (the consent question)", () => run([startCall, askUnknown, chooseShowMedicine])],
    ["capturing (Take photo / Upload)", () => run([startCall, askUnknown, chooseShowMedicine, grantCamera])],
    ["comparing", () => run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo()])],
    ["possibleMatch", () => toConfirmMatch()],
    ["blocked (not sure)", () => {
      const s = toConfirmMatch();
      return run([{ type: "CONFIRM_MATCH", candidateId: s.candidate!.candidateId, decision: "unsure" }], s);
    }],
    ["blocked (unreadable label)", () => run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo("sample_unreadable_label"), resolve])],
  ];
  it.each(blockedStages)("no dose, timing or instruction text before the medicine is confirmed: %s", (_name, at) => {
    const s = at();
    expect(["confirmed", "explaining"]).not.toContain(callStage(s));
    sessionStore.setForTest(s);
    render(<CompanionExperience />);
    act(() => void vi.advanceTimersByTime(4000));
    expect(document.body.textContent).not.toMatch(INSTRUCTION);
  });

  it("the possible-match chip never appears alongside instruction text", () => {
    sessionStore.setForTest(toConfirmMatch());
    render(<CompanionExperience />);
    expect(chips()).toContain("Possible match · not verified");
    expect(document.body.textContent).not.toMatch(INSTRUCTION);
  });

  it("chips appear where the gates move: confirmed by her, then the record", () => {
    sessionStore.setForTest(toConfirmMatch());
    render(<CompanionExperience />);
    fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: "yes, that's my medicine" } });
    fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
    expect(chips()).toEqual(["Possible match · not verified", "Confirmed by you · unlocked"]);
    act(() => dispatch({ type: "EXPLAIN_STEP", direction: "next" }));
    expect(chips()).toEqual(["Possible match · not verified", "Confirmed by you · unlocked", "From your verified plan"]);
    expect(screen.getByText("Take 1 tablet twice daily with meals.")).toBeInTheDocument();
    expect(document.querySelector('[data-progress="explaining"]')).not.toBeNull();
  });

  it("a demo label being checked: 'checking against your record'; a photo also says it was taken", () => {
    sessionStore.setForTest(run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo()]));
    render(<CompanionExperience />);
    expect(chips()).toEqual(["Checking label against your record"]);
  });

  it("a photo being checked: 'label photo taken', then 'checking label against your record'", () => {
    const photo = { type: "SUBMIT_LABEL", input: { mode: "image", source: "upload", mimeType: "image/jpeg", byteSize: 1000 } } as const;
    sessionStore.setForTest(run([startCall, askUnknown, chooseShowMedicine, grantCamera, photo]));
    render(<CompanionExperience />);
    expect(chips().slice(0, 2)).toEqual(["Label photo taken", "Checking label against your record"]);
    // Offline here, so the photo can't be read: the safe fallback is blocked, never an explanation.
    expect(chips().slice(2)).toEqual(["Blocked · no instructions"]);
    expect(document.body.textContent).not.toMatch(INSTRUCTION);
  });
});

describe("editing a callback summary resets approval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStore.reset();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a send for the version before the edit sends nothing; only the current version can be sent", () => {
    const s = run([
      { type: "SET_DOSE_SCENARIO", scenario: "conflict-sent" },
      startCall,
      { type: "USER_MESSAGE", text: "My doctor changed my medicine, but this box still says the old amount. How many should I take now?", via: "typed" },
      chooseShowMedicine,
      grantCamera,
      submitDemo(),
      resolve,
    ]);
    sessionStore.setForTest(run([{ type: "CONFIRM_MATCH", candidateId: s.candidate!.candidateId, decision: "confirmed" }], s));
    render(<CompanionExperience />);
    for (const words of ["yes", "ask a pharmacist", "yes please"]) {
      fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: words } });
      fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
    }
    const cb = () => sessionStore.getSnapshot().doseCheck!.callback!;
    expect(cb().status).toBe("reviewing");
    expect(callStage(sessionStore.getSnapshot())).toBe("handoff");
    expect(chips()).toContain("Pharmacist request · review before sending");
    const reviewed = cb().revision;

    fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: "change the callback number to 0000 0199" } });
    fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
    expect(cb().revision).toBeGreaterThan(reviewed);

    act(() => dispatch({ type: "DOSE", action: { kind: "send", revision: reviewed } }));
    expect(cb().status).toBe("reviewing"); // the old approval doesn't carry over
    act(() => dispatch({ type: "DOSE", action: { kind: "send", revision: cb().revision } }));
    expect(cb().status).toBe("submitting");
  });
  const chips = () => [...document.querySelectorAll("[data-transcript] [data-chip]")].map((c) => c.textContent);
});
