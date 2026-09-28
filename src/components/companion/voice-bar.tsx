import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ConversationView } from "./use-conversation";
import type { T } from "./screen-chrome";
import type { CopyKey } from "@/lib/content/translations";

/**
 * Call status strip: a plain-text caption of what the companion is doing, and a
 * small stop/mute control — like the mute icon on a phone call, not a labelled
 * "button". Status is words, not colour or animation alone (design-standard §7:
 * audio output needs a visible caption and a stop/mute control).
 *
 * Live interim words are shown in the call feed itself (as part of the running
 * transcript), not repeated here — this strip is just the current mic/speaker
 * status, or a notice such as "didn't catch that" when there's nothing else to say.
 */
export function VoiceBar({ view, t }: { view: ConversationView; t: T }) {
  const status: string | null = view.notice
    ? t(view.notice as CopyKey)
    : view.speaking
      ? t("voiceSpeaking")
      : view.listening
        ? t("voiceListeningNow")
        : null;

  return (
    <div className="flex items-center gap-2 border-t border-line bg-canvas px-4">
      <p role="status" aria-live="polite" className="flex-1 text-[13px] leading-snug text-navy-700">
        {status ?? t("voicePrivacy")}
      </p>
      {/* Icon only — no pill, no border, no visible label — but a real 44×44 target
          and a dynamic accessible name ("Mic on"/"Mic off") for assistive tech. */}
      <button
        type="button"
        aria-pressed={view.micOn}
        onClick={view.toggleMic}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-pill",
          view.micOn ? "text-navy-900" : "text-slate-600",
        )}
      >
        {view.micOn ? (
          <Mic className="h-5 w-5" aria-hidden="true" />
        ) : (
          <MicOff className="h-5 w-5" aria-hidden="true" />
        )}
        <span className="sr-only">{view.micOn ? t("voiceMicOn") : t("voiceMicOff")}</span>
      </button>
    </div>
  );
}
