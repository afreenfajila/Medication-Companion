"use client";

import { CircleHelp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CallFooter } from "@/components/ui/call-footer";
import { CompanionOrb } from "@/components/ui/companion-orb";
import { PhoneShell, ScreenBody } from "@/components/ui/shell";
import { helpResponseSchema, understandCapabilityResponseSchema, understandResponseSchema } from "@/lib/api/schemas";
import { resolveExplanation } from "@/lib/content/explanation";
import { isUnderstandKey } from "@/lib/content/understand-guard";
import { DOSE_SCENARIOS, buildCallbackPayload, callbackRequestId } from "@/lib/dose-check/dose-check";
import { getDoseCallbackService, type CallbackResult } from "@/lib/services/dose-callback";
import { t as translate, type CopyKey } from "@/lib/content/translations";
import { requestLabelAnalysis } from "@/lib/label/analyze-client";
import type { LabelInput } from "@/types/content";
import { clearPendingImage, peekPendingImage } from "@/lib/label/pending-image";
import { dispatch, useSession } from "@/lib/session/session-store";
import { guardRequestedState, pathForState } from "@/lib/session/state-machine";
import { speakableText } from "@/lib/voice/speakable";
import { getVoiceCoordinator, useVoiceCapabilities } from "@/lib/voice/use-voice";
import { CameraGuidanceScreen, LabelActions } from "./camera-screens";
import { CallFeed, useFollowLatest } from "./call-feed";
import { DisclosureFooter, ScreenHeader } from "./screen-chrome";
import { StartScreen } from "./start-screen";
import { labelActionsFor, useCallFeed } from "./use-call-feed";
import { useVoiceConversation } from "./use-conversation";
import { VoiceBar } from "./voice-bar";

const ANALYSIS_DELAY_MS = 900;
/** Longest a new line waits for the voice to start before its words are shown anyway. */
export const VOICE_HOLD_MAX_MS = 3000;
// Longest the (simulated) callback request is awaited before its outcome counts as unknown.
const SUBMIT_TIMEOUT_MS = 15000;
// How long the understanding pass gets to answer something the person said.
// A short "thinking" pause is natural in a conversation, but it is bounded:
// after this, the approved reply is used, so the call never stalls.
const UNDERSTAND_BUDGET_MS = 4000;
// How much of the conversation the understanding pass sees for context.
const UNDERSTAND_HISTORY_TURNS = 6;

/**
 * The whole call — from "Call with companion" to "End call" — happens on this
 * one screen, laid out like an AI voice call (owner decision, 14 October 2026):
 *
 *   header with Help on the right → orb + one status line → the conversation
 *   (the screen's one scroller) → the open camera, only while it is open → one
 *   control row: the message pill (type + send arrow) · mic · End call.
 *
 * Every action is said or typed — the same words either way. The only other
 * buttons are Take photo / Upload inside the companion's message (a photo needs a
 * tap), after a consent yes, and the camera's own capture / flip / close.
 * Medicine confirmation, the label check, the comparison, "check before sending",
 * submission progress and outcomes are all messages in the conversation, answered
 * in words. Only the pre-call landing (`StartScreen`) is a different layout,
 * since a call cannot be "in progress" before it starts.
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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
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

  // Dose check: the reviewed callback request, through the simulated adapter only
  // (no network, no pharmacy). The answer carries its request ID, so the reducer
  // drops it if the call ended or the draft changed meanwhile.
  const doseSubmitting = session.doseCheck?.callback?.status === "submitting" ? session.doseCheck.callback : null;
  const doseScenario = session.doseScenario;
  useEffect(() => {
    if (!doseSubmitting) return;
    let live = true;
    const requestId = callbackRequestId(doseSubmitting.draftId, doseSubmitting.revision);
    const outcome = doseScenario ? DOSE_SCENARIOS[doseScenario].callbackOutcome : "success";
    // No answer in time, or an error, is NOT proof that nothing was delivered: it's "unknown".
    let timer = 0;
    const timeout = new Promise<CallbackResult>((r) => {
      timer = window.setTimeout(() => r({ status: "unknown" }), SUBMIT_TIMEOUT_MS);
    });
    Promise.race([getDoseCallbackService().submit(buildCallbackPayload(doseSubmitting.draft, requestId), { outcome }), timeout])
      .catch((): CallbackResult => ({ status: "unknown" }))
      .then((r) => {
        if (!live) return;
        dispatch({
          type: "DOSE",
          action: { kind: "result", requestId, outcome: r.status, reference: r.status === "submitted" ? r.reference : undefined },
        });
      });
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [doseSubmitting, sessionId, doseScenario]);

  // When the panel changes under the button that was just pressed (Use camera, a help
  // option…), that button disappears and keyboard focus would drop to the page. Only then
  // is focus moved to the new panel; focus that's somewhere else stays put, and
  // transcript updates never move it (PRD §12, design-standard §21).
  const panelKey = `${session.state}|${session.helpFlow?.stage ?? ""}`;
  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    pinnedRef.current?.focus({ preventScroll: true });
  }, [panelKey]);

  // Move focus once at the big transitions (into/out of a call) — not on every
  // step within it, since that would fight the continuous "one call" feeling.
  useEffect(() => {
    if (wasCallActive.current === session.callActive) return;
    wasCallActive.current = session.callActive;
    mainRef.current?.focus({ preventScroll: true });
  }, [session.callActive]);

  // Study mode's deliberately wrong explanation never reaches the dose-change check.
  const explanation = resolveExplanation(session, language, session.doseCheck ? null : session.studyCondition);

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
        via: session.userInputVia,
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
  //
  // All of that is the voice coordinator's: it picks ONE voice for the whole call
  // (ElevenLabs streaming the exact approved text when configured, otherwise the
  // browser's own synthesis, otherwise words only) and one ear (OpenAI realtime
  // transcription, otherwise browser recognition), and drops anything late from
  // an earlier turn or an earlier call.
  const caps = useVoiceCapabilities();
  useEffect(() => {
    const coordinator = getVoiceCoordinator();
    if (session.callActive) coordinator.startCall(language);
    else coordinator.endCall(); // also on mount: a remount never inherits a stale call
    // The call's language is read once, when it connects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.callActive, session.callCount]);

  // Every line the step shows is said through the coordinator, so the spoken and
  // visible words are the same string by construction. "Repeat slowly" re-says
  // exactly the current approved line (never new text), slower.
  const lastRepeat = useRef(session.repeatCount);
  useEffect(() => {
    const slow = session.repeatCount !== lastRepeat.current;
    lastRepeat.current = session.repeatCount;
    const coordinator = getVoiceCoordinator();
    if (!session.callActive) return; // endCall above already silenced everything
    if (!spoken) return coordinator.stopSpeaking(); // a step with no line of its own (e.g. analysing)
    coordinator.speak(spoken, language, { slow, source: "session" });
  }, [session.callActive, spoken, language, session.repeatCount]);

  const conversation = useVoiceConversation({
    session,
    soundActive: session.callActive,
    cameraLive: session.cameraMode === "preview",
    t,
    aiIntent: understandingOn?.call === session.callCount && understandingOn.enabled,
  });

  // The companion's words appear as its voice starts (owner decision, 12 October 2026,
  // amending PRD EN-05): a new line waits while the voice is being prepared, shown as
  // "thinking", and appears when audio actually plays — or after VOICE_HOLD_MAX_MS at
  // most, so a slow or failing voice never hides what was said. With no voice (words
  // only) nothing waits.
  const vs = conversation.status;
  const awaitingVoice =
    session.callActive &&
    (vs.kind === "connecting" ||
      !conversation.voiceKnown || // the call's engines haven't reported yet (the first moment of a call)
      (conversation.voiceOutput &&
        ((vs.kind === "speaking" && !vs.audioStarted) ||
          // Rendered before the line is handed to the voice: it is about to be prepared.
          (spoken !== null && conversation.lastSessionLine !== spoken))));
  const holdKey = `${session.callCount}|${spoken ?? ""}|${conversation.lastSessionLine ?? ""}`;
  const [holdExpired, setHoldExpired] = useState<string | null>(null);
  useEffect(() => {
    if (!awaitingVoice) return;
    const id = window.setTimeout(() => setHoldExpired(holdKey), VOICE_HOLD_MAX_MS);
    return () => window.clearTimeout(id);
  }, [awaitingVoice, holdKey]);
  const voiceHeld = awaitingVoice && holdExpired !== holdKey;
  const inCall = session.callActive && session.state !== "start";
  const speechInput = caps.recognition || conversation.hasInput;
  // The mic button says what it does now: unmute, turn a paused mic back on, talk/send in
  // push-to-talk, or mute.
  const mic = conversation.muted
    ? { label: t("unmute"), act: conversation.toggleMute }
    : conversation.paused
      ? { label: t("micResume"), act: conversation.resume }
      : conversation.pushToTalk
        ? { label: t(conversation.status.kind === "listening" ? "voiceTapToSend" : "voiceTapToTalk"), act: conversation.talk }
        : { label: t("mute"), act: conversation.toggleMute };

  // The one running transcript for the whole call — see use-call-feed.ts.
  const feed = useCallFeed(session, t, explanation, listeningLine, voiceHeld, conversation.notices, conversation.userLines, spoken);
  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);
  const orbState = conversation.speaking ? "speaking" : conversation.listening ? "listening" : "idle";
  const follow = useFollowLatest(scrollerRef);

  // The only panel: the in-app camera, while it is open (opened from Take photo).
  const cameraOpen = session.state === "camera-guidance" && session.cameraMode === "preview";
  const hasPinned = cameraOpen;
  const submitLabel = (input: LabelInput) => dispatch({ type: "SUBMIT_LABEL", input });
  // Take photo / Upload inside the companion's message, only while a photo can be taken.
  const labelWhich = labelActionsFor(session);
  const labelActions = labelWhich ? (
    <LabelActions t={t} which={labelWhich} onTakePhoto={() => dispatch({ type: "OPEN_CAMERA" })} onSubmit={submitLabel} />
  ) : null;

  return (
    <PhoneShell>
      <div lang={language} className="flex min-h-0 flex-1 flex-col">
        <ScreenHeader
          t={t}
          language={language}
          compact={inCall}
          control={
            inCall ? (
              // Help, always there: the same as saying "help" (on the help step, it says it again).
              <button
                type="button"
                onClick={() => dispatch(session.state === "safety" ? { type: "REPEAT" } : { type: "GET_HELP" })}
                className="-my-1.5 flex min-h-12 shrink-0 items-center rounded-pill"
              >
                <span className="inline-flex h-9 items-center gap-1 rounded-pill border-2 border-navy-900 px-3 text-[15px] font-bold text-navy-900 hover:bg-teal-100 max-[379px]:px-2.5">
                  <CircleHelp className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t("help")}
                </span>
              </button>
            ) : undefined
          }
        />
        {inCall && (
          // The calm companion area: the orb and one short status line. Not part of the scroller.
          <div className="flex shrink-0 flex-col items-center gap-0.5 px-4 pb-1 pt-6">
            <CompanionOrb size="xs" state={orbState} />
            {speechInput ? (
              <VoiceBar view={conversation} t={t} />
            ) : (
              // Without speech input, typed "didn't catch that" guidance still needs a place.
              <p role="status" aria-live="polite" className="min-h-[1.5em] text-center text-[15px] leading-snug text-navy-700">
                {conversation.notice ? t(conversation.notice) : ""}
              </p>
            )}
          </div>
        )}
        <ScreenBody ref={scrollerRef}>
          <main
            ref={mainRef}
            tabIndex={-1}
            data-screen={session.state}
            className="flex flex-1 flex-col outline-none"
          >
            {/* Always mounted, so every change is announced: exactly what the
                companion is saying now — replies, confirm prompts, safety status,
                and the fixed voice notices — the same string the voice renders. */}
            <p data-announcer className="sr-only" aria-live="polite" aria-atomic="true">
              {session.callActive && !voiceHeld ? (conversation.lastLine ?? spoken ?? "") : ""}
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
                <CallFeed
                  entries={feed}
                  interim={conversation.interim}
                  thinking={companionThinking || voiceHeld}
                  hideRecord={session.state === "safety"}
                  atBottom={follow.atBottom}
                  placedRef={follow.placed}
                  labelActions={labelActions}
                  t={t}
                />
              </div>
            )}
          </main>
        </ScreenBody>
        {/* Controls never wait for the voice: only the transcript line does. */}
        {hasPinned && (
          // The open camera. Capped and scrollable, so it never pushes the controls off screen.
          <div
            ref={pinnedRef}
            tabIndex={-1}
            data-pinned
            className="no-scrollbar max-h-[60%] shrink-0 overflow-y-auto bg-canvas px-4 pb-2 pt-3 outline-none"
          >
            <CameraGuidanceScreen
              t={t}
              onSubmit={submitLabel}
              onClose={() => dispatch({ type: "CLOSE_CAMERA" })}
              onCameraFailed={(issue) => dispatch({ type: "CAMERA_FAILED", issue })}
            />
          </div>
        )}
        {session.callActive && (
          <CallFooter
            labels={{
              group: t("appName"),
              message: t("typeLabel"),
              placeholder: t("typePlaceholder"),
              send: t("send"),
              mic: mic.label,
              end: t("endCall"),
            }}
            onSend={conversation.submitText}
            muted={conversation.muted}
            micDisabled={!speechInput}
            onMic={mic.act}
            onEnd={() => dispatch({ type: "END_CALL" })}
          />
        )}
        <DisclosureFooter t={t} inCall={session.callActive} />
      </div>
    </PhoneShell>
  );
}
