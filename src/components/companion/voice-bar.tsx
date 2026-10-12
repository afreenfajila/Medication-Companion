import { Mic, Volume2 } from "lucide-react";
import type { CopyKey } from "@/lib/content/translations";
import type { ConversationView } from "./use-conversation";
import type { T } from "./screen-chrome";

/**
 * The one short status line under the companion orb, plus recovery actions that
 * appear only when they are needed — never during a healthy call:
 *
 *  - "Try again" after listening paused (silence, a mic or network problem);
 *  - "Tap to talk"/"Tap to send" when there is no local speech detection
 *    (push-to-talk), and not while muted;
 *  - "Repeat slowly" after the voice stopped mid-line.
 *
 * The caption is read from the one voice status the coordinator owns; nothing
 * here decides on its own whether the companion is speaking or listening.
 * Status is words, not colour or animation alone (design-standard §7).
 */
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
  const key = captionKey(view.status);
  if (key) return key;
  // Nothing happening: say where speech goes (there is nothing to disclose without a mic).
  if (!view.hasInput) return null;
  return view.realtimeInput ? "voicePrivacyRealtime" : "voicePrivacy";
}

const recovery =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-pill border border-teal-600/30 bg-teal-100 px-4 text-[16px] font-bold text-navy-900 hover:bg-[#d7ebe9]";

export function VoiceBar({ view, t, onRepeat }: { view: ConversationView; t: T; onRepeat: () => void }) {
  const key = statusKey(view);
  const canResume = !view.muted && view.paused;
  const canTalk = view.pushToTalk && !view.muted && !view.paused;
  const canRepeat = view.voiceStopped;

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
      {(canResume || canTalk || canRepeat) && (
        <div className="flex flex-wrap justify-center gap-3">
          {canResume && (
            <button type="button" onClick={view.resume} className={recovery}>
              <Mic className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{t("voiceTryAgain")}</span>
            </button>
          )}
          {canTalk && (
            <button type="button" onClick={view.talk} className={recovery}>
              <Mic className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{view.status.kind === "listening" ? t("voiceTapToSend") : t("voiceTapToTalk")}</span>
            </button>
          )}
          {canRepeat && (
            <button type="button" onClick={onRepeat} className={recovery}>
              <Volume2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{t("repeat")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
