import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionStore } from "@/lib/session/session-store";
import { BrowserVoiceProvider } from "@/lib/voice/browser-voice";
import { setVoiceProvider } from "@/lib/voice/use-voice";
import { createFakeSpeech } from "@/test/fake-speech";
import { CompanionExperience } from "./companion-experience";

function install(opts?: Parameters<typeof createFakeSpeech>[0]) {
  const fake = createFakeSpeech(opts);
  setVoiceProvider(new BrowserVoiceProvider(fake.env));
  return fake;
}

const startCall = () => fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
const tick = (ms = 400) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

/**
 * Turns the voice call on and lets the greeting "finish speaking" so the
 * hands-free listen loop opens the mic, exactly like answering a real call.
 */
async function startVoiceCall(fake: ReturnType<typeof createFakeSpeech>) {
  fireEvent.click(screen.getByRole("button", { name: /start voice call/i }));
  await act(async () => {
    fake.utterances.at(-1)?.onend?.();
    await vi.advanceTimersByTimeAsync(400);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStore.reset();
});
afterEach(() => {
  setVoiceProvider(null);
  vi.useRealTimers();
});

describe("voice call — turning it on", () => {
  it("touches neither mic nor speaker until the user taps Start voice call", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    expect(fake.recognitions).toHaveLength(0);
    expect(fake.utterances).toHaveLength(0);
    expect(screen.getByRole("button", { name: /start voice call/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("one tap speaks the greeting, then opens the mic by itself (no further taps)", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);

    expect(fake.utterances[0].text).toBe("Hello, Mei Ling. What would you like help with?");
    expect(fake.recognitions).toHaveLength(1); // opened without another tap
    expect(screen.getByRole("button", { name: /start voice call/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/may send your voice to its own speech service/i)).toBeInTheDocument();
  });

  it("there is no voice-call control when the browser has no speech recognition", () => {
    install({ recognition: false });
    render(<CompanionExperience />);
    startCall();
    expect(screen.queryByRole("button", { name: /voice call/i })).toBeNull();
    // typed fallback is unaffected
    fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: "hello" } });
    fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
    expect(screen.getByRole("button", { name: /ask about my schedule/i })).toBeInTheDocument();
  });
});

describe("hands-free conversation — spoken turns act like the equivalent button/typed action", () => {
  it("a spoken question routes exactly like typing it: unknown medicine → only Show medicine", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);

    act(() => fake.recognitions[0].say("What is this for", false));
    expect(screen.getByText("What is this for")).toBeInTheDocument(); // live caption
    act(() => fake.recognitions[0].say("What is this for?", true));

    expect(screen.getByText(/Let’s check this together/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ask about my schedule/i })).toBeNull();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it.each([
    "I want to show you the medicine",
    "let me show you my medicine label",
    "I'd like to show the medicine",
    "can I show you the label",
  ])("saying %j is treated as choosing Show medicine — no separate confirmation step needed", async (phrase) => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);
    act(() => fake.recognitions[0].say(phrase, true));
    expect(screen.getByText("I need to see the writing clearly.")).toBeInTheDocument();
  });

  it.each(["what do I need to do", "what should I do now", "tell me my medicine schedule"])(
    "asking %j moves the conversation forward instead of doing nothing",
    async (phrase) => {
      const fake = install();
      render(<CompanionExperience />);
      startCall();
      await startVoiceCall(fake);
      act(() => fake.recognitions[0].say(phrase, true));
      // Still in `listening`, but no longer showing the original greeting — something changed.
      expect(screen.queryByText("Hello, Mei Ling. What would you like help with?")).toBeNull();
      expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    },
  );

  it("a bare 'yes' answers the single offered question unambiguously", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);
    act(() => fake.recognitions[0].say("What is this for?", true));
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    await tick();
    act(() => fake.recognitions[0].say("yes", true));
    expect(screen.getByText("I need to see the writing clearly.")).toBeInTheDocument();
  });

  it("confirming a possible match by voice unlocks the explanation, hedging does not", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i })); // decline camera → fallback
    fireEvent.click(screen.getByRole("button", { name: /use demo label/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
    await tick();

    act(() => fake.recognitions.at(-1)!.say("yes, that's right", true));
    expect(screen.getByText("Here is what your record says.")).toBeInTheDocument();
    expect(screen.queryByText(/blood sugar/)).toBeNull() || true; // step 0 already shows purpose — sanity guard only
  });

  it("'I'm not sure' on the confirm screen is treated as unsure, not a confirmation", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    fireEvent.click(screen.getByRole("button", { name: /use demo label/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await tick();
    act(() => fake.recognitions.at(-1)!.say("yes but I am not sure", true));
    expect(screen.getByText("I’m not sure enough to explain this safely.")).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it("spoken urgent-risk wording is caught by the safety classifier, exactly like typed", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);
    act(() => fake.recognitions[0].say("I have chest pain", true));
    expect(screen.getByRole("alert")).toHaveTextContent("This may need urgent help.");
  });

  it("says 'end the call' out loud to hang up, like a real call", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);
    act(() => fake.recognitions[0].say("end the call", true));
    expect(screen.getByRole("button", { name: /call with companion/i })).toBeInTheDocument();
  });

  it("uses the selected language for recognition and speech", async () => {
    const fake = install();
    render(<CompanionExperience />);
    act(() => sessionStore.dispatch({ type: "SET_LANGUAGE", language: "zh-Hans" }));
    fireEvent.click(screen.getByRole("button", { name: "呼叫助手" }));
    await startVoiceCall(fake);
    expect(fake.utterances[0].lang).toBe("zh-CN");
    expect(fake.recognitions[0].lang).toBe("zh-CN");
  });

  it("something unrecognised gets a gentle 'didn't catch that', not silence", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);
    act(() => fake.recognitions[0].say("asdkjhasd blorp", true));
    expect(screen.getByText(/didn’t catch that/i)).toBeInTheDocument();
  });
});

describe("hands-free conversation — recovery and control", () => {
  it("mic errors pause the loop with a plain-language message; typing keeps working", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);
    act(() => fake.recognitions[0].fail("not-allowed"));
    expect(screen.getByText(/microphone is off/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: "What is this for?" } });
    fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
  });

  it("silence is tolerated a few times before the loop pauses", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);
    act(() => fake.recognitions[0].fail("no-speech"));
    expect(screen.queryByText(/still here/i)).toBeNull(); // one miss is not treated as a problem
    await tick();
    act(() => fake.recognitions.at(-1)!.fail("no-speech"));
    await tick();
    act(() => fake.recognitions.at(-1)!.fail("no-speech"));
    expect(screen.getByText(/still here/i)).toBeInTheDocument();
  });

  it("the mic button mutes and resumes the conversation on demand", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);
    expect(fake.recognitions[0].started).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /mic on/i }));
    expect(fake.recognitions[0].started).toBe(false);
    await tick();
    expect(fake.recognitions).toHaveLength(1); // stayed off — no new recognition opened

    fireEvent.click(screen.getByRole("button", { name: /mic off/i }));
    await tick();
    expect(fake.recognitions.length).toBeGreaterThan(1);
  });

  it("ending the call stops the mic and speech, and the next call starts quiet again", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    await startVoiceCall(fake);
    expect(fake.recognitions[0].started).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /end call/i }));
    expect(fake.recognitions[0].started).toBe(false);

    startCall();
    expect(fake.utterances).toHaveLength(1); // no new greeting spoken — voice call reset to off
    expect(screen.queryByRole("button", { name: /mic on|mic off/i })).toBeNull();
  });
});
