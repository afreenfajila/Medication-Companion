import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Stop/mute control for spoken replies. Off by default; the visible caption
 * is always on screen either way. State is shown by icon + words, not colour.
 */
export function SoundToggle({
  on,
  onToggle,
  labels,
}: {
  on: boolean;
  onToggle: () => void;
  labels: { on: string; off: string; group: string };
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={labels.group}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-4 text-sm font-bold",
        on ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-navy-900",
      )}
    >
      {on ? (
        <Volume2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <VolumeX className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{on ? labels.on : labels.off}</span>
    </button>
  );
}
