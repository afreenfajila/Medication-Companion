"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CopyKey } from "@/lib/content/translations";
import { dispatch } from "@/lib/session/session-store";
import type { Session } from "@/lib/session/state-machine";
import { runVoiceAction } from "@/lib/voice/actions";
import { interpretUtterance } from "@/lib/voice/commands";
import { VoiceError, type VoiceErrorCode } from "@/lib/voice/provider";
import { getVoiceProvider, useVoiceCapabilities } from "@/lib/voice/use-voice";

const LISTEN_DELAY_MS = 350; // let the speaker finish before the mic opens (no echo)
const MAX_SILENT_TURNS = 3; // then pause politely instead of listening forever

const ERROR_KEY: Record<VoiceErrorCode, CopyKey> = {
  "permission-denied": "voiceDenied",
  "no-speech": "voiceNoSpeech",
  "no-microphone": "voiceNoMic",
  network: "voiceNetwork",
  unsupported: "voiceUnsupported",
  unknown: "voiceUnknown",
};

export type ConversationView = {
  /** Mic is open right now. */
  listening: boolean;
  /** Companion is speaking right now. */
  speaking: boolean;
  /** Live words while the person is talking. */
  interim: string;
  /** User muted the mic, or the loop paused after silence/an error. */
  micOn: boolean;
  /** Plain-language status/error (copy key), or null. */
  notice: CopyKey | null;
  toggleMic: () => void;
};

/**
 * Turns the browser voice provider into a phone-call style conversation:
 *
 *   companion speaks  →  mic opens by itself  →  person answers  →  companion acts/speaks  →  …
 *
 * It only starts once a call is active (the "Call with companion" tap is the user
 * action) and never listens while the companion is speaking. Everything heard goes
 * through `interpretUtterance` (deterministic; safety classifier first) and becomes
 * the same events the buttons dispatch — so every gate in the reducer still applies.
 */
export function useVoiceConversation(opts: {
  session: Session;
  soundActive: boolean;
  speaking: boolean;
  cameraLive: boolean;
  speakNotice: (text: string) => void;
  t: (key: CopyKey) => string;
}): ConversationView {
  const { session, soundActive, speaking, speakNotice, t } = opts;
  const caps = useVoiceCapabilities();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState<CopyKey | null>(null);
  const silentTurns = useRef(0);
  // A medicine name said aloud without its strength yet ("It's Metformin"),
  // remembered only long enough for the follow-up turn ("500 milligrams") to
  // complete it — see commands.ts's camera-guidance case.
  const pendingSpokenName = useRef<string | null>(null);
  useEffect(() => {
    if (session.state !== "camera-guidance") pendingSpokenName.current = null;
  }, [session.state]);

  // Latest values for the long-lived provider callbacks.
  const latest = useRef({ session, speaking, speakNotice, t, cameraLive: opts.cameraLive, soundActive });
  useEffect(() => {
    latest.current = { session, speaking, speakNotice, t, cameraLive: opts.cameraLive, soundActive };
  });

  // `soundActive` is the explicit "Start voice call" tap — the mic is never
  // opened, and no permission prompt appears, before that user action.
  const enabled = session.callActive && caps.recognition && soundActive;
  const active = enabled && !muted && !paused && session.state !== "analyzing";

  const handleTranscript = useCallback((text: string) => {
    const { session: s, speaking: isSpeaking, speakNotice: say, t: tr, soundActive: soundOn } = latest.current;
    if (isSpeaking) return; // never react to the companion's own voice
    setInterim("");
    silentTurns.current = 0;
    setNotice(null);

    const intent = interpretUtterance(text, {
      state: s.state,
      contextualActions: s.contextualActions,
      candidateId: s.candidate?.candidateId ?? null,
      explainStep: s.explainStep,
      cameraLive: latest.current.cameraLive,
      pendingSpokenMedicineName: pendingSpokenName.current,
    });
    if (intent.kind === "event") {
      pendingSpokenName.current = null;
      dispatch(intent.event);
    } else if (intent.kind === "message") {
      pendingSpokenName.current = null;
      dispatch({ type: "USER_MESSAGE", text: text.slice(0, 300) });
    } else if (intent.kind === "ui") {
      runVoiceAction(intent.action);
    } else if (intent.kind === "need-strength") {
      pendingSpokenName.current = intent.medicineName;
      setNotice("askStrengthForSpokenLabel");
      if (soundOn) say(tr("askStrengthForSpokenLabel"));
    } else {
      setNotice("voiceDidntCatch");
      if (soundOn) say(tr("voiceDidntCatch"));
    }
  }, []);

  // Provider subscriptions.
  useEffect(() => {
    const provider = getVoiceProvider();
    if (!provider) return;
    const offs = [
      provider.onListeningChange(setListening),
      provider.onInterim(setInterim),
      provider.onTranscript(handleTranscript),
      provider.onError((error) => {
        setInterim("");
        const code = error instanceof VoiceError ? error.code : "unknown";
        if (code === "no-speech") {
          silentTurns.current += 1;
          if (silentTurns.current >= MAX_SILENT_TURNS) {
            setPaused(true);
            setNotice("voicePaused");
          }
          return; // otherwise stay quiet and simply listen again
        }
        setPaused(true); // permission/mic/network problems: stop retrying, keep typing usable
        setNotice(ERROR_KEY[code]);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [handleTranscript]);

  // The listen loop: whenever it is the person's turn, open the mic.
  useEffect(() => {
    const provider = getVoiceProvider();
    if (!provider) return;
    if (!active) {
      provider.stopListening();
      return;
    }
    if (speaking || listening) return;
    const id = window.setTimeout(() => provider.startListening(session.language), LISTEN_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [active, speaking, listening, session.language, session.state, session.assistantKey, session.explainStep]);

  const toggleMic = useCallback(() => {
    if (muted || paused) {
      silentTurns.current = 0;
      setNotice(null);
      setMuted(false);
      setPaused(false);
    } else {
      setMuted(true);
      setInterim("");
      getVoiceProvider()?.stopListening();
    }
  }, [muted, paused]);

  return {
    listening,
    speaking,
    interim,
    micOn: enabled && !muted && !paused,
    notice,
    toggleMic,
  };
}
