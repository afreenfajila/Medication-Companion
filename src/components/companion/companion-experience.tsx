"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CallFooter } from "@/components/ui/call-footer";
import { CompanionOrb } from "@/components/ui/companion-orb";
import { PhoneShell, ScreenBody } from "@/components/ui/shell";
import {
  replyRephraseResponseSchema,
  rephraseResponseSchema,
  understandCapabilityResponseSchema,
  understandResponseSchema,
} from "@/lib/api/schemas";
import { resolveExplanation, withRephrasedFlavor } from "@/lib/content/explanation";
import { isConversationalRephraseKey, type RephraseFieldSet } from "@/lib/content/rephrase-guard";
import { isUnderstandKey } from "@/lib/content/understand-guard";
import { t as translate, type CopyKey } from "@/lib/content/translations";
import { requestLabelAnalysis } from "@/lib/label/analyze-client";
import { clearPendingImage, peekPendingImage } from "@/lib/label/pending-image";
import { dispatch, useSession } from "@/lib/session/session-store";
import { guardRequestedState, pathForState } from "@/lib/session/state-machine";
import { getGeminiSpeechPlayer } from "@/lib/voice/gemini-speech-player";
import { speakableText } from "@/lib/voice/speakable";
import { getVoiceProvider, useVoiceCapabilities } from "@/lib/voice/use-voice";
import { AnalyzingScreen, CameraGuidanceScreen, CameraPermissionScreen } from "./camera-screens";
import { CallFeed } from "./call-feed";
import { CompleteScreen } from "./complete-screen";
import { ConfirmScreen } from "./confirm-screen";
import { ExplainScreen } from "./explain-screen";
import { ListeningActions } from "./listening-screen";
import { SafetyScreen } from "./safety-screen";
import { DisclosureFooter, ScreenHeader } from "./screen-chrome";
import { StartScreen } from "./start-screen";
import { useCallFeed } from "./use-call-feed";
import { useVoiceConversation } from "./use-conversation";
import { VoiceBar } from "./voice-bar";

const ANALYSIS_DELAY_MS = 900;
// How long a conversational-line rephrase gets before this turn is spoken with
// the exact approved wording instead — never long enough to feel like a pause
// in what should still feel like a live call.
const LINE_REPHRASE_BUDGET_MS = 800;
// How long the understanding pass gets to answer something the person said.
// Longer than a rephrase — it is working out what they meant, and a short
// "thinking" pause is natural in a conversation — but still bounded: after
// this, the approved reply is used, so the call never stalls.
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

  // Move focus once at the big transitions (into/out of a call) — not on every
  // step within it, since that would fight the continuous "one call" feeling.
  useEffect(() => {
    if (wasCallActive.current === session.callActive) return;
    wasCallActive.current = session.callActive;
    mainRef.current?.focus({ preventScroll: true });
  }, [session.callActive]);

  const explanation = resolveExplanation(session, language);

  // Optional visual-only polish: an English rephrase of the non-dosing "flavour"
  // text (title/purpose/caution/prompt), fetched once per confirmed medicine and
  // validated server-side before it ever reaches here (see rephrase-guard.ts).
  // The instruction, the source line, and everything SPOKEN aloud always use the
  // exact approved text below — this never touches what the companion says.
  const [rephrased, setRephrased] = useState<{ key: string; fields: RephraseFieldSet } | null>(null);
  const candidateId = session.candidate?.candidateId ?? null;
  const rephraseKey = `${language}:${candidateId ?? ""}`;
  const rephrasedFields = rephrased && rephrased.key === rephraseKey ? rephrased.fields : null;

  useEffect(() => {
    if (session.state !== "explain" || language !== "en" || !candidateId) return;
    const key = `${language}:${candidateId}`;
    const controller = new AbortController();
    fetch("/api/companion/rephrase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.sessionId }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        const parsed = rephraseResponseSchema.safeParse(json);
        if (parsed.success && parsed.data.ok) setRephrased({ key, fields: parsed.data.data.fields });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [session.state, language, candidateId, session.sessionId]);

  const displayedExplanation = explanation
    ? withRephrasedFlavor(explanation, language, rephrasedFields)
    : null;

  // Natural wording for the small set of in-call conversational lines that
  // are safe to vary (see CONVERSATIONAL_REPHRASE_KEYS) — "AI should respond
  // naturally", extended from the explanation screen to the live conversation
  // itself. WHICH line is said is still fully deterministic (session.assistantKey,
  // chosen by the reducer); only its wording can change, and only after the
  // same guardrail validation used for the explanation ("rephrase-guard.ts").
  //
  // Never adds a delay a reviewer would notice: this turn's line is decided
  // ONCE, within a short budget, and then frozen — never swapped after the
  // fact, so the companion never says the approved line and then, moments
  // later, a naturalised one on top of it. If Claude doesn't answer (or fails
  // validation) within the budget, the exact approved line is used, exactly
  // as it always was.
  //
  // A reply to something the person SAID goes further (CLAUDE.md § Claude,
  // task 3): Claude reads the message in the context of the conversation and
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
  const listeningEligible =
    !understandEligible &&
    session.callActive &&
    session.state === "listening" &&
    language === "en" &&
    isConversationalRephraseKey(session.assistantKey);
  // Includes turnCount so a repeated reply is decided afresh each turn — the
  // same sentence twice in a row is exactly what the rephrase is there to avoid.
  // An understood reply is decided once per turn, so "Repeat" says it again.
  const turnSig = understandEligible
    ? `understand:${session.turnCount}:${session.language}`
    : `${session.assistantKey}:${session.repeatCount}:${session.turnCount}`;
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
        window.clearTimeout(budget);
        const parsed = understandResponseSchema.safeParse(json);
        if (!parsed.success || !parsed.data.ok) return decide(canonical);
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
      .catch(() => {
        window.clearTimeout(budget);
        decide(canonical);
      });
    return () => {
      window.clearTimeout(budget);
      controller.abort(); // a new turn started (or this one unmounted) — stop waiting on the old one
    };
    // Keyed on the turn: the AI_REPLY this effect dispatches changes the offered
    // actions, and must not start a second request for the same turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [understandEligible, turnSig]);

  useEffect(() => {
    if (!listeningEligible || decidedTurns.current.has(turnSig)) return;
    const canonical = t(session.assistantKey);
    const controller = new AbortController();
    const decide = (text: string) => {
      if (decidedTurns.current.has(turnSig)) return;
      decidedTurns.current.add(turnSig);
      setDecidedLine({ sig: turnSig, text });
    };
    const budget = window.setTimeout(() => {
      decide(canonical); // out of time — use the approved line, exactly as before
      controller.abort();
    }, LINE_REPHRASE_BUDGET_MS);

    fetch("/api/companion/reply-rephrase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: session.assistantKey }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        window.clearTimeout(budget);
        const parsed = replyRephraseResponseSchema.safeParse(json);
        decide(parsed.success && parsed.data.ok ? parsed.data.data.text : canonical);
      })
      .catch(() => {
        window.clearTimeout(budget);
        decide(canonical);
      });
    return () => {
      window.clearTimeout(budget);
      controller.abort(); // a new turn started (or this one unmounted) — stop waiting on the old one
    };
  }, [listeningEligible, turnSig, session.assistantKey, t]);

  const listeningLine = !listeningEligible && !understandEligible
    ? t(session.assistantKey) // not eligible: immediate, exactly as before
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
  const feed = useCallFeed(session, t, displayedExplanation, listeningLine, voiceHeld);
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
      pinnedActions = (
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
      pinnedActions = displayedExplanation ? (
        <ExplainScreen
          t={t}
          language={language}
          step={session.explainStep}
          recordConflict={session.recordConflict}
          onConflictChoice={(choice) => dispatch({ type: "RECORD_CONFLICT_CHOICE", choice })}
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
          onDemoAction={(action) => dispatch({ type: "HELP_ACTION", action })}
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
                <CallFeed entries={feed} interim={conversation.interim} thinking={companionThinking || voiceHeld} t={t} />
              </div>
            )}
          </main>
        </ScreenBody>
        {pinnedActions && (session.state === "listening" || !voiceHeld) && (
          <div className="border-t border-line bg-canvas px-4 pb-2 pt-3">{pinnedActions}</div>
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
