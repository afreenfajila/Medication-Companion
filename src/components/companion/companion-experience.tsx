"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CallFooter } from "@/components/ui/call-footer";
import { SoundToggle } from "@/components/ui/sound-toggle";
import { PhoneShell, ScreenBody } from "@/components/ui/shell";
import { resolveExplanation } from "@/lib/content/explanation";
import { requestLabelAnalysis } from "@/lib/label/analyze-client";
import { clearPendingImage, peekPendingImage } from "@/lib/label/pending-image";
import { t as translate, type CopyKey } from "@/lib/content/translations";
import { dispatch, useSession } from "@/lib/session/session-store";
import { guardRequestedState, pathForState } from "@/lib/session/state-machine";
import { speakableText } from "@/lib/voice/speakable";
import { getVoiceProvider, useVoiceCapabilities } from "@/lib/voice/use-voice";
import { AnalyzingScreen, CameraGuidanceScreen, CameraPermissionScreen } from "./camera-screens";
import { CompleteScreen } from "./complete-screen";
import { ConfirmScreen } from "./confirm-screen";
import { ExplainScreen } from "./explain-screen";
import { ListeningScreen } from "./listening-screen";
import { SafetyScreen } from "./safety-screen";
import { DisclosureFooter, ScreenHeader } from "./screen-chrome";
import { StartScreen } from "./start-screen";

const ANALYSIS_DELAY_MS = 900;

/**
 * Renders whatever the session state machine says. The URL never decides:
 * `?state=` is compared to the authoritative state and rewritten to match, so
 * `/companion?state=explain` without a confirmed match simply shows start.
 */
export function CompanionExperience() {
  const session = useSession();
  const language = session.language;
  const t = useCallback((key: CopyKey) => translate(language, key), [language]);
  const mainRef = useRef<HTMLElement>(null);

  // Spoken replies: OFF until the user turns sound on, and only during an active call.
  const caps = useVoiceCapabilities();
  const [soundOn, setSoundOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const sound = soundOn && session.callActive && caps.synthesis;
  const previousState = useRef(session.state);

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

  // Move focus to the new screen when the state changes (screen-reader friendly).
  useEffect(() => {
    if (previousState.current === session.state) return;
    previousState.current = session.state;
    mainRef.current?.focus({ preventScroll: true });
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [session.state]);

  const explanation = resolveExplanation(session, language);

  // Exactly the approved on-screen wording; explanation text only with a confirmed match.
  const spoken = speakableText(session, t, explanation);

  useEffect(() => {
    const provider = getVoiceProvider();
    if (!provider) return;
    return provider.onSpeakingChange(setSpeaking);
  }, []);

  useEffect(() => {
    const provider = getVoiceProvider();
    if (!provider) return;
    if (!sound || !spoken) {
      provider.stopSpeaking();
      return;
    }
    provider.speak(spoken, language);
    return () => provider.stopSpeaking();
  }, [sound, spoken, language, session.repeatCount]);

  let screen: React.ReactNode;
  switch (session.state) {
    case "listening":
      screen = (
        <ListeningScreen
          t={t}
          session={session}
          speaking={speaking}
          onSend={(text) => dispatch({ type: "USER_MESSAGE", text })}
          onSelectRoute={(route) => dispatch({ type: "SELECT_ROUTE", route })}
        />
      );
      break;
    case "camera-permission":
      screen = (
        <CameraPermissionScreen
          t={t}
          onGrant={() => dispatch({ type: "CAMERA_CONSENT", granted: true })}
          onDecline={() => dispatch({ type: "CAMERA_CONSENT", granted: false })}
        />
      );
      break;
    case "camera-guidance":
      screen = (
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
      screen = <AnalyzingScreen t={t} />;
      break;
    case "confirm-match":
      screen = session.candidate ? (
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
      screen = explanation ? (
        <ExplainScreen
          t={t}
          language={language}
          explanation={explanation}
          step={session.explainStep}
          repeatCount={session.repeatCount}
          onLanguageChange={(l) => dispatch({ type: "SET_LANGUAGE", language: l })}
          onStep={(direction) => dispatch({ type: "EXPLAIN_STEP", direction })}
          onUnderstood={() => dispatch({ type: "UNDERSTOOD" })}
        />
      ) : null;
      break;
    case "safety":
      screen = (
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
      screen = <CompleteScreen t={t} onAnother={() => dispatch({ type: "NEW_MEDICINE" })} />;
      break;
    case "start":
    default:
      screen = (
        <StartScreen
          t={t}
          language={language}
          onCall={() => dispatch({ type: "CALL_START" })}
          onLanguageChange={(l) => dispatch({ type: "SET_LANGUAGE", language: l })}
        />
      );
  }

  return (
    <PhoneShell>
      <div lang={language} className="flex min-h-0 flex-1 flex-col">
        <ScreenHeader
          t={t}
          control={
            session.callActive && caps.synthesis ? (
              <SoundToggle
                on={sound}
                onToggle={() => setSoundOn((v) => !v)}
                labels={{ on: t("soundOn"), off: t("soundOff"), group: t("soundLabel") }}
              />
            ) : undefined
          }
        />
        <ScreenBody>
          <main
            ref={mainRef}
            tabIndex={-1}
            data-screen={session.state}
            className="flex flex-1 flex-col outline-none"
          >
            {screen}
          </main>
        </ScreenBody>
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
