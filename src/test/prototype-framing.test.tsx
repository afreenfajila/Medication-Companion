import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import AboutPage from "@/app/about/page";
import { CaregiverDashboard } from "@/components/caregiver/dashboard";
import { PersonaPicker } from "@/components/persona-picker";
import { PrototypeBadge } from "@/components/prototype-badge";
import { metforminRecord } from "@/lib/content/seed-record";
import { copy } from "@/lib/content/translations";
import { sessionStore } from "@/lib/session/session-store";
import { run, startCall } from "./helpers";

// Assignment 3, H1: the product behaves like the real thing; one badge says it's a prototype.
const DEMO = /\bdemo\b|示范/i;

beforeEach(() => sessionStore.reset());

describe("prototype framing (H1)", () => {
  // content-model §3 / §17 (supersedes A3 H1's blanket "no demo" rule): every simulated
  // request outcome must say so, so nobody mistakes it for a real message or callback.
  it("every simulated request outcome is labelled as a demo, in both languages", () => {
    const outcomes = ["callbackSent", "familySent", "doseSubmitted", "doseFailed", "doseUnknown"] as const;
    for (const key of outcomes) {
      expect(copy.en[key], `en.${key}`).toMatch(/^Demo\b/);
      expect(copy["zh-Hans"][key], `zh-Hans.${key}`).toMatch(/^演示/);
    }
  });

  it("record wording never says 'demo'", () => {
    for (const field of Object.values(metforminRecord.explanation)) {
      for (const line of Object.values(field)) expect(line).not.toMatch(DEMO);
    }
  });

  it.each([
    ["sign-in stand-in", <PersonaPicker key="p" />],
    ["caregiver view", <CaregiverDashboard key="c" />],
    ["about page", <AboutPage key="a" />],
  ])("the %s says nothing about 'demo'", (_name, ui) => {
    const { container } = render(ui);
    expect(container.textContent).not.toMatch(DEMO);
  });

  it("one small Prototype badge, in the person's language", () => {
    const { unmount } = render(<PrototypeBadge />);
    expect(screen.getByText("Prototype · Fictional data")).toBeInTheDocument();
    unmount();
    sessionStore.setForTest({ ...run([startCall]), language: "zh-Hans" });
    render(<PrototypeBadge />);
    expect(screen.getByText("原型 · 虚构数据")).toBeInTheDocument();
  });

  it("the persona picker is a sign-in stand-in: Continue as Mei Ling, noting Singpass", () => {
    render(<PersonaPicker />);
    expect(screen.getByRole("link", { name: /continue as mei ling/i })).toHaveAttribute("href", "/companion");
    expect(screen.getByText(/signs you in with Singpass/)).toBeInTheDocument();
  });

  it("the about page explains what is simulated", () => {
    render(<AboutPage />);
    expect(screen.getByRole("heading", { name: "What is simulated" })).toBeInTheDocument();
    for (const part of [/Pharmacist callbacks/, /Family and trusted-helper messages/, /Sign-in/, /The pharmacy record/]) {
      expect(screen.getByText(part)).toBeInTheDocument();
    }
  });
});
