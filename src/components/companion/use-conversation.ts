"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t as translate, type CopyKey } from "@/lib/content/translations";
import { dispatch } from "@/lib/session/session-store";
import type { Session } from "@/lib/session/state-machine";
import { runCapture } from "@/lib/voice/actions";
import { interpretUtterance } from "@/lib/voice/commands";
import { detectInputLanguage } from "@/lib/voice/detect-language";
import { isLikelySelfEcho } from "@/lib/voice/echo";
import { VoiceError, type VoiceErrorCode } from "@/lib/voice/provider";
import { getVoiceProvider, useVoiceCapabilities } from "@/lib/voice/use-voice";

const LISTEN_DELAY_MS = 350; // let the speaker finish before the mic opens (no echo)
const MAX_SILENT_TURNS = 3; // then pause politely instead of listening forever
// ponytail: starting threshold from the spec; tune against real older-adult speech in testing.
export const MIN_SPEECH_CONFIDENCE = 0.5;

const ERROR_KEY: Record<VoiceErrorCode, CopyKey> = {
  "permission-denied": "voiceDenied",
  "no-speech": "voiceNoSpeech",
  "no-microphone": "voiceNoMic",
  network: "voiceNetwork",
  unsupported: "voiceUnsupported",
  unknown: "voiceUnknown",
};

/**
 * What to say when an utterance couldn't be interpreted.
 *
 * Outside the open conversation, every state is waiting for one of a small,
 * known set of answers — so a bare "I didn't catch that" strands the person at
 * exactly the moment the companion knows most about what comes next. Each state
 * therefore re-prompts with its own step: acknowledge, then say what can be
 * said here. (`listening` keeps the generic line: there the person can say
 * anything, so there is no specific step to name.)
 *
 * These are fixed approved lines naming this screen's own controls — never a
 * model's idea of what to do next, and they open no gate.
 */
const UNCLEAR_GUIDANCE: Partial<Record<Session["state"], CopyKey>> = {
  "camera-permission": "unclearCameraPermission",
  "camera-guidance": "unclearCameraGuidance",
  "confirm-match": "unclearConfirmMatch",
  safety: "unclearSafety",
  complete: "unclearComplete",
};

export function unclearGuidanceKey(
  session: Pick<Session, "state" | "explainStep"> & {
    recordConflict?: boolean;
    helpFlow?: Session["helpFlow"];
    showMethod?: Session["showMethod"];
    doseCheck?: Session["doseCheck"];
  },
): CopyKey {
  if (session.helpFlow?.stage === "confirm") return "unclearHelpConfirm";
  if (session.state === "camera-permission" && session.showMethod === "choose") return "unclearShowMedicine";
  if (session.state === "explain") {
    if (session.doseCheck) return "doseUnclear";
    if (session.recordConflict) return "unclearRecordConflict";
    if (session.explainStep === 1) return "unclearLabelCheck";
    return session.explainStep === 2 ? "unclearExplainLast" : "unclearExplain";
  }
  return UNCLEAR_GUIDANCE[session.state] ?? "voiceDidntCatch";
}

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
  /** Typed input: handled exactly like a spoken turn. */
  submitText: (text: string) => void;
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
  /** Exactly what the companion is saying/just said, for echo suppression. */
  spokenText: string | null;
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

  // What the companion last said, and when it stopped — the echo guard's inputs.
  const lastSpoken = useRef<string | null>(null);
  const speechEndedAt = useRef(0);
  /**
   * True while the CURRENT recognition session is one that was open while the
   * companion was talking — the only kind that can have heard it. Cleared as
   * soon as a fresh mic opens after speech, so that a person repeating a word
   * the prompt suggested ("...for example, 500 milligrams" → "500 milligrams")
   * is never mistaken for an echo.
   */
  const micOverlappedSpeech = useRef(false);
  const wasListening = useRef(false);
  useEffect(() => {
    if (speaking) {
      // Any recognition still in flight may have picked this up.
      micOverlappedSpeech.current = true;
    } else if (listening && !wasListening.current) {
      // A mic that opened after the companion finished cannot have heard it.
      micOverlappedSpeech.current = false;
    }
    wasListening.current = listening;
  }, [speaking, listening]);
  useEffect(() => {
    if (opts.spokenText) lastSpoken.current = opts.spokenText;
  }, [opts.spokenText]);
  useEffect(() => {
    if (speaking) {
      speechEndedAt.current = Number.POSITIVE_INFINITY; // still talking
    } else if (speechEndedAt.current === Number.POSITIVE_INFINITY) {
      speechEndedAt.current = Date.now();
    }
  }, [speaking]);

  // `soundActive` is the explicit "Start voice call" tap — the mic is never
  // opened, and no permission prompt appears, before that user action.
  const enabled = session.callActive && caps.recognition && soundActive;
  const active = enabled && !muted && !paused && session.state !== "analyzing";

  /**
   * Acts on what the person said OR typed — the same interpreter for both, so
   * "next", "I understand" or "下一步" work either way. Replies follow the
   * language they used: Chinese input switches to Chinese, English to English.
   */
  const interpretText = useCallback((text: string, confidence?: number, via: "typed" | "voice" = "voice") => {
    const { speakNotice: say, soundActive: soundOn } = latest.current;
    let s = latest.current.session;
    setNotice(null);

    // Notices are spoken from in here rather than from the session's line, so
    // they must be remembered for the echo guard too — otherwise the companion
    // can hear its own "I didn't quite catch that" and try to answer it.
    const sayNotice = (key: CopyKey) => {
      setNotice(key);
      if (!soundOn) return;
      const line = translate(s.language, key); // in the language they just used
      lastSpoken.current = line;
      say(line);
    };

    // The recogniser wasn't sure what it heard: ask again before classifying
    // (or switching language on) a guess. Exactly 0 means "not provided".
    if (confidence !== undefined && confidence > 0 && confidence < MIN_SPEECH_CONFIDENCE) {
      sayNotice("didntCatch");
      return;
    }

    const detected = detectInputLanguage(text);
    if (detected && detected !== s.language) {
      dispatch({ type: "SET_LANGUAGE", language: detected });
      s = { ...s, language: detected };
    }

    const intent = interpretUtterance(text, {
      state: s.state,
      nameCheckPending: s.nameCheckPending,
      contextualActions: s.contextualActions,
      candidateId: s.candidate?.candidateId ?? null,
      explainStep: s.explainStep,
      recordConflict: s.recordConflict,
      helpStage: s.helpFlow?.stage ?? null,
      showMethod: s.showMethod,
      doseCheck: s.doseCheck,
      cameraLive: latest.current.cameraLive,
      pendingSpokenMedicineName: pendingSpokenName.current,
    });
    if (intent.kind === "event") {
      pendingSpokenName.current = null;
      dispatch(intent.event);
    } else if (intent.kind === "message") {
      pendingSpokenName.current = null;
      dispatch({ type: "USER_MESSAGE", text: text.slice(0, 300), via });
    } else if (intent.kind === "ui") {
      runCapture();
    } else if (intent.kind === "need-strength") {
      pendingSpokenName.current = intent.medicineName;
      sayNotice("askStrengthForSpokenLabel");
    } else {
      sayNotice(unclearGuidanceKey(s));
    }
  }, []);

  const handleTranscript = useCallback(
    (text: string, confidence?: number) => {
      if (latest.current.speaking) return; // never react to the companion's own voice
      // ...nor to the tail of it, arriving from a mic that was open while it spoke.
      if (
        micOverlappedSpeech.current &&
        isLikelySelfEcho(text, lastSpoken.current, Date.now() - speechEndedAt.current)
      ) {
        micOverlappedSpeech.current = false;
        setInterim("");
        return; // silently: nothing was said, so there is nothing to answer
      }
      setInterim("");
      silentTurns.current = 0;
      interpretText(text, confidence);
    },
    [interpretText],
  );

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
    // Close the mic while the companion talks. Without this the mic stayed open
    // through the companion's own speech and recognition delivered it as a user
    // turn ("Mei Ling says: hello" after the greeting) — the in-handler
    // `speaking` check can't catch that, because the final transcript usually
    // lands just after speech ends.
    if (speaking) {
      provider.stopListening();
      return;
    }
    if (listening) return;
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
    // Typed input is exactly what she wrote — never treated as possibly misheard.
    submitText: (text: string) => interpretText(text, undefined, "typed"),
  };
}
