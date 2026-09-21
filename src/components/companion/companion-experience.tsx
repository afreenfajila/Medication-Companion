"use client";

import { useCallback, useEffect, useRef } from "react";
import { CallFooter } from "@/components/ui/call-footer";
import { PhoneShell, ScreenBody } from "@/components/ui/shell";
import { resolveExplanation } from "@/lib/content/explanation";
import { t as translate, type CopyKey } from "@/lib/content/translations";
import { dispatch, useSession } from "@/lib/session/session-store";
import { guardRequestedState, pathForState } from "@/lib/session/state-machine";
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
  const previousState = useRef(session.state);

  // Keep the URL a reflection of the session, never the other way round.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("state");
    if (guardRequestedState(session, requested).redirected) {
      window.history.replaceState(null, "", pathForState(session.state));
    }
  }, [session]);

  // Deterministic "checking" beat, then the guarded RESOLVE_ANALYSIS transition.
  useEffect(() => {
    if (session.state !== "analyzing") return;
    const id = window.setTimeout(() => dispatch({ type: "RESOLVE_ANALYSIS" }), ANALYSIS_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [session.state]);

  // Move focus to the new screen when the state changes (screen-reader friendly).
  useEffect(() => {
    if (previousState.current === session.state) return;
    previousState.current = session.state;
    mainRef.current?.focus({ preventScroll: true });
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [session.state]);

  const explanation = resolveExplanation(session, language);

  let screen: React.ReactNode;
  switch (session.state) {
    case "listening":
      screen = (
        <ListeningScreen
          t={t}
          session={session}
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
          onSubmitDemo={(demoAssetId) =>
            dispatch({ type: "SUBMIT_LABEL", input: { mode: "demo", demoAssetId } })
          }
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
        <ScreenHeader t={t} />
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
