import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * One turn of the call transcript. "user": light-teal block. "companion": plain
 * text, so the spoken equivalent is always readable. Compact spacing and ~1.5
 * line height; static content only (no borders, buttons or focus targets).
 * Screen-reader announcement of companion replies is done by one persistent
 * live region in CompanionExperience (a live region mounted together with its
 * content is often not announced).
 */
export function TranscriptCard({
  speaker,
  label,
  children,
  className,
  "data-interim": interim,
}: {
  speaker: "user" | "companion";
  label: string;
  children: ReactNode;
  className?: string;
  /** Live words still being heard: marked so they can be told apart from final text. */
  "data-interim"?: boolean;
}) {
  if (speaker === "user") {
    return (
      <div data-speaker="user" data-interim={interim || undefined} className={cn("fade-in rounded-md bg-teal-100 px-3 py-2", className)}>
        <p className="text-[15px] font-bold leading-tight text-navy-700">{label}</p>
        <div className="mt-1 flex flex-col gap-1 text-[18px] leading-normal break-words">{children}</div>
      </div>
    );
  }
  return (
    <div data-speaker="companion" className={cn("px-1", className)}>
      <p className="text-[15px] font-bold leading-tight text-navy-700">{label}</p>
      <div className="fade-in mt-1 flex flex-col gap-1 text-[19px] font-medium leading-normal break-words">{children}</div>
    </div>
  );
}
