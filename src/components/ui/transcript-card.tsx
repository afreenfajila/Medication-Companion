import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A single transcript moment — not an endless chat log.
 * "user": light-teal card. "companion": large plain text so the spoken
 * equivalent is always readable. Companion text is a polite live region.
 */
export function TranscriptCard({
  speaker,
  label,
  children,
  className,
}: {
  speaker: "user" | "companion";
  label: string;
  children: ReactNode;
  className?: string;
}) {
  if (speaker === "user") {
    return (
      <div className={cn("fade-in rounded-md bg-teal-100 px-4 py-3", className)}>
        <p className="text-[13px] font-bold leading-tight text-navy-700">{label}</p>
        <p className="mt-1 text-lg leading-snug break-words">{children}</p>
      </div>
    );
  }
  return (
    <div className={cn("px-1", className)} aria-live="polite" aria-atomic="true">
      <p className="text-[13px] font-bold leading-tight text-navy-700">{label}</p>
      <p className="fade-in mt-1 text-[20px] font-medium leading-snug">{children}</p>
    </div>
  );
}
