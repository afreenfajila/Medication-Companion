import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
import { chooseCamera, chooseShowMedicine, grantCamera, resolve, run, startCall, submitDemo } from "./helpers";

/**
 * The active call, as a calm phone call: three persistent controls (Get help,
 * Mute, End call); everything else contextual, automatic, or one tap away in
 * the Get help sheet; the whole transcript readable.
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
const buttonNames = () => screen.getAllByRole("button").map((b) => b.textContent?.trim());
const muteButton = () => screen.getByRole("button", { name: /^(mute|unmute)$/i });
const openHelp = () => fireEvent.click(screen.getByRole("button", { name: /^get help$/i }));
const sheet = () => within(screen.getByRole("dialog"));

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
  it("a normal call shows exactly three controls: Get help, Mute, End call — no links, no text box", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    expect(fake.recognitions[0].started).toBe(true); // a healthy, listening call
    expect(buttonNames()).toEqual(["Get help", "Mute", "End call"]);
    expect(screen.queryAllByRole("link")).toHaveLength(0); // About is in the Get help sheet during a call
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /show medicine|repeat|type instead|interrupt|show choices|earlier/i })).toBeNull();
    // The disclosure words stay on screen.
    expect(screen.getByText("AI guide · Not a pharmacist or doctor")).toBeInTheDocument();
  });

  it("Mute's accessible name is its visible word (Mute ↔ Unmute, no aria-pressed); each change is announced politely", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    const status = () => screen.getAllByRole("status").find((el) => el.getAttribute("aria-live") === "polite" && !el.closest("[data-transcript]"))!;
    expect(muteButton()).toHaveAccessibleName("Mute");
    expect(muteButton()).not.toHaveAttribute("aria-pressed");

    fireEvent.click(muteButton());
    expect(muteButton()).toHaveAccessibleName("Unmute");
    expect(muteButton()).toHaveTextContent("Unmute"); // name = visible label
    expect(muteButton()).not.toHaveAttribute("aria-pressed");
    expect(status()).toHaveTextContent(/^Muted\. The companion can’t hear you/);

    fireEvent.click(muteButton());
    expect(muteButton()).toHaveAccessibleName("Mute");
    expect(status()).toHaveTextContent("Unmuted. I can hear you again."); // said once…
    tick(); // …until the mic opens and the status moves on
    expect(status()).toHaveTextContent(/I’m listening/);
    fireEvent.click(muteButton()); // and back to muted, to check typing below
    expect(screen.getByLabelText(/type it here/i)).toBeInTheDocument();
    // Captions keep working while muted: a typed question still gets its visible reply.
    fireEvent.change(screen.getByLabelText(/type it here/i), { target: { value: "What is this for?" } });
    fireEvent.submit(screen.getByLabelText(/type it here/i).closest("form")!);
    expect(screen.getByText(/Let’s check this together/)).toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: /^(get help|mute|end call)$/i })).toBeNull();
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
    fireEvent.change(screen.getByLabelText(/type it here/i), { target: { value: "i dont know what to do" } });
    fireEvent.submit(screen.getByLabelText(/type it here/i).closest("form")!);
    await act(async () => flush());
    expect(understandSignal?.aborted).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /^end call$/i }));
    expect(understandSignal?.aborted).toBe(true);
  });

  it("End call acts once, even if tapped twice", () => {
    const onEnd = vi.fn();
    render(
      <CallFooter
        labels={{ group: "Call", help: "Get help", mute: "Mute", unmute: "Unmute", end: "End call" }}
        muted={false}
        onHelp={() => undefined}
        onToggleMute={() => undefined}
        onEnd={onEnd}
      />,
    );
    const end = screen.getByRole("button", { name: "End call" });
    fireEvent.click(end);
    fireEvent.click(end);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("End call is not colour alone: it has its own icon and the word 'End'", () => {
    install();
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    const end = screen.getByRole("button", { name: /^end call$/i });
    expect(end.querySelector(".lucide-phone-off")).not.toBeNull();
    expect(end).toHaveTextContent("End call");
  });
});

describe("contextual controls appear only when they apply", () => {
  it("Show medicine is absent at the start of a call and appears once the companion asks to see it", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    expect(screen.queryByRole("button", { name: /show medicine/i })).toBeNull();
    act(() => fake.recognitions.at(-1)!.say("What is this for?", true));
    expect(screen.getByText(/Let’s check this together/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    // Still the only contextual action, and never a row of suggestions.
    expect(buttonNames()).toEqual(["Show medicine", "Get help", "Mute", "End call"]);
  });

  it("the text box is absent in a healthy call and opens from Get help → Type instead (and closes again)", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    expect(screen.queryByRole("textbox")).toBeNull();
    openHelp();
    fireEvent.click(sheet().getByRole("button", { name: /type instead/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const box = screen.getByLabelText(/type it here/i);
    tick(1);
    expect(document.activeElement).toBe(box); // ready to type
    expect(screen.getAllByRole("textbox")).toHaveLength(1); // one compact composer
    fireEvent.click(screen.getByRole("button", { name: /close typing/i }));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("Tap to talk appears only without local speech detection (push-to-talk), never otherwise", async () => {
    install();
    installRealtime({ vad: true });
    const { unmount } = render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    expect(screen.queryByRole("button", { name: /tap to (talk|send)/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^end call$/i }));
    unmount();

    installRealtime({ vad: false });
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    expect(screen.getByRole("button", { name: /tap to talk/i })).toBeInTheDocument();
    fireEvent.click(muteButton());
    expect(screen.queryByRole("button", { name: /tap to (talk|send)/i })).toBeNull(); // not while muted
  });

  it("Repeat appears only after the voice failed mid-line (or from Get help), not in a healthy call", async () => {
    install();
    const { speech } = installRealtime();
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    act(() => speech.started());
    expect(screen.queryByRole("button", { name: /repeat/i })).toBeNull();
    act(() => speech.breakMidLine());
    expect(screen.getByRole("button", { name: /repeat/i })).toBeInTheDocument();
    tick(1000); // listening again: Repeat stays offered until the companion speaks again
    fireEvent.click(screen.getByRole("button", { name: /repeat/i }));
    expect(speech.requests.at(-1)).toMatchObject({ slow: true });
    act(() => speech.started());
    expect(screen.queryByRole("button", { name: /repeat/i })).toBeNull();
  });

  it("Try again appears only after listening paused, and resumes it", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    act(() => fake.recognitions.at(-1)!.fail("network"));
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/type it here/i)).toBeInTheDocument(); // typing offered meanwhile
    const before = fake.recognitions.length;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    tick();
    expect(fake.recognitions.length).toBeGreaterThan(before);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });
});

describe("the Get help sheet", () => {
  function toCallbackReview() {
    const s = run([
      { type: "SET_DOSE_SCENARIO", scenario: "conflict-sent" },
      startCall,
      { type: "USER_MESSAGE", text: "My doctor changed my medicine, but this box still says the old amount. How many should I take now?", via: "typed" },
      chooseShowMedicine,
      chooseCamera,
      grantCamera,
      submitDemo(),
      resolve,
    ]);
    sessionStore.setForTest(run([{ type: "CONFIRM_MATCH", candidateId: s.candidate!.candidateId, decision: "confirmed" }], s));
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: "Yes, that is what the label says" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask for a pharmacist callback" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, prepare a summary" }));
  }

  it("opening and closing it sends nothing and changes nothing — not even a reviewed callback's approval", () => {
    const fetchFn = vi.fn(async () => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchFn);
    toCallbackReview();
    expect(screen.getByRole("heading", { name: "Check before sharing" })).toBeInTheDocument();
    const before = sessionStore.getSnapshot();
    const calls = fetchFn.mock.calls.length;

    const opener = screen.getByRole("button", { name: /^get help$/i });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Get help" })).toBeInTheDocument();
    expect(sessionStore.getSnapshot()).toBe(before); // the very same session object: nothing dispatched
    expect(fetchFn.mock.calls.length).toBe(calls);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener); // focus comes back to where it was
    expect(sessionStore.getSnapshot()).toBe(before);
    expect(sessionStore.getSnapshot().doseCheck?.callback?.status).toBe("reviewing");
  });

  it("holds the moved actions: a person, Repeat, Type instead, the interrupt setting and About", async () => {
    install();
    installRealtime(); // full duplex: the interrupt setting applies
    render(<CompanionExperience />);
    fireEvent.click(callButton());
    await act(async () => flush());
    openHelp();
    expect(sheet().getByRole("button", { name: "Get help from a person" })).toBeInTheDocument();
    expect(sheet().getByRole("button", { name: /repeat slowly/i })).toBeInTheDocument();
    expect(sheet().getByRole("button", { name: /type instead/i })).toBeInTheDocument();
    expect(sheet().getByRole("link", { name: "About this prototype" })).toHaveAttribute("href", "/about");
    // The words carry the state, so no aria-pressed on top of a changing label.
    const toggle = sheet().getByRole("button", { name: /interrupt by voice: on/i });
    expect(toggle).not.toHaveAttribute("aria-pressed");
    fireEvent.click(toggle);
    expect(sheet().getByRole("button", { name: /interrupt by voice: off/i })).not.toHaveAttribute("aria-pressed");
  });

  it("'Get help from a person' opens the existing guarded help step (pharmacist, clinic… each confirmed first)", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    openHelp();
    fireEvent.click(sheet().getByRole("button", { name: "Get help from a person" }));
    expect(sessionStore.getSnapshot().state).toBe("safety");
    expect(sessionStore.getSnapshot().helpFlow).toBeNull(); // nothing requested yet
    expect(screen.getByRole("button", { name: /pharmacist/i })).toBeInTheDocument();
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
    expect(screen.getByText("If it’s right, say or type “send”. If not, say “don’t send”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change something" }));
    expect(screen.queryByText("If it’s right, say or type “send”. If not, say “don’t send”.")).toBeNull(); // editing: not sendable
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

  it("a person re-reading earlier turns is not pulled down; 'Latest message' appears and takes them back", () => {
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
    expect(screen.getByRole("button", { name: "Latest message" })).toBeInTheDocument();

    act(() => fake.recognitions.at(-1)!.say("What is this for?", true));
    expect(scrollIntoView).not.toHaveBeenCalled(); // their place is kept

    fireEvent.click(screen.getByRole("button", { name: "Latest message" }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Latest message" })).toBeNull();
    // @ts-expect-error restore jsdom's missing method
    delete Element.prototype.scrollIntoView;
  });

  it("keyboard order follows the screen: contextual action, text box, then Get help, Mute, End call", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    act(() => fake.recognitions.at(-1)!.say("What is this for?", true));
    fireEvent.click(muteButton()); // typing opens
    const order = [...document.querySelectorAll<HTMLElement>("button, input, a[href]")]
      .filter((el) => !el.closest("dialog:not([open])"))
      .map((el) => el.getAttribute("aria-label") || el.textContent?.trim() || (el as HTMLInputElement).placeholder);
    expect(order).toEqual(["Show medicine", "Type your answer or question", "Send", "Get help", "Unmute", "End call"]);
  });
});

describe("labels fit narrow screens", () => {
  it("call-control labels are short in English and Simplified Chinese, and may wrap rather than clip", () => {
    for (const language of ["en", "zh-Hans"] as const) {
      for (const key of ["getHelp", "mute", "unmute", "endCall"] as const) {
        const label = t(language, key);
        // ≈ what fits a third of a 320 px screen at 16 px: no truncation needed.
        expect([...label].length, `${language} ${key}`).toBeLessThanOrEqual(language === "en" ? 9 : 4);
      }
    }
    render(
      <CallFooter
        labels={{ group: "Call", help: t("zh-Hans", "getHelp"), mute: t("zh-Hans", "mute"), unmute: t("zh-Hans", "unmute"), end: t("zh-Hans", "endCall") }}
        muted
        onHelp={() => undefined}
        onToggleMute={() => undefined}
        onEnd={() => undefined}
      />,
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toMatch(/min-h-14/); // 56 px tall targets
      expect(button.className).toMatch(/break-words/);
      expect(button.className).not.toMatch(/truncate|whitespace-nowrap|overflow-hidden/);
    }
    expect(screen.getByRole("navigation").className).toMatch(/gap-3/); // 12 px between controls
  });
});

describe("the call stays one call", () => {
  it("a voice turn heard while the help sheet is open still lands in the same transcript", () => {
    const fake = install();
    render(<CompanionExperience />);
    startHealthyCall(fake);
    openHelp();
    act(() => fake.recognitions.at(-1)!.say("What is this for?", true));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
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
    expect(buttonNames()).toEqual(["Get help", "Mute", "End call"]); // the notice adds no control
    fireEvent.click(screen.getByRole("button", { name: /^get help$/i }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /type instead/i }));
    fireEvent.change(screen.getByLabelText(/type it here/i), { target: { value: "What is this for?" } });
    fireEvent.submit(screen.getByLabelText(/type it here/i).closest("form")!);
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
    fireEvent.click(screen.getByRole("button", { name: /^get help$/i }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /type instead/i }));
    fireEvent.change(screen.getByLabelText(/type it here/i), { target: { value: "What is this for?" } });
    fireEvent.submit(screen.getByLabelText(/type it here/i).closest("form")!);
    const reply = speech.requests.at(-1)!.text;
    act(() => speech.failBeforeAudio("quota-exceeded"));
    expect(screen.getByText(reply)).toBeInTheDocument(); // the voice is gone, so the words show at once: visible text = what was to be spoken
    expect(fake.utterances).toEqual([]); // the browser voice never takes over mid-call
    expect(screen.getAllByText(/The voice isn’t available for the rest of this call/)).toHaveLength(1);
    expect(screen.getByText(reply)).toBeInTheDocument(); // the words stay
  });
});

describe("scroll areas", () => {
  it("the transcript and a step's panel scroll without a visible scrollbar (CSS hides it; scrolling still works)", () => {
    sessionStore.setForTest(run([startCall, { type: "USER_MESSAGE", text: "What is this for?", via: "typed" }, chooseShowMedicine]));
    render(<CompanionExperience />);
    const transcriptScroller = document.querySelector("main")!.parentElement!;
    expect(transcriptScroller).toHaveClass("no-scrollbar", "overflow-y-auto");
    expect(document.querySelector("[data-pinned]")).toHaveClass("no-scrollbar", "overflow-y-auto");
    const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");
    expect(css).toMatch(/\.no-scrollbar\s*\{\s*scrollbar-width:\s*none;/);
    expect(css).toMatch(/\.no-scrollbar::-webkit-scrollbar\s*\{\s*display:\s*none;/);
  });
});
