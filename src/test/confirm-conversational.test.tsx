import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { isApprovedSpeech } from "@/lib/content/speech-guard";
import { t } from "@/lib/content/translations";
import { sessionStore } from "@/lib/session/session-store";
import { BrowserVoiceProvider } from "@/lib/voice/browser-voice";
import { interpretUtterance, spokenActions, type CommandContext } from "@/lib/voice/commands";
import { confirmLine, speakableText } from "@/lib/voice/speakable";
import { setVoiceProvider } from "@/lib/voice/use-voice";
import { createFakeSpeech } from "./fake-speech";
import { toConfirmMatch } from "./helpers";

/**
 * Owner decision (12 October 2026): no confirmation panel. The companion says what it
 * found from the record, in the conversation; a clear yes (said or typed) confirms.
 * The gate is unchanged: "no" and "not sure" never unlock the record, and the AI is
 * never offered "yes".
 */
const EN = /^I found a possible match on your BrightCare Pharmacy record \(fictional\): Metformin, 500 mg, tablet\. Please check the name on your label\. Is this the medicine you have\? If you’re not sure, just say so\.$/;

beforeEach(() => {
  vi.useFakeTimers();
  sessionStore.reset();
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
});
afterEach(() => {
  setVoiceProvider(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the medicine confirmation is a conversation", () => {
  it("one line says what was found: a possible match, name, strength, form, fictional source — approved for the voice", () => {
    const s = toConfirmMatch();
    const en = confirmLine((k) => t("en", k), s.candidate!);
    expect(en).toMatch(EN);
    expect(isApprovedSpeech(en)).toBe(true);
    const zh = confirmLine((k) => t("zh-Hans", k), s.candidate!);
    expect(zh).toMatch(/BrightCare Pharmacy记录（虚构）中找到一个可能的匹配：Metformin，500 mg，片剂。/);
    expect(isApprovedSpeech(zh)).toBe(true);
    expect(speakableText(s, (k) => t("en", k), null, null)).toBe(en); // what is said is what is shown
  });

  it("no panel or buttons: a healthy voice call keeps just Help, the message pill, the mic and End call; the line is in the transcript", () => {
    const fake = createFakeSpeech();
    setVoiceProvider(new BrowserVoiceProvider(fake.env));
    sessionStore.setForTest(toConfirmMatch());
    render(<CompanionExperience />);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") || b.textContent?.trim())).toEqual(["Help", "Send message", "Mute microphone", "End call"]);
    expect(document.querySelector("[data-pinned]")).toBeNull();
    const line = screen.getByText(EN);
    expect(line.closest("[data-speaker]")).toHaveAttribute("data-speaker", "companion");
    expect(fake.utterances.at(-1)?.text).toBe(line.textContent); // the same words, voiced
  });

  it("a clear yes (said or typed) confirms; no, not sure and a hedged yes never unlock the record", () => {
    const s = toConfirmMatch();
    const ctx: CommandContext = {
      state: "confirm-match",
      contextualActions: [],
      candidateId: s.candidate!.candidateId,
      explainStep: 0,
      cameraLive: false,
      pendingSpokenMedicineName: null,
    };
    const decision = (text: string) => {
      const r = interpretUtterance(text, ctx);
      return r.kind === "event" && r.event.type === "CONFIRM_MATCH" ? r.event.decision : r.kind;
    };
    expect(decision("yes, this is my medicine")).toBe("confirmed");
    expect(decision("yes")).toBe("confirmed");
    expect(decision("no, that's not it")).toBe("denied");
    expect(decision("I'm not sure")).toBe("unsure");
    expect(decision("yes, I think so, maybe")).toBe("unsure");
    expect(decision("is it?")).toBe("unclear"); // a question is never a yes
    // The AI meaning-match can never say yes for her.
    expect(spokenActions(ctx).some((a) => a.event?.type === "CONFIRM_MATCH" && a.event.decision === "confirmed")).toBe(false);
  });

  it("typed 'yes' opens the record; typed 'not sure' does not", () => {
    sessionStore.setForTest(toConfirmMatch());
    const { unmount } = render(<CompanionExperience />);
    const type = (text: string) => {
      fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: text } });
      fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
    };
    type("I'm not sure");
    expect(sessionStore.getSnapshot().state).not.toBe("explain");
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    unmount();

    sessionStore.reset();
    sessionStore.setForTest(toConfirmMatch());
    render(<CompanionExperience />);
    type("yes, this is my medicine");
    expect(sessionStore.getSnapshot().state).toBe("explain");
    expect(screen.getByText("Here is what your record says.")).toBeInTheDocument();
  });
});
