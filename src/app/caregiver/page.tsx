import type { Metadata } from "next";
import { CaregiverDashboard } from "@/components/caregiver/dashboard";
import { AppShell } from "@/components/ui/shell";

export const metadata: Metadata = { title: "Caregiver view — prototype" };

export default function CaregiverPage() {
  return (
    <AppShell wide>
      <CaregiverDashboard />
    </AppShell>
  );
}
