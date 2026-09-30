import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionStore } from "@/lib/session/session-store";
import { run, toExplain } from "@/test/helpers";
import { CompanionExperience } from "./companion-experience";

const FORBIDDEN_ON_HOME = [
  /show medicine/i,
  /ask about my schedule/i,
  /my schedule/i,
  /repeat/i,
  /get help/i,
  /end call/i,
];

const primaryButtons = (root: HTMLElement) => root.querySelectorAll('[data-variant="primary"]');

beforeEach(() => {
  vi.useFakeTimers();
  sessionStore.reset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const analysisEnvelope = (data: unknown) => ({ ok: true, data, requestId: "req_test" });
const candidate = {
  outcome: "candidate",
  userMessage: "I found a possible match. Please check the name on the label.",
  nextState: "confirm-match",
  candidate: {
    candidateId: "cand_med_metformin_500_demo",
    patientName: "Mei Ling Tan",
    medicineName: "Metformin 500 mg",
    strength: "500 mg",
    dosageForm: "tablet",
    sourceLabel: "BrightCare Pharmacy — demo record",
    matchStatus: "possible",
  },
};

/** fetch stub: sample PNGs load; /api/label/analyze answers with the given body/status. */
function stubFetch(analyze: { status?: number; body: unknown } | "network-error") {
  const fn = vi.fn(async (url: string, init?: unknown) => {
    void init;
    if (String(url).startsWith("/samples/")) {
      return {
        ok: true,
        blob: async () => new Blob([new Uint8Array([137, 80, 78, 71, 1, 2])], { type: "image/png" }),
      };
    }
    if (analyze === "network-error") throw new TypeError("network down");
    return { ok: (analyze.status ?? 200) < 400, status: analyze.status ?? 200, json: async () => analyze.body };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });

const send = (text: string) => {
  fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: text } });
  fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
};

/** Start a call and open the camera-guidance screen (no camera in jsdom → fallback). */
function toGuidance(consent: "grant" | "decline" = "grant") {
  fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
  send("What is this for?");
  fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
  fireEvent.click(
    screen.getByRole("button", { name: consent === "grant" ? /yes, switch camera/i : /not now/i }),
  );
}

describe("landing (01-start-call)", () => {
  it("exposes exactly one prominent primary CTA: Call with companion", () => {
    const { container } = render(<CompanionExperience />);
    const primaries = primaryButtons(container);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent("Call with companion");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hello, Mei Ling");
  });

  it("has no Show medicine / schedule / Repeat / Get help / End call controls", () => {
    render(<CompanionExperience />);
    const buttons = screen.getAllByRole("button");
    for (const pattern of FORBIDDEN_ON_HOME) {
      expect(buttons.filter((b) => pattern.test(b.textContent ?? ""))).toHaveLength(0);
    }
    // Only small utilities besides the CTA.
    const names = buttons.map((b) => b.textContent);
    expect(names).toEqual(["Call with companion", "Help", "Language", "Settings"]);
    expect(screen.getByText("AI guide · Not a pharmacist or doctor")).toBeInTheDocument();
    expect(screen.getByText("Plan checked by BrightCare Pharmacy — demo record")).toBeInTheDocument();
  });
});

describe("in-call flow", () => {
  it("reveals call controls and a contextual Show medicine only after the call starts and a question is asked", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));

    const footer = screen.getByRole("navigation", { name: "Medication Companion" });
    expect(within(footer).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Repeat slowly",
      "Get help",
      "End call",
    ]);
    expect(screen.queryByRole("button", { name: /show medicine/i })).toBeNull();

    send("What is this for?");
    expect(screen.getByText(/Let’s check this together/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ask about my schedule/i })).toBeNull();
  });

  it("shows both temporary actions for a broad schedule question", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("When do I take my medicine?");
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask about my schedule/i })).toBeInTheDocument();
  });

  it("runs the full happy path with the demo label: possible match → confirm → explanation → Chinese", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));

    // Permission is explained before anything else; the explanation is not reachable yet.
    expect(screen.getByText("I need to see the writing clearly.")).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /yes, switch camera/i }));

    fireEvent.click(screen.getByRole("button", { name: /use demo label/i }));
    expect(screen.getByText("Reading the label…")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Possible match only — no instruction visible.
    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
    expect(screen.getAllByText("Metformin 500 mg").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    expect(screen.queryByText(/blood sugar/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /yes, this is my medicine/i }));
    expect(screen.getByText("Here is what your record says.")).toBeInTheDocument();
    expect(screen.getByText("Metformin helps manage blood sugar.")).toBeInTheDocument();

    // "Next" is said or typed, not a button.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "next" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(screen.getByText("Take 1 tablet twice daily with meals.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getByText("随餐每日服用一片，每日两次。")).toBeInTheDocument();
    // Language change did not reset the confirmation.
    expect(screen.getByRole("button", { name: "中文" })).toHaveAttribute("aria-pressed", "true");
  });

  it("beside the instruction: shows the dated source and asks to compare with the label; 'It looks different' reaches safety", () => {
    sessionStore.setForTest(run([{ type: "EXPLAIN_STEP", direction: "next" }], toExplain()));
    render(<CompanionExperience />);
    expect(screen.getByText("Take 1 tablet twice daily with meals.")).toBeInTheDocument();
    expect(screen.getByText("BrightCare Pharmacy — demo record · checked 21 September 2026")).toBeInTheDocument();
    const check = screen.getByRole("group", { name: "Does this match what’s printed on your label?" });
    expect(within(check).getByRole("button", { name: "Yes, it matches" })).toBeInTheDocument();

    fireEvent.click(within(check).getByRole("button", { name: "It looks different" }));
    expect(screen.getByText(/When the label and the record don’t agree, a pharmacist is the best person to look/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check with pharmacy — demo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try another photo" })).toBeNull();
  });

  it("low mood: a warm reply, and family help asks for consent before anything happens", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("I feel so lonely");
    expect(screen.getByText(/that sounds hard/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask family to help — demo" }));

    const consent = screen.getByRole("group", { name: /Shall I let your family know/ });
    expect(sessionStore.getSnapshot().audit.some((e) => e.eventType === "caregiver-help-requested")).toBe(false);
    fireEvent.click(within(consent).getByRole("button", { name: "Yes, ask them — demo" }));
    expect(sessionStore.getSnapshot().audit.some((e) => e.eventType === "caregiver-help-requested")).toBe(true);
    expect(screen.getByText(/no call or message was sent/i)).toBeInTheDocument();
  });

  it("self-harm wording shows the urgent screen with crisis line numbers as text, not a claimed call", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("I want to die");
    expect(screen.getByRole("alert")).toHaveTextContent("This may need urgent help.");
    expect(screen.getByText("Samaritans of Singapore (24 hours): 1767 · Emergency: 995")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /1767|995/ })).toBeNull();
  });

  it("typed-label fallback: a mismatching strength blocks instructions and offers demo-labelled human help", async () => {
    render(<CompanionExperience />);
    toGuidance("decline");
    fireEvent.click(screen.getByRole("button", { name: /type the label details/i }));
    fireEvent.change(screen.getByLabelText(/medicine name/i), { target: { value: "Metformin" } });
    fireEvent.change(screen.getByLabelText(/strength/i), { target: { value: "850 mg" } });
    fireEvent.click(screen.getByRole("button", { name: /check these details/i }));
    await flush();

    // A label that doesn't match gets the gentler, no-fault wording — not an alarm.
    expect(screen.getByText("Let’s check this one together.")).toBeInTheDocument();
    expect(screen.queryByText("I’m not sure enough to explain this safely.")).toBeNull();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    expect(screen.getByRole("button", { name: "Check with pharmacy — demo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask a trusted helper — demo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try another photo" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Check with pharmacy — demo" }));
    expect(screen.getByText(/no call or message was sent/i)).toBeInTheDocument();
  });

  it("typed-label fallback: validates required fields, then a correct label reaches a possible match", async () => {
    render(<CompanionExperience />);
    toGuidance("decline");
    fireEvent.click(screen.getByRole("button", { name: /type the label details/i }));
    fireEvent.click(screen.getByRole("button", { name: /check these details/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/medicine name and strength/i);

    fireEvent.change(screen.getByLabelText(/medicine name/i), { target: { value: "metformin" } });
    fireEvent.change(screen.getByLabelText(/strength/i), { target: { value: "500mg" } });
    fireEvent.click(screen.getByRole("button", { name: /check these details/i }));
    await flush();
    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it("camera unavailable (jsdom) → explained fallback, and the demo label still completes the flow", async () => {
    render(<CompanionExperience />);
    toGuidance("grant");
    expect(screen.getByText("I couldn’t find a camera.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take photo of label/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /use demo label/i }));
    await flush();
    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
  });

  it("mock upload: a sample photo is POSTed to the real analyze route and shows a possible match", async () => {
    const fetchFn = stubFetch({ body: analysisEnvelope(candidate) });
    render(<CompanionExperience />);
    toGuidance("decline");
    fireEvent.click(screen.getByRole("button", { name: /upload a photo — demo/i }));
    expect(screen.getByText(/not saved by default/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /clear label photo/i }));
    await flush();

    const call = fetchFn.mock.calls.find(([u]) => u === "/api/label/analyze");
    expect(call).toBeDefined();
    const init = call![1] as { method: string; body: FormData };
    expect(init.method).toBe("POST");
    expect(init.body.get("inputMode")).toBe("image");
    expect(init.body.get("image")).toBeInstanceOf(Blob);
    expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    // Only the sample list + analyze route were fetched — plus the once-per-call
    // check for whether the understanding pass is configured. No other network use.
    expect(
      fetchFn.mock.calls.every(
        ([u]) =>
          String(u).startsWith("/samples/") || u === "/api/label/analyze" || u === "/api/companion/understand",
      ),
    ).toBe(true);
  });

  it("mock upload: an unreadable answer blocks instructions", async () => {
    stubFetch({
      body: analysisEnvelope({
        outcome: "unreadable",
        userMessage: "x",
        nextState: "safety",
        reasonCode: "low-confidence",
      }),
    });
    render(<CompanionExperience />);
    toGuidance("decline");
    fireEvent.click(screen.getByRole("button", { name: /upload a photo — demo/i }));
    fireEvent.click(screen.getByRole("button", { name: /blurry label photo/i }));
    await flush();
    expect(screen.getByText("Let’s check this one together.")).toBeInTheDocument();
    expect(screen.getByText("I couldn’t read the label clearly.")).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it.each([
    [
      "AI unavailable (503 envelope)",
      {
        status: 503,
        body: {
          ok: false,
          error: { code: "ai_unavailable", message: "m", safeNextAction: "type_label" },
          requestId: "r",
        },
      },
    ],
    ["network error", "network-error"],
    ["malformed response", { body: { hello: "world" } }],
  ] as const)(
    "mock upload: %s → safe fallback, never an explanation, and the demo label still works",
    async (_n, analyze) => {
      stubFetch(analyze as Parameters<typeof stubFetch>[0]);
      render(<CompanionExperience />);
      toGuidance("decline");
      fireEvent.click(screen.getByRole("button", { name: /upload a photo — demo/i }));
      fireEvent.click(screen.getByRole("button", { name: /clear label photo/i }));
      await flush();
      // A service failure keeps its original wording (only label outcomes are softened).
      expect(screen.getByText("I’m not sure enough to explain this safely.")).toBeInTheDocument();
      expect(screen.getByText(/I couldn’t read that photo/)).toBeInTheDocument();
      expect(screen.queryByText(/Take 1 tablet/)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Try another photo" }));
      fireEvent.click(screen.getByRole("button", { name: /use demo label/i }));
      await flush();
      expect(screen.getByText("Is this the medicine you are holding?")).toBeInTheDocument();
    },
  );

  it("does not request the camera until the user consents, and requests video only (no microphone)", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }));
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    expect(screen.getByText("I need to see the writing clearly.")).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled(); // explained first, nothing activated

    fireEvent.click(screen.getByRole("button", { name: /yes, switch camera/i }));
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    expect(screen.getByRole("button", { name: /take photo of label/i })).toBeEnabled();
    expect(stop).not.toHaveBeenCalled();

    // Leaving the screen (here: using the demo label) stops the camera.
    fireEvent.click(screen.getByRole("button", { name: /use demo label/i }));
    expect(stop).toHaveBeenCalled();
  });

  it("camera permission denied by the browser → explained fallback, no dead end", async () => {
    const getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    });
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    render(<CompanionExperience />);
    toGuidance("grant");
    await flush();
    expect(screen.getByText("The camera is off.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use demo label/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload a photo — demo/i })).toBeInTheDocument();
  });

  it("End call returns to the quiet landing state", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    fireEvent.click(screen.getByRole("button", { name: /end call/i }));
    expect(screen.getByRole("button", { name: /call with companion/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /end call/i })).toBeNull();
  });

  it("urgent wording shows the urgent message with no normal continuation", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("I have chest pain");
    expect(screen.getByRole("alert")).toHaveTextContent("This may need urgent help.");
    expect(screen.queryByRole("button", { name: /back to the conversation/i })).toBeNull();
  });
});

describe("lines outside the understanding pass", () => {
  it("are the exact approved copy, shown at once, with no model call", () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, data: { enabled: true }, requestId: "r" }) }));
    vi.stubGlobal("fetch", fetchFn);
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("tell me my medicine schedule"); // → scheduleNeedsRecord, not an understanding key

    expect(
      screen.getByText(/To talk about your schedule, I first need to check a medicine against your record/),
    ).toBeInTheDocument();
    expect(fetchFn.mock.calls.every((call) => (call as unknown[])[1] === undefined || ((call as unknown[])[1] as RequestInit).method === "GET")).toBe(true);
  });
});

describe("understanding pass — Claude answers what the person meant", () => {
  function stubUnderstanding(post: unknown | "hang", enabled = true) {
    const fn = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (String(url) === "/api/companion/understand" && init?.method === "GET") {
        return { ok: true, json: async () => ({ ok: true, data: { enabled }, requestId: "req_cap" }) };
      }
      if (String(url) === "/api/companion/understand") {
        if (post === "hang") return new Promise(() => undefined);
        return { ok: true, json: async () => post };
      }
      throw new Error(`unexpected fetch in this test: ${url}`);
    });
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  const settle = (ms = 1000) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  const nameCheck =
    "I think you said Metformin, the medicine on your record — did I hear that right? You can also type it below, or show me the label.";

  it("a misheard name gets Claude's own check-back, with the doors it chose", async () => {
    const fetchFn = stubUnderstanding({
      ok: true,
      data: { text: nameCheck, contextualActions: ["show-medicine"], checkingMedicineName: true, source: "claude" },
      requestId: "req_u",
    });
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    await settle(); // capability check
    send("I do have met for pain with me");
    expect(screen.getByText(/let me think about that/i)).toBeInTheDocument();
    await settle();

    expect(screen.getByText(nameCheck)).toBeInTheDocument();
    expect(screen.queryByText(/let me think about that/i)).toBeNull();
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ask about my schedule/i })).toBeNull();

    // It was sent the person's words and the router's reading — never record instructions.
    const post = fetchFn.mock.calls.find(([u, i]) => u === "/api/companion/understand" && i?.method === "POST");
    const body = JSON.parse(post![1]!.body!);
    expect(body).toMatchObject({ message: "I do have met for pain with me", key: "medicineNameCheck" });
    expect(JSON.stringify(body)).not.toMatch(/twice daily|with meals/i);
  });

  it("falls back to the approved reply if Claude doesn't answer in time", async () => {
    stubUnderstanding("hang");
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    await settle();
    send("I do have met for pain with me");
    await settle(4500);
    expect(screen.getByText(/I want to make sure I heard you right/)).toBeInTheDocument();
  });

  it("is skipped entirely when the server says it isn't configured — replies stay instant", async () => {
    const fetchFn = stubUnderstanding({ never: "used" }, false);
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    await settle();
    send("What is this for?");
    expect(screen.getByText(/Let’s check this together/)).toBeInTheDocument();
    expect(fetchFn.mock.calls.some(([u, i]) => u === "/api/companion/understand" && i?.method === "POST")).toBe(false);
  });

  it("a safety message never waits on — or reaches — the understanding pass", async () => {
    const fetchFn = stubUnderstanding({ never: "used" });
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    await settle();
    send("I have chest pain");
    expect(screen.getByRole("alert")).toHaveTextContent("This may need urgent help.");
    expect(fetchFn.mock.calls.some(([u, i]) => u === "/api/companion/understand" && i?.method === "POST")).toBe(false);
  });
});
