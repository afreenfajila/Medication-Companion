import { recordMedicines } from "@/lib/content/seed-record";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionStore, dispatch } from "@/lib/session/session-store";
import { run, toExplain } from "@/test/helpers";
import { t } from "@/lib/content/translations";
import { CompanionExperience } from "./companion-experience";


/** The confirmation is said and shown in the conversation (no panel): a possible match, from the fictional record. */
const POSSIBLE_MATCH = /^I found a possible match on your BrightCare Pharmacy record \(fictional\): Metformin, 500 mg, tablet\./;

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
  fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: text } });
  fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
};

/**
 * Start a call, ask to show the label (in words: there is no Show medicine button) and answer the
 * consent question. "grant": Take photo / Upload are offered; "camera": then Take photo is tapped
 * (no camera in jsdom → fallback); "decline": no photo, just the name.
 */
function toGuidance(consent: "grant" | "camera" | "decline" = "grant") {
  fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
  send("What is this for?");
  send("yes"); // "Would you like to show me the medicine label?"
  act(() => dispatch({ type: "CAMERA_CONSENT", granted: consent !== "decline" })); // "yes" / "no", in words
  if (consent === "camera") fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
}
/** The call's own controls, by accessible name. */
const CALL_CONTROLS = ["Send message", "Mute microphone", "End call"];

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
  it("reveals the call controls once the call starts; showing the medicine is asked in words, never a button", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));

    const footer = screen.getByRole("navigation", { name: "Medication Companion" });
    expect(within(footer).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(CALL_CONTROLS);
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument(); // in the header

    send("What is this for?");
    expect(screen.getByText(/Let’s check this together/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show medicine|show label|ask about my schedule/i })).toBeNull();
  });

  it("'I take it twice a day' asks which medicine — it never assumes", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("I take it twice a day");
    expect(screen.getByText(/Which medicine do you mean\?/)).toBeInTheDocument();
    expect(document.querySelector("main")!.textContent).not.toMatch(/Metformin/);
    expect(screen.queryByRole("button", { name: /show medicine/i })).toBeNull(); // asked in words
  });

  it("when the person is unsure what to do, the companion explains what it can help with", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("i dont know what to do");
    expect(screen.getByText(/I can check a medicine label with you, then explain what your pharmacy record says/)).toBeInTheDocument();
    // No suggestion buttons: both are asked in words.
    expect(screen.queryByRole("button", { name: /show medicine|ask about my schedule/i })).toBeNull();
  });

  it("a broad schedule question: both next steps are understood in words, with no buttons", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("When do I take my medicine?");
    expect(screen.queryByRole("button", { name: /show medicine|ask about my schedule/i })).toBeNull();
    expect(sessionStore.getSnapshot().contextualActions).toContain("show-medicine");
    expect(sessionStore.getSnapshot().contextualActions).toContain("ask-schedule"); // still understood when said
  });

  it("runs the full happy path: consent → label → possible match → confirm → explanation → Chinese", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("What is this for?");
    send("yes"); // show the label

    // One consent question, in the conversation (camera or photo, nothing kept); no buttons yet.
    expect(screen.getByText(t("en", "cameraPermissionHeading")).closest("[data-transcript]")).not.toBeNull();
    expect(screen.getByText(/I’ll only look at the medicine name, and the photo won’t be kept/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take photo|upload/i })).toBeNull();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    send("yes");
    expect(sessionStore.getSnapshot().state).toBe("camera-guidance");
    expect(screen.getByRole("button", { name: "Take photo" })).toBeInTheDocument(); // inside the companion's message

    send("It's Metformin, 500 mg"); // said or typed, no form
    expect(screen.getByText("Thank you, let me have a look.")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Possible match only — no instruction visible.
    expect(screen.getByText(POSSIBLE_MATCH)).toBeInTheDocument(); // name, strength, form and fictional source, in words
    expect(screen.queryByRole("button", { name: /yes, this is the medicine|no, try again|i’m not sure/i })).toBeNull(); // no panel
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    expect(screen.queryByText(/blood sugar/)).toBeNull();

    send("yes, this is my medicine"); // confirmed in words: there is no confirmation panel
    expect(screen.getByText("Here is what your record says.")).toBeInTheDocument();
    expect(screen.getByText("Metformin helps manage blood sugar.")).toBeInTheDocument();

    // "Next" is said or typed, not a button.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "next" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(screen.getByText("Take 1 tablet twice daily with meals.")).toBeInTheDocument();

    // Language is changed in words too ("中文"), not a button.
    send("中文");
    expect(screen.getByText("随餐每日服用一片，每日两次。")).toBeInTheDocument();
    // Language change did not reset the confirmation: still on the record, now in Chinese.
    expect(screen.getByLabelText("输入消息")).toBeInTheDocument();
  });

  it("beside the instruction: says the dated source and asks to compare with the label, in words; 'it looks different' reaches safety", () => {
    sessionStore.setForTest(run([{ type: "EXPLAIN_STEP", direction: "next" }], toExplain()));
    render(<CompanionExperience />);
    expect(screen.getByText("Take 1 tablet twice daily with meals.")).toBeInTheDocument();
    expect(screen.getByText("BrightCare Pharmacy · checked 21 September 2026.")).toBeInTheDocument();
    expect(screen.getByText("Does this match what’s printed on your label?")).toBeInTheDocument();
    // Answered in words: no buttons to agree with without looking, and no panel.
    expect(screen.queryByRole("button", { name: /yes, it matches|it looks different/i })).toBeNull();
    expect(document.querySelector("[data-pinned]")).toBeNull();

    send("it looks different");
    expect(screen.getByText(/When the label and the record don’t agree, a pharmacist is the best person to look/)).toBeInTheDocument();
    // "Incorrect output" leads to a person — not another photo — asked in the conversation, with a way back.
    expect(screen.getByText("Would you like a pharmacist to call you, or shall I let your family know? Or we can just carry on talking.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pharmacist|try another photo|back to the conversation/i })).toBeNull();
    // Escalated: the instruction already shown is tucked away, not left on screen.
    expect(screen.queryByText("Take 1 tablet twice daily with meals.")).toBeNull();
    expect(screen.getAllByText("Your record is tucked away while we get you some help.").length).toBeGreaterThan(0);
  });

  it("low mood: a warm reply, and family help asks for consent before anything happens", async () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("I feel so lonely");
    expect(screen.getByText(/that sounds hard/)).toBeInTheDocument();
    // Asked in words: no "Let my family know" button, no panel.
    expect(document.querySelector("[data-pinned]")).toBeNull();
    expect(screen.queryByRole("button", { name: /let my family know/i })).toBeNull();
    const fetchFn = vi.fn(async (url: string) =>
      String(url) === "/api/help/request"
        ? { ok: true, json: async () => ({ ok: true, data: { kind: "family", contactName: "Daniel" }, requestId: "r" }) }
        : { ok: true, json: async () => ({ ok: true, data: { enabled: false }, requestId: "r" }) },
    );
    vi.stubGlobal("fetch", fetchFn);
    send("please let my family know");

    // The consent question is a line in the conversation, with no buttons to nudge towards "yes".
    expect(screen.getByText(/Shall I let your family know/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /yes, let them know|not now/i })).toBeNull();
    expect(fetchFn.mock.calls.some(([u]) => u === "/api/help/request")).toBe(false); // nothing sent yet
    send("yes, let them know");
    await flush();
    // Reviewed before it goes: who it's to and what it says, then an explicit "send".
    expect(fetchFn.mock.calls.some(([u]) => u === "/api/help/request")).toBe(false);
    expect(screen.getByText("Daniel, your family (fictional)")).toBeInTheDocument();
    expect(screen.getByText("I’d like some help, please.")).toBeInTheDocument();
    send("send");
    await flush();
    // "Sent" only after the (simulated) service said so, naming who was told.
    expect(fetchFn.mock.calls.some(([u]) => u === "/api/help/request")).toBe(true);
    expect(screen.getByText(/a message to Daniel saying you’d like some help was simulated/)).toBeInTheDocument();
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
    send("It's Metformin, 850 mg");
    await flush();

    // A label that doesn't match gets the gentler, no-fault wording — not an alarm —
    // on a calm surface: only urgent risk is ever red.
    expect(screen.getByText("Let’s check this one together.")).toBeInTheDocument();
    expect(screen.getByText("Let’s check this one together.").closest("[data-speaker]")).not.toHaveClass("bg-danger-100");
    expect(screen.queryByText("I’m not sure enough to explain this safely.")).toBeNull();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    // Every way on, asked in the conversation: another photo, a pharmacist, or family. No clinic, no
    // trusted helper, no panel, no buttons.
    expect(screen.getByText("Would you like to try another photo, have a pharmacist call you, or let your family know? Or we can just carry on talking.")).toBeInTheDocument();
    expect(screen.getByText("I won’t show any medicine instructions until we’re sure.")).toBeInTheDocument();
    expect(screen.queryByText(/trusted helper|clinic/i)).toBeNull();
    expect(document.querySelector("[data-pinned]")).toBeNull();
    expect(screen.queryByRole("button", { name: /pharmacist|family|another photo/i })).toBeNull();

    // A callback confirms first; when the service is down it says so plainly and never claims "sent".
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ ok: false, error: { code: "service_unavailable", message: "x", safeNextAction: "retry" }, requestId: "r" }) })),
    );
    send("a pharmacist please");
    expect(screen.getByText(/Shall I send the request\?/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /yes, send the request/i })).toBeNull(); // answered in words
    send("yes, please send it");
    await flush();
    // "Check before sending": what goes, inside the companion's message; then an explicit "send" sends it.
    expect(screen.getByText(/^Here’s the request I’d send to BrightCare Pharmacy\./)).toBeInTheDocument();
    expect(screen.getByText("Please call me back")).toBeInTheDocument();
    expect(document.querySelector("[data-transcript] button")).toBeNull();
    expect(screen.queryByText(/I couldn’t send that just now/)).toBeNull(); // the "yes" sent nothing
    send("send it");
    await flush();
    expect(screen.getByText(/I couldn’t send that just now/)).toBeInTheDocument();
    expect(screen.queryByText(/I’ve sent your request/)).toBeNull();
    send("can I have their phone number");
    expect(screen.getByText(/You can call BrightCare Pharmacy on 0000 0123/)).toBeInTheDocument();
  });

  it("a no to the camera: the words are in the chat, no buttons, and saying the name still asks to confirm", async () => {
    render(<CompanionExperience />);
    toGuidance("decline");
    expect(screen.getByText("You can still continue.").closest("[data-transcript]")).not.toBeNull();
    expect(screen.getByText("For example: “It’s Metformin, 500 milligrams.”")).toBeInTheDocument();
    expect(document.querySelector("[data-pinned]")).toBeNull();
    expect(screen.queryByRole("button", { name: /take photo|upload/i })).toBeNull();
    send("it's metformin 500 milligrams");
    await flush();
    expect(screen.getByText(POSSIBLE_MATCH)).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it("a name with no strength is asked for the strength; then it reaches a possible match", async () => {
    render(<CompanionExperience />);
    toGuidance("decline");
    send("it's metformin");
    expect(screen.getByText(/What strength does the label say/)).toBeInTheDocument();
    send("500mg");
    await flush();
    expect(screen.getByText(POSSIBLE_MATCH)).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
  });

  it("camera unavailable (jsdom) → explained fallback, and the demo label still completes the flow", async () => {
    render(<CompanionExperience />);
    toGuidance("camera");
    expect(screen.getByText("I couldn’t find a camera.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take photo/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument(); // still offered, in the message
    act(() => dispatch({ type: "CHOOSE_MEDICINE", medicineId: recordMedicines[0].id }));
    await flush();
    expect(screen.getByText(POSSIBLE_MATCH)).toBeInTheDocument();
  });

  it("Upload: a plain file input (no capture), shrunk first, then POSTed and still only a possible match", async () => {
    const fetchFn = stubFetch({ body: analysisEnvelope(candidate) });
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("What is this for?");
    send("yes");
    expect(screen.getByText(/I’ll only look at the medicine name, and the photo won’t be kept/)).toBeInTheDocument();
    expect(document.querySelector("[data-photo-input]")).toBeNull(); // no button until the yes
    send("yes, a photo is fine");
    expect(screen.getAllByRole("button", { name: "Upload" })).toHaveLength(1);

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
    expect(screen.getByText(POSSIBLE_MATCH)).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    // Only the analyze route — plus the once-per-call understanding check. No other network use.
    expect(fetchFn.mock.calls.every(([u]) => u === "/api/label/analyze" || u === "/api/companion/understand")).toBe(true);
  });

  it("a photo the browser can't open (e.g. HEIC) asks for another or the camera — nothing is sent", async () => {
    const fetchFn = stubFetch({ body: analysisEnvelope(candidate) });
    render(<CompanionExperience />);
    toGuidance("grant");
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
    toGuidance("grant");
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
      toGuidance("grant");
      pickPhoto();
      await flush();
      // A service failure keeps its original wording (only label outcomes are softened).
      expect(screen.getByText("I’m not sure enough to explain this safely.")).toBeInTheDocument();
      expect(screen.getByText(/I couldn’t read that photo/)).toBeInTheDocument();
      expect(screen.queryByText(/Take 1 tablet/)).toBeNull();

      send("try another photo");
    act(() => dispatch({ type: "CHOOSE_MEDICINE", medicineId: recordMedicines[0].id }));
      await flush();
      expect(screen.getByText(POSSIBLE_MATCH)).toBeInTheDocument();
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
    send("yes");
    expect(screen.getByText(t("en", "cameraPermissionHeading"))).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled(); // explained first, nothing activated

    act(() => dispatch({ type: "CAMERA_CONSENT", granted: true }));
    await flush();
    expect(getUserMedia).not.toHaveBeenCalled(); // a yes only offers Take photo / Upload
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    expect(screen.getByRole("button", { name: /take photo of label/i })).toBeEnabled();
    expect(stop).not.toHaveBeenCalled();

    // Leaving the screen (here: using the demo label) stops the camera.
    act(() => dispatch({ type: "CHOOSE_MEDICINE", medicineId: recordMedicines[0].id }));
    expect(stop).toHaveBeenCalled();
  });

  it("camera permission denied by the browser → explained fallback, no dead end", async () => {
    const getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    });
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    render(<CompanionExperience />);
    toGuidance("camera");
    await flush();
    expect(screen.getByText("The camera is off.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose from my medicines" })).toBeNull();
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
    // The doors it chose are understood in words; none is a button.
    expect(sessionStore.getSnapshot().contextualActions).toEqual(["show-medicine"]);
    expect(screen.queryByRole("button", { name: /show medicine|ask about my schedule/i })).toBeNull();

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
