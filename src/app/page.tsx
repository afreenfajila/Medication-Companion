import { PersonaPicker } from "@/components/persona-picker";
import { AppShell } from "@/components/ui/shell";

export default function HomePage() {
  return (
    <AppShell>
      <PersonaPicker />
    </AppShell>
  );
}
