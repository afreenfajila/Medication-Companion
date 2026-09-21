import type { Metadata } from "next";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { AppShell } from "@/components/ui/shell";

export const metadata: Metadata = { title: "Companion — Medication Companion prototype" };

export default function CompanionPage() {
  return (
    <AppShell>
      <CompanionExperience />
    </AppShell>
  );
}
