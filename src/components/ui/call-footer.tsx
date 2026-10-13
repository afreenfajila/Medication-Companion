import { HandHelping, Mic, MicOff, PhoneOff } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The three persistent active-call controls, like a phone call's: Get help ·
 * Mute/Unmute · End call. Rendered only while a call is active. Icon above a
 * short label (never icon or colour alone); 48px+ targets with 12px gaps, and
 * labels may wrap instead of clipping at narrow widths or 200% zoom.
 *
 * End call is destructive (red, phone-off icon, the word "End") and acts once:
 * a second tap before the call has gone does nothing.
 */
export function CallFooter({
  labels,
  muted,
  muteDisabled = false,
  onHelp,
  onToggleMute,
  onEnd,
}: {
  labels: { group: string; help: string; mute: string; unmute: string; end: string };
  muted: boolean;
  /** No speech input on this call (typing only): there is nothing to mute. */
  muteDisabled?: boolean;
  onHelp: () => void;
  onToggleMute: () => void;
  onEnd: () => void;
}) {
  const ended = useRef(false);
  const base =
    "flex min-h-14 min-w-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-center text-[16px] font-bold leading-tight break-words transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <nav aria-label={labels.group} className="grid grid-cols-3 gap-3 border-t border-line bg-canvas px-4 pb-1 pt-2">
      <button type="button" onClick={onHelp} className={cn(base, "text-navy-900 hover:bg-teal-100")}>
        <HandHelping className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{labels.help}</span>
      </button>
      {/* The visible word is the name ("Mute" / "Unmute"), so no aria-pressed: the label already says the state. */}
      <button
        type="button"
        disabled={muteDisabled}
        onClick={onToggleMute}
        className={cn(base, muted ? "bg-navy-900 text-white hover:bg-[#1f4368]" : "text-navy-900 hover:bg-teal-100")}
      >
        {muted ? <MicOff className="h-5 w-5 shrink-0" aria-hidden="true" /> : <Mic className="h-5 w-5 shrink-0" aria-hidden="true" />}
        <span>{muted ? labels.unmute : labels.mute}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          if (ended.current) return;
          ended.current = true;
          onEnd();
        }}
        className={cn(base, "bg-danger-100 text-danger-800 hover:bg-[#f6dcd9]")}
      >
        <PhoneOff className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{labels.end}</span>
      </button>
    </nav>
  );
}
