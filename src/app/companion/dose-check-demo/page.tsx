import type { Metadata } from "next";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { DoseCheckReviewer } from "@/components/companion/dose-check-reviewer";
import { AppShell } from "@/components/ui/shell";

export const metadata: Metadata = { title: "Dose-change demo — Medication Companion prototype" };

/** Reviewer route for the Assignment 4 dose-change journey: controls above, the real call below. */
export default function DoseCheckDemoPage() {
  return (
    <div className="bg-canvas md:bg-desk">
      <DoseCheckReviewer />
      <AppShell>
        <CompanionExperience />
      </AppShell>
    </div>
  );
}
