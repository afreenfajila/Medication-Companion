import { User } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Illustrated camera panel for the demo build: a generic bottle (no real
 * branding), a label-frame, ONE slow decorative scan line, a "1 medicine only"
 * badge and an optional small "You" tile. It never implies anything was read.
 * No camera is opened here — that arrives in a later phase.
 */
export function CameraPreview({
  statusLabel,
  badgeLabel,
  youLabel,
  summary,
  className,
}: {
  statusLabel: string;
  badgeLabel: string;
  youLabel: string;
  summary: string;
  className?: string;
}) {
  return (
    <figure
      className={cn("relative overflow-hidden rounded-lg bg-navy-900", className)}
      aria-label={summary}
    >
      <div className="relative aspect-[4/5] w-full">
        <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2">
          <span className="rounded-pill bg-white/15 px-3 py-1 text-[13px] font-medium text-white">
            {statusLabel}
          </span>
          <span className="rounded-pill bg-teal-600 px-3 py-1 text-[13px] font-bold text-white">
            {badgeLabel}
          </span>
        </div>

        {/* Generic illustrated bottle */}
        <svg
          viewBox="0 0 200 260"
          className="absolute inset-x-[18%] top-[14%] h-[72%] w-[64%]"
          aria-hidden="true"
        >
          <rect x="70" y="8" width="60" height="30" rx="8" fill="#e7f3f2" opacity="0.9" />
          <rect x="60" y="34" width="80" height="14" rx="6" fill="#5b9b98" />
          <rect x="44" y="48" width="112" height="196" rx="22" fill="#e7f3f2" opacity="0.14" />
          <rect x="44" y="48" width="112" height="196" rx="22" fill="none" stroke="#e7f3f2" strokeOpacity="0.5" strokeWidth="2" />
          <rect x="56" y="100" width="88" height="96" rx="8" fill="#faf9f6" opacity="0.92" />
          <rect x="66" y="112" width="52" height="7" rx="3.5" fill="#17324d" opacity="0.55" />
          <rect x="66" y="128" width="68" height="5" rx="2.5" fill="#17324d" opacity="0.3" />
          <rect x="66" y="141" width="60" height="5" rx="2.5" fill="#17324d" opacity="0.3" />
          <rect x="66" y="154" width="64" height="5" rx="2.5" fill="#17324d" opacity="0.3" />
          <rect x="66" y="172" width="38" height="5" rx="2.5" fill="#17324d" opacity="0.3" />
        </svg>

        {/* Label frame with a single decorative scan line */}
        <div
          className="absolute inset-x-[14%] top-[36%] h-[44%] overflow-hidden rounded-md border-2 border-teal-600"
          style={{ containerType: "size" }}
          aria-hidden="true"
        >
          <div className="scan-line h-0.5 w-full bg-teal-600/80" />
        </div>

        {/* Optional self-view tile */}
        <div className="absolute bottom-3 right-3 flex h-24 w-[4.5rem] flex-col items-center justify-center gap-1 rounded-md border border-white/25 bg-navy-700 text-white">
          <User className="h-6 w-6" aria-hidden="true" />
          <span className="text-[12px] font-medium">{youLabel}</span>
        </div>
      </div>
    </figure>
  );
}
