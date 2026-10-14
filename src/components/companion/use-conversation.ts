"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { t as translate, type CopyKey } from "@/lib/content/translations";
import { dispatch, sessionStore } from "@/lib/session/session-store";
import type { Session, SessionEvent } from "@/lib/session/state-machine";
import { intentResponseSchema, labelWordingResponseSchema } from "@/lib/api/schemas";
import { looksLikeLabelWording } from "@/lib/dose-check/dose-check";
import { careContacts } from "@/lib/content/seed-record";
import { cleanLabelWording } from "@/lib/dose-check/label-wording";
import { routeMessage } from "@/lib/session/intent";
import { isSafeCompanionReply } from "@/lib/content/understand-guard";
import { canRetryLabel } from "@/lib/session/state-machine";
import { runCapture } from "@/lib/voice/actions";
import { fillRecordFacts, resolveExplanation } from "@/lib/content/explanation";
import { callActions, interpretUtterance, isBrief, isGateAnswer, isQuestion, spokenActions, type CommandContext, type SpokenAction } from "@/lib/voice/commands";
import { helpLine } from "@/lib/content/help-lines";
import type { AssistantTurn, VoiceStatus } from "@/lib/voice/coordinator";
import { detectInputLanguage } from "@/lib/voice/detect-language";
import { isLikelySelfEcho } from "@/lib/voice/echo";
import type { VoiceErrorCode } from "@/lib/voice/provider";
import { getVoiceCoordinator, useVoiceCapabilities } from "@/lib/voice/use-voice";

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
    cameraMode?: Session["cameraMode"];
    cameraIssue?: Session["cameraIssue"];
    doseCheck?: Session["doseCheck"];
  },
  /** The words were heard clearly and were a question: don't claim they weren't caught. */
  question = false,
): CopyKey {
  if (session.helpFlow?.stage === "confirm") return "unclearHelpConfirm";
  if (session.state === "camera-guidance") {
    if (session.cameraMode === "ready") return "unclearCameraReady";
    if (session.cameraMode === "fallback") return session.cameraIssue ? "unclearCameraUpload" : "unclearCameraFallback";
  }
  if (session.state === "explain") {
    if (session.doseCheck) return question ? "doseQuestionUnclear" : "doseUnclear";
    if (session.recordConflict) return "unclearRecordConflict";
    if (session.explainStep === 1) return question ? "unclearLabelCheckQuestion" : "unclearLabelCheck";
    if (session.explainStep === 2) return question ? "unclearExplainLastQuestion" : "unclearExplainLast";
    return question ? "unclearExplainQuestion" : "unclearExplain";
  }
  return UNCLEAR_GUIDANCE[session.state] ?? "voiceDidntCatch";
}

/**
 * The plain version of a decision's question, for a second miss: one clear question, with
 * "not sure" always an answer (never nudging towards yes). Null when the step isn't a decision.
 */
export function plainQuestion(s: Session, t: (key: CopyKey) => string): string | null {
  const ask = (question: string) => t("crispYesNo").replace("{question}", question);
  if (s.helpFlow?.stage === "confirm") return ask(helpLine(t, s.helpFlow));
  if (s.helpFlow?.stage === "review") return t("reviewSayToSend");
  if (s.helpFlow) return null;
  if (s.state === "confirm-match" && s.candidate) return ask(t("confirmQuestion"));
  if (s.state === "explain" && !s.doseCheck && !s.recordConflict && s.explainStep === 1) return ask(t("labelCheckPrompt"));
  if (s.state === "explain" && !s.doseCheck && !s.recordConflict && s.explainStep === 2) return t("explainWhichOne");
  return null;
}

/** Identifies the decision on screen, so an answer that arrives after it changed is ignored. */
function screenSignature(s: Session): string {
  const d = s.doseCheck;
  return [s.callCount, s.state, s.helpFlow?.stage, s.explainStep, s.recordConflict, s.cameraMode, d?.step, d?.offer, d?.callback?.status, d?.labelRevision].join("|");
}

type IntentAnswer =
  | { outcome: "action"; action: string }
  | { outcome: "unclear" }
  | { outcome: "reply"; reply: string }
  | { outcome: "none" };

/** Lines that end "What else can I help with?": a plain "no" then finishes the call. */
const ANYTHING_ELSE_KEYS: ReadonlySet<string> = new Set(["doseBackToCall", "doseBackToCallMatch", "doseBackToCallIncomplete"]);

type LabelWordingAnswer = { outcome: "wording"; wording: string } | { outcome: "no-wording" } | { outcome: "none" };

/**
 * The label wording she read, picked out by meaning (POST /api/companion/label-wording): her own
 * words only, checked on the server and again in the reducer. "none" on any problem: the app's
 * own clean-up is used instead.
 */
async function requestLabelWording(utterance: string, language: Session["language"]): Promise<LabelWordingAnswer> {
  try {
    const res = await fetch("/api/companion/label-wording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance, language }),
      signal: AbortSignal.timeout(6000),
    });
    const parsed = labelWordingResponseSchema.safeParse(await res.json());
    if (!parsed.success || !parsed.data.ok) return { outcome: "none" };
    const d = parsed.data.data;
    if (d.outcome === "wording" && d.wording) return { outcome: "wording", wording: d.wording };
    return d.outcome === "no-wording" ? { outcome: "no-wording" } : { outcome: "none" };
  } catch {
    return { outcome: "none" };
  }
}

/** Where the person is in the call, in plain words, for the meaning-match. Never record content. */
export function screenContext(s: Pick<Session, "state" | "explainStep" | "doseCheck" | "helpFlow">): string {
  // At a review the person alone sends, by saying "send": the AI must say so, never that it can't send.
  const review = "checking a summary before it is sent: it is sent only when they say send the request, so tell them that";
  if (s.helpFlow) return s.helpFlow.stage === "review" ? review : "being asked about a help request";
  switch (s.state) {
    case "explain":
      if (s.doseCheck?.callback?.status === "reviewing") return review;
      return s.doseCheck ? "comparing their medicine label with their pharmacy record" : `hearing their pharmacy record explained, part ${s.explainStep + 1} of 3`;
    case "camera-permission":
      return "being asked if the companion may see their medicine label with the camera or a photo";
    case "camera-guidance":
      return "showing their medicine label";
    case "confirm-match":
      return "checking a possible medicine match: once they confirm it, the companion explains what their record says";
    case "safety":
      return "on the help screen, choosing who could help";
    case "complete":
      return "finishing the call";
    default:
      return "on a call with the companion";
  }
}

/**
 * What the words meant on this step (POST /api/companion/intent): an on-screen action, "unclear"
 * (ask them to repeat), a short guarded reply, or "none" (no AI, slow, or any error).
 */
async function requestIntent(utterance: string, s: Session, actions: SpokenAction[]): Promise<IntentAnswer> {
  try {
    const res = await fetch("/api/companion/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        utterance,
        language: s.language,
        context: screenContext(s),
        actions: actions.map(({ id, description }) => ({ id, description })),
      }),
      signal: AbortSignal.timeout(7000),
    });
    const parsed = intentResponseSchema.safeParse(await res.json());
    if (!parsed.success || !parsed.data.ok) return { outcome: "none" };
    const d = parsed.data.data;
    if (d.outcome === "unclear") return { outcome: "unclear" };
    // Checked again here: an AI-worded line is shown and said only if it passes the guard.
    if (d.outcome === "reply" && d.reply && isSafeCompanionReply(d.reply, s.language)) return { outcome: "reply", reply: d.reply };
    if (d.action) return { outcome: "action", action: d.action };
    return { outcome: "none" };
  } catch {
    return { outcome: "none" };
  }
}

export type UserLine = { id: number; call: number; text: string };

export type ConversationView = {
  /** The one voice status (coordinator-owned): orb, caption and mic all read this. */
  status: VoiceStatus;
  /** Mic is open right now. */
  listening: boolean;
  /** Companion is speaking right now. */
  speaking: boolean;
  /** Live words while the person is talking. */
  interim: string;
  /** The mic is open for turns: a call with voice input, not muted, not paused. */
  micOn: boolean;
  /** The person muted the mic (the Mute/Unmute call control). Nothing they say is sent or answered. */
  muted: boolean;
  /** Listening stopped by itself after silence or a mic/network problem; "Try again" resumes it. */
  paused: boolean;
  /** The voice stopped mid-line; true until the companion speaks again (Repeat is offered meanwhile). */
  voiceStopped: boolean;
  /** Just unmuted: the status line says so once, until the voice status next changes. */
  justUnmuted: boolean;
  /** Sticky for the rest of the call: the streaming voice was replaced (browser voice) or lost (words only). */
  voiceNotice: CopyKey | null;
  /** This call has a voice (streaming or browser); false when it is words only. */
  voiceOutput: boolean;
  /** The voice engines have reported for this call (until then, whether there is a voice is unknown). */
  voiceKnown: boolean;
  /** The last step line (not a notice) handed to the voice this call. */
  lastSessionLine: string | null;
  /**
   * Her turns (said or typed) that didn't become a free-form message the session records —
   * "yes", "next", "use the camera", a misheard phrase — so the chat shows every turn.
   */
  userLines: UserLine[];
  toggleMute: () => void;
  resume: () => void;
  /** Some speech input exists for this call (browser or realtime). */
  hasInput: boolean;
  /** Speech goes to the realtime transcription service rather than the browser's engine. */
  realtimeInput: boolean;
  /** No automatic endpointing (no local VAD): the mic button starts a turn and sends it. */
  pushToTalk: boolean;
  /** The mic stays open while the companion speaks, and confirmed speech can interrupt it. */
  duplex: boolean;
  autoInterrupt: boolean;
  toggleAutoInterrupt: () => void;
  /** A mic problem or pause (copy key), shown in the status strip until fixed; or null. */
  notice: CopyKey | null;
  /** Fixed lines the companion said outside the step's own text, oldest first — shown in the feed. */
  notices: AssistantTurn[];
  /** The last line the companion said (any source), for the live region. */
  lastLine: string | null;
  /** Push-to-talk only: tap to talk, tap again to send. */
  talk: () => void;
  /** Typed input: handled exactly like a spoken turn. */
  submitText: (text: string) => void;
};

/**
 * Turns the voice coordinator into a phone-call style conversation:
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
  cameraLive: boolean;
  t: (key: CopyKey) => string;
  /** The AI meaning-match is available this call (an Anthropic key is configured). */
  aiIntent?: boolean;
}): ConversationView {
  const { session, soundActive, t } = opts;
  const aiIntent = opts.aiIntent ?? false;
  const caps = useVoiceCapabilities();
  const coordinator = getVoiceCoordinator();
  const { status, lastAssistant, capabilities } = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
  const listening = status.kind === "listening";
  const speaking = status.kind === "speaking";
  const hasInput = status.kind === "connecting" || (capabilities.input !== null && capabilities.input !== "text-only");
  const realtimeInput = capabilities.input === "openai-realtime";
  const pushToTalk = hasInput && status.kind !== "connecting" && !capabilities.handsFree;
  const [interim, setInterim] = useState("");
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voiceStopped, setVoiceStopped] = useState(false);
  const [justUnmuted, setJustUnmuted] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<CopyKey | null>(null);
  // From the coordinator's snapshot, not its event: a line handed over before this hook
  // subscribed (a screen that mounts mid-call) still counts.
  const [lastSessionLine, setLastSessionLine] = useState<string | null>(lastAssistant?.source === "session" ? lastAssistant.text : null);
  const [seenAssistant, setSeenAssistant] = useState(lastAssistant);
  if (seenAssistant !== lastAssistant) {
    setSeenAssistant(lastAssistant);
    if (lastAssistant?.source === "session") setLastSessionLine(lastAssistant.text);
  }
  // Adjusted while rendering (React's pattern for state derived from a change), not in an effect.
  const [seenStatus, setSeenStatus] = useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    setJustUnmuted(false);
    if (status.kind === "interrupted" && status.reason === "playback") setVoiceStopped(true);
    else if (status.kind === "speaking") setVoiceStopped(false);
  }
  const [notices, setNotices] = useState<AssistantTurn[]>([]);
  const [userLines, setUserLines] = useState<UserLine[]>([]);
  const userLineSeq = useRef(0);
  // Mic problems and the silence pause: shown in the status strip (not spoken) until fixed.
  const [notice, setNotice] = useState<CopyKey | null>(null);
  const silentTurns = useRef(0);
  // A medicine name said aloud without its strength yet ("It's Metformin"),
  // remembered only long enough for the follow-up turn ("500 milligrams") to
  // complete it — see commands.ts's camera-guidance case.
  const pendingSpokenName = useRef<string | null>(null);
  /** The screen the last "didn't follow" line was said on: a second miss there gets different words. */
  const lastFallback = useRef<string | null>(null);
  // Every call starts unmuted and listening (the coordinator resets its own gate too).
  const [seenCall, setSeenCall] = useState(session.callCount);
  if (seenCall !== session.callCount) {
    setSeenCall(session.callCount);
    setMuted(false);
    setPaused(false);
    setVoiceStopped(false);
    setJustUnmuted(false);
    setVoiceNotice(null);
    setLastSessionLine(null);
    setUserLines([]);
    // The last call's notices too: the chat starts again for a new call, so anything still held
    // here would be replayed into it as if just said.
    setNotices([]);
  }
  useEffect(() => {
    if (session.state !== "camera-guidance") pendingSpokenName.current = null;
  }, [session.state]);

  // Latest values for the long-lived coordinator callbacks.
  const latest = useRef({ session, speaking, t, cameraLive: opts.cameraLive, soundActive, aiIntent, muted, paused });
  useEffect(() => {
    latest.current = { session, speaking, t, cameraLive: opts.cameraLive, soundActive, aiIntent, muted, paused };
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
    if (speaking) {
      speechEndedAt.current = Number.POSITIVE_INFINITY; // still talking
    } else if (speechEndedAt.current === Number.POSITIVE_INFINITY) {
      speechEndedAt.current = Date.now();
    }
  }, [speaking]);

  // `soundActive` is the explicit "Start voice call" tap — the mic is never
  // opened, and no permission prompt appears, before that user action.
  const enabled = session.callActive && (caps.recognition || hasInput) && soundActive;
  const active = enabled && !muted && !paused && session.state !== "analyzing";

  /**
   * Acts on what the person said OR typed — the same interpreter for both, so
   * "next", "I understand" or "下一步" work either way. Replies follow the
   * language they used: Chinese input switches to Chinese, English to English.
   */
  const interpretText = useCallback((text: string, confidence?: number, via: "typed" | "voice" = "voice") => {
    let s = latest.current.session;
    setNotice(null);
    // Her words go in the chat whatever they lead to (a new call starts a new list).
    const showHerWords = () => {
      userLineSeq.current += 1;
      const line: UserLine = { id: userLineSeq.current, call: s.callCount, text: text.trim().slice(0, 300) };
      setUserLines((prev) => [...prev.filter((l) => l.call === line.call), line]);
    };

    // A fixed line said outside the step's own text. It goes through the coordinator
    // like every other line, so it is visible (feed + live region) before it is
    // voiced, and the echo guard knows about it (see onAssistantTurn below).
    const sayNotice = (key: CopyKey) => {
      // In the language they just used. Record facts ({instruction}, {verifiedDate}) only
      // ever come from the confirmed record; without one, a line that needs them isn't said.
      // The callback number is only ever the one in the summary on screen.
      const line = translate(s.language, key)
        .replace("{callbackNumber}", s.doseCheck?.callback?.draft.callbackContact ?? "")
        .replace("{pharmacyPhone}", careContacts.pharmacy.phone);
      const needsRecord = /\{(instruction|verifiedDate)\}/.test(line);
      const explanation = needsRecord ? resolveExplanation(s, s.language) : null;
      if (needsRecord && !explanation) return; // record facts only ever come from a confirmed record
      coordinator.speak(explanation ? fillRecordFacts(line, explanation, s.language) : line, s.language, { source: "notice" });
    };
    const question = isQuestion(text);

    // The recogniser wasn't sure what it heard: ask again before classifying
    // (or switching language on) a guess. Exactly 0 means "not provided".
    if (confidence !== undefined && confidence > 0 && confidence < MIN_SPEECH_CONFIDENCE) {
      // Not shown: a guess (say, "chest pain") shown but not acted on would look ignored.
      sayNotice("didntCatch");
      return;
    }

    const detected = detectInputLanguage(text);
    if (detected && detected !== s.language) {
      dispatch({ type: "SET_LANGUAGE", language: detected });
      s = { ...s, language: detected };
    }

    const ctx: CommandContext = {
      state: s.state,
      nameCheckPending: s.nameCheckPending,
      contextualActions: s.contextualActions,
      candidateId: s.candidate?.candidateId ?? null,
      explainStep: s.explainStep,
      recordConflict: s.recordConflict,
      anythingElse: s.state === "listening" && ANYTHING_ELSE_KEYS.has(s.assistantKey),
      helpStage: s.helpFlow?.stage ?? null,
      cameraMode: s.cameraMode,
      cameraIssue: s.cameraIssue,
      doseCheck: s.doseCheck,
      cameraLive: latest.current.cameraLive,
      pendingSpokenMedicineName: pendingSpokenName.current,
      safetyReason: s.safetyReason,
      labelRouteSelected: s.labelRouteSelected,
      canRetryLabel: canRetryLabel(s),
    };
    const intent = interpretUtterance(text, ctx);
    // Reading the box her own way ("It says… two? I think two."): on the label step, anything that
    // isn't already plain wording is first read for its meaning — her own words only, never one
    // added — before it is said back. Plain wording is said back at once; without the AI, the app's
    // own clean-up does it. Anything the safety rules route elsewhere never comes here.
    const labelStep = intent.kind === "message" && s.state === "explain" && s.doseCheck?.step === "label";
    const routed = labelStep ? routeMessage(text, { matchConfirmed: true, explaining: true }) : null;
    const plainWording = (() => {
      const c = cleanLabelWording(text);
      return c.wording === text.trim() && !c.unsure && looksLikeLabelWording(text);
    })();
    const labelByMeaning =
      labelStep && latest.current.aiIntent && !routed?.safetyReason && routed?.intent !== "urgent-risk" && !plainWording;
    if (intent.kind === "message" && !labelByMeaning) {
      pendingSpokenName.current = null;
      const turns = sessionStore.getSnapshot().turnCount;
      dispatch({ type: "USER_MESSAGE", text: text.slice(0, 300), via });
      // The session records a message as her turn; if this step didn't take it, show it here.
      if (sessionStore.getSnapshot().turnCount === turns) showHerWords();
      return;
    }
    if (!labelByMeaning) showHerWords(); // an answer or command ("yes", "next", "use the camera"): still her turn in the chat

    // "Didn't follow" — but never the same words twice in a row on the same screen. The second
    // time, a decision gets one plain question; anything else gets different words and a way out.
    const sayFallback = (first: CopyKey, at: Session) => {
      const sig = screenSignature(at);
      if (lastFallback.current !== sig) {
        lastFallback.current = sig;
        return sayNotice(first);
      }
      lastFallback.current = null;
      const plain = plainQuestion(at, (k) => translate(at.language, k));
      if (plain) return void coordinator.speak(plain, at.language, { source: "notice" });
      sayNotice("stillNotSure");
    };
    const act = (event: SessionEvent) => {
      pendingSpokenName.current = null;
      lastFallback.current = null;
      dispatch(event);
    };

    // A sentence (or words the fixed phrases don't know): work out what she meant before doing
    // anything. The step's actions plus the call's own (repeat, end, help), in any order; never a
    // gate. If the AI is off or can't tell, the fixed rules' reading (if any) is used, then guidance.
    const byMeaning = (rulesSaid: SessionEvent | null, at: Session) => {
      const fallback = (now: Session) => (rulesSaid ? act(rulesSaid) : sayFallback(unclearGuidanceKey(now, question), now));
      const own = latest.current.aiIntent ? spokenActions(ctx) : [];
      const actions = own.length > 0 || latest.current.aiIntent ? [...own, ...callActions(ctx).filter((g) => !own.some((a) => a.event?.type === g.event?.type))] : [];
      if (!latest.current.aiIntent || actions.length === 0) return fallback(at);
      const asked = screenSignature(at);
      void requestIntent(text, at, actions).then((answer) => {
        const now = latest.current.session;
        if (screenSignature(now) !== asked) return; // the screen moved on meanwhile: the answer is stale
        if (answer.outcome === "action") {
          // Matched by id, never by position: the person may ask for any action, in any order.
          const chosen = actions.find((a) => a.id === answer.action);
          if (chosen?.say) {
            lastFallback.current = null;
            return sayNotice(chosen.say); // a fixed line (e.g. the record's own instruction), never AI words
          }
          if (chosen?.event) return act(chosen.event);
        }
        if (answer.outcome === "unclear") return sayFallback("didntCatch", now); // gibberish or cut off
        if (answer.outcome === "reply") {
          // Understood, but not an action here: a natural, guarded reply (visible, then voiced).
          lastFallback.current = null;
          return void coordinator.speak(answer.reply, now.language, { source: "notice" });
        }
        fallback(now);
      });
    };

    if (labelByMeaning) {
      const asked = screenSignature(s);
      void requestLabelWording(text.slice(0, 300), s.language).then((answer) => {
        const now = latest.current.session;
        if (screenSignature(now) !== asked) return; // she moved on meanwhile
        // She didn't read any wording ("the print is tiny", a question): what did she mean?
        if (answer.outcome === "no-wording") {
          showHerWords();
          return byMeaning(null, now);
        }
        // Her turn, with the wording picked out (re-checked by the reducer), or the app's own clean-up.
        pendingSpokenName.current = null;
        dispatch({ type: "USER_MESSAGE", text: text.slice(0, 300), via, labelWording: answer.outcome === "wording" ? answer.wording : undefined });
      });
      return;
    }

    // A decision only she can make, or a short clear command: act at once on the fixed rules.
    // "Can I show you my label?" on the help step is unambiguous too: it goes straight to the label question.
    const showLabel = intent.kind === "event" && intent.event.type === "RETURN_TO_CALL" && intent.event.showLabel === true;
    if (intent.kind === "event" && (isGateAnswer(intent.event) || isBrief(text) || showLabel)) {
      act(intent.event);
    } else if (intent.kind === "ui") {
      if (intent.action === "capture") return void runCapture();
      if (intent.action === "listen-again") {
        // Typed (the mic is off): the same as tapping the mic button.
        if (latest.current.muted) {
          coordinator.setMuted(false);
          setMuted(false);
          setJustUnmuted(true);
          return;
        }
        if (latest.current.paused) {
          silentTurns.current = 0;
          setNotice(null);
          setPaused(false);
          return;
        }
        return byMeaning(null, s);
      }
      // The interrupt setting: only on a call where the mic stays open while the companion talks.
      if (!coordinator.getSnapshot().capabilities.duplex) return sayNotice("voiceInterruptUnavailable");
      const on = intent.action === "interrupt-on";
      coordinator.setAutoInterrupt(on);
      sayNotice(on ? "voiceInterruptOn" : "voiceInterruptOff");
    } else if (intent.kind === "need-strength") {
      pendingSpokenName.current = intent.medicineName;
      sayNotice("askStrengthForSpokenLabel");
    } else if (intent.kind === "reply") {
      pendingSpokenName.current = null;
      sayNotice(intent.key);
    } else {
      byMeaning(intent.kind === "event" ? intent.event : null, s);
    }
  }, [coordinator]);

  const handleTranscript = useCallback(
    (text: string, confidence?: number) => {
      if (latest.current.speaking) return; // never react to the companion's own voice
      // ...nor to the tail of it, arriving from a mic that was open while it spoke.
      if (
        micOverlappedSpeech.current &&
        isLikelySelfEcho(text, lastSpoken.current, Date.now() - speechEndedAt.current)
      ) {
        micOverlappedSpeech.current = false;
        return; // silently: nothing was said, so there is nothing to answer
      }
      silentTurns.current = 0;
      interpretText(text, confidence);
    },
    [interpretText],
  );

  // Coordinator subscriptions: it already dropped anything from an old turn or an old call.
  useEffect(() => {
    const offs = [
      coordinator.onInterim(setInterim),
      coordinator.onUserTurn((turn) => handleTranscript(turn.text, turn.confidence)),
      coordinator.onAssistantTurn((turn) => {
        lastSpoken.current = turn.text; // the echo guard must know every line, notices included
        // A new call (new callId) starts a new transcript.
        if (turn.source === "notice") setNotices((prev) => [...prev.filter((n) => n.id.callId === turn.id.callId), turn]);
      }),
      coordinator.onFallback((f) => {
        if (f.kind !== "output") return;
        // One notice for the rest of the call (and announced once through the status line).
        const key: CopyKey = f.to === "browser" ? "voiceChanged" : "voiceLost";
        setVoiceNotice(key);
        setNotice(key);
      }),
      coordinator.onError((code) => {
        if (code === "no-speech") {
          silentTurns.current += 1;
          coordinator.setSlowEndpoint(true); // give a slower speaker a longer pause from now on
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
  }, [coordinator, handleTranscript]);

  // The listen loop: whenever it is the person's turn, open the mic. The coordinator
  // ignores the request while the companion talks, while connecting, or while a
  // committed turn still awaits its transcript; this only decides when to ask.
  // In push-to-talk (no local VAD to end a turn) the mic button does it instead.
  useEffect(() => {
    if (!active) {
      coordinator.stopListening();
      return;
    }
    if (pushToTalk || status.kind === "speaking" || status.kind === "listening" || status.kind === "connecting") return;
    const id = window.setTimeout(() => coordinator.startListening(session.language), LISTEN_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [coordinator, active, pushToTalk, status, session.language, session.state, session.assistantKey, session.explainStep]);

  const talk = useCallback(() => {
    // Tap to talk, tap again to send. Typing is always there too.
    if (!pushToTalk || muted) return;
    if (status.kind === "listening") coordinator.commitListening();
    else if (active) {
      if (status.kind === "speaking") coordinator.interrupt();
      coordinator.startListening(session.language);
    }
  }, [coordinator, muted, pushToTalk, status.kind, active, session.language]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    coordinator.setMuted(next); // the gate: no turn, no commit, no barge-in while muted
    setMuted(next);
    setJustUnmuted(!next);
  }, [coordinator, muted]);

  const resume = useCallback(() => {
    silentTurns.current = 0;
    setNotice(null);
    setPaused(false);
  }, []);

  const toggleAutoInterrupt = useCallback(() => coordinator.setAutoInterrupt(!capabilities.autoInterrupt), [coordinator, capabilities.autoInterrupt]);

  return {
    status,
    listening,
    speaking,
    interim,
    micOn: enabled && !muted && !paused,
    muted,
    paused,
    voiceStopped,
    justUnmuted,
    voiceNotice,
    voiceOutput: capabilities.output !== null && capabilities.output !== "text-only",
    voiceKnown: capabilities.output !== null,
    lastSessionLine,
    userLines,
    toggleMute,
    resume,
    hasInput,
    realtimeInput,
    pushToTalk,
    duplex: capabilities.duplex,
    autoInterrupt: capabilities.autoInterrupt,
    toggleAutoInterrupt,
    notice,
    notices,
    lastLine: lastAssistant?.text ?? null,
    talk,
    // Typed input is exactly what she wrote — never treated as possibly misheard.
    // Typing while the companion talks interrupts it (the words stay on screen).
    submitText: (text: string) => {
      if (coordinator.status.kind === "speaking") coordinator.interrupt();
      interpretText(text, undefined, "typed");
    },
  };
}
