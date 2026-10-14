import type { ChipTone } from "@/lib/session/call-stage";
import { cn } from "@/lib/utils/cn";

/** Text and colour together (never colour alone); every pairing clears WCAG AA for small text. */
const TONES: Record<ChipTone, string> = {
  neutral: "bg-line text-navy-900",
  coral: "bg-danger-100 text-danger-800",
  teal: "bg-teal-100 text-teal-800",
  blue: "bg-[#e6eefa] text-[#1d4f91]",
};

/** A small uppercase status chip for the call's safety progress (call-stage.ts). */
export function StatusChip({ label, tone, className }: { label: string; tone: ChipTone; className?: string }) {
  return (
    <span
      data-chip={tone}
      className={cn("inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-bold uppercase leading-tight tracking-wide", TONES[tone], className)}
    >
      {label}
    </span>
  );
}
