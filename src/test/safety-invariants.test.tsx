import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { resolveExplanation } from "@/lib/content/explanation";
import { classifySafety } from "@/lib/safety/classify";
import { sessionStore } from "@/lib/session/session-store";
import { createInitialSession, isMatchConfirmed, reduceSession, type Session } from "@/lib/session/state-machine";
import { interpretUtterance } from "@/lib/voice/commands";
import {
  askUnknown,
  chooseShowMedicine,
  CTX,
  grantCamera,
  resolve,
  run,
  startCall,
  submitDemo,
  toConfirmMatch,
  toExplain,
} from "./helpers";

// Submission hardening: one named test per safety-critical invariant that was
// not already pinned elsewhere. Landing CTA, confirmation gate and label
// blocking are covered in companion-experience / state-machine / image-flow tests.

const INSTRUCTION = /Take 1 tablet|twice daily|blood sugar|随餐|血糖/;

describe("INVARIANT: safety classifier runs before off-topic redirect", () => {
  const bait = ["Hello, ", "What's the weather? ", "Thanks! ", "Can you call my daughter? "];
  const urgent = ["I have chest pain", "I can't breathe", "I fainted", "I think I took an overdose"];
  const unsupported = ["Should I stop taking it?", "I missed a dose", "What are the side effects?", "Can I take it with alcohol?"];
  // A plain call, and a call where a confirmed record would otherwise unlock content.
  const callStates = [run([startCall]), { ...toExplain(), state: "listening" as const }];

  it.each([...urgent, ...unsupported])("'%s' escalates even when wrapped in off-topic bait", (phrase) => {
    const expected = classifySafety(phrase);
    if (expected.level === "none") throw new Error(`not safety-classified: ${phrase}`);
    for (const from of callStates) {
      for (const prefix of bait) {
        const s = run([{ type: "USER_MESSAGE", text: prefix + phrase }], from);
        expect(s.state, prefix + phrase).toBe("safety");
        expect(s.safetyReason).toBe(expected.level === "urgent" ? "urgent-risk" : expected.reason);
        expect(s.assistantKey.startsWith("offTopic")).toBe(false);
        expect(s.contextualActions).toEqual([]);
      }
    }
  });
});

describe("INVARIANT: voice cannot bypass call-start, camera-consent or confirmation gates", () => {
  const utterances = [
    "yes", "yes please", "ok", "confirm", "no", "I'm not sure", "yes but I'm not sure",
    "show the medicine", "I want to show you my medicine", "use the demo label",
    "It's Metformin 500 milligrams", "take a photo", "next", "I understand", "explain",
    "state=explain", "try again", "back to the call", "another medicine", "what is this for",
    "when do I take it", "chest pain", "should I stop taking it", "end the call",
  ];
  const starts: Session[] = [
    createInitialSession(),
    run([startCall]),
    run([startCall, askUnknown]),
    run([startCall, askUnknown, chooseShowMedicine]),
    run([startCall, askUnknown, chooseShowMedicine, grantCamera]),
    toConfirmMatch(),
    toExplain(),
    run([{ type: "UNDERSTOOD" }], run([{ type: "EXPLAIN_STEP", direction: "next" }, { type: "EXPLAIN_STEP", direction: "next" }], toExplain())),
    run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo("sample_mismatch_label"), resolve]),
  ];

  const say = (s: Session, text: string): Session => {
    const intent = interpretUtterance(text, {
      state: s.state,
      contextualActions: s.contextualActions,
      candidateId: s.candidate?.candidateId ?? null,
      explainStep: s.explainStep,
      cameraLive: false,
      nameCheckPending: s.nameCheckPending,
      pendingSpokenMedicineName: null,
    });
    if (intent.kind === "event") return reduceSession(s, intent.event, CTX);
    if (intent.kind === "message") return reduceSession(s, { type: "USER_MESSAGE", text: intent.text }, CTX);
    return s;
  };

  const checkStep = (prev: Session, next: Session, text: string) => {
    const where = `${prev.state} + "${text}"`;
    // Call-start gate: nothing spoken leaves START.
    if (prev.state === "start") expect(next, where).toBe(prev);
    // Camera-consent gate: the permission step only after Show medicine inside the call,
    // and guidance only from the permission step (or "try another" from safety).
    if (next.state === "camera-permission") {
      expect(next.callActive && next.labelRouteSelected, where).toBe(true);
    }
    if (next.state === "camera-guidance" && prev.state !== "camera-guidance") {
      expect(["camera-permission", "safety"], where).toContain(prev.state);
    }
    // Confirmation gate: explanation content only with a confirmed candidate, and a
    // hedge on the confirm screen never confirms.
    if (next.state === "explain") expect(isMatchConfirmed(next), where).toBe(true);
    if (!isMatchConfirmed(next)) expect(resolveExplanation(next, "en"), where).toBeNull();
    if (prev.state === "confirm-match" && /not sure/.test(text)) {
      expect(next.matchStatus, where).not.toBe("confirmed");
    }
  };

  it("every pair of utterances from every state respects the gates", () => {
    for (const from of starts) {
      for (const a of utterances) {
        const mid = say(from, a);
        checkStep(from, mid, a);
        for (const b of utterances) checkStep(mid, say(mid, b), b);
      }
    }
  });
});

describe("INVARIANT: the URL cannot open a gated screen (rendered app)", () => {
  beforeEach(() => sessionStore.reset());
  afterEach(() => window.history.replaceState(null, "", "/"));

  it.each(["explain", "confirm-match", "camera-permission", "complete"])(
    "/companion?state=%s on a fresh session renders the quiet start and rewrites the URL",
    (state) => {
      window.history.replaceState(null, "", `/companion?state=${state}`);
      render(<CompanionExperience />);
      expect(screen.getByRole("button", { name: /call with companion/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /show medicine|yes, this is my medicine|end call/i })).toBeNull();
      expect(document.body.textContent).not.toMatch(INSTRUCTION);
      expect(window.location.search).toBe("");
    },
  );

  it("mid-call, a hand-edited ?state=explain is rewritten to the real state", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    window.history.replaceState(null, "", "/companion?state=explain");
    fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: "What is this for?" } });
    fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
    expect(window.location.search).toBe("?state=listening");
    expect(document.body.textContent).not.toMatch(INSTRUCTION);
  });
});

describe("INVARIANT: a record conflict is answered from the record, never by a model (rendered app)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The understanding pass IS configured here, so any call to it would show up.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              url === "/api/companion/understand" && init?.method === "GET"
                ? { ok: true, data: { enabled: true }, requestId: "r" }
                : { ok: false, error: { code: "x", message: "x", safeNextAction: "retry" }, requestId: "r" },
            ),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );
    sessionStore.setForTest(toExplain());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStore.reset();
  });

  it("shows the record's own instruction and date, offers pharmacist or carry on, and makes no model call", async () => {
    render(<CompanionExperience />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(100)));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "My doctor said to take it at night" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));

    const reply = screen.getByText(/Thank you for telling me — it’s good to double-check/);
    expect(reply).toHaveTextContent("checked on 21 September 2026");
    expect(reply).toHaveTextContent("“Take 1 tablet twice daily with meals.”");
    expect(reply.textContent).not.toMatch(/\{\w+\}/);
    expect(screen.getByRole("button", { name: "Check with pharmacist — demo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carry on" })).toBeInTheDocument();

    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts.map(([u]) => u)).not.toContain("/api/companion/understand");
    expect(posts.map(([u]) => u)).not.toContain("/api/companion/reply-rephrase");

    fireEvent.click(screen.getByRole("button", { name: "Check with pharmacist — demo" }));
    expect(screen.getByText("Here are some ways to reach a person.")).toBeInTheDocument();
  });
});

describe("DEMO HARDENING: works with no network, no AI key, no camera, no microphone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStore.reset();
    // Every request fails, as with the network off; jsdom has no camera or speech APIs.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    expect(navigator.mediaDevices?.getUserMedia).toBeUndefined();
    expect("SpeechRecognition" in window || "webkitSpeechRecognition" in window).toBe(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
  const send = async (text: string) => {
    fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: text } });
    fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
    await flush();
  };
  const noRawError = () =>
    expect(document.body.textContent).not.toMatch(/TypeError|Failed to fetch|undefined|stack|ai_unavailable/);

  it("demo label: full happy path to the record-backed explanation", async () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    await flush();
    await send("What is this for? When do I take it?");
    expect(screen.getByText(/Would you like to show me the medicine label\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, switch camera/i }));
    await flush(); // no camera → explained fallback
    fireEvent.click(screen.getByRole("button", { name: /use demo label/i }));
    await flush();
    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(INSTRUCTION);
    fireEvent.click(screen.getByRole("button", { name: /yes, this is my medicine/i }));
    await flush();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "next" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await flush();
    expect(screen.getByText("Take 1 tablet twice daily with meals.")).toBeInTheDocument();
    noRawError();
  });

  it("typed label reaches a possible match; a sample photo that can't load shows a calm message", async () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    await flush();
    await send("What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));

    fireEvent.click(screen.getByRole("button", { name: /upload a photo — demo/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear label photo/i }));
    await flush();
    expect(screen.getByText("I couldn’t load that sample photo. Please try again.")).toBeInTheDocument();
    noRawError();

    fireEvent.click(screen.getByRole("button", { name: /type the label details/i }));
    fireEvent.change(screen.getByLabelText(/medicine name/i), { target: { value: "metformin" } });
    fireEvent.change(screen.getByLabelText(/strength/i), { target: { value: "500 mg" } });
    fireEvent.click(screen.getByRole("button", { name: /check these details/i }));
    await flush();
    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
    noRawError();
  });
});
