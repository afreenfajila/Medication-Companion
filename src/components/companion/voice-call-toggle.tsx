import { Phone, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { T } from "./screen-chrome";

/**
 * One tap starts a hands-free, phone-call-style conversation: the companion
 * speaks its replies and the microphone reopens by itself after each one.
 * Off by default — nothing about the mic or speaker runs until this is tapped.
 */
export function VoiceCallToggle({ on, onToggle, t }: { on: boolean; onToggle: () => void; t: T }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-4 text-sm font-bold",
        on ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-navy-900",
      )}
    >
      {on ? (
        <PhoneCall className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Phone className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{on ? t("voiceCallOn") : t("voiceCallStart")}</span>
    </button>
  );
}
