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
    sourceLabel: "BrightCare Pharmacy",
    matchStatus: "possible",
  },
};

// jsdom has no image decoding or canvas: the browser-side shrink is stubbed (it has
// its own unit test). A HEIC "photo" stands for one the browser can't open.
const preparePhoto = vi.hoisted(() => vi.fn(async (f: Blob) => (f.type === "image/heic" ? null : f)));
vi.mock("@/lib/label/prepare-photo", () => ({ preparePhoto }));

const photoInput = () => document.querySelector<HTMLInputElement>("[data-photo-input]")!;
/** What the system photo picker hands back after the person chooses a photo. */
function pickPhoto(type = "image/jpeg") {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], "label.jpg", { type });
  fireEvent.change(photoInput(), { target: { files: [file] } });
}

/** fetch stub: /api/label/analyze answers with the given body/status. */
function stubFetch(analyze: { status?: number; body: unknown } | "network-error") {
  const fn = vi.fn(async (url: string, init?: unknown) => {
    void url;
    void init;
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
  fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
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
    expect(screen.getByText("Plan checked by BrightCare Pharmacy · 21 September 2026")).toBeInTheDocument();
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

  it("when the person is unsure what to do, the companion explains what it can help with", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("i dont know what to do");
    expect(screen.getByText(/I can check a medicine label with you, then explain what your pharmacy record says/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask about my schedule/i })).toBeInTheDocument();
  });

  it("shows both temporary actions for a broad schedule question", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("When do I take my medicine?");
    expect(screen.getByRole("button", { name: /show medicine/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask about my schedule/i })).toBeInTheDocument();
  });

  it("runs the full happy path: camera or photo → consent → label → possible match → confirm → explanation → Chinese", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));

    // Camera or photo first, as equal choices; nothing medical is reachable yet.
    expect(screen.getByText("How would you like to show me your medicine?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use camera" })).toHaveAttribute("data-variant", "primary");
    expect(screen.getByRole("button", { name: "Choose a photo" })).toHaveAttribute("data-variant", "primary");
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    // Permission is explained before the camera is ever touched.
    fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
    expect(screen.getByText("I need to see the writing clearly.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /yes, switch camera/i }));

    fireEvent.click(screen.getByRole("button", { name: /type the label details/i }));
    fireEvent.change(screen.getByLabelText(/medicine name/i), { target: { value: "Metformin" } });
    fireEvent.change(screen.getByLabelText(/strength/i), { target: { value: "500 mg" } });
    fireEvent.click(screen.getByRole("button", { name: /check these details/i }));
    expect(screen.getByText("Thank you, let me have a look.")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Possible match only — no instruction visible.
    expect(screen.getByText("I found a possible match: Metformin, 500 mg. Is this the one you’re holding?")).toBeInTheDocument();
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
    expect(screen.getByText("BrightCare Pharmacy · checked 21 September 2026")).toBeInTheDocument();
    const check = screen.getByRole("group", { name: "Does this match what’s printed on your label?" });
    expect(within(check).getByRole("button", { name: "Yes, it matches" })).toBeInTheDocument();
    // Neither answer looks like the default: no filled "yes" to agree with without looking.
    expect(primaryButtons(check)).toHaveLength(0);
    // The pinned step scrolls on its own rather than being clipped or pushing the call controls away.
    expect(document.querySelector("[data-pinned]")).toHaveClass("overflow-y-auto", "max-h-[60%]");

    fireEvent.click(within(check).getByRole("button", { name: "It looks different" }));
    expect(screen.getByText(/When the label and the record don’t agree, a pharmacist is the best person to look/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask a pharmacist to call me" })).toBeInTheDocument();
    // "Incorrect output" leads to a person — not another photo.
    expect(screen.queryByRole("button", { name: "Try another photo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to the conversation" })).toBeInTheDocument();
    // Escalated: the instruction already shown is tucked away, not left on screen.
    expect(screen.queryByText("Take 1 tablet twice daily with meals.")).toBeNull();
    expect(screen.getAllByText("Your record is tucked away while we get you some help.").length).toBeGreaterThan(0);
  });

  it("low mood: a warm reply, and family help asks for consent before anything happens", async () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("I feel so lonely");
    expect(screen.getByText(/that sounds hard/)).toBeInTheDocument();
    // Family help and carrying on get equal weight, each with its own icon (not a calendar).
    const choices = screen.getByRole("group", { name: "Companion says:" });
    expect(primaryButtons(choices)).toHaveLength(0);
    expect(choices.querySelector(".lucide-users-round")).not.toBeNull();
    expect(choices.querySelector(".lucide-arrow-right")).not.toBeNull();
    expect(choices.querySelector(".lucide-calendar-clock")).toBeNull();
    const fetchFn = vi.fn(async (url: string) =>
      String(url) === "/api/help/request"
        ? { ok: true, json: async () => ({ ok: true, data: { kind: "family", contactName: "Daniel" }, requestId: "r" }) }
        : { ok: true, json: async () => ({ ok: true, data: { enabled: false }, requestId: "r" }) },
    );
    vi.stubGlobal("fetch", fetchFn);
    fireEvent.click(screen.getByRole("button", { name: "Let my family know" }));

    const consent = screen.getByRole("group", { name: /Shall I let your family know/ });
    expect(primaryButtons(consent)).toHaveLength(0); // consent never nudges towards "yes"
    expect(fetchFn.mock.calls.some(([u]) => u === "/api/help/request")).toBe(false); // nothing sent yet
    fireEvent.click(within(consent).getByRole("button", { name: "Yes, let them know" }));
    await flush();
    // "Sent" only after the (simulated) service said so, naming who was told.
    expect(fetchFn.mock.calls.some(([u]) => u === "/api/help/request")).toBe(true);
    expect(screen.getByText(/I’ve let Daniel know you’d like some help/)).toBeInTheDocument();
    expect(sessionStore.getSnapshot().audit.some((e) => e.eventType === "caregiver-help-requested")).toBe(true);
  });

  it("self-harm wording shows the urgent screen with crisis line numbers as text, not a claimed call", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("I want to die");
    expect(screen.getByRole("alert")).toHaveTextContent("This may need urgent help.");
    expect(screen.getByRole("alert")).toHaveClass("bg-danger-100"); // urgent is the one red card
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

    // A label that doesn't match gets the gentler, no-fault wording — not an alarm —
    // on a calm surface: only urgent risk is ever red.
    expect(screen.getByText("Let’s check this one together.")).toBeInTheDocument();
    expect(screen.getByText("Let’s check this one together.").closest("section")).not.toHaveClass("bg-danger-100");
    expect(screen.queryByText("I’m not sure enough to explain this safely.")).toBeNull();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    expect(screen.getByRole("button", { name: "Ask a pharmacist to call me" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask my trusted helper" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try another photo" })).toBeInTheDocument();
    // Only two filled/outlined buttons in view; the other help options are one tap away.
    expect(screen.getByRole("button", { name: "Ask my trusted helper" }).closest("details")).not.toBeNull();
    const pinned = document.querySelector("[data-pinned]")!;
    const inView = [...pinned.querySelectorAll('[data-variant="primary"], [data-variant="secondary"]')].filter(
      (b) => !b.closest("details"),
    );
    expect(inView).toHaveLength(2);

    // A callback confirms first; when the service is down it says so plainly and never claims "sent".
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ ok: false, error: { code: "service_unavailable", message: "x", safeNextAction: "retry" }, requestId: "r" }) })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask a pharmacist to call me" }));
    expect(screen.getByText(/Shall I send the request\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, send the request" }));
    await flush();
    expect(screen.getByText(/I couldn’t send that just now/)).toBeInTheDocument();
    expect(screen.queryByText(/I’ve sent your request/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See the pharmacy’s number" }));
    expect(screen.getByText(/You can call BrightCare Pharmacy on 6555 0123/)).toBeInTheDocument();
  });

  it("choose from my medicines: lists name and strength only, then still asks to confirm", () => {
    render(<CompanionExperience />);
    toGuidance("decline");
    fireEvent.click(screen.getByRole("button", { name: "Choose from my medicines" }));
    const list = screen.getByRole("region", { name: "Which medicine are you holding?" });
    expect(list.textContent).not.toMatch(/Take 1 tablet|twice daily|blood sugar/);
    fireEvent.click(within(list).getByRole("button", { name: "Metformin 500 mg" }));
    expect(screen.getByText("I found a possible match: Metformin, 500 mg. Is this the one you’re holding?")).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
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
    expect(screen.getByText("I found a possible match: Metformin, 500 mg. Is this the one you’re holding?")).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it("camera unavailable (jsdom) → explained fallback, and the demo label still completes the flow", async () => {
    render(<CompanionExperience />);
    toGuidance("grant");
    expect(screen.getByText("I couldn’t find a camera.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take photo of label/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose from my medicines" }));
    fireEvent.click(screen.getByRole("button", { name: "Metformin 500 mg" }));
    await flush();
    expect(screen.getByText("I found a possible match: Metformin, 500 mg. Is this the one you’re holding?")).toBeInTheDocument();
  });

  it("choose a photo: a plain file input (no capture), shrunk first, then POSTed and still only a possible match", async () => {
    const fetchFn = stubFetch({ body: analysisEnvelope(candidate) });
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    expect(screen.getByText(/I’ll only look at the medicine name, and the photo won’t be kept/)).toBeInTheDocument();

    const input = photoInput();
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).not.toHaveAttribute("capture"); // phones offer the library and files, not just the camera
    pickPhoto();
    await flush();

    expect(preparePhoto).toHaveBeenCalled(); // downscaled and re-encoded before upload
    const call = fetchFn.mock.calls.find(([u]) => u === "/api/label/analyze");
    const init = call![1] as { method: string; body: FormData };
    expect(init.method).toBe("POST");
    expect(init.body.get("image")).toBeInstanceOf(Blob);
    expect(screen.getByText("I found a possible match: Metformin, 500 mg. Is this the one you’re holding?")).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    // Only the analyze route — plus the once-per-call understanding check. No other network use.
    expect(fetchFn.mock.calls.every(([u]) => u === "/api/label/analyze" || u === "/api/companion/understand")).toBe(true);
  });

  it("a photo the browser can't open (e.g. HEIC) asks for another or the camera — nothing is sent", async () => {
    const fetchFn = stubFetch({ body: analysisEnvelope(candidate) });
    render(<CompanionExperience />);
    toGuidance("decline");
    pickPhoto("image/heic");
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("I couldn’t open that photo. Would you like to try another one");
    expect(fetchFn.mock.calls.some(([u]) => u === "/api/label/analyze")).toBe(false);
  });

  it("photo: an unreadable answer blocks instructions", async () => {
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
    pickPhoto();
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
    "photo: %s → safe fallback, never an explanation, and choosing from the record still works",
    async (_n, analyze) => {
      stubFetch(analyze as Parameters<typeof stubFetch>[0]);
      render(<CompanionExperience />);
      toGuidance("decline");
      pickPhoto();
      await flush();
      // A service failure keeps its original wording (only label outcomes are softened).
      expect(screen.getByText("I’m not sure enough to explain this safely.")).toBeInTheDocument();
      expect(screen.getByText(/I couldn’t read that photo/)).toBeInTheDocument();
      expect(screen.queryByText(/Take 1 tablet/)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Try another photo" }));
      fireEvent.click(screen.getByRole("button", { name: "Choose from my medicines" }));
    fireEvent.click(screen.getByRole("button", { name: "Metformin 500 mg" }));
      await flush();
      expect(screen.getByText("I found a possible match: Metformin, 500 mg. Is this the one you’re holding?")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Choose from my medicines" }));
    fireEvent.click(screen.getByRole("button", { name: "Metformin 500 mg" }));
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
    expect(screen.getByRole("button", { name: "Choose a photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose from my medicines" })).toBeInTheDocument();
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
