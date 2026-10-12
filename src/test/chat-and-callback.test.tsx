import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { t } from "@/lib/content/translations";
import { sessionStore } from "@/lib/session/session-store";
import { BrowserVoiceProvider } from "@/lib/voice/browser-voice";
import { setVoiceProvider } from "@/lib/voice/use-voice";
import { createFakeSpeech } from "./fake-speech";
import { chooseCamera, chooseShowMedicine, run, startCall, toConfirmMatch } from "./helpers";

/**
 * Owner reports from live testing:
 *  - the help request card and its buttons aren't needed — the question goes in the chat, answered in words;
 *  - "before sending the message to the pharmacist… the companion didn't let me review the message";
 *  - "some of the voice input by me or conversations I had… is not captured in the chat list".
 */

const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
const type = (text: string) => {
  fireEvent.change(screen.getByLabelText(/type it here/i), { target: { value: text } });
  fireEvent.submit(screen.getByLabelText(/type it here/i).closest("form")!);
};
const chat = () => [...document.querySelectorAll("[data-transcript] [data-speaker]")].map((el) => `${el.getAttribute("data-speaker")}: ${el.textContent?.replace(/^(Mei Ling says:|Companion says:)/, "")}`);

let posts: Array<{ url: string; body: unknown }> = [];
beforeEach(() => {
  vi.useFakeTimers();
  sessionStore.reset();
  posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") posts.push({ url, body: JSON.parse(String(init.body)) });
      if (url === "/api/help/request") {
        return new Response(JSON.stringify({ ok: true, data: { kind: "pharmacist-callback", reference: "BC-482913" }, requestId: "r" }));
      }
      throw new Error("offline");
    }),
  );
});
afterEach(() => {
  setVoiceProvider(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a pharmacist callback: asked in words, checked, then sent by an explicit 'send'", () => {
  const atHelpScreen = () => sessionStore.setForTest(run([startCall, { type: "GET_HELP" }]));

  it("the question is a line in the chat, with no card or buttons", () => {
    atHelpScreen();
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: "Ask a pharmacist to call me" }));
    expect(chat().at(-1)).toBe(`companion: ${t("en", "callbackConfirm")}`);
    expect(screen.queryByRole("button", { name: /yes, send the request|not now/i })).toBeNull();
    expect(document.querySelector("[data-pinned]")).toBeNull();
  });

  it("'yes' opens the review: exactly what is sent; a plain yes doesn't send, an explicit 'send' does", async () => {
    atHelpScreen();
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: "Ask a pharmacist to call me" }));
    type("yes please");
    await flush();
    expect(posts.filter((p) => p.url === "/api/help/request")).toHaveLength(0); // nothing sent by "yes"

    const review = screen.getByRole("region", { name: "Check before sharing" });
    expect(review).toHaveTextContent("BrightCare Pharmacy — fictional demo");
    expect(review).toHaveTextContent("Please call me back");
    expect(review).toHaveTextContent(t("en", "helpReasonGeneral")); // the reason code that is sent, in words
    expect(review).not.toHaveTextContent("0000 0188"); // masked until asked
    fireEvent.click(screen.getByRole("button", { name: "Show number" }));
    expect(review).toHaveTextContent("0000 0188");
    expect(chat().at(-1)).toBe(`companion: ${t("en", "callbackReview")}`); // and said, in the chat

    expect(screen.queryByRole("button", { name: /send callback request/i })).toBeNull(); // no Send button
    // A plain yes or a question doesn't send ("maybe send it" is a hedge: it cancels, sending nothing).
    for (const words of ["yes", "is it ready to send?"]) {
      type(words);
      await flush();
      expect(sessionStore.getSnapshot().helpFlow?.stage).toBe("review");
    }
    expect(posts.filter((p) => p.url === "/api/help/request")).toHaveLength(0);
    expect(chat()).toContain(`companion: ${t("en", "helpSayToSend")}`); // the plain yes was told how to send

    type("send it");
    await flush();
    const sent = posts.filter((p) => p.url === "/api/help/request");
    expect(sent).toHaveLength(1);
    // The preview and the payload match: the kind and the reason shown, and nothing else of hers.
    expect(sent[0].body).toEqual({ sessionId: expect.any(String), kind: "pharmacist-callback", reason: "help-requested" });
    expect(screen.getByText(/your callback request to BrightCare Pharmacy was submitted/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /carry on/i })).toBeNull(); // "anything else?" is answered in words
  });

  it("'don't send' (said or tapped) closes the review with nothing sent", async () => {
    atHelpScreen();
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: "Ask a pharmacist to call me" }));
    type("yes");
    type("don't send it");
    await flush();
    expect(sessionStore.getSnapshot().helpFlow).toBeNull();
    expect(posts.filter((p) => p.url === "/api/help/request")).toHaveLength(0);
  });
});

describe("the chat captures the whole conversation", () => {
  it("her spoken answers that act on a step ('yes', 'next') are in the chat, in order", () => {
    const fake = createFakeSpeech();
    setVoiceProvider(new BrowserVoiceProvider(fake.env));
    sessionStore.setForTest(toConfirmMatch());
    render(<CompanionExperience />);
    act(() => fake.utterances.at(-1)?.onend?.()); // the companion finishes asking…
    act(() => vi.advanceTimersByTime(400)); // …and the mic opens
    act(() => fake.recognitions.at(-1)!.say("yes, this is my medicine", true));
    act(() => fake.utterances.at(-1)?.onend?.());
    act(() => vi.advanceTimersByTime(400));
    act(() => fake.recognitions.at(-1)!.say("next", true));
    const lines = chat();
    const yes = lines.indexOf("user: yes, this is my medicine");
    const next = lines.indexOf("user: next");
    expect(yes).toBeGreaterThan(lines.findIndex((l) => l.startsWith("companion: I found a possible match")));
    expect(next).toBeGreaterThan(yes);
    expect(lines.slice(yes + 1, next).join(" ")).toMatch(/Here is what your record says/);
  });

  it("a step's own line goes into the chat once she answers — in its place, and never twice", () => {
    sessionStore.setForTest(run([startCall, { type: "USER_MESSAGE", text: "What is this for?", via: "typed" }, chooseShowMedicine, chooseCamera]));
    render(<CompanionExperience />);
    const question = t("en", "cameraPermissionHeading");
    expect(screen.getAllByText(new RegExp(question.slice(0, 20)))).toHaveLength(1); // in its panel only, for now
    type("no thanks");
    const lines = chat();
    const asked = lines.findIndex((l) => l.includes(question));
    expect(asked).toBeGreaterThan(-1); // now in the chat…
    expect(lines[asked + 1]).toBe("user: no thanks"); // …before her answer
    expect(lines.filter((l) => l.includes(question))).toHaveLength(1);
  });

  it("words a step doesn't take are still shown (nothing she says disappears)", () => {
    sessionStore.setForTest(run([startCall, { type: "USER_MESSAGE", text: "What is this for?", via: "typed" }, chooseShowMedicine, chooseCamera]));
    render(<CompanionExperience />);
    type("the weather is lovely today");
    expect(chat()).toContain("user: the weather is lovely today");
  });
});
