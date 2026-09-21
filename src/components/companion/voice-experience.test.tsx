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
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(1000); });

beforeEach(() => {
  vi.useFakeTimers();
  sessionStore.reset();
});
afterEach(() => {
  setVoiceProvider(null);
  vi.useRealTimers();
});

describe("voice input", () => {
  it("does not touch the microphone until the user taps, and discloses where speech may go", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    expect(fake.recognitions).toHaveLength(0);
    expect(screen.getByText(/may send your voice to its own speech service/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /tap to speak/i }));
    expect(fake.recognitions).toHaveLength(1);
    expect(screen.getByRole("button", { name: /stop listening/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/please speak now/i)).toBeInTheDocument();
  });

  it("a spoken question takes the same route as typing: unknown medicine → only Show medicine", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    fireEvent.click(screen.getByRole("button", { name: /tap to speak/i }));
    act(() => fake.recognitions[0].say("What is this for", false));
    expect(screen.getByText("What is this for")).toBeInTheDocument(); // live interim caption
    act(() => fake.recognitions[0].say("What is this for?", true));

    expect(screen.getByText(/Let’s check this together/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ask about my schedule/i })).toBeNull();
    // Still just a question: the camera has not been requested and nothing medical is shown.
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it("spoken urgent-risk wording is caught by the safety classifier, exactly like typed", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    fireEvent.click(screen.getByRole("button", { name: /tap to speak/i }));
    act(() => fake.recognitions[0].say("I have chest pain", true));
    expect(screen.getByRole("alert")).toHaveTextContent("This may need urgent help.");
    expect(screen.queryByRole("button", { name: /back to the conversation/i })).toBeNull();
  });

  it("speech cannot skip the call-start gate: no mic control exists on the landing screen", () => {
    install();
    render(<CompanionExperience />);
    expect(screen.queryByRole("button", { name: /tap to speak/i })).toBeNull();
  });

  it("uses the selected language for recognition", () => {
    const fake = install();
    render(<CompanionExperience />);
    act(() => sessionStore.dispatch({ type: "SET_LANGUAGE", language: "zh-Hans" }));
    fireEvent.click(screen.getByRole("button", { name: "呼叫助手" }));
    fireEvent.click(screen.getByRole("button", { name: "点击说话" }));
    expect(fake.recognitions[0].lang).toBe("zh-CN");
  });

  it.each([
    ["not-allowed", /microphone is off/i],
    ["no-speech", /didn’t hear anything/i],
    ["audio-capture", /couldn’t find a microphone/i],
    ["network", /voice service couldn’t be reached/i],
  ])("recognition error %s → plain-language message, typing still works", (code, message) => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    fireEvent.click(screen.getByRole("button", { name: /tap to speak/i }));
    act(() => fake.recognitions[0].fail(code));
    expect(screen.getByText(message)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: "What is this for?" } });
    fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
  });

  it("no speech recognition → no mic button, an explanation, and typing works", () => {
    install({ recognition: false });
    render(<CompanionExperience />);
    startCall();
    expect(screen.queryByRole("button", { name: /tap to speak/i })).toBeNull();
    expect(screen.getByText(/voice input isn’t available in this browser/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: "hello" } });
    fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
    expect(screen.getByRole("button", { name: /ask about my schedule/i })).toBeInTheDocument();
  });

  it("leaving the listening screen stops an active recording", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    fireEvent.click(screen.getByRole("button", { name: /tap to speak/i }));
    expect(fake.recognitions[0].started).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /end call/i }));
    expect(fake.recognitions[0].started).toBe(false);
  });
});

describe("spoken replies", () => {
  it("is silent by default: nothing is spoken and the control is off", () => {
    const fake = install();
    render(<CompanionExperience />);
    expect(screen.queryByRole("button", { name: /read replies aloud/i })).toBeNull(); // not on landing
    startCall();
    expect(fake.utterances).toHaveLength(0);
    expect(screen.getByRole("button", { name: /read replies aloud/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Sound off")).toBeInTheDocument();
  });

  it("turning sound on reads the visible companion message; new replies are read; off/mute stops it", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    fireEvent.click(screen.getByRole("button", { name: /read replies aloud/i }));
    expect(fake.utterances.at(-1)?.text).toBe("Hello, Mei Ling. What would you like help with?");
    expect(screen.getByText("Sound on")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: "What is this for?" } });
    fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
    expect(fake.utterances.at(-1)?.text).toContain("Let’s check this together");

    const spoken = fake.utterances.length;
    fireEvent.click(screen.getByRole("button", { name: /repeat/i }));
    expect(fake.utterances.length).toBe(spoken + 1); // Repeat re-reads the approved content

    fireEvent.click(screen.getByRole("button", { name: /read replies aloud/i })); // mute
    const afterMute = fake.utterances.length;
    fireEvent.click(screen.getByRole("button", { name: /repeat/i }));
    expect(fake.utterances.length).toBe(afterMute);
    expect(screen.getByText("Sound off")).toBeInTheDocument();
  });

  it("never reads the explanation before confirmation, and reads record wording after it", async () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    fireEvent.click(screen.getByRole("button", { name: /read replies aloud/i }));
    fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: "What is this for?" } });
    fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    fireEvent.click(screen.getByRole("button", { name: /use demo label/i }));
    await flush();

    // On the possible-match screen: identity only.
    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
    const before = fake.utterances.map((u) => u.text).join(" | ");
    expect(before).not.toMatch(/blood sugar|Take 1 tablet|twice daily/i);

    fireEvent.click(screen.getByRole("button", { name: /yes, this is my medicine/i }));
    expect(fake.utterances.at(-1)?.text).toContain("Metformin helps manage blood sugar.");
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(fake.utterances.at(-1)?.text).toContain("Take 1 tablet twice daily with meals.");
  });

  it("ending the call stops speech and turns sound off for the next call", () => {
    const fake = install();
    render(<CompanionExperience />);
    startCall();
    fireEvent.click(screen.getByRole("button", { name: /read replies aloud/i }));
    const spoken = fake.utterances.length;
    fireEvent.click(screen.getByRole("button", { name: /end call/i }));
    expect(fake.utterances.length).toBe(spoken);
    expect(screen.queryByRole("button", { name: /read replies aloud/i })).toBeNull();
  });

  it("no speech synthesis → no sound control at all", () => {
    install({ synthesis: false });
    render(<CompanionExperience />);
    startCall();
    expect(screen.queryByRole("button", { name: /read replies aloud/i })).toBeNull();
  });
});
