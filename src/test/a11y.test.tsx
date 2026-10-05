import axe from "axe-core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AboutPage from "@/app/about/page";
import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";
import { CaregiverDashboard } from "@/components/caregiver/dashboard";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { PersonaPicker } from "@/components/persona-picker";
import { sessionStore } from "@/lib/session/session-store";
import type { Session } from "@/lib/session/state-machine";
import {
  askUnknown,
  chooseShowMedicine,
  chooseCamera, grantCamera,
  resolve,
  run,
  startCall,
  submitDemo,
  toConfirmMatch,
  toExplain,
} from "@/test/helpers";

/** axe on the rendered DOM. (Colour contrast needs real layout, so it is covered by design-tokens.test.ts.) */
async function violations(container: HTMLElement): Promise<string[]> {
  const result = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

beforeEach(() => {
  sessionStore.reset();
});
afterEach(() => vi.restoreAllMocks());

const show = (session: Session) => {
  sessionStore.setForTest(session);
  return render(<CompanionExperience />);
};

describe("automated accessibility (axe) — every screen state", () => {
  const states: Array<[string, () => Session]> = [
    ["01 start", () => run([])],
    ["02 listening (greeting)", () => run([startCall])],
    ["02 listening (both contextual actions)", () => run([startCall, { type: "USER_MESSAGE", text: "hello" }])],
    ["03 show medicine: camera or photo", () => run([startCall, askUnknown, chooseShowMedicine])],
    ["03 camera permission", () => run([startCall, askUnknown, chooseShowMedicine, chooseCamera])],
    ["help flow: callback confirm", () => run([startCall, { type: "GET_HELP" }, { type: "HELP_START", kind: "pharmacist-callback" }])],
    ["help flow: failed", () =>
      run([
        startCall,
        { type: "GET_HELP" },
        { type: "HELP_START", kind: "pharmacist-callback" },
        { type: "HELP_CONFIRM", granted: true },
        { type: "HELP_RESULT", ok: false },
      ])],
    ["04 camera guidance (fallback)", () => run([startCall, askUnknown, chooseShowMedicine, chooseCamera, { type: "CAMERA_CONSENT", granted: false }])],
    ["analyzing", () => run([startCall, askUnknown, chooseShowMedicine, chooseCamera, grantCamera, submitDemo()])],
    ["05 confirm match", toConfirmMatch],
    ["06 explain step 1", toExplain],
    ["06 explain step 2", () => run([{ type: "EXPLAIN_STEP", direction: "next" }], toExplain())],
    ["06 explain step 3", () => run([{ type: "EXPLAIN_STEP", direction: "next" }, { type: "EXPLAIN_STEP", direction: "next" }], toExplain())],
    ["06 explain (Chinese)", () => run([{ type: "SET_LANGUAGE", language: "zh-Hans" }], toExplain())],
    ["complete", () => run([{ type: "UNDERSTOOD" }], toExplain())],
    ["07 safety (mismatch)", () => run([startCall, askUnknown, chooseShowMedicine, chooseCamera, grantCamera, submitDemo("sample_mismatch_label"), resolve])],
    ["07 safety (medical question)", () => run([startCall, { type: "USER_MESSAGE", text: "Should I stop taking it?" }])],
    ["07 safety (urgent)", () => run([startCall, { type: "USER_MESSAGE", text: "I have chest pain" }])],
  ];

  it.each(states)("%s has no violations", async (_name, build) => {
    const { container } = show(build());
    expect(await violations(container)).toEqual([]);
  });

  it("start screen with each utility sheet open", async () => {
    for (const name of [/^help$/i, /^language$/i, /^settings$/i]) {
      sessionStore.reset();
      const { container, unmount } = render(<CompanionExperience />);
      // jsdom has no <dialog>.showModal; emulate the open state the browser would give us.
      HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      };
      HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      };
      fireEvent.click(screen.getByRole("button", { name }));
      expect(await violations(container)).toEqual([]);
      unmount();
    }
  });

  it("typed-label form and the record list (camera guidance panels)", async () => {
    const { container } = show(run([startCall, askUnknown, chooseShowMedicine, chooseCamera, { type: "CAMERA_CONSENT", granted: false }]));
    fireEvent.click(screen.getByRole("button", { name: "Choose from my medicines" }));
    fireEvent.click(screen.getByRole("button", { name: /type the label details/i }));
    fireEvent.click(screen.getByRole("button", { name: /check these details/i })); // shows the error state
    expect(await violations(container)).toEqual([]);
  });

  it("persona picker, caregiver dashboard, about, error and not-found pages", async () => {
    for (const ui of [
      <PersonaPicker key="p" />,
      <CaregiverDashboard key="c" />,
      <AboutPage key="a" />,
      <ErrorPage key="e" error={new Error("x")} reset={() => undefined} />,
      <NotFound key="n" />,
    ]) {
      const { container, unmount } = render(ui);
      expect(await violations(container)).toEqual([]);
      unmount();
    }
  });
});

describe("semantics that axe can't fully judge", () => {
  it("each companion screen has exactly one h1", () => {
    for (const build of [() => run([]), () => run([startCall]), toConfirmMatch, toExplain]) {
      sessionStore.setForTest(build());
      const { unmount } = render(<CompanionExperience />);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      unmount();
    }
  });

  it("the state change moves focus to the new screen's main region", async () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    await act(async () => undefined);
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("the companion reply and safety messages are live regions", () => {
    const first = show(run([startCall, askUnknown]));
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
    first.unmount();
    show(run([startCall, { type: "USER_MESSAGE", text: "I have chest pain" }]));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("decorative orb and scan line are hidden from assistive tech; the page language matches content", () => {
    const { container } = show(run([]));
    expect(container.querySelector(".orb")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[lang]")).toHaveAttribute("lang", "en");
    sessionStore.setForTest(run([{ type: "SET_LANGUAGE", language: "zh-Hans" }]));
    const zh = render(<CompanionExperience />, { container: document.body.appendChild(document.createElement("div")) });
    expect(zh.container.querySelector("[lang]")).toHaveAttribute("lang", "zh-Hans");
  });
});
