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
  entryId,
  urgent = false,
  "data-interim": interim,
}: {
  speaker: "user" | "companion";
  /** Omitted when the previous turn was the same speaker: one label per run of messages. */
  label?: string;
  children: ReactNode;
  className?: string;
  /** The feed message's id, so a new summary can be brought into view at its first line. */
  entryId?: string;
  /** Urgent guidance: announced at once (role="alert") and the one red treatment (design-standard). */
  urgent?: boolean;
  /** Live words still being heard: marked so they can be told apart from final text. */
  "data-interim"?: boolean;
}) {
  if (speaker === "user") {
    return (
      <div data-speaker="user" data-entry={entryId} data-interim={interim || undefined} className={cn("fade-in rounded-md bg-teal-100 px-3 py-2", className)}>
        {label && <p className="text-[15px] font-bold leading-tight text-navy-700">{label}</p>}
        <div className={cn("flex flex-col gap-1 text-[18px] leading-normal break-words", label && "mt-1")}>{children}</div>
      </div>
    );
  }
  return (
    <div
      data-speaker="companion"
      data-entry={entryId}
      role={urgent ? "alert" : undefined}
      className={cn("fade-in scroll-mt-2 px-1", urgent && "rounded-md border-2 border-danger-700 bg-danger-100 px-3 py-2 text-danger-800", className)}
    >
      {label && <p className="text-[15px] font-bold leading-tight text-navy-700">{label}</p>}
      <div className={cn("flex flex-col gap-1 text-[19px] font-medium leading-normal break-words", label && "mt-1")}>{children}</div>
    </div>
  );
}
