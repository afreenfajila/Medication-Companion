import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A single transcript moment — not an endless chat log.
 * "user": light-teal card. "companion": large plain text so the spoken
 * equivalent is always readable. Screen-reader announcement of companion
 * replies is done by one persistent live region in CompanionExperience (a
 * live region mounted together with its content is often not announced).
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
        <div className="mt-1 flex flex-col gap-1 text-lg leading-snug break-words">{children}</div>
      </div>
    );
  }
  return (
    <div className={cn("px-1", className)}>
      <p className="text-[13px] font-bold leading-tight text-navy-700">{label}</p>
      <div className="fade-in mt-1 flex flex-col gap-1 text-[20px] font-medium leading-snug">{children}</div>
    </div>
  );
}
