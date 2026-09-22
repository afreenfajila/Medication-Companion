import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ConversationView } from "./use-conversation";
import type { T } from "./screen-chrome";
import type { CopyKey } from "@/lib/content/translations";

/**
 * Call status strip: what the companion is doing right now, live captions of what
 * it hears, and a mute button like on a phone call. Status is shown in words, not
 * colour or animation alone.
 */
export function VoiceBar({ view, t }: { view: ConversationView; t: T }) {
  const status: string | null = view.interim
    ? view.interim
    : view.speaking
      ? t("voiceSpeaking")
      : view.listening
        ? t("voiceListeningNow")
        : view.notice
          ? t(view.notice as CopyKey)
          : null;

  return (
    <div className="flex items-center gap-3 border-t border-line bg-canvas px-4 py-2">
      <p role="status" aria-live="polite" className="min-h-6 flex-1 text-sm leading-snug text-navy-700">
        {status ?? t("voicePrivacy")}
      </p>
      <button
        type="button"
        aria-pressed={view.micOn}
        aria-label={t("voiceMicLabel")}
        onClick={view.toggleMic}
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill border px-4 text-sm font-bold",
          view.micOn ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-navy-900",
        )}
      >
        {view.micOn ? (
          <Mic className="h-4 w-4" aria-hidden="true" />
        ) : (
          <MicOff className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{view.micOn ? t("voiceMicOn") : t("voiceMicOff")}</span>
      </button>
    </div>
  );
}
