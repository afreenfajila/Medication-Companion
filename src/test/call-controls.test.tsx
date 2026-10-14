import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { CallFooter } from "@/components/ui/call-footer";
import { t } from "@/lib/content/translations";
import { dispatch, sessionStore } from "@/lib/session/session-store";
import { BrowserVoiceProvider } from "@/lib/voice/browser-voice";
import { setVoiceAdaptersForTest, setVoiceProvider } from "@/lib/voice/use-voice";
import { FakeCapture, FakeDetector, FakeSpeechAdapter, FakeTranscription, flush, frame } from "./fake-audio";
import { createFakeSpeech } from "./fake-speech";
import { chooseShowMedicine, grantCamera, resolve, run, startCall, submitDemo } from "./helpers";

/**
 * The active call, as an AI voice call (owner decision, 14 October 2026): Help in the header,
 * one control row (message pill + send arrow, mic, End call), and every other action said or
 * typed. The only other buttons are Take photo / Upload inside a companion message after a
 * consent yes, and the open camera's own controls. The whole transcript stays readable.
 */

function install(opts?: Parameters<typeof createFakeSpeech>[0]) {
  const fake = createFakeSpeech(opts);
  setVoiceProvider(new BrowserVoiceProvider(fake.env));
  return fake;
}

/** Realtime engines (OpenAI-shaped input with mic and local VAD, ElevenLabs-shaped voice), all fakes. */
function installRealtime({ vad = true } = {}) {
  const transcription = new FakeTranscription();
  const speech = new FakeSpeechAdapter();
  const capture = new FakeCapture();
  const detector = new FakeDetector(vad);
  setVoiceAdaptersForTest({ transcription: () => transcription, speech: () => speech, capture: () => capture, detector: () => detector });
  return { transcription, speech, capture, detector };
}

const tick = (ms = 400) => act(() => vi.advanceTimersByTime(ms));
const callButton = () => screen.getByRole("button", { name: /call with companion/i });
/** Starts a call with the browser engines and lets the greeting finish, so the mic opens. */
function startHealthyCall(fake: ReturnType<typeof createFakeSpeech>) {
  fireEvent.click(callButton());
  act(() => fake.utterances.at(-1)?.onend?.());
  tick();
}
/** Every button on screen, by accessible name (icon buttons have no visible words). */
const buttonNames = () => screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") || b.textContent?.trim());
const CALL_CONTROLS = ["Help", "Send message", "Mute microphone", "End call"];
const muteButton = () => screen.getByRole("button", { name: /^(mute|unmute) microphone$/i });
const helpPill = () => screen.getByRole("button", { name: /^help$/i });
const type = (words: string) => {
  fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: words } });
  fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
};

beforeEach(() => {
  vi.useFakeTimers();
  sessionStore.reset();
});
afterEach(() => {
  setVoiceProvider(null);
  setVoiceAdaptersForTest(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("persistent call controls", () => {
  it("a normal call shows only Help, the message pill (with its send arrow), the mic and End call", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    expect(fake.recognitions[0].started).toBe(true); // a healthy, listening call
    expect(buttonNames()).toEqual(CALL_CONTROLS);
    expect(screen.queryAllByRole("link")).toHaveLength(0); // About is on the start screen
    expect(screen.getAllByRole("textbox")).toHaveLength(1); // the pill: always there, typing works like speech
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled(); // until something is typed
    expect(screen.queryByText("Say it, or type it here")).toBeNull();
    expect(screen.queryByRole("button", { name: /show medicine|repeat|type instead|interrupt|latest message|get help/i })).toBeNull();
    // The disclosure words stay on screen, under the controls.
    expect(screen.getByText("AI guide · Not a pharmacist or doctor")).toBeInTheDocument();
  });

  it("the mic: 'Mute microphone' ↔ 'Unmute microphone' with aria-pressed; each change is announced politely", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    const status = () => screen.getAllByRole("status").find((el) => el.getAttribute("aria-live") === "polite" && !el.closest("[data-transcript]"))!;
    expect(muteButton()).toHaveAccessibleName("Mute microphone");
    expect(muteButton()).toHaveAttribute("aria-pressed", "false");
    expect(muteButton().querySelector(".lucide-mic")).not.toBeNull();

    fireEvent.click(muteButton());
    expect(muteButton()).toHaveAccessibleName("Unmute microphone");
    expect(muteButton()).toHaveAttribute("aria-pressed", "true");
    expect(muteButton().querySelector(".lucide-mic-off")).not.toBeNull(); // slashed mic
    expect(muteButton().className).toMatch(/bg-teal-100/); // a light tint, never solid navy
    expect(muteButton().className).not.toMatch(/bg-navy-900/);
    expect(status()).toHaveTextContent(/^Muted\. Type below, or tap the microphone to unmute\./);

    fireEvent.click(muteButton());
    expect(muteButton()).toHaveAccessibleName("Mute microphone");
    expect(status()).toHaveTextContent("Unmuted. I can hear you again."); // said once…
    tick(); // …until the mic opens and the status moves on
    expect(status()).toHaveTextContent(/^Listening…$/);
    fireEvent.click(muteButton());
    // Captions keep working while muted: a typed question still gets its visible reply.
    type("What is this for?");
    expect(screen.getByText(/Let’s check this together/)).toBeInTheDocument();
    // And typing can unmute too.
    type("turn the mic back on");
    expect(muteButton()).toHaveAccessibleName("Mute microphone");
  });

  it("muted, no audio reaches transcription, no voice turn is committed, and talking does not interrupt", async () => {
    install();
    const { transcription, speech, capture, detector } = installRealtime();
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    act(() => speech.started()); // the greeting is playing; the mic is open in duplex
    fireEvent.click(muteButton());
    const turnsBefore = sessionStore.getSnapshot().turnCount;

    act(() => detector.emit({ type: "speech-start", at: 9000, candidateAt: 8600 }));
    expect(speech.interrupts).toEqual([]); // barge-in is off while muted
    act(() => speech.ended());
    tick(2000); // the listen loop would have reopened the mic by now
    act(() => capture.feed(frame(9100, 0.3)));
    expect(transcription.begun).toEqual([]);
    expect(transcription.appended).toEqual([]);
    expect(sessionStore.getSnapshot().turnCount).toBe(turnsBefore);

    fireEvent.click(muteButton()); // Unmute: the same call listens again
    tick(1000);
    expect(transcription.begun).toHaveLength(1);
    expect(transcription.begun[0].callId).toBe(transcription.connects[0].callId);
  });

  it("End call stops playback, transcription, the microphone, the VAD and both provider sockets", async () => {
    install();
    const { transcription, speech, capture, detector } = installRealtime();
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    act(() => speech.started());
    fireEvent.click(screen.getByRole("button", { name: /^end call$/i }));
    expect(sessionStore.getSnapshot().callActive).toBe(false);
    expect(capture.stops).toBeGreaterThan(0);
    expect(detector.stops).toBeGreaterThan(0);
    expect(transcription.disconnects).toBeGreaterThan(0);
    expect(speech.disconnects).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^(mute microphone|end call)$/i })).toBeNull();
    expect(screen.queryByLabelText(/type a message/i)).toBeNull();
  });

  it("End call aborts pending model work for the call", async () => {
    let understandSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/companion/understand" && (!init || init.method === "GET")) {
          return new Response(JSON.stringify({ ok: true, data: { enabled: true }, requestId: "r" }));
        }
        if (url === "/api/companion/understand") {
          understandSignal = init?.signal ?? undefined;
          return new Promise<Response>(() => undefined); // still thinking
        }
        throw new Error("offline");
      }),
    );
    render(<CompanionExperience />); // no speech input: typing is open
    fireEvent.click(callButton());
    await act(async () => flush());
    fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: "i dont know what to do" } });
    fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
    await act(async () => flush());
    expect(understandSignal?.aborted).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /^end call$/i }));
    expect(understandSignal?.aborted).toBe(true);
  });

  it("End call acts once, even if tapped twice", () => {
    const onEnd = vi.fn();
    render(
      <CallFooter
        labels={{ group: "Call", message: "Type a message", placeholder: "Type a message…", send: "Send message", mic: "Mute microphone", end: "End call" }}
        onSend={() => undefined}
        muted={false}
        onMic={() => undefined}
        onEnd={onEnd}
      />,
    );
    const end = screen.getByRole("button", { name: "End call" });
    fireEvent.click(end);
    fireEvent.click(end);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("End call is not colour alone: hang-up icon and an accessible name; it is the row's only solid control", () => {
    install();
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    const end = screen.getByRole("button", { name: /^end call$/i });
    expect(end.querySelector(".lucide-phone-off")).not.toBeNull();
    expect(end.className).toMatch(/bg-danger-800 text-white/);
    const row = screen.getByRole("navigation", { name: "Medication Companion" });
    const solid = [...row.querySelectorAll("button")].filter((b) => /\bbg-(navy-900|danger-800)\b/.test(b.className));
    expect(solid).toEqual([end]);
  });
});

describe("contextual controls appear only when they apply", () => {
  it("no Show medicine button: the companion asks in words, and a yes asks for consent — still no buttons", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    act(() => fake.recognitions.at(-1)!.say("What is this for?", true));
    expect(screen.getByText(/Would you like to show me the medicine label\?/)).toBeInTheDocument();
    expect(buttonNames()).toEqual(CALL_CONTROLS);
    type("yes");
    expect(sessionStore.getSnapshot().state).toBe("camera-permission");
    expect(screen.getByText(t("en", "cameraPurpose"))).toBeInTheDocument(); // what to say: "yes" or "no"
    expect(buttonNames()).toEqual(CALL_CONTROLS);
  });

  it("the message pill: the send arrow is disabled until text is typed; Enter sends through the same path as speech", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    const box = screen.getByLabelText(/type a message/i);
    expect(box).toHaveAttribute("placeholder", "Type a message…");
    expect(box.className).toMatch(/text-\[17px\]/); // ≥16 px
    const arrow = screen.getByRole("button", { name: "Send message" });
    expect(arrow).toBeDisabled();
    fireEvent.change(box, { target: { value: "What is this for?" } });
    expect(arrow).toBeEnabled();
    fireEvent.submit(box.closest("form")!); // Enter submits the form
    expect(screen.getByText(/Let’s check this together/)).toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  it("push-to-talk (no local speech detection): the mic button talks and sends; otherwise it mutes", async () => {
    install();
    installRealtime({ vad: true });
    const { unmount } = render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    expect(screen.queryByRole("button", { name: /tap to (talk|send)/i })).toBeNull();
    expect(muteButton()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^end call$/i }));
    unmount();

    installRealtime({ vad: false });
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    expect(screen.getByRole("button", { name: /tap to talk/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("after the voice failed mid-line, the status says to say 'repeat'; saying or typing it re-says the line slowly", async () => {
    install();
    const { speech } = installRealtime();
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    act(() => speech.started());
    act(() => speech.breakMidLine());
    expect(screen.getByText(/say or type “repeat” to hear them again/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /repeat/i })).toBeNull();
    tick(1000);
    type("repeat");
    expect(speech.requests.at(-1)).toMatchObject({ slow: true });
  });

  it("after listening paused, the mic button turns it back on (and typing 'listen again' does too)", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    act(() => fake.recognitions.at(-1)!.fail("network"));
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    const mic = screen.getByRole("button", { name: "Turn microphone back on" });
    const before = fake.recognitions.length;
    fireEvent.click(mic);
    tick();
    expect(fake.recognitions.length).toBeGreaterThan(before);
    expect(muteButton()).toHaveAccessibleName("Mute microphone");

    act(() => fake.recognitions.at(-1)!.fail("network"));
    const again = fake.recognitions.length;
    type("listen again");
    tick();
    expect(fake.recognitions.length).toBeGreaterThan(again);
  });
});

describe("Help, and what used to be in its sheet", () => {
  function toCallbackReview() {
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
    // Said or typed, never tapped: the reading, the pharmacist, the summary.
    for (const words of ["yes", "ask a pharmacist", "yes please"]) {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: words } });
      fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    }
  }
  const reviewIntro = "I’ve prepared a short summary for the pharmacist.";

  it("Help is the same as saying 'help': it opens getting a person, and sends nothing — not even a reviewed summary", () => {
    const fetchFn = vi.fn(async () => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchFn);
    toCallbackReview();
    expect(screen.getByText(reviewIntro)).toBeInTheDocument();
    const calls = fetchFn.mock.calls.length;
    fireEvent.click(helpPill());
    expect(sessionStore.getSnapshot().state).toBe("safety");
    expect(sessionStore.getSnapshot().doseCheck?.callback?.status).not.toBe("submitting");
    expect(sessionStore.getSnapshot().doseCheck?.callback?.status).not.toBe("submitted");
    expect(fetchFn.mock.calls.length).toBe(calls);
    expect(screen.queryByRole("dialog")).toBeNull(); // no sheet
  });

  it("the moved actions are words: 'repeat', and the interrupt setting", async () => {
    install();
    const { speech } = installRealtime(); // full duplex: the interrupt setting applies
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    act(() => speech.started());
    act(() => speech.ended());
    tick(1000);
    type("please stop interrupting");
    act(() => speech.started()); // its words show as its voice starts
    expect(screen.getByText(t("en", "voiceInterruptOff"))).toBeInTheDocument();
    act(() => speech.ended());
    type("let me interrupt");
    act(() => speech.started());
    expect(screen.getByText(t("en", "voiceInterruptOn"))).toBeInTheDocument();
    act(() => speech.ended());
    type("say that again");
    expect(speech.requests.at(-1)).toMatchObject({ slow: true });
  });

  it("the Help pill opens the existing guarded help step (pharmacist, family… each confirmed first)", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    expect(helpPill().querySelector(".lucide-circle-help")).not.toBeNull(); // "?" icon + the word
    expect(helpPill()).toHaveTextContent("Help");
    fireEvent.click(helpPill());
    expect(sessionStore.getSnapshot().state).toBe("safety");
    expect(sessionStore.getSnapshot().helpFlow).toBeNull(); // nothing requested yet
    // Asked in the conversation, answered in words: "pharmacist, or family?"
    expect(screen.getByText(t("en", "helpRequestedHeading"))).toBeInTheDocument();
    expect(screen.getByText(t("en", "safetyAsk"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pharmacist/i })).toBeNull();
    fireEvent.click(helpPill()); // already there: said again, nothing new requested
    expect(sessionStore.getSnapshot().helpFlow).toBeNull();
    type("help");
    expect(sessionStore.getSnapshot().state).toBe("safety");
  });

  it("no Send button anywhere: the review says how to send, and only there", () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const fake = install();
    const { unmount } = render(<CompanionExperience />);
    startHealthyCall(fake);
    expect(screen.queryByText(/say or type “send”/)).toBeNull();
    unmount();
    setVoiceProvider(null);
    toCallbackReview();
    expect(screen.queryByRole("button", { name: /send callback request|send again/i })).toBeNull();
    expect(screen.getByText("Please check these details. You can tell me what to change, say “send the request,” or say “cancel.”")).toBeInTheDocument();
    // The summary is a message in the conversation, not a panel with its own buttons.
    expect(document.querySelector("[data-pinned]")).toBeNull();
    expect(document.querySelector("[data-transcript] button")).toBeNull();
    expect(buttonNames()).toEqual(CALL_CONTROLS);
  });
});

describe("the transcript", () => {
  it("live words are marked as temporary and replaced by the final words — never shown twice", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    act(() => fake.recognitions.at(-1)!.say("What is", false));
    const live = document.querySelector("[data-interim]")!;
    expect(live).toHaveTextContent("Hearing you…");
    expect(live).toHaveTextContent("What is");
    act(() => fake.recognitions.at(-1)!.say("What is this for?", true));
    expect(document.querySelector("[data-interim]")).toBeNull();
    expect(screen.getAllByText("What is this for?")).toHaveLength(1);
  });

  it("transcript content is static text: no buttons, links or focus targets inside any turn", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    act(() => fake.recognitions.at(-1)!.say("What is this for?", true));
    const turns = [...document.querySelectorAll("[data-speaker]")];
    expect(turns.length).toBeGreaterThanOrEqual(3);
    for (const turn of turns) {
      expect(turn.querySelector("button, a, input, [role=button], [tabindex]")).toBeNull();
      expect(turn.getAttribute("role")).toBeNull();
    }
  });

  it("no 'Latest message' button: a new message always comes into view, even after scrolling up", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    const scroller = document.querySelector("main")!.parentElement!;
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    // Pretend the transcript is taller than the screen and they scrolled up.
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 500 });
    scroller.scrollTop = 200;
    fireEvent.scroll(scroller);
    expect(screen.queryByRole("button", { name: "Latest message" })).toBeNull();
    act(() => fake.recognitions.at(-1)!.say("What is this for?", true));
    expect(scrollIntoView).toHaveBeenCalled(); // taken to the newest message
    // @ts-expect-error restore jsdom's missing method
    delete Element.prototype.scrollIntoView;
  });

  it("keyboard order follows the screen: Help, Take photo, Upload, the message box, send, mic, End call", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    act(() => fake.recognitions.at(-1)!.say("What is this for?", true));
    type("yes"); // show the label
    type("yes"); // consent: Take photo and Upload appear in the companion's message
    const order = [...document.querySelectorAll<HTMLElement>("button, input:not([type=file]), a[href]")].map(
      (el) => el.getAttribute("aria-label") || el.textContent?.trim() || (el as HTMLInputElement).placeholder,
    );
    expect(order).toEqual(["Help", "Take photo", "Upload", "Type a message", "Send message", "Mute microphone", "End call"]);
  });
});

describe("labels fit narrow screens", () => {
  it("one row at any width: the pill shrinks, the 56 px round buttons don't; Help is a short word", () => {
    for (const language of ["en", "zh-Hans"] as const) {
      expect([...t(language, "help")].length, `${language} help`).toBeLessThanOrEqual(language === "en" ? 6 : 3);
    }
    render(
      <CallFooter
        labels={{ group: "Call", message: t("zh-Hans", "typeLabel"), placeholder: t("zh-Hans", "typePlaceholder"), send: t("zh-Hans", "send"), mic: t("zh-Hans", "mute"), end: t("zh-Hans", "endCall") }}
        onSend={() => undefined}
        muted
        onMic={() => undefined}
        onEnd={() => undefined}
      />,
    );
    const nav = screen.getByRole("navigation");
    expect(nav.className).toMatch(/\bflex\b/);
    expect(nav.className).not.toMatch(/grid|flex-wrap/); // never a grid, never two rows
    expect(nav.className).toMatch(/gap-3/); // 12 px between controls
    expect(nav.querySelector("form")!.className).toMatch(/h-14 min-w-0 flex-1 .*rounded-pill/);
    for (const name of [t("zh-Hans", "mute"), t("zh-Hans", "endCall")]) {
      const b = screen.getByRole("button", { name });
      expect(b.className).toMatch(/h-14 w-14 shrink-0 .*rounded-full/);
    }
    expect(screen.getByRole("button", { name: t("zh-Hans", "send") }).className).toMatch(/h-10 w-10/); // 40 px circle inside the pill
  });
});

describe("the call stays one call", () => {
  it("a voice turn heard right after tapping Help lands in the same transcript", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    act(() => fake.recognitions.at(-1)!.say("What is this for?", true));
    fireEvent.click(helpPill());
    expect(screen.getByText("What is this for?")).toBeInTheDocument();
    act(() => dispatch({ type: "END_CALL" }));
  });
});

describe("free-tier voice: one sticky notice, no mid-call voice switching", () => {
  it("a configured voice the account can't use: browser voice for the whole call, one notice that stays", async () => {
    const fake = install();
    const { speech } = installRealtime();
    speech.connectResult = false;
    speech.unavailableReason = "voice-unavailable";
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    expect(fake.utterances.map((u) => u.text)).toEqual(["Hello, I’m an AI guide. What would you like to know today?"]);
    expect(speech.requests).toEqual([]); // never tried again this call
    const notice = /your browser’s own voice is reading the words for this call/;
    expect(screen.getAllByText(notice)).toHaveLength(1); // announced once, shown once
    act(() => fake.utterances.at(-1)?.onend?.());
    tick();
    expect(buttonNames()).toEqual(CALL_CONTROLS); // the notice adds no control
    fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: "What is this for?" } });
    fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
    expect(screen.getAllByText(notice)).toHaveLength(1); // still there after the next turn
    expect(document.querySelector("[data-voice-notice]")).toHaveTextContent(notice);
    expect(fake.utterances.at(-1)?.text).toMatch(/Let’s check this together/); // the same browser voice
  });

  it("an unconfigured voice is a setup choice, not a failure: no notice", async () => {
    install();
    const { speech } = installRealtime();
    speech.connectResult = false;
    speech.unavailableReason = "unconfigured";
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    expect(screen.queryByText(/browser’s own voice is reading/)).toBeNull();
  });

  it("credits running out after the voice was heard: words only from then on, said once, never another voice", async () => {
    const fake = install();
    const { speech } = installRealtime();
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    act(() => speech.started());
    act(() => speech.ended());
    tick(1000);
    fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: "What is this for?" } });
    fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
    const reply = speech.requests.at(-1)!.text;
    act(() => speech.failBeforeAudio("quota-exceeded"));
    expect(screen.getByText(reply)).toBeInTheDocument(); // the voice is gone, so the words show at once: visible text = what was to be spoken
    expect(fake.utterances).toEqual([]); // the browser voice never takes over mid-call
    expect(screen.getAllByText(/The voice isn’t available for the rest of this call/)).toHaveLength(1);
    expect(screen.getByText(reply)).toBeInTheDocument(); // the words stay
  });
});

describe("scroll areas", () => {
  it("the transcript and the open camera scroll without a visible scrollbar (CSS hides it; scrolling still works)", () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(() => new Promise(() => {})) } });
    sessionStore.setForTest(
      run([startCall, { type: "USER_MESSAGE", text: "What is this for?", via: "typed" }, chooseShowMedicine, grantCamera, { type: "OPEN_CAMERA" }]),
    );
    render(<CompanionExperience />);
    const transcriptScroller = document.querySelector("main")!.parentElement!;
    expect(transcriptScroller).toHaveClass("no-scrollbar", "overflow-y-auto");
    expect(document.querySelector("[data-pinned]")).toHaveClass("no-scrollbar", "overflow-y-auto");
    const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");
    expect(css).toMatch(/\.no-scrollbar\s*\{\s*scrollbar-width:\s*none;/);
    expect(css).toMatch(/\.no-scrollbar::-webkit-scrollbar\s*\{\s*display:\s*none;/);
  });
});
