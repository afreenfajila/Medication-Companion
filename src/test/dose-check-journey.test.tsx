import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { DoseCheckReviewer } from "@/components/companion/dose-check-reviewer";
import { setDoseCallbackServiceForTest, SimulatedDoseCallbackService } from "@/lib/services/dose-callback";
import { dispatch, sessionStore } from "@/lib/session/session-store";
import type { Session } from "@/lib/session/state-machine";
import { chooseCamera, chooseShowMedicine, grantCamera, resolve, run, startCall, submitDemo } from "./helpers";

const OPENING =
  "My doctor changed my medicine, but this box still says the old amount. How many should I take now?";
const OLD_LABEL = "Take 2 tablets twice daily with meals";

function conflictSession(scenario: Session["doseScenario"] = "conflict-sent"): Session {
  const s = run([
    { type: "SET_DOSE_SCENARIO", scenario },
    startCall,
    { type: "USER_MESSAGE", text: OPENING, via: "typed" },
    chooseShowMedicine,
    chooseCamera,
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

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));
/** Typed exactly as it could be said: sending is an explicit "send" (no Send button). */
const typeIn = (text: string) => {
  fireEvent.change(screen.getByLabelText(/type it here/i), { target: { value: text } });
  fireEvent.submit(screen.getByLabelText(/type it here/i).closest("form")!);
};
const pinned = () => within(document.querySelector<HTMLElement>("[data-pinned]")!);

async function toReviewPanel() {
  sessionStore.setForTest(conflictSession());
  render(<CompanionExperience />);
  // The camera reading is unconfirmed until the person says so.
  expect(pinned().getByRole("heading", { name: "Please check what I read" })).toBeInTheDocument();
  expect(pinned().getByRole("region", { name: /not confirmed yet/i })).toHaveTextContent("Your label photo (simulated reading)");
  // Confirmation is full size, never a compact control.
  expect(screen.getByRole("button", { name: "Yes, that is what the label says" }).className).not.toMatch(/min-h-11/);
  click("Yes, that is what the label says");
  expect(pinned().getByText("These instructions differ")).toBeInTheDocument();
  const recordBlock = pinned().getByRole("region", { name: "Current record" });
  expect(recordBlock).toHaveTextContent("BrightCare Pharmacy (fictional)");
  expect(recordBlock).toHaveTextContent("21 September 2026");
  expect(pinned().getByRole("region", { name: "Label you confirmed" })).toHaveTextContent(OLD_LABEL);
  click("Ask for a pharmacist callback");
  click("Yes, prepare a summary");
  expect(screen.getByRole("heading", { name: "Check before sharing" })).toBeInTheDocument();
}

describe("dose-change journey in the call (UI)", () => {
  it("the payload sent is exactly what the review panel showed", async () => {
    await toReviewPanel();
    const panel = pinned();
    expect(panel.getByText("Demo only — no real callback request is sent.")).toBeInTheDocument();
    expect(panel.getByText(/Only the details shown here are included/)).toBeInTheDocument();
    expect(panel.getByText("•••• 0188")).toBeInTheDocument(); // masked by default
    expect(panel.queryByText("0000 0188")).toBeNull();
    // …with a labelled way to see exactly what will be sent (design-standard §16).
    click("Show number");
    expect(panel.getByText("0000 0188")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide number" })).toHaveAttribute("aria-pressed", "true");
    click("Hide number");
    expect(panel.queryByText("0000 0188")).toBeNull();

    // No Send button: the review says how to send, and an explicit "send" does it.
    expect(screen.queryByRole("button", { name: "Send callback request" })).toBeNull();
    expect(panel.getByText("If it’s right, say or type “send”. If not, say “don’t send”.")).toBeInTheDocument();
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

    expect(panel.getByText("Demo: callback request submitted.")).toBeInTheDocument();
    expect(panel.getByText("The difference in your medication instructions still needs checking.")).toBeInTheDocument();
    expect(panel.getByText("Submitted — simulated")).toBeInTheDocument();
    expect(panel.getByText("Unresolved")).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: "Send callback request" })).toBeNull();
  });

  it("Don't send makes no submission and returns to the comparison", async () => {
    await toReviewPanel();
    click("Don’t send");
    await act(async () => undefined);
    expect(service.received).toHaveLength(0);
    expect(pinned().getByText(/^Nothing was shared./)).toBeInTheDocument();
    expect(pinned().getByText("These instructions differ")).toBeInTheDocument();
  });

  it("failure keeps the summary; Try again sends the same request", async () => {
    sessionStore.setForTest(conflictSession("conflict-fails"));
    render(<CompanionExperience />);
    click("Yes, that is what the label says");
    click("Ask for a pharmacist callback");
    click("Yes, prepare a summary");
    await act(async () => typeIn("send it"));
    expect(pinned().getByText("Demo: request not submitted.")).toBeInTheDocument();
    expect(pinned().getByText("The request could not be delivered. No one has been notified. Your summary is still available.")).toBeInTheDocument();
    expect(pinned().getByText("Unresolved")).toBeInTheDocument();
    expect(pinned().getByText("View fictional pharmacy contact")).toBeInTheDocument();
    await act(async () => typeIn("try again"));
    expect(service.received.map((p) => p.requestId)).toEqual([service.received[0].requestId, service.received[0].requestId]);
    expect(service.deliveredCount).toBe(1);
    expect(pinned().getByText("Demo: callback request submitted.")).toBeInTheDocument();
  });

  it("an unknown outcome says so, and Try again sends the same request once", async () => {
    sessionStore.setForTest(conflictSession("conflict-unknown"));
    render(<CompanionExperience />);
    click("Yes, that is what the label says");
    click("Ask for a pharmacist callback");
    click("Yes, prepare a summary");
    await act(async () => typeIn("send it"));
    expect(pinned().getByText("Demo: submission could not be confirmed.")).toBeInTheDocument();
    expect(pinned().getByText("Not confirmed — simulated")).toBeInTheDocument();
    expect(pinned().queryByText(/No one has been notified/)).toBeNull();
    expect(pinned().queryByRole("button", { name: "Review summary" })).toBeNull();
    await act(async () => typeIn("try again"));
    expect(service.deliveredCount).toBe(1);
    expect(pinned().getByText("Demo: callback request submitted.")).toBeInTheDocument();
  });

  it("correcting a misread label updates the comparison in the same call", () => {
    sessionStore.setForTest(conflictSession("misread-label"));
    render(<CompanionExperience />);
    click("Change the wording");
    const input = pinned().getByLabelText("What does the label on your box say?");
    expect(input).toHaveValue("Take 7 tablet twice daily with meals");
    fireEvent.change(input, { target: { value: "Take 1 tablet twice daily with meals" } });
    click("Use this wording");
    // The corrected wording is shown back for confirmation, not trusted as typed.
    expect(pinned().getByRole("region", { name: /not confirmed yet/i })).toHaveTextContent("As you typed it");
    click("Yes, that is what the label says");
    expect(pinned().getByText("Matches for the details checked")).toBeInTheDocument();
    expect(pinned().queryByRole("button", { name: "Ask for a pharmacist callback" })).toBeNull();
  });

  it("works in Chinese too", () => {
    sessionStore.setForTest({ ...conflictSession(), language: "zh-Hans" });
    render(<CompanionExperience />);
    click("对，标签上就是这样写的");
    expect(pinned().getByText("这两个用法不一样")).toBeInTheDocument();
    expect(pinned().getByRole("button", { name: "请药剂师回电" })).toBeInTheDocument();
  });

  it("keyboard focus moves to the new panel when the pressed button disappears (PRD §12)", () => {
    sessionStore.setForTest(conflictSession());
    render(<CompanionExperience />);
    const yes = screen.getByRole("button", { name: "Yes, that is what the label says" });
    yes.focus();
    act(() => yes.click());
    expect(document.activeElement).toBe(document.querySelector("[data-pinned]"));
  });

  it("after submission: review the request, return to the call (still unresolved), or end the call", async () => {
    await toReviewPanel();
    await act(async () => typeIn("send it"));
    click("Review request");
    expect(pinned().getByText("•••• 0188")).toBeInTheDocument();
    click("Return to call");
    const s = sessionStore.getSnapshot();
    expect(s.state).toBe("listening");
    expect(screen.getByText(/still unresolved/)).toBeInTheDocument();
  });

  it("'Read this to me' repeats the summary without advancing anything", async () => {
    await toReviewPanel();
    const before = sessionStore.getSnapshot();
    click("Read this to me");
    const after = sessionStore.getSnapshot();
    expect(after.repeatCount).toBe(before.repeatCount + 1);
    expect(after.doseCheck?.callback?.status).toBe("reviewing");
  });

  it("record unavailable: a callback can still be prepared, with nothing invented", () => {
    sessionStore.setForTest(conflictSession("record-unavailable"));
    render(<CompanionExperience />);
    click("Ask for a pharmacist callback");
    click("Yes, prepare a summary");
    expect(screen.getByRole("heading", { name: "Check before sharing" })).toBeInTheDocument();
    expect(pinned().getByText("Not available")).toBeInTheDocument();
    expect(pinned().getByText("Not confirmed")).toBeInTheDocument();
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
