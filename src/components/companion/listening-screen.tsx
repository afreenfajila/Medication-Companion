"use client";

<<<<<<< HEAD
import { Send } from "lucide-react";
import { useId, useState } from "react";
import { CompanionOrb, type OrbState } from "@/components/ui/companion-orb";
=======
import { Mic, Send, Square } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CompanionOrb } from "@/components/ui/companion-orb";
>>>>>>> a2528316cb25c39d4d44554f392e8ee3a5a5e16a
import { ContextualChoiceGroup } from "@/components/ui/contextual-choice-group";
import { TranscriptCard } from "@/components/ui/transcript-card";
import type { Session } from "@/lib/session/state-machine";
import { getVoiceProvider, useVoiceCapabilities } from "@/lib/voice/use-voice";
import { VoiceError, type VoiceErrorCode } from "@/lib/voice/provider";
import type { ContextualActionId } from "@/types/content";
import type { CopyKey } from "@/lib/content/translations";
import type { T } from "./screen-chrome";

const VOICE_ERROR_KEY: Record<VoiceErrorCode, CopyKey> = {
  "permission-denied": "voiceDenied",
  "no-speech": "voiceNoSpeech",
  "no-microphone": "voiceNoMic",
  network: "voiceNetwork",
  unsupported: "voiceUnsupported",
  unknown: "voiceUnknown",
};

/**
 * 02-companion-listening. The transcript, the companion's single response, and
 * — only when that response is a question that needs it — temporary contextual
 * choices directly beneath it. No generic task menu.
 */
export function ListeningScreen({
  t,
  session,
<<<<<<< HEAD
  orbState,
=======
  speaking,
>>>>>>> a2528316cb25c39d4d44554f392e8ee3a5a5e16a
  onSend,
  onSelectRoute,
}: {
  t: T;
  session: Session;
<<<<<<< HEAD
  orbState: OrbState;
=======
  speaking: boolean;
>>>>>>> a2528316cb25c39d4d44554f392e8ee3a5a5e16a
  onSend: (text: string) => void;
  onSelectRoute: (route: ContextualActionId) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();

  // Voice input. A spoken transcript takes exactly the same path as typed text
  // (onSend → USER_MESSAGE → safety classifier first). Nothing starts until the tap.
  const caps = useVoiceCapabilities();
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [voiceError, setVoiceError] = useState<VoiceErrorCode | null>(null);
  const sendRef = useRef(onSend);
  useEffect(() => {
    sendRef.current = onSend;
  });
  useEffect(() => {
    const provider = getVoiceProvider();
    if (!provider) return;
    const offs = [
      provider.onListeningChange(setRecording),
      provider.onInterim(setInterim),
      provider.onTranscript((text) => {
        setInterim("");
        setVoiceError(null);
        sendRef.current(text.slice(0, 300));
      }),
      provider.onError((error) => {
        setInterim("");
        setVoiceError(error instanceof VoiceError ? error.code : "unknown");
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      provider.stopListening();
    };
  }, []);

  const toggleMic = () => {
    const provider = getVoiceProvider();
    if (!provider) return;
    if (recording) {
      provider.stopListening();
    } else {
      setVoiceError(null);
      provider.startListening(session.language);
    }
  };

  const choices = session.contextualActions.map((id) => ({
    id,
    label: id === "show-medicine" ? t("showMedicine") : t("askSchedule"),
  }));

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <h1 className="sr-only">{t("callWithCompanion")}</h1>
      <div className="flex flex-col items-center gap-1">
<<<<<<< HEAD
        <CompanionOrb size="sm" state={orbState} />
=======
        <CompanionOrb size="sm" state={recording ? "listening" : speaking ? "speaking" : "idle"} />
        <p role="status" className="min-h-6 text-base font-medium text-navy-700">
          {recording ? t("voiceListeningNow") : ""}
        </p>
>>>>>>> a2528316cb25c39d4d44554f392e8ee3a5a5e16a
      </div>

      {interim && (
        <TranscriptCard speaker="user" label={t("youSay")}>
          {interim}
        </TranscriptCard>
      )}

      {!interim && session.userText && (
        <TranscriptCard
          key={`u-${session.userText}`}
          speaker="user"
          label={t("youSay")}
        >
          {session.userText}
        </TranscriptCard>
      )}

      <TranscriptCard
        key={`c-${session.assistantKey}-${session.repeatCount}`}
        speaker="companion"
        label={t("companionSays")}
      >
        {t(session.assistantKey)}
      </TranscriptCard>

      <ContextualChoiceGroup
        choices={choices}
        groupLabel={t("companionSays")}
        onSelect={onSelectRoute}
      />

      <form
        className="mt-auto flex flex-col gap-2 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          onSend(text);
          setDraft("");
        }}
      >
        {caps.recognition && (
          <button
            type="button"
            data-variant="secondary"
            aria-pressed={recording}
            onClick={toggleMic}
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-pill border border-teal-600/30 bg-teal-100 px-6 text-lg font-bold hover:bg-[#d7ebe9]"
          >
            {recording ? (
              <Square className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Mic className="h-5 w-5" aria-hidden="true" />
            )}
            <span>{recording ? t("voiceStop") : t("voiceTapToSpeak")}</span>
          </button>
        )}
        <label htmlFor={inputId} className="mt-1 text-sm font-bold text-navy-700">
          {t("typeLabel")}
        </label>
        <div className="flex items-stretch gap-2">
          <input
            id={inputId}
            type="text"
            value={draft}
            maxLength={300}
            autoComplete="off"
            placeholder={t("typePlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-14 min-w-0 flex-1 rounded-pill border border-navy-700/30 bg-surface px-5 text-lg placeholder:text-navy-700/70"
          />
          <button
            type="submit"
            data-variant="secondary"
            className="inline-flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-pill border border-teal-600/30 bg-teal-100 px-5 text-base font-bold hover:bg-[#d7ebe9]"
          >
            <Send className="h-5 w-5" aria-hidden="true" />
            <span>{t("send")}</span>
          </button>
        </div>
<<<<<<< HEAD
=======
        {voiceError && (
          <p role="status" className="text-base font-medium text-danger-700">
            {t(VOICE_ERROR_KEY[voiceError])}
          </p>
        )}
        <DemoNotice role="note">
          {caps.recognition ? t("voicePrivacy") : t("voiceUnsupported")}
        </DemoNotice>
>>>>>>> a2528316cb25c39d4d44554f392e8ee3a5a5e16a
      </form>
    </div>
  );
}
