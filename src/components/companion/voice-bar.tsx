import type { CopyKey } from "@/lib/content/translations";
import type { ConversationView } from "./use-conversation";
import type { T } from "./screen-chrome";

/** What the status line under the companion orb says, from the one voice status the coordinator owns. */
export function captionKey(status: ConversationView["status"]): CopyKey | null {
  switch (status.kind) {
    case "connecting":
      return "voiceConnecting";
    case "listening":
      return status.afterInterrupt ? "voiceHeardYou" : "voiceListeningNow";
    case "processing":
      return "voiceProcessing";
    case "speaking":
      return !status.audioStarted ? "voicePreparing" : status.micOpen ? "voiceSpeakingDuplex" : "voiceSpeaking";
    case "interrupted":
      return status.reason === "playback" ? "voiceInterrupted" : null;
    default:
      return null;
  }
}

/** What the status line says now: mute first, then a mic problem, then what the voice is doing. */
export function statusKey(view: ConversationView): CopyKey | null {
  if (view.muted) return "voiceMuted";
  if (view.justUnmuted) return "voiceUnmuted";
  if (view.notice) return view.notice;
  // The voice stopped mid-line: say how to hear it again ("repeat") until the companion next speaks.
  if (view.voiceStopped && view.status.kind === "listening") return "voiceInterrupted";
  const key = captionKey(view.status);
  if (key) return key;
  // Nothing happening: say where speech goes (there is nothing to disclose without a mic).
  if (!view.hasInput) return null;
  return view.realtimeInput ? "voicePrivacyRealtime" : "voicePrivacy";
}

/**
 * The one status line under the orb (and a sticky voice notice). Recovery is in the control row
 * and in words: the mic button turns a paused mic back on (or talks, in push-to-talk), and
 * "repeat" says the line again — so there are no buttons here.
 */
export function VoiceBar({ view, t }: { view: ConversationView; t: T }) {
  const key = statusKey(view);
  return (
    <div className="flex flex-col items-center gap-2">
      {/* Polite and always mounted, so mute and status changes are announced without interrupting. */}
      <p role="status" aria-live="polite" className="min-h-[1.5em] max-w-[34ch] text-center text-[15px] leading-snug text-navy-700">
        {key ? t(key) : ""}
      </p>
      {/* Sticky for the rest of the call; announced once above, so this copy is not a live region. */}
      {view.voiceNotice && key !== view.voiceNotice && (
        <p data-voice-notice className="max-w-[34ch] text-center text-[14px] leading-snug text-navy-700">
          {t(view.voiceNotice)}
        </p>
      )}
    </div>
  );
}
