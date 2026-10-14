import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { DoseCheckReviewer } from "@/components/companion/dose-check-reviewer";
import { setDoseCallbackServiceForTest, SimulatedDoseCallbackService } from "@/lib/services/dose-callback";
import { dispatch, sessionStore } from "@/lib/session/session-store";
import type { Session } from "@/lib/session/state-machine";
import { chooseShowMedicine, grantCamera, resolve, run, startCall, submitDemo } from "./helpers";

const OPENING =
  "My doctor changed my medicine, but this box still says the old amount. How many should I take now?";
const OLD_LABEL = "Take 2 tablets twice daily with meals";
const SAY_SEND = "Please check these details. You can tell me what to change, say “send the request,” or say “cancel.”";
const DEMO = "Demo only — no real pharmacy is contacted.";
/** Exactly the fields that leave the call (`buildCallbackPayload`). */
const PAYLOAD_KEYS = ["callbackContact", "concernSummary", "confirmedLabel", "currentRecord", "medicine", "patientId", "reason", "recipientId", "requestId", "simulated"];

function conflictSession(scenario: Session["doseScenario"] = "conflict-sent"): Session {
  const s = run([
    { type: "SET_DOSE_SCENARIO", scenario },
    startCall,
    { type: "USER_MESSAGE", text: OPENING, via: "typed" },
    chooseShowMedicine,
    grantCamera,
    submitDemo(),
    resolve,
  ]);
  return run([{ type: "CONFIRM_MATCH", candidateId: s.candidate!.candidateId, decision: "confirmed" }], s);
}

let service: SimulatedDoseCallbackService;
beforeEach(() => {
  sessionStore.reset();
  service = new SimulatedDoseCallbackService(0);
  setDoseCallbackServiceForTest(service);
  // No AI, no realtime voice: the deterministic call only.
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Every step is answered in words, typed exactly as it could be said: there are no buttons. */
const typeIn = (text: string) => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
};
/** The latest companion message in the one conversation. */
const lastCompanion = () => within([...document.querySelectorAll<HTMLElement>('[data-speaker="companion"]')].at(-1)!);
/** The latest structured message (comparison, summary, outcome): headings and lines, no buttons. */
const lastSections = () => within([...document.querySelectorAll<HTMLElement>("[data-sections]")].at(-1)!);
const noButtons = () => expect(document.querySelector("[data-transcript] button")).toBeNull();

/** Confirm the reading, ask for a pharmacist, accept the offer: the summary to check is in the chat. */
function toReview() {
  sessionStore.setForTest(conflictSession());
  render(<CompanionExperience />);
  // The camera reading is unconfirmed until the person says so — asked in the conversation.
  expect(lastCompanion().getByText(/On your box, I think I read: “Take 2 tablets twice daily with meals” Is that what it says\?/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /yes, that is what the label says/i })).toBeNull();
  typeIn("yes");
  expect(lastCompanion().getByText(/^These instructions differ\./)).toBeInTheDocument();
  const compared = lastSections();
  expect(compared.getByText("Current record").nextElementSibling).toHaveTextContent(/^“Take 1 tablet twice daily with meals\.?”$/);
  expect(compared.getByText("BrightCare Pharmacy (fictional) · 21 September 2026")).toBeInTheDocument();
  expect(compared.getByText("Label you confirmed").nextElementSibling).toHaveTextContent(OLD_LABEL);
  expect(compared.getByText("Your label photo (simulated reading)")).toBeInTheDocument();
  expect(compared.getByText("Different")).toBeInTheDocument();
  noButtons();
  typeIn("ask a pharmacist");
  expect(lastCompanion().getByText(/^I can put together a short summary for a pharmacist/)).toBeInTheDocument();
  typeIn("yes please");
  expect(lastCompanion().getByText("I’ve prepared a short summary for the pharmacist.")).toBeInTheDocument();
}

describe("dose-change journey in the call (UI)", () => {
  it("the payload sent is exactly what the review message showed", async () => {
    toReview();
    const review = lastSections();
    expect(review.getByText(DEMO)).toBeInTheDocument();
    // The rows, in order, with the labels the summary uses.
    const headings = [...document.querySelectorAll("[data-sections]")].at(-1)!.querySelectorAll("p.uppercase");
    expect([...headings].map((h) => h.textContent)).toEqual([
      "To",
      "Reason for callback",
      "Medicine",
      "Pharmacy record",
      "Label wording you confirmed",
      "Callback number",
    ]);
    expect(review.getByText("To").nextElementSibling).toHaveTextContent("BrightCare Pharmacy — fictional demo");
    expect(review.getByText("Medicine").nextElementSibling).toHaveTextContent("Metformin 500 mg");
    // The record's exact words, with its source and date beside them.
    expect(review.getByText("Pharmacy record").nextElementSibling).toHaveTextContent(/^“Take 1 tablet twice daily with meals\.?”$/);
    expect(review.getByText("Pharmacy record").parentElement).toHaveTextContent("BrightCare Pharmacy (fictional) · 21 September 2026");
    expect(review.getByText("Label wording you confirmed").nextElementSibling).toHaveTextContent(`“${OLD_LABEL}”`);
    expect(review.getByText("•••• 0188")).toBeInTheDocument(); // masked; said in full on request
    expect(review.queryByText("0000 0188")).toBeNull();
    noButtons();

    // No Send button (the typed input's own submit is not one): the review says how to send.
    expect(screen.queryByRole("button", { name: /send callback request|send request|send again/i })).toBeNull();
    expect(review.getByText(SAY_SEND)).toBeInTheDocument();
    expect(service.received).toHaveLength(0);
    await act(async () => typeIn("send"));
    expect(service.received).toHaveLength(1);
    const p = service.received[0];
    const shown = document.body.textContent ?? "";
    for (const value of [
      p.concernSummary,
      `${p.medicine.displayName} ${p.medicine.strengthText}`,
      p.currentRecord!.instructionText,
      p.currentRecord!.sourceName,
      p.confirmedLabel!.instructionText,
    ]) {
      expect(shown).toContain(value);
    }
    expect(p.confirmedLabel).toEqual({ instructionText: OLD_LABEL, labelRevision: 1 });
    expect(p.simulated).toBe(true);
    // Nothing beyond the allowlist leaves the call: no image, audio, transcript or session.
    expect(Object.keys(p).sort()).toEqual(PAYLOAD_KEYS);
    expect(JSON.stringify(p)).not.toMatch(/data:image|blob:|transcript|turns/i);
    // What isn't a visible row is named by the disclosure: the patient ID and the reference numbers.
    expect(p.callbackContact.replace(/\D/g, "").slice(-4)).toBe("0188");
    expect(review.getByText(/with your patient ID and reference numbers for the record and this request/)).toBeInTheDocument();
    expect(review.getByText(/Your label photo and full conversation are not included\./)).toBeInTheDocument();

    const outcome = lastCompanion();
    expect(outcome.getByText(/^Demo: callback request submitted\./)).toBeInTheDocument();
    expect(outcome.getByText(/The difference in your medication instructions still needs checking\./)).toBeInTheDocument();
    expect(outcome.getByText("Submitted — simulated")).toBeInTheDocument();
    expect(outcome.getByText("Unresolved")).toBeInTheDocument();
    // The summary that was sent stays readable above it; nothing is replaced.
    expect(screen.getByText(SAY_SEND)).toBeInTheDocument();
    noButtons();
  });

  it("a new summary opens at its first line ('To'), not its last, and stays there while it is read", () => {
    const calls: Array<{ el: Element; opts: unknown }> = [];
    Element.prototype.scrollIntoView = function (this: Element, opts?: unknown) {
      calls.push({ el: this, opts });
    } as Element["scrollIntoView"];
    try {
      toReview();
      const last = calls.at(-1)!;
      expect(last.opts).toEqual({ block: "start" });
      expect(last.el).toHaveTextContent("I’ve prepared a short summary for the pharmacist.");
      expect(last.el.querySelector("[data-sections]")).not.toBeNull();
      // The whole summary is in the call's one scroller; the controls are outside it, never over it.
      const scroller = document.querySelector("main")!.parentElement!;
      expect(scroller).toContainElement(last.el as HTMLElement);
      expect(scroller.querySelector("nav")).toBeNull();
      expect(scroller.querySelector("form")).toBeNull();
      expect(last.el.querySelector("[data-sections]")!.className).not.toMatch(/overflow|max-h/);
      // A status change (the companion "thinking") does not move it.
      const before = calls.length;
      act(() => dispatch({ type: "REPEAT" }));
      expect(calls.slice(before).filter((c) => (c.opts as { block?: string })?.block === "end")).toHaveLength(0);
    } finally {
      // @ts-expect-error restore jsdom's missing method
      delete Element.prototype.scrollIntoView;
    }
  });

  it("a correction in words updates the summary, clears approval, and needs a fresh 'send the request'", async () => {
    toReview();
    const first = sessionStore.getSnapshot().doseCheck!.callback!;
    // "Change the number, then send": changed, shown again, nothing sent.
    await act(async () => typeIn("change the number to 0000 0199, then send"));
    expect(service.received).toHaveLength(0);
    const now = sessionStore.getSnapshot().doseCheck!.callback!;
    expect(now.revision).toBe(first.revision + 1);
    expect(now.approvedRevision).toBeNull();
    expect(now.status).toBe("reviewing");
    expect(lastCompanion().getByText("I’ve updated the summary. Nothing has been sent.")).toBeInTheDocument();
    expect(lastSections().getByText("•••• 0199")).toBeInTheDocument();
    // The earlier version can't be approved any more.
    act(() => dispatch({ type: "DOSE", action: { kind: "send", revision: first.revision } }));
    expect(sessionStore.getSnapshot().doseCheck!.callback!.status).toBe("reviewing");
    // Without a number, it is asked for; nothing is sent.
    await act(async () => typeIn("change the number, then send"));
    expect(lastCompanion().getByText("Which number would you like the pharmacist to call? Please say or type it.")).toBeInTheDocument();
    expect(service.received).toHaveLength(0);
    // The reason, in her words.
    await act(async () => typeIn("change the reason to please check which amount is current"));
    expect(lastSections().getByText("Reason for callback").nextElementSibling).toHaveTextContent("please check which amount is current");
    // Asking for the number says it in full.
    typeIn("what's the number?");
    expect(lastCompanion().getByText("The callback number in this request is 0000 0199.")).toBeInTheDocument();
    // A fresh, explicit approval sends exactly the current version — once, however often it is said.
    await act(async () => typeIn("send the request"));
    await act(async () => typeIn("send the request"));
    expect(service.received).toHaveLength(1);
    expect(service.received[0].callbackContact).toBe("0000 0199");
    expect(service.received[0].concernSummary).toBe("please check which amount is current");
  });

  it("new label wording in the review is checked back first, then compared again, before anything is sent", async () => {
    toReview();
    await act(async () => typeIn("the label says Take 2 tablets twice daily with food"));
    // Shown back to confirm: a typed correction is never trusted as-is.
    expect(lastCompanion().getByText("You wrote “Take 2 tablets twice daily with food”. Is that exactly what’s printed on your label?")).toBeInTheDocument();
    await act(async () => typeIn("send the request")); // not while the wording is unconfirmed
    expect(service.received).toHaveLength(0);
    expect(sessionStore.getSnapshot().doseCheck!.reading).toBe("Take 2 tablets twice daily with food"); // and not taken as wording
    await act(async () => typeIn("yes"));
    const cb = sessionStore.getSnapshot().doseCheck!.callback!;
    expect(cb.status).toBe("reviewing");
    expect(cb.approvedRevision).toBeNull();
    expect(lastSections().getByText("Label wording you confirmed").nextElementSibling).toHaveTextContent("“Take 2 tablets twice daily with food”");
    await act(async () => typeIn("send the request"));
    expect(service.received[0].confirmedLabel).toEqual({ instructionText: "Take 2 tablets twice daily with food", labelRevision: 2 });
  });

  it("'what happens if I say send?' and 'cancel' send nothing", async () => {
    toReview();
    await act(async () => typeIn("What happens if I say send?"));
    expect(service.received).toHaveLength(0);
    expect(lastCompanion().getByText(/Nothing is sent until you say it/)).toBeInTheDocument();
    await act(async () => typeIn("cancel"));
    expect(service.received).toHaveLength(0);
    expect(sessionStore.getSnapshot().doseCheck!.callback!.status).toBe("cancelled");
  });

  it("'don't send' makes no submission and returns to the comparison", async () => {
    toReview();
    await act(async () => typeIn("don’t send"));
    expect(service.received).toHaveLength(0);
    expect(lastCompanion().getByText(/^No problem — nothing has been shared\./)).toBeInTheDocument();
    expect(lastCompanion().getByText(/These instructions differ/)).toBeInTheDocument();
  });

  it("failure keeps the summary; 'try again' sends the same request", async () => {
    sessionStore.setForTest(conflictSession("conflict-fails"));
    render(<CompanionExperience />);
    typeIn("yes");
    typeIn("pharmacist");
    typeIn("yes please");
    await act(async () => typeIn("send it"));
    const failed = lastCompanion();
    expect(failed.getByText(/^Demo: request not submitted\./)).toBeInTheDocument();
    expect(failed.getByText(/The request could not be delivered\. No one has been notified\. Your summary is still available\./)).toBeInTheDocument();
    expect(failed.getByText("Unresolved")).toBeInTheDocument();
    expect(failed.getByText("View fictional pharmacy contact").nextElementSibling).toHaveTextContent("BrightCare Pharmacy: 0000 0123");
    expect(failed.getByText(/If you’d like me to try again, just say “send the request”\. Or we can leave it for now\.$/)).toBeInTheDocument();
    expect(screen.getByText(SAY_SEND)).toBeInTheDocument(); // the summary stays
    await act(async () => typeIn("try again"));
    expect(service.received.map((p) => p.requestId)).toEqual([service.received[0].requestId, service.received[0].requestId]);
    expect(service.deliveredCount).toBe(1);
    expect(lastCompanion().getByText(/^Demo: callback request submitted\./)).toBeInTheDocument();
  });

  it("an unknown outcome says so, and 'try again' sends the same request once", async () => {
    sessionStore.setForTest(conflictSession("conflict-unknown"));
    render(<CompanionExperience />);
    typeIn("yes");
    typeIn("pharmacist");
    typeIn("yes please");
    await act(async () => typeIn("send it"));
    const unknown = lastCompanion();
    expect(unknown.getByText(/^Demo: submission could not be confirmed\./)).toBeInTheDocument();
    expect(unknown.getByText("Not confirmed — simulated")).toBeInTheDocument();
    expect(unknown.queryByText(/No one has been notified/)).toBeNull();
    await act(async () => typeIn("try again"));
    expect(service.deliveredCount).toBe(1);
    expect(lastCompanion().getByText(/^Demo: callback request submitted\./)).toBeInTheDocument();
  });

  it("correcting a misread label in words updates the comparison in the same call", () => {
    sessionStore.setForTest(conflictSession("misread-label"));
    render(<CompanionExperience />);
    // The misread wording is shown back to check, not trusted; "change the wording" (or "no") asks again.
    expect(lastCompanion().getByText(/I think I read: “Take 7 tablet twice daily with meals” Is that what it says\?/)).toBeInTheDocument();
    typeIn("change the wording");
    expect(lastCompanion().getByText("Sorry, I didn’t get that right. What does the label say? You can read it to me again, or type it.")).toBeInTheDocument();
    typeIn("Take 1 tablet twice daily with meals");
    // The corrected wording is shown back for confirmation, not trusted as typed.
    expect(lastCompanion().getByText("You wrote “Take 1 tablet twice daily with meals”. Is that exactly what’s printed on your label?")).toBeInTheDocument();
    typeIn("yes");
    expect(lastCompanion().getByText(/^Thank you\. The wording you confirmed matches your record/)).toBeInTheDocument();
    expect(lastSections().getByText("As you typed it")).toBeInTheDocument();
    expect(lastSections().queryByText("Different")).toBeNull();
    // A match offers no callback.
    typeIn("pharmacist");
    expect(sessionStore.getSnapshot().doseCheck?.offer).toBe(false);
  });

  it("reading the box the way people do: hesitation is set aside, nothing is added, and only her yes confirms", () => {
    sessionStore.setForTest(conflictSession());
    render(<CompanionExperience />);
    typeIn("no"); // not what the camera read
    expect(lastCompanion().getByText("Sorry, I didn’t get that right. What does the label say? You can read it to me again, or type it.")).toBeInTheDocument();
    typeIn("It says… two? I think two.");
    // Her own word, not "two tablets": no unit she didn't say. Gently, because she sounded unsure.
    expect(lastCompanion().getByText("No rush. You wrote “two”. Is that exactly what’s printed on your label?")).toBeInTheDocument();
    expect(sessionStore.getSnapshot().doseCheck?.labelText).toBeNull(); // not confirmed by being said
    typeIn("Yes.");
    const d = sessionStore.getSnapshot().doseCheck!;
    expect(d.labelText).toBe("two");
    expect(d.step).toBe("compared");
    // What wasn't said stays unclear — never filled in from the record.
    expect(lastSections().getByText("Not clear on both")).toBeInTheDocument();
  });

  it("a correction mid-sentence keeps the corrected words; 'I can't read it' never becomes wording", () => {
    sessionStore.setForTest(conflictSession());
    render(<CompanionExperience />);
    typeIn("no");
    typeIn("two... no, one tablet, twice daily with meals");
    expect(lastCompanion().getByText("You wrote “one tablet, twice daily with meals”. Is that exactly what’s printed on your label?")).toBeInTheDocument();
    typeIn("no");
    typeIn("I can't read it, the print is too small");
    const d = sessionStore.getSnapshot().doseCheck!;
    expect(d.step).toBe("compared");
    expect(d.labelText).toBeNull();
    expect(d.comparison?.outcome).toBe("insufficient");
  });

  describe("with the AI on: the wording is picked out by meaning, but only her own words are ever used", () => {
    const withAi = (answer: unknown) =>
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (url === "/api/companion/understand" && (!init || init.method === "GET")) {
            return new Response(JSON.stringify({ ok: true, data: { enabled: true }, requestId: "r" }));
          }
          if (url === "/api/companion/label-wording") return new Response(JSON.stringify({ ok: true, data: answer, requestId: "r" }));
          return new Response(JSON.stringify({ ok: true, data: { action: null, outcome: "none" }, requestId: "r" }));
        }),
      );
    const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

    it("a rambling reading is said back as the wording she meant", async () => {
      withAi({ outcome: "wording", wording: "one tablet twice a day" });
      sessionStore.setForTest(conflictSession());
      render(<CompanionExperience />);
      await settle();
      typeIn("no");
      typeIn("so the box, hmm, it's one tablet I would say twice a day");
      await settle();
      expect(vi.mocked(fetch).mock.calls.some(([u]) => u === "/api/companion/label-wording")).toBe(true);
      expect(lastCompanion().getByText("You wrote “one tablet twice a day”. Is that exactly what’s printed on your label?")).toBeInTheDocument();
      expect(screen.getByText("so the box, hmm, it's one tablet I would say twice a day")).toBeInTheDocument(); // her own words, as she said them
    });

    it("words she never said are refused: the app's own clean-up is used instead", async () => {
      withAi({ outcome: "wording", wording: "one tablet twice a day with meals" }); // "with meals" was never said
      sessionStore.setForTest(conflictSession());
      render(<CompanionExperience />);
      await settle();
      typeIn("no");
      typeIn("um, one tablet twice a day");
      await settle();
      expect(sessionStore.getSnapshot().doseCheck?.reading).toBe("one tablet twice a day");
    });

    it("plain wording is said back at once, without asking the AI", async () => {
      withAi({ outcome: "wording", wording: "x" });
      sessionStore.setForTest(conflictSession());
      render(<CompanionExperience />);
      await settle();
      typeIn("no");
      typeIn("Take 1 tablet twice daily with meals");
      expect(vi.mocked(fetch).mock.calls.some(([u]) => u === "/api/companion/label-wording")).toBe(false);
      expect(sessionStore.getSnapshot().doseCheck?.reading).toBe("Take 1 tablet twice daily with meals");
    });

    it("no wording at all goes to the meaning-match, never into the label", async () => {
      withAi({ outcome: "no-wording" });
      sessionStore.setForTest(conflictSession());
      render(<CompanionExperience />);
      await settle();
      typeIn("no");
      typeIn("my pills are the little pink ones");
      await settle();
      expect(sessionStore.getSnapshot().doseCheck?.reading).toBeNull();
      expect(vi.mocked(fetch).mock.calls.some(([u]) => u === "/api/companion/intent")).toBe(true);
    });
  });

  it("works in Chinese too", () => {
    sessionStore.setForTest({ ...conflictSession(), language: "zh-Hans" });
    render(<CompanionExperience />);
    typeIn("对");
    expect(lastCompanion().getByText(/^这两个用法不一样。/)).toBeInTheDocument();
    expect(lastSections().getByText("不同之处")).toBeInTheDocument();
    typeIn("药剂师");
    expect(sessionStore.getSnapshot().doseCheck?.offer).toBe(true);
  });

  it("after submission: 'back to the call' carries on (still unresolved); 'that's all' ends the call", async () => {
    toReview();
    await act(async () => typeIn("send it"));
    typeIn("should I take two?"); // nothing to decide here any more: a question is not a yes
    expect(sessionStore.getSnapshot().doseCheck?.callback?.status).toBe("submitted");
    typeIn("back to the call");
    const s = sessionStore.getSnapshot();
    expect(s.state).toBe("listening");
    expect(screen.getByText(/still unresolved/)).toBeInTheDocument();
    // The sent summary and outcome stay in the conversation.
    expect(screen.getByText("Submitted — simulated")).toBeInTheDocument();
    expect(screen.getByText("•••• 0188")).toBeInTheDocument();
  });

  it("'that's all' after the outcome ends the call", async () => {
    toReview();
    await act(async () => typeIn("send it"));
    typeIn("no thanks, that's all");
    expect(sessionStore.getSnapshot().callActive).toBe(false);
  });

  it("'repeat' says the summary again without advancing anything", () => {
    toReview();
    const before = sessionStore.getSnapshot();
    typeIn("repeat");
    const after = sessionStore.getSnapshot();
    expect(after.repeatCount).toBe(before.repeatCount + 1);
    expect(after.doseCheck?.callback?.status).toBe("reviewing");
  });

  it("record unavailable: a callback can still be prepared, with nothing invented", () => {
    sessionStore.setForTest(conflictSession("record-unavailable"));
    render(<CompanionExperience />);
    typeIn("ask a pharmacist");
    typeIn("yes please");
    const review = lastSections();
    expect(review.getByText("Pharmacy record").nextElementSibling).toHaveTextContent("Not available");
    // No wording was confirmed: not called "confirmed", and not in the request.
    expect(review.queryByText("Label wording you confirmed")).toBeNull();
    expect(review.getByText("Label wording").nextElementSibling).toHaveTextContent("Not confirmed — not included in the request");
    expect(review.getByText(SAY_SEND)).toBeInTheDocument();
  });

  it("the dose check never opens a panel: only the call controls, no review region, no buttons in messages", () => {
    toReview();
    expect(document.querySelector("[data-pinned]")).toBeNull();
    expect(screen.queryByRole("region", { name: /check before sharing/i })).toBeNull();
    const controls = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") || b.textContent?.trim());
    expect(controls).toEqual(["Help", "Send message", "Mute microphone", "End call"]);
  });

  it("after a reload mid-call, the start screen is the ordinary one: no notice about the earlier call (owner decision)", () => {
    sessionStore.setForTest({ ...sessionStore.getSnapshot(), previousCallInterrupted: true });
    render(<CompanionExperience />);
    expect(screen.queryByText(/may or may not have gone through|page reloaded/)).toBeNull();
    expect(screen.getAllByRole("button").filter((b) => b.dataset.variant === "primary")).toHaveLength(1);
  });

  it("the whole conversation stays readable in order: nothing is collapsed behind 'Earlier in this call'", () => {
    sessionStore.setForTest(run([startCall]));
    render(<CompanionExperience />);
    act(() => dispatch({ type: "USER_MESSAGE", text: "What is this for?", via: "typed" }));
    act(() => dispatch({ type: "USER_MESSAGE", text: OPENING, via: "typed" }));
    const main = document.querySelector("main")!;
    expect(main.querySelector("details")).toBeNull();
    expect(screen.queryByText(/Earlier in this call/)).toBeNull();
    const turns = [...main.querySelectorAll("[data-speaker]")];
    expect(turns.map((el) => el.getAttribute("data-speaker"))).toEqual(["companion", "user", "companion", "user", "companion"]);
    expect(turns[1]).toHaveTextContent("What is this for?");
    expect(turns[3]).toHaveTextContent(OPENING);
    turns.forEach((el) => expect(el).toBeVisible());
  });

  it("reviewer controls live outside the call and pick a scenario", () => {
    render(<DoseCheckReviewer />);
    expect(sessionStore.getSnapshot().doseScenario).toBe("conflict-sent");
    fireEvent.click(screen.getByRole("radio", { name: /Record unavailable/ }));
    expect(sessionStore.getSnapshot().doseScenario).toBe("record-unavailable");
    act(() => dispatch({ type: "CALL_START" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset call" }));
    expect(sessionStore.getSnapshot().callActive).toBe(false);
  });
});
