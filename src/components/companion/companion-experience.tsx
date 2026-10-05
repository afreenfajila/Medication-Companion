"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CallFooter } from "@/components/ui/call-footer";
import { CompanionOrb } from "@/components/ui/companion-orb";
import { PhoneShell, ScreenBody } from "@/components/ui/shell";
import { helpResponseSchema, understandCapabilityResponseSchema, understandResponseSchema } from "@/lib/api/schemas";
import { fillRecordFacts, resolveExplanation } from "@/lib/content/explanation";
import { isUnderstandKey } from "@/lib/content/understand-guard";
import { t as translate, type CopyKey } from "@/lib/content/translations";
import { requestLabelAnalysis } from "@/lib/label/analyze-client";
import { clearPendingImage, peekPendingImage } from "@/lib/label/pending-image";
import { dispatch, useSession } from "@/lib/session/session-store";
import { guardRequestedState, pathForState } from "@/lib/session/state-machine";
import { getGeminiSpeechPlayer } from "@/lib/voice/gemini-speech-player";
import { speakableText } from "@/lib/voice/speakable";
import { getVoiceProvider, useVoiceCapabilities } from "@/lib/voice/use-voice";
import { AnalyzingScreen, CameraGuidanceScreen, CameraPermissionScreen, ShowMedicineChoice } from "./camera-screens";
import { CallFeed } from "./call-feed";
import { CompleteScreen } from "./complete-screen";
import { ConfirmScreen } from "./confirm-screen";
import { ExplainScreen } from "./explain-screen";
import { ListeningActions } from "./listening-screen";
import { HelpFlowCard, SafetyScreen } from "./safety-screen";
import { DisclosureFooter, ScreenHeader } from "./screen-chrome";
import { StartScreen } from "./start-screen";
import { useCallFeed } from "./use-call-feed";
import { useVoiceConversation } from "./use-conversation";
import { VoiceBar } from "./voice-bar";

const ANALYSIS_DELAY_MS = 900;
// How long the understanding pass gets to answer something the person said.
// A short "thinking" pause is natural in a conversation, but it is bounded:
// after this, the approved reply is used, so the call never stalls.
const UNDERSTAND_BUDGET_MS = 4000;
// How much of the conversation the understanding pass sees for context.
const UNDERSTAND_HISTORY_TURNS = 6;
// Longest the words are held back waiting for Gemini's voice to start before
// switching to the browser voice instead.
const VOICE_WAIT_MS = 3500;

/**
 * The whole call — from "Call with companion" to "End call" — happens on this
 * one screen. There is no full-screen swap for the camera, confirmation,
 * explanation, or safety steps: a running conversation transcript (`CallFeed`)
 * scrolls above, and whatever the current step needs (camera preview, decision
 * buttons, language control, safety actions...) stays pinned just above the
 * call controls. Only the pre-call landing (`StartScreen`) is a different
 * layout, since a call cannot be "in progress" before it starts.
 *
 * The URL never decides the state: `?state=` is compared to the authoritative
 * session state and rewritten to match, so `/companion?state=explain` without
 * a confirmed match simply shows start.
 */
export function CompanionExperience() {
  const session = useSession();
  const language = session.language;
  const t = useCallback((key: CopyKey) => translate(language, key), [language]);
  const mainRef = useRef<HTMLElement>(null);
  const wasCallActive = useRef(session.callActive);

  // Keep the URL a reflection of the session, never the other way round.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("state");
    if (guardRequestedState(session, requested).redirected) {
      window.history.replaceState(null, "", pathForState(session.state));
    }
  }, [session]);

  // Analysis. Demo/typed labels resolve locally after a short beat. Image labels go
  // to /api/label/analyze (real Claude vision + deterministic matching); any failure
  // routes to the safe fallback, never to an explanation.
  const pendingMode = session.pendingLabel?.mode ?? null;
  const sessionId = session.sessionId;
  useEffect(() => {
    if (session.state !== "analyzing") {
      clearPendingImage();
      return;
    }
    if (pendingMode === "image") {
      const image = peekPendingImage();
      if (!image) {
        dispatch({ type: "ANALYSIS_FAILED" });
        return;
      }
      const controller = new AbortController();
      requestLabelAnalysis(image, sessionId, controller.signal).then((analysis) => {
        if (controller.signal.aborted) return;
        clearPendingImage();
        dispatch(analysis ? { type: "ANALYSIS_RESULT", analysis } : { type: "ANALYSIS_FAILED" });
      });
      return () => controller.abort();
    }
    const id = window.setTimeout(() => dispatch({ type: "RESOLVE_ANALYSIS" }), ANALYSIS_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [session.state, pendingMode, sessionId]);

  // Sending a confirmed help request. "Sent" is shown only when the service
  // answers ok; any failure (including the network) is the failure state.
  const helpSending = session.helpFlow?.stage === "sending" ? session.helpFlow : null;
  useEffect(() => {
    if (!helpSending || helpSending.kind === "clinic") return;
    const controller = new AbortController();
    fetch("/api/help/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, kind: helpSending.kind, reason: helpSending.reason }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        const parsed = helpResponseSchema.safeParse(json);
        dispatch(
          parsed.success && parsed.data.ok
            ? { type: "HELP_RESULT", ok: true, reference: parsed.data.data.reference, contactName: parsed.data.data.contactName }
            : { type: "HELP_RESULT", ok: false },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) dispatch({ type: "HELP_RESULT", ok: false });
      });
    return () => controller.abort();
  }, [helpSending, sessionId]);

  // Move focus once at the big transitions (into/out of a call) — not on every
  // step within it, since that would fight the continuous "one call" feeling.
  useEffect(() => {
    if (wasCallActive.current === session.callActive) return;
    wasCallActive.current = session.callActive;
    mainRef.current?.focus({ preventScroll: true });
  }, [session.callActive]);

  const explanation = resolveExplanation(session, language, session.studyCondition);

  // A reply to something the person SAID (CLAUDE.md § Claude, task 3):
  // Claude reads the message in the context of the conversation and
  // answers it in its own words, e.g. "Did you mean Metformin?" for a misheard
  // name. What it returns is advisory — a reply that passes the server guard,
  // and which of the two in-call doors to offer (AI_REPLY, which the reducer
  // only accepts for the same turn). No gate moves; if it's slow, unavailable
  // or rejected, the router's approved reply is used exactly as before.
  // Asked once per call: with no AI configured the pass is skipped outright,
  // so replies stay instant rather than "thinking" and then falling back.
  const [understandingOn, setUnderstandingOn] = useState<{ call: number; enabled: boolean } | null>(null);
  useEffect(() => {
    if (!session.callActive) return;
    const call = session.callCount;
    const controller = new AbortController();
    fetch("/api/companion/understand", { method: "GET", signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        const parsed = understandCapabilityResponseSchema.safeParse(json);
        setUnderstandingOn({ call, enabled: parsed.success && parsed.data.ok && parsed.data.data.enabled });
      })
      .catch(() => setUnderstandingOn({ call, enabled: false }));
    return () => controller.abort();
  }, [session.callActive, session.callCount]);

  const understandEligible =
    understandingOn?.call === session.callCount &&
    understandingOn.enabled &&
    session.callActive &&
    session.state === "listening" &&
    session.userText !== null &&
    session.replyTo !== null &&
    session.replyTo === session.turnCount &&
    isUnderstandKey(session.assistantKey);
  // Decided once per turn and language, then frozen — never swapped after the
  // fact — so "Repeat" says the same reply again.
  const turnSig = `understand:${session.turnCount}:${session.language}`;
  const [decidedLine, setDecidedLine] = useState<{ sig: string; text: string } | null>(null);
  const decidedTurns = useRef<Set<string>>(new Set());
  const feedRef = useRef<{ speaker: "user" | "companion"; lines: string[] }[]>([]);

  useEffect(() => {
    if (!understandEligible || decidedTurns.current.has(turnSig) || session.userText === null) return;
    const turn = session.turnCount;
    const key = session.assistantKey;
    const message = session.userText;
    const offered = session.contextualActions;
    const canonical = t(key);
    const controller = new AbortController();
    const decide = (text: string) => {
      if (decidedTurns.current.has(turnSig)) return;
      decidedTurns.current.add(turnSig);
      setDecidedLine({ sig: turnSig, text });
    };
    const budget = window.setTimeout(() => {
      decide(canonical); // out of time — the router's approved reply, exactly as before
      controller.abort();
    }, UNDERSTAND_BUDGET_MS);

    // What was said before this message, oldest first. The feed may or may not
    // already hold this turn's own words; they're sent separately, so drop them.
    const past = feedRef.current.map((e) => ({ speaker: e.speaker, text: e.lines.join(" ").slice(0, 600) }));
    if (past.at(-1)?.speaker === "user" && past.at(-1)?.text === message) past.pop();
    const history = past.filter((e) => e.text.trim()).slice(-UNDERSTAND_HISTORY_TURNS);

    fetch("/api/companion/understand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        key,
        language: session.language,
        offered,
        checkingMedicineName: session.nameCheckPending,
        history,
      }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        const parsed = understandResponseSchema.safeParse(json);
        if (!parsed.success || !parsed.data.ok) return;
        const data = parsed.data.data;
        if (data.source === "claude") {
          dispatch({
            type: "AI_REPLY",
            turnCount: turn,
            contextualActions: data.contextualActions,
            checkingMedicineName: data.checkingMedicineName,
          });
        }
        decide(data.text);
      })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(budget);
        decide(canonical); // no-op if a reply was already decided
      });
    return () => {
      window.clearTimeout(budget);
      controller.abort(); // a new turn started (or this one unmounted) — stop waiting on the old one
    };
    // Keyed on the turn: the AI_REPLY this effect dispatches changes the offered
    // actions, and must not start a second request for the same turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [understandEligible, turnSig]);

  const listeningLine = !understandEligible
    ? t(session.assistantKey) // not eligible: immediate, the approved line
    : decidedLine && decidedLine.sig === turnSig
      ? decidedLine.text
      : null; // eligible but not decided yet — say/show nothing for this turn until it is
  const companionThinking = understandEligible && listeningLine === null;

  // Exactly the approved on-screen wording; explanation text only with a confirmed match.
  const spoken = speakableText(session, t, explanation, listeningLine);

  // Like answering a phone call: tapping "Call with companion" IS the user action
  // that starts both ears (recognition) and mouth (synthesis) — no second tap, no
  // visible toggle. Nothing about the mic/speaker runs before that tap, and ending
  // the call stops both; the next call starts the same way, automatically.
  const caps = useVoiceCapabilities();
  const [speaking, setSpeaking] = useState(false);
  // Gemini speech doesn't need browser speechSynthesis support at all; the
  // browser-TTS fallback inside speakNow() already no-ops safely if absent.
  const canSpeak = session.callActive;

  useEffect(() => {
    const offs = [
      getVoiceProvider()?.onSpeakingChange(setSpeaking),
      getGeminiSpeechPlayer()?.onSpeakingChange(setSpeaking),
    ].filter((off): off is () => void => Boolean(off));
    return () => offs.forEach((off) => off());
  }, []);

  // Gemini renders the exact same approved text as audio, so the voice sounds
  // the same for every reviewer regardless of which browser/OS they're on,
  // instead of depending on whatever speech-synthesis voices happen to be
  // installed. It never composes what is said — only the renderer differs.
  // Any failure (no key, network, blocked autoplay) falls back to the
  // browser's own speechSynthesis, which always still works.
  // Resolves once the voice has actually started. Gemini gets VOICE_WAIT_MS to
  // start playing; after that it's dropped for the (instant) browser voice, so
  // the held-back words below never wait long.
  const speakNow = useCallback(async (text: string, lang: typeof language, signal?: AbortSignal, slow = false) => {
    const player = getGeminiSpeechPlayer();
    if (player) {
      let timer = 0;
      const cap = new Promise<false>((r) => (timer = window.setTimeout(() => r(false), VOICE_WAIT_MS)));
      const ok = await Promise.race([player.speak(text, lang, slow), cap]);
      window.clearTimeout(timer);
      if (signal?.aborted) return;
      if (ok) return;
      player.stop();
    }
    getVoiceProvider()?.speak(text, lang, slow);
  }, []);

  // Words and voice arrive together: while this turn's audio is still being
  // fetched, its text (and the choices that go with it) stay hidden behind a
  // "connecting" indicator. No Gemini player → browser speech is instant, no hold.
  const voiceKey = spoken ? `${session.repeatCount}:${language}:${spoken}` : null;
  const [voicedKey, setVoicedKey] = useState<string | null>(null);
  const voiceHeld = canSpeak && voiceKey !== null && voicedKey !== voiceKey && getGeminiSpeechPlayer() !== null;

  // "Repeat slowly" re-says exactly the current approved line (never new text), slower.
  const lastRepeat = useRef(session.repeatCount);
  useEffect(() => {
    const slow = session.repeatCount !== lastRepeat.current;
    lastRepeat.current = session.repeatCount;
    if (!canSpeak || !spoken) {
      getGeminiSpeechPlayer()?.stop();
      getVoiceProvider()?.stopSpeaking();
      return;
    }
    const controller = new AbortController();
    speakNow(spoken, language, controller.signal, slow).then(() => {
      if (!controller.signal.aborted) setVoicedKey(voiceKey);
    });
    return () => {
      controller.abort();
      getGeminiSpeechPlayer()?.stop();
      getVoiceProvider()?.stopSpeaking();
    };
  }, [canSpeak, spoken, language, session.repeatCount, speakNow, voiceKey]);

  const conversation = useVoiceConversation({
    session,
    soundActive: session.callActive,
    speaking: speaking && canSpeak,
    cameraLive: session.cameraMode === "preview",
    spokenText: spoken,
    speakNotice: (text) => canSpeak && speakNow(text, language),
    t,
  });
  const showVoiceBar = session.callActive && caps.recognition && session.state !== "start";

  // The one running transcript for the whole call — see use-call-feed.ts.
  const feed = useCallFeed(session, t, explanation, listeningLine, voiceHeld);
  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);
  const orbState = speaking ? "speaking" : conversation.listening ? "listening" : "idle";

  let pinnedActions: React.ReactNode = null;
  switch (session.state) {
    case "listening":
      pinnedActions = (
        <ListeningActions
          t={t}
          session={session}
          hideChoices={voiceHeld}
          onSend={conversation.submitText}
          onSelectRoute={(route) => dispatch({ type: "SELECT_ROUTE", route })}
        />
      );
      break;
    case "camera-permission":
      // First camera or photo (or typing); the consent question only after "Use camera".
      pinnedActions =
        session.showMethod === "choose" ? (
          <ShowMedicineChoice
            t={t}
            onCamera={() => dispatch({ type: "CHOOSE_CAMERA" })}
            onSubmit={(input) => dispatch({ type: "SUBMIT_LABEL", input })}
          />
        ) : (
          <CameraPermissionScreen
            t={t}
            onGrant={() => dispatch({ type: "CAMERA_CONSENT", granted: true })}
            onDecline={() => dispatch({ type: "CAMERA_CONSENT", granted: false })}
          />
        );
      break;
    case "camera-guidance":
      pinnedActions = (
        <CameraGuidanceScreen
          t={t}
          mode={session.cameraMode ?? "fallback"}
          issue={session.cameraIssue}
          onSubmit={(input) => dispatch({ type: "SUBMIT_LABEL", input })}
          onChooseMedicine={(medicineId) => dispatch({ type: "CHOOSE_MEDICINE", medicineId })}
          onCameraFailed={(issue) => dispatch({ type: "CAMERA_FAILED", issue })}
        />
      );
      break;
    case "analyzing":
      pinnedActions = <AnalyzingScreen t={t} />;
      break;
    case "confirm-match":
      pinnedActions = session.candidate ? (
        <ConfirmScreen
          t={t}
          candidate={session.candidate}
          onDecision={(decision) =>
            session.candidate &&
            dispatch({
              type: "CONFIRM_MATCH",
              candidateId: session.candidate.candidateId,
              decision,
            })
          }
        />
      ) : null;
      break;
    case "explain":
      // Defensive: the reducer cannot enter explain without a confirmed match.
      pinnedActions = explanation ? (
        <ExplainScreen
          t={t}
          language={language}
          step={session.explainStep}
          recordConflict={session.recordConflict}
          onConflictChoice={(choice) => dispatch({ type: "RECORD_CONFLICT_CHOICE", choice })}
          sourceLine={fillRecordFacts(t("recordCheckedOn"), explanation, language)}
          onLabelCheck={(matches) => dispatch({ type: "LABEL_CHECK", matches })}
          onLanguageChange={(l) => dispatch({ type: "SET_LANGUAGE", language: l })}
          onSend={conversation.submitText}
        />
      ) : null;
      break;
    case "safety":
      pinnedActions = (
        <SafetyScreen
          t={t}
          session={session}
          onTryAnother={() => dispatch({ type: "TRY_ANOTHER_LABEL" })}
          onHelp={(kind) => dispatch({ type: "HELP_START", kind })}
          onReturn={() => dispatch({ type: "RETURN_TO_CALL" })}
        />
      );
      break;
    case "complete":
      pinnedActions = <CompleteScreen t={t} onAnother={() => dispatch({ type: "NEW_MEDICINE" })} />;
      break;
    case "start":
    default:
      pinnedActions = null;
  }
  // A help request sits on top of whichever step offered it, until it is done.
  if (session.helpFlow) {
    pinnedActions = (
      <HelpFlowCard
        t={t}
        flow={session.helpFlow}
        onConfirm={(granted) => dispatch({ type: "HELP_CONFIRM", granted })}
        onRetry={() => dispatch({ type: "HELP_RETRY" })}
        onShowNumber={() => dispatch({ type: "HELP_SHOW_NUMBER" })}
        onDismiss={() => dispatch({ type: "HELP_DISMISS" })}
      />
    );
  }

  return (
    <PhoneShell>
      <div lang={language} className="flex min-h-0 flex-1 flex-col">
        <ScreenHeader t={t} />
        <ScreenBody>
          <main
            ref={mainRef}
            tabIndex={-1}
            data-screen={session.state}
            className="flex flex-1 flex-col outline-none"
          >
            {/* Always mounted, so every change is announced: exactly what the
                companion is saying now — replies, confirm prompts, safety status —
                released together with the voice. */}
            <p data-announcer className="sr-only" aria-live="polite" aria-atomic="true">
              {session.callActive && !voiceHeld ? (spoken ?? "") : ""}
            </p>
            {session.state === "start" ? (
              <StartScreen
                t={t}
                language={language}
                onCall={() => dispatch({ type: "CALL_START" })}
                onLanguageChange={(l) => dispatch({ type: "SET_LANGUAGE", language: l })}
              />
            ) : (
              <div className="flex flex-1 flex-col gap-4 py-2">
                <h1 className="sr-only">{t("callWithCompanion")}</h1>
                <div className="flex flex-col items-center gap-1">
                  <CompanionOrb size="sm" state={orbState} />
                </div>
                <CallFeed
                  entries={feed}
                  interim={conversation.interim}
                  thinking={companionThinking || voiceHeld}
                  hideRecord={session.state === "safety"}
                  t={t}
                />
              </div>
            )}
          </main>
        </ScreenBody>
        {pinnedActions && (session.state === "listening" || !voiceHeld) && (
          // Capped and scrollable: a tall step (safety options, an open sample picker)
          // must never be clipped or push the call controls off the screen.
          <div data-pinned className="max-h-[60%] shrink-0 overflow-y-auto border-t border-line bg-canvas px-4 pb-2 pt-3">
            {pinnedActions}
          </div>
        )}
        {showVoiceBar && <VoiceBar view={conversation} t={t} />}
        {/* Without speech recognition, typed "didn't catch that" guidance still needs a place. */}
        {!showVoiceBar && session.callActive && conversation.notice && (
          <p role="status" className="border-t border-line bg-canvas px-4 py-2 text-[13px] leading-snug text-navy-700">
            {t(conversation.notice)}
          </p>
        )}
        {session.callActive && (
          <CallFooter
            labels={{
              group: t("appName"),
              repeat: t("repeat"),
              help: t("getHelp"),
              end: t("endCall"),
            }}
            onRepeat={() => dispatch({ type: "REPEAT" })}
            onHelp={() => dispatch({ type: "GET_HELP" })}
            onEnd={() => dispatch({ type: "END_CALL" })}
          />
        )}
        <DisclosureFooter t={t} />
      </div>
    </PhoneShell>
  );
}
