import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t as translate } from "@/lib/content/translations";
import { sessionStore } from "@/lib/session/session-store";
import { BrowserVoiceProvider } from "@/lib/voice/browser-voice";
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

    expect(fake.utterances[0].text).toBe("Hello, Mei Ling. What would you like help with?");
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
        view={{ listening: false, speaking: false, interim: "", micOn: true, notice: null, toggleMic: () => undefined }}
      />,
    );
    expect(screen.getByText(/may send your voice to its own speech service/i)).toBeInTheDocument();
  });

  it("no voice bar at all when the browser has no speech recognition — typing still works", () => {
    const fake = install({ recognition: false });
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    // Synthesis-only: the greeting is still spoken (no recognition needed for that)...
    expect(fake.utterances[0].text).toBe("Hello, Mei Ling. What would you like help with?");
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
    expect(screen.getByText("Hello, Mei Ling. What would you like help with?")).toBeInTheDocument();
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

    expect(screen.getByText(/Metformin 500 mg/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    // Named, not explained — the dosing instruction is still gated behind confirmation.
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it("an off-topic question (the weather) is redirected to the two supported actions, not answered", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    act(() => fake.recognitions[0].say("What will happen if I ask about the weather today?", true));

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
      expect(screen.getByText("I need to see the writing clearly.")).toBeInTheDocument();
    },
  );

  it.each(["what do I need to do", "what should I do now", "tell me my medicine schedule"])(
    "asking %j moves the conversation forward instead of doing nothing",
    (phrase) => {
      const fake = install();
      render(<CompanionExperience />);
      startCall(fake);
      act(() => fake.recognitions[0].say(phrase, true));
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
    expect(screen.getByText("I need to see the writing clearly.")).toBeInTheDocument();
  });

  it("confirming a possible match by voice unlocks the explanation, hedging does not", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i })); // decline camera → fallback
    fireEvent.click(screen.getByRole("button", { name: /use demo label/i }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    fireEvent.click(screen.getByRole("button", { name: /use demo label/i }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    finishSpeaking(fake);
    respond(fake, "yes but I am not sure");
    expect(screen.getByText("I’m not sure enough to explain this safely.")).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it("something unrecognised on a yes/no screen gets a gentle 'didn't catch that', not silence", () => {
    // Free speech in `listening` always routes through the normal NLU (never "unclear") —
    // this only applies on a screen expecting a specific answer, e.g. confirm-match.
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    fireEvent.click(screen.getByRole("button", { name: /use demo label/i }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    finishSpeaking(fake);

    act(() => fake.recognitions.at(-1)!.say("asdkjhasd blorp", true));
    expect(screen.getByText(/didn’t catch that/i)).toBeInTheDocument();
    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument(); // unchanged
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
    fireEvent.click(screen.getByRole("button", { name: /not now/i })); // decline camera → fallback
    finishSpeaking(fake); // let the guidance text finish before answering by voice

    respond(fake, "It's Metformin, 500 milligrams");
    act(() => vi.advanceTimersByTime(1000)); // the brief "checking" beat before a result

    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
  });

  it("a medicine name with no strength yet is asked for the strength, then completes on the next turn", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    finishSpeaking(fake);

    respond(fake, "It's Metformin");
    expect(screen.getByText(/what strength does the label say/i)).toBeInTheDocument();

    respond(fake, "500 milligrams");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
  });

  it("a wrong name and strength said together is a safe no-match, not a guess", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall(fake);
    respond(fake, "What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    finishSpeaking(fake);

    respond(fake, "It's Aspirin, 300 milligrams");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/i’m not sure enough/i)).toBeInTheDocument();
  });
});

describe("hands-free conversation — recovery and control", () => {
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
