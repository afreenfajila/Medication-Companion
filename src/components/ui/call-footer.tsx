import { HandHelping, PhoneOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Active-call controls: Repeat · Get help · End call. Rendered only while a
 * call is active (the start state never mounts this). End call carries an icon
 * and a label so it is not colour-only.
 */
export function CallFooter({
  labels,
  onRepeat,
  onHelp,
  onEnd,
}: {
  labels: { repeat: string; help: string; end: string; group: string };
  onRepeat: () => void;
  onHelp: () => void;
  onEnd: () => void;
}) {
  const base =
    "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-2 text-[14px] font-bold leading-tight transition-colors";
  return (
    <nav
      aria-label={labels.group}
      className="grid grid-cols-3 gap-2 border-t border-line bg-canvas px-4 pt-3"
    >
      <button type="button" onClick={onRepeat} className={cn(base, "text-navy-900 hover:bg-teal-100")}>
        <RotateCcw className="h-5 w-5" aria-hidden="true" />
        <span>{labels.repeat}</span>
      </button>
      <button type="button" onClick={onHelp} className={cn(base, "text-navy-900 hover:bg-teal-100")}>
        <HandHelping className="h-5 w-5" aria-hidden="true" />
        <span>{labels.help}</span>
      </button>
      <button
        type="button"
        onClick={onEnd}
        className={cn(base, "bg-danger-100 text-danger-800 hover:bg-[#f6dcd9]")}
      >
        <PhoneOff className="h-5 w-5" aria-hidden="true" />
        <span>{labels.end}</span>
      </button>
    </nav>
  );
}
