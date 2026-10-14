import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { t } from "@/lib/content/translations";
import type { DoseScenario } from "@/lib/dose-check/dose-check";
import { sessionStore } from "@/lib/session/session-store";
import { interpretUtterance, type CommandContext } from "@/lib/voice/commands";
import { askUnknown, chooseShowMedicine, grantCamera, resolve, run, startCall, submitDemo, toConfirmMatch } from "./helpers";

/**
 * Voice/text only (owner brief, 14 October 2026): every action is said or typed, through the same
 * code checks as before. The only buttons in a call are Help, the message pill's send arrow, the
 * mic, End call, Take photo / Upload (inside the companion's message, after a consent yes) and the
 * open camera's own capture / flip / close.
 */
const ALLOWED = new Set([
  "Help",
  "Send message",
  "Mute microphone",
  "Unmute microphone",
  "Turn microphone back on",
  "Tap to talk",
  "Tap to send",
  "End call",
  "Take photo",
  "Upload",
  "Take photo of label",
  "Show my face instead",
  "Show the medicine camera",
  "Close camera",
]);
const names = () => screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") || b.textContent?.trim() || "");
const type = (words: string) => {
  fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: words } });
  fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
};
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(2000); // the simulated service answers after 1.2 s
  });

beforeEach(() => {
  vi.useFakeTimers();
  sessionStore.reset();
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(() => new Promise(() => {})) } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("only the allowed buttons, in every step of a call", () => {
  const steps: [string, () => ReturnType<typeof run>][] = [
    ["listening, after an offer", () => run([startCall, askUnknown])],
    ["the consent question", () => run([startCall, askUnknown, chooseShowMedicine])],
    ["Take photo / Upload", () => run([startCall, askUnknown, chooseShowMedicine, grantCamera])],
    ["the camera open", () => run([startCall, askUnknown, chooseShowMedicine, grantCamera, { type: "OPEN_CAMERA" }])],
    ["a no to the camera", () => run([startCall, askUnknown, chooseShowMedicine, { type: "CAMERA_CONSENT", granted: false }])],
    ["the possible match", () => toConfirmMatch()],
    ["getting a person", () => run([{ type: "GET_HELP" }], run([startCall, askUnknown]))],
  ];
  it.each(steps)("%s", (_name, at) => {
    sessionStore.setForTest(at());
    render(<CompanionExperience />);
    for (const name of names()) expect(ALLOWED.has(name), `unexpected button "${name}"`).toBe(true);
  });
});

describe("consequential words go through the same code checks", () => {
  const ctx = (over: Partial<CommandContext>): CommandContext => ({
    state: "listening",
    contextualActions: [],
    candidateId: null,
    explainStep: 0,
    cameraLive: false,
    pendingSpokenMedicineName: null,
    ...over,
  });
  const said = (text: string, c: CommandContext) => {
    const r = interpretUtterance(text, c);
    return r.kind === "event" ? r.event : r.kind === "reply" ? r.key : r.kind;
  };
  const confirm = ctx({ state: "confirm-match", candidateId: "c1" });

  it.each(["yes", "that's right", "yes, that's the one"])("medicine: %j confirms", (text) => {
    expect(said(text, confirm)).toEqual({ type: "CONFIRM_MATCH", candidateId: "c1", decision: "confirmed" });
  });
  it.each(["no", "that's not it", "no, that's not my medicine"])("medicine: %j says it isn't", (text) => {
    expect(said(text, confirm)).toEqual({ type: "CONFIRM_MATCH", candidateId: "c1", decision: "denied" });
  });
  it.each(["maybe", "hmm", "I think so"])("medicine: %j is unsure, never a yes", (text) => {
    expect(said(text, confirm)).toEqual({ type: "CONFIRM_MATCH", candidateId: "c1", decision: "unsure" });
  });

  it.each([
    ["the medicine", confirm],
    ["a help request", ctx({ helpStage: "confirm" })],
  ])("'ok' alone never says yes to %s: it is checked, gently", (_name, c) => {
    for (const ok of ["ok", "okay", "OK.", "alright"]) expect(said(ok, c)).toBe("okIsItYes");
    expect(t("en", "okIsItYes")).toBe("Just so I’ve got it right — do you mean yes?");
  });

  it("'okay' does answer the camera question (it only brings up Take photo / Upload)", () => {
    expect(said("okay", ctx({ state: "camera-permission" }))).toEqual({ type: "CAMERA_CONSENT", granted: true });
  });
});

describe("the reviewed callback: only an explicit 'send', for the exact revision", () => {
  function toReview(scenario: DoseScenario) {
    const s = run([
      { type: "SET_DOSE_SCENARIO", scenario },
      startCall,
      { type: "USER_MESSAGE", text: "My doctor changed my medicine, but this box still says the old amount. How many should I take now?", via: "typed" },
      chooseShowMedicine,
      grantCamera,
      submitDemo(),
      resolve,
    ]);
    sessionStore.setForTest(run([{ type: "CONFIRM_MATCH", candidateId: s.candidate!.candidateId, decision: "confirmed" }], s));
    render(<CompanionExperience />);
    for (const words of ["yes", "ask a pharmacist", "yes please"]) type(words);
    expect(sessionStore.getSnapshot().doseCheck?.callback?.status).toBe("reviewing");
  }
  const cb = () => sessionStore.getSnapshot().doseCheck!.callback!;

  it("'ok' and a plain 'yes' never send; the review stays on screen as text", () => {
    toReview("conflict-sent");
    expect(screen.getByText(/Please check these details/)).toBeInTheDocument();
    for (const words of ["ok", "yes", "maybe"]) {
      type(words);
      expect(cb().status).toBe("reviewing");
    }
  });

  it("an edit makes a new revision; the next 'send' is for that revision only", () => {
    toReview("conflict-sent");
    const before = cb().revision;
    type("change the callback number to 0000 0199");
    expect(cb().revision).toBeGreaterThan(before);
    expect(cb().status).toBe("reviewing"); // reviewed again before anything goes
    expect(cb().draft.callbackContact).toBe("0000 0199");
    type("send the request");
    expect(cb().status).toBe("submitting");
    expect(cb().revision).toBeGreaterThan(before);
  });

  it("after a failure: 'try again' re-sends; 'show pharmacy contact' shows the number as text", async () => {
    toReview("conflict-fails");
    type("send");
    await flush();
    expect(cb().status).toBe("failed");
    type("show pharmacy contact");
    await flush();
    expect(screen.getByText(/You can call BrightCare Pharmacy on 0000 0123/)).toBeInTheDocument();
    type("try again");
    expect(cb().status).toBe("submitting");
  });
});

describe("after tapping Help, checking a medicine is still possible", () => {
  const SAID = "No, uh, can I show my medication label? So that you can check and tell me what medication I should take tonight?";

  it("on the help step, asking to show the label goes back to the label question (consent first)", () => {
    const helped = run([{ type: "GET_HELP" }], run([startCall, askUnknown]));
    expect(helped.safetyReason).toBe("help-requested");
    const r = interpretUtterance(SAID, {
      state: "safety",
      contextualActions: [],
      candidateId: null,
      explainStep: 0,
      cameraLive: false,
      pendingSpokenMedicineName: null,
      safetyReason: "help-requested",
      labelRouteSelected: false,
      canRetryLabel: true,
    });
    expect(r).toEqual({ kind: "event", event: { type: "RETURN_TO_CALL", showLabel: true } });
    const back = run([{ type: "RETURN_TO_CALL", showLabel: true }], helped);
    expect(back.state).toBe("camera-permission");
    expect(back.labelRouteSelected).toBe(true);
  });

  it("never sidesteps the label limit: after a label that couldn't be checked, it is not this route", () => {
    const unreadable = run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo("sample_unreadable_label"), resolve]);
    expect(unreadable.state).toBe("safety");
    expect(unreadable.safetyReason).not.toBe("help-requested");
    expect(run([{ type: "RETURN_TO_CALL", showLabel: true }], unreadable)).toBe(unreadable);
  });

  it("in the call: Help, then the sentence typed, reaches the camera/photo question", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(sessionStore.getSnapshot().state).toBe("safety");
    type(SAID);
    expect(sessionStore.getSnapshot().state).toBe("camera-permission");
    expect(screen.getByText(t("en", "cameraPermissionHeading"))).toBeInTheDocument();
  });
});

describe("what is heard is always in the chat", () => {
  it("tapping Help on the help step says its line again — and shows it again", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const ask = t("en", "safetyAsk");
    expect(screen.getAllByText(ask)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getAllByText(ask)).toHaveLength(2);
    type("repeat");
    expect(screen.getAllByText(ask)).toHaveLength(3);
  });
});
