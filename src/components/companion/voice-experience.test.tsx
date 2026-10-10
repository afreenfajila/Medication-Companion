import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t as translate } from "@/lib/content/translations";
import { sessionStore } from "@/lib/session/session-store";
import { BrowserVoiceProvider } from "@/lib/voice/browser-voice";
import { type GeminiSpeechPlayer, setGeminiSpeechPlayer } from "@/lib/voice/gemini-speech-player";
import { setVoiceProvider } from "@/lib/voice/use-voice";
import { createFakeSpeech } from "@/test/fake-speech";
import { CompanionExperience } from "./companion-experience";
import { VoiceBar } from "./voice-bar";

function install(opts?: Parameters<typeof createFakeSpeech>[0]) {
  const fake = createFakeSpeech(opts);
  setVoiceProvider(new BrowserVoiceProvider(fake.env));
  return fake;
}

const tick = (ms = 400) => act(() => vi.advanceTimersByTime(ms));

/**
 * Tapping "Call with companion" IS the user action that starts the call — like a
 * phone call, that single tap also starts the voice conversation automatically
 * (no separate toggle). This helper taps it, then lets the greeting "finish
 * speaking" so the hands-free listen loop opens the mic.
 */
function startCall(fake: ReturnType<typeof createFakeSpeech>, buttonName: string | RegExp = /call with companion/i) {
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
  act(() => {
    fake.utterances.at(-1)?.onend?.();
  });
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

/**
 * Says something into the (currently open) mic, lets the companion finish
 * speaking its reply, then waits for the mic to reopen — one full turn of
 * the hands-free loop, mirroring what a real conversation does automatically.
 */
function respond(fake: ReturnType<typeof createFakeSpeech>, text: string) {
  act(() => fake.recognitions.at(-1)!.say(text, true));
  finishSpeaking(fake);
}

/** Lets the companion finish speaking whatever it just said, then reopens the mic. */
function finishSpeaking(fake: ReturnType<typeof createFakeSpeech>) {
  act(() => fake.utterances.at(-1)?.onend?.());
  tick();
}

/** The small icon-only mute control: accessible name is the dynamic "Mic on"/"Mic off" text. */
const micButton = () => screen.getByRole("button", { name: /mic on|mic off/i });

beforeEach(() => {
  vi.useFakeTimers();
  sessionStore.reset();
});
afterEach(() => {
  setVoiceProvider(null);
  vi.useRealTimers();
});

describe("the call starts voice automatically — no separate button", () => {
  it("touches neither mic nor speaker before Call with companion is tapped", () => {
    const fake = install();
    render(<CompanionExperience />);
    expect(fake.recognitions).toHaveLength(0);
    expect(fake.utterances).toHaveLength(0);
  });

  it("one tap on Call with companion speaks the greeting, then opens the mic by itself", () => {
    const fake = install();
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));

    expect(fake.utterances[0].text).toBe("Hello, I’m an AI guide. What would you like to know today?");
    expect(screen.getByText(/^speaking…$/i)).toBeInTheDocument(); // reading the greeting aloud
    expect(fake.recognitions).toHaveLength(0); // not yet — still speaking

    act(() => fake.utterances.at(-1)?.onend?.());
    act(() => vi.advanceTimersByTime(400));

    expect(fake.recognitions).toHaveLength(1); // opened without another tap
    expect(screen.getByText(/listening… please speak now/i)).toBeInTheDocument();
  });

  it("there is no separate voice-call toggle or labelled mic button anywhere on screen", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    // Only the call footer (Repeat/Get help/End call) and the small mute icon exist.
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names.some((n) => /voice call|tap to speak|start voice/i.test(n ?? ""))).toBe(false);
  });

  it("the call status discloses where speech may go before anything is happening", () => {
    render(
      <VoiceBar
        t={(key) => translate("en", key)}
        view={{
          listening: false,
          speaking: false,
          interim: "",
          micOn: true,
          notice: null,
          toggleMic: () => undefined,
          submitText: () => undefined,
        }}
      />,
    );
    expect(screen.getByText(/may send your voice to its own speech service/i)).toBeInTheDocument();
  });

  it("no voice bar at all when the browser has no speech recognition — typing still works", () => {
    const fake = install({ recognition: false });
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    // Synthesis-only: the greeting is still spoken (no recognition needed for that)...
    expect(fake.utterances[0].text).toBe("Hello, I’m an AI guide. What would you like to know today?");
    // ...but there is no mic status/mute control, since there is nothing to listen with.
    expect(screen.queryByRole("button", { name: /mic on|mic off/i })).toBeNull();

    fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: "hello" } });
    fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
    expect(screen.getByRole("button", { name: /ask about my schedule/i })).toBeInTheDocument();
  });

  it("no speech at all when the browser has neither recognition nor synthesis — the call still works by typing", () => {
    const fake = install({ recognition: false, synthesis: false });
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    expect(fake.utterances).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /mic on|mic off/i })).toBeNull();
    expect(screen.getByText("Hello, I’m an AI guide. What would you like to know today?")).toBeInTheDocument();
  });
});

describe("hands-free conversation — spoken turns act like the equivalent button/typed action", () => {
  it("a spoken question routes exactly like typing it: unknown medicine → only Show medicine", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);

    act(() => fake.recognitions[0].say("What is this for", false));
    expect(screen.getByText("What is this for")).toBeInTheDocument(); // live caption
    act(() => fake.recognitions[0].say("What is this for?", true));

    expect(screen.getByText(/Let’s check this together/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ask about my schedule/i })).toBeNull();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it("asking 'what are my prescriptions' names what's on file, but still requires the label check before any instruction", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    act(() => fake.recognitions[0].say("What are my prescriptions?", true));
    // This reply is eligible for natural rephrasing (see CONVERSATIONAL_REPHRASE_KEYS),
    // so it waits a short, bounded budget before speaking — there is no real
    // server in this test, so it always falls back to the exact approved line.
    act(() => vi.advanceTimersByTime(900));

    expect(screen.getByText(/Metformin 500 mg/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    // Named, not explained — the dosing instruction is still gated behind confirmation.
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it("two questions that get the same reply still show two replies", () => {
    // Reported: two spoken questions in a row, and the transcript showed only
    // the user's words — the second reply was deduplicated away by its text and
    // the companion looked like it had ignored the person.
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "I have met for free medicine");
    respond(fake, "the medication I have says it is so bad for free");

    const userTurns = screen.getAllByText(/Mei Ling says:/);
    const companionTurns = screen.getAllByText(/Companion says:/);
    expect(userTurns).toHaveLength(2);
    // Greeting + a reply to each question.
    expect(companionTurns).toHaveLength(3);
  });

  it("saying the very same thing twice is two turns, not one", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "I do not understand");
    respond(fake, "I do not understand");

    expect(screen.getAllByText(/Mei Ling says:/)).toHaveLength(2);
    expect(screen.getAllByText(/Companion says:/)).toHaveLength(3);
  });

  it("the companion's own words are not heard back as a user turn", () => {
    // Reported: "Mei Ling says: hello" appeared without the user saying anything —
    // the mic was open through the companion's greeting and recognition handed
    // its tail back just after the speech ended.
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    expect(fake.recognitions.length).toBeGreaterThan(0); // the mic really is open

    act(() => fake.recognitions.at(-1)!.say("What is this for?", true));
    expect(screen.getAllByText(/Mei Ling says:/)).toHaveLength(1);
    // The companion replies, then that reply comes back off the microphone the
    // moment it stops talking — before the mic has been reopened for a new turn.
    act(() => fake.utterances.at(-1)?.onend?.());
    act(() =>
      fake.recognitions.at(-1)!.say("Would you like to show me the medicine label?", true),
    );

    expect(screen.getAllByText(/Mei Ling says:/)).toHaveLength(1); // still just the real one
  });

  it("but a person repeating a word the prompt suggested is NOT treated as an echo", () => {
    // "...for example, 500 milligrams" → "500 milligrams" is a real answer that
    // happens to quote the question. Suppressing it would strand the person.
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    finishSpeaking(fake);

    respond(fake, "It's Metformin");
    expect(screen.getByText(/what strength does the label say/i)).toBeInTheDocument();
    respond(fake, "500 milligrams");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("I found a possible match: Metformin, 500 mg.")).toBeInTheDocument();
  });

  it("an off-topic question (the weather) is acknowledged, then redirected to the two supported actions", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    act(() => fake.recognitions[0].say("What will happen if I ask about the weather today?", true));
    tick(1000);

    // Acknowledged first — not bounced with a bare refusal — then walked back.
    expect(screen.getByText(/I’d enjoy talking about that/)).toBeInTheDocument();
    expect(screen.getByText(/Would you like to show me a medicine label/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask about my schedule/i })).toBeInTheDocument();
  });

  it.each([
    "I want to show you the medicine",
    "let me show you my medicine label",
    "I'd like to show the medicine",
    "can I show you the label",
  ])(
    "saying %j is treated as choosing Show medicine — no separate confirmation step needed",
    (phrase) => {
      const fake = install();
      render(<CompanionExperience />);
      startCall(fake);
      act(() => fake.recognitions[0].say(phrase, true));
      expect(screen.getByText("How would you like to show me your medicine?")).toBeInTheDocument();
    },
  );

  it.each(["what do I need to do", "what should I do now", "tell me my medicine schedule"])(
    "asking %j moves the conversation forward instead of doing nothing",
    (phrase) => {
      const fake = install();
      render(<CompanionExperience />);
      startCall(fake);
      act(() => fake.recognitions[0].say(phrase, true));
      // "tell me my medicine schedule" lands on `scheduleNeedsRecord`, which is
      // eligible for natural rephrasing (see CONVERSATIONAL_REPHRASE_KEYS) and so
      // waits a short, bounded budget before speaking; with no real server in
      // this test it always falls back to the exact approved line. A no-op for
      // the other two phrases here, which land on the non-eligible `clarificationPrompt`.
      act(() => vi.advanceTimersByTime(900));
      // Still in `listening`, and the conversation moved forward with a new reply.
      expect(screen.getByText(/show me (a |the )?medicine label/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    },
  );

  it("a bare 'yes' answers the single offered question unambiguously", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    respond(fake, "yes");
    expect(screen.getByText("How would you like to show me your medicine?")).toBeInTheDocument();
    // Camera or photo is a choice; saying "camera" leads to the consent question.
    respond(fake, "the camera please");
    expect(screen.getByText("I need to see the writing clearly.")).toBeInTheDocument();
  });

  it("confirming a possible match by voice unlocks the explanation, hedging does not", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i })); // decline camera → fallback
    fireEvent.click(screen.getByRole("button", { name: "Choose from my medicines" }));
    fireEvent.click(screen.getByRole("button", { name: "Metformin 500 mg" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("I found a possible match: Metformin, 500 mg.")).toBeInTheDocument();
    finishSpeaking(fake); // let the "possible match" heading finish before answering

    respond(fake, "yes, that's right");
    expect(screen.getByText("Here is what your record says.")).toBeInTheDocument();
    expect(screen.getByText(/blood sugar/)).toBeInTheDocument(); // step 0 shows the purpose
  });

  it("'I'm not sure' on the confirm screen is treated as unsure, not a confirmation", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    fireEvent.click(screen.getByRole("button", { name: "Choose from my medicines" }));
    fireEvent.click(screen.getByRole("button", { name: "Metformin 500 mg" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    finishSpeaking(fake);
    respond(fake, "yes but I am not sure");
    expect(screen.getByText("Let’s check this one together.")).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it("something unrecognised on a yes/no screen re-prompts with that step's own choices", () => {
    // Free speech in `listening` always routes through the normal NLU (never "unclear") —
    // this only applies on a screen expecting a specific answer, e.g. confirm-match.
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    fireEvent.click(screen.getByRole("button", { name: "Choose from my medicines" }));
    fireEvent.click(screen.getByRole("button", { name: "Metformin 500 mg" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    finishSpeaking(fake);

    act(() => fake.recognitions.at(-1)!.say("asdkjhasd blorp", true));
    // Acknowledged, then told what this step accepts — including "I'm not sure",
    // so the re-prompt never nudges toward confirming.
    expect(screen.getByText(/didn’t quite catch that/i)).toBeInTheDocument();
    expect(screen.getByText(/say “yes”, “no”, or “I’m not sure”/i)).toBeInTheDocument();
    expect(screen.getByText("I found a possible match: Metformin, 500 mg.")).toBeInTheDocument(); // unchanged
  });

  it("after a confirmed match, an unrecognised question names the next step instead of stalling", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    fireEvent.click(screen.getByRole("button", { name: "Choose from my medicines" }));
    fireEvent.click(screen.getByRole("button", { name: "Metformin 500 mg" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    finishSpeaking(fake);
    respond(fake, "yes that is my medicine");

    act(() => fake.recognitions.at(-1)!.say("so what am I meant to do now", true));
    expect(screen.getByText(/say “next” to hear the rest/i)).toBeInTheDocument();
    // Guidance only — it moves nothing and opens nothing: still on the first step.
    expect(screen.getByLabelText(translate("en", "explainHintNext"))).toBeInTheDocument();
    expect(screen.queryByText("Take 1 tablet twice daily with meals.")).toBeNull();
  });

  it("spoken urgent-risk wording is caught by the safety classifier, exactly like typed", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    act(() => fake.recognitions[0].say("I have chest pain", true));
    expect(screen.getByRole("alert")).toHaveTextContent("This may need urgent help.");
  });

  it("says 'end the call' out loud to hang up, like a real call", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    act(() => fake.recognitions[0].say("end the call", true));
    expect(screen.getByRole("button", { name: /call with companion/i })).toBeInTheDocument();
  });

  it("uses the selected language for recognition and speech", () => {
    const fake = install();
    render(<CompanionExperience />);
    act(() => sessionStore.dispatch({ type: "SET_LANGUAGE", language: "zh-Hans" }));
    startCall(fake, "呼叫助手");
    expect(fake.utterances[0].lang).toBe("zh-CN");
    expect(fake.recognitions[0].lang).toBe("zh-CN");
  });

  it("saying the name and strength in one breath finds the same candidate as the camera or typed form", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i })); // decline camera → fallback
    finishSpeaking(fake); // let the guidance text finish before answering by voice

    respond(fake, "It's Metformin, 500 milligrams");
    act(() => vi.advanceTimersByTime(1000)); // the brief "checking" beat before a result

    expect(screen.getByText("I found a possible match: Metformin, 500 mg.")).toBeInTheDocument();
  });

  it("a medicine name with no strength yet is asked for the strength, then completes on the next turn", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    finishSpeaking(fake);

    respond(fake, "It's Metformin");
    expect(screen.getByText(/what strength does the label say/i)).toBeInTheDocument();

    respond(fake, "500 milligrams");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("I found a possible match: Metformin, 500 mg.")).toBeInTheDocument();
  });

  it("a wrong name and strength said together is a safe no-match, not a guess", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    finishSpeaking(fake);

    respond(fake, "It's Aspirin, 300 milligrams");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("Let’s check this one together.")).toBeInTheDocument();
  });
});

describe("hands-free conversation — recovery and control", () => {
  it("a low-confidence result is asked again before anything is classified; 0 means 'not provided'", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);

    // Would otherwise be an urgent-risk turn: nothing is acted on from a guess.
    act(() => fake.recognitions.at(-1)!.say("I have chest pain", true, 0.3));
    expect(screen.getByText("Sorry, I didn’t quite catch that. Could you say it again? Typing it works well too.")).toBeInTheDocument();
    expect(screen.queryByText("This may need urgent help.")).toBeNull();
    expect(screen.queryByText("I have chest pain")).toBeNull();
    finishSpeaking(fake);

    act(() => fake.recognitions.at(-1)!.say("What is this for?", true, 0));
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
  });

  it("mic errors pause the loop with a plain-language message; typing keeps working", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    act(() => fake.recognitions[0].fail("not-allowed"));
    expect(screen.getByText(/microphone is off/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: "What is this for?" } });
    fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
  });

  it("silence is tolerated a few times before the loop pauses", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    act(() => fake.recognitions[0].fail("no-speech"));
    expect(screen.queryByText(/still here/i)).toBeNull(); // one miss is not treated as a problem
    tick();
    act(() => fake.recognitions.at(-1)!.fail("no-speech"));
    tick();
    act(() => fake.recognitions.at(-1)!.fail("no-speech"));
    expect(screen.getByText(/still here/i)).toBeInTheDocument();
  });

  it("the small mic icon mutes and resumes the conversation on demand", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    expect(fake.recognitions[0].started).toBe(true);
    expect(micButton()).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(micButton());
    expect(fake.recognitions[0].started).toBe(false);
    expect(micButton()).toHaveAttribute("aria-pressed", "false");
    tick();
    expect(fake.recognitions).toHaveLength(1); // stayed off — no new recognition opened

    fireEvent.click(micButton());
    expect(micButton()).toHaveAttribute("aria-pressed", "true");
    tick();
    expect(fake.recognitions.length).toBeGreaterThan(1);
  });

  it("ending the call stops the mic and speech, and the next call starts the same automatic way", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    expect(fake.recognitions[0].started).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /end call/i }));
    expect(fake.recognitions[0].started).toBe(false);
    expect(screen.queryByRole("button", { name: /mic on|mic off/i })).toBeNull(); // VoiceBar not shown

    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    expect(fake.utterances).toHaveLength(2); // the greeting is spoken again, automatically
  });
});

describe("words and voice arrive together", () => {
  const GREETING = "Hello, I’m an AI guide. What would you like to know today?";
  function installSlowGemini() {
    let start: (ok: boolean) => void = () => undefined;
    const player = {
      speak: vi.fn(() => new Promise<boolean>((r) => (start = r))),
      stop: vi.fn(),
      onSpeakingChange: () => () => undefined,
    };
    setGeminiSpeechPlayer(player as unknown as GeminiSpeechPlayer);
    return { player, start: (ok: boolean) => start(ok) };
  }
  afterEach(() => setGeminiSpeechPlayer(null));

  // PRD EN-05: text must not be artificially delayed to wait for audio.
  it("shows the companion's words at once, without waiting for its voice to start", async () => {
    install();
    const gemini = installSlowGemini();
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));

    expect(screen.getByText(GREETING)).toBeInTheDocument();
    expect(screen.queryByText(translate("en", "companionThinking"))).not.toBeInTheDocument();

    await act(async () => gemini.start(true));
    expect(screen.getAllByText(GREETING)).toHaveLength(1); // said once, not added again when the voice starts
  });

  it("if the voice is slow, switches to the browser voice and shows the words together", async () => {
    const fake = install();
    installSlowGemini();
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    expect(fake.utterances).toHaveLength(0);

    await act(async () => vi.advanceTimersByTime(6000));
    expect(fake.utterances.at(-1)?.text).toBe(GREETING);
    expect(screen.getByText(GREETING)).toBeInTheDocument();
  });
});
