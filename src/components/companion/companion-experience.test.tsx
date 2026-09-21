import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionStore } from "@/lib/session/session-store";
import { CompanionExperience } from "./companion-experience";

const FORBIDDEN_ON_HOME = [
  /show medicine/i,
  /ask about my schedule/i,
  /my schedule/i,
  /^repeat$/i,
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
});

const send = (text: string) => {
  fireEvent.change(screen.getByLabelText(/type your question/i), { target: { value: text } });
  fireEvent.submit(screen.getByLabelText(/type your question/i).closest("form")!);
};

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
      "Repeat",
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

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByText("Take 1 tablet twice daily with meals.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getByText("随餐每日服用一片，每日两次。")).toBeInTheDocument();
    // Language change did not reset the confirmation.
    expect(screen.getByRole("button", { name: "中文" })).toHaveAttribute("aria-pressed", "true");
  });

  it("blocks instructions for a non-matching label and offers demo-labelled human help", () => {
    render(<CompanionExperience />);
    fireEvent.click(screen.getByRole("button", { name: /call with companion/i }));
    send("What is this for?");
    fireEvent.click(screen.getByRole("button", { name: /show medicine/i }));
    fireEvent.click(screen.getByRole("button", { name: /not now/i })); // decline camera → fallback
    fireEvent.click(screen.getByRole("button", { name: /different medicine — demo/i }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("I’m not sure enough to explain this safely.")).toBeInTheDocument();
    expect(screen.queryByText(/Take 1 tablet/)).toBeNull();
    expect(screen.getByRole("button", { name: "Check with pharmacy — demo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask a trusted helper — demo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try another photo" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Check with pharmacy — demo" }));
    expect(screen.getByText(/no call or message was sent/i)).toBeInTheDocument();
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
