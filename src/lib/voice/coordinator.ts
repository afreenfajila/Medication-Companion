import type { UiLanguage } from "@/types/content";
import {
  sameIdentity,
  TERMINAL_SPEECH_FAILURES,
  type AudioCapture,
  type BargeInDetector,
  type BargeInEvent,
  type SpeechAdapter,
  type SpeechAdapterId,
  type SpeechEvent,
  type SpeechFailureReason,
  type TranscriptionAdapter,
  type TranscriptionAdapterId,
  type TranscriptionEvent,
  type TurnIdentity,
} from "./adapters";
import { BrowserSpeechAdapter, BrowserTranscriptionAdapter } from "./browser-adapters";
import { BARGE_IN_DEFAULTS } from "./barge-in";
import type { SpeechVoiceProvider, VoiceErrorCode } from "./provider";
import { diag } from "./voice-diagnostics";

/**
 * One owner for the mechanics of voice during a call: which engines are in use,
 * whether the mic is open, what the current status is, and which late events
 * still count.
 *
 * It is NOT a second application state machine. It never routes meaning, never
 * classifies, never confirms and never touches the session: it emits typed
 * turns (`UserVoiceTurn`, `AssistantTurn`) and a single `VoiceStatus`, and the
 * conversation layer decides what they mean (the same way typed input does).
 *
 * Each open mic is one *turn* with an id, so a final that arrives after the
 * turn was closed — a stopped call, a restarted call, the companion started
 * talking, a second final for the same turn — is dropped instead of becoming a
 * submission. Only a committed final transcript ever becomes a `UserVoiceTurn`;
 * interim words are display-only.
 *
 * Full duplex: with realtime input the microphone stays open while the
 * companion speaks, but nothing is sent for transcription until the local
 * detector confirms (loudness AND speech probability) that a person is talking.
 * Then playback stops, the pre-roll is flushed so the first words are kept, and
 * a new user turn begins.
 */

export type { TurnIdentity } from "./adapters";
export type AdapterId = SpeechAdapterId;
export type InputAdapterId = TranscriptionAdapterId;

export type VoiceStatus =
  | { kind: "idle"; callId: number }
  /** Engines are being connected (and the mic opened) for a new call. */
  | { kind: "connecting"; callId: number }
  /** `afterInterrupt`: this mic turn began by interrupting the companion ("I heard you — go ahead."). */
  | { kind: "listening"; callId: number; turnId: number; afterInterrupt?: boolean }
  /** A final utterance was committed (or is awaited) and nothing has happened since. */
  | { kind: "processing"; callId: number; turnId: number }
  /** `audioStarted: false` is "preparing voice"; `micOpen` is the full-duplex mic (barge-in armed). */
  | { kind: "speaking"; callId: number; turnId: number; adapter: AdapterId; audioStarted: boolean; micOpen: boolean }
  /** Playback stopped before the line finished. The words stay visible; Repeat says them again. */
  | { kind: "interrupted"; callId: number; turnId: number; reason: "user" | "playback" }
  /** No recognition and no voice at all: the call works by text only. */
  | { kind: "unavailable"; callId: number }
  | { kind: "error"; callId: number; code: VoiceErrorCode };

export type UserVoiceTurn = { id: TurnIdentity; text: string; confidence?: number };

/** One approved line: the same string is shown and spoken, by construction. */
export type AssistantTurn = {
  id: TurnIdentity;
  text: string;
  /** `session`: the current step's own line. `notice`: a fixed voice/help line said outside it ("didn't catch that"). */
  source: "session" | "notice";
  slow: boolean;
};

export type VoiceCapabilitiesSnapshot = {
  input: InputAdapterId | null;
  output: AdapterId | null;
  /** The mic can end a turn by itself (local VAD endpointing); otherwise push-to-talk. */
  handsFree: boolean;
  /** The mic stays open while the companion speaks and confirmed speech interrupts it. */
  duplex: boolean;
  autoInterrupt: boolean;
};

export type VoiceSnapshot = { status: VoiceStatus; lastAssistant: AssistantTurn | null; capabilities: VoiceCapabilitiesSnapshot };

export type VoiceFallback = {
  kind: "input" | "output";
  from: InputAdapterId | AdapterId;
  to: InputAdapterId | AdapterId;
  /** Why (output only): an internal code, never shown raw. */
  reason?: SpeechFailureReason;
};

/** What the coordinator needs from the page; read at each call start, so tests and bootstraps can swap them. */
export type VoiceDeps = {
  /** The browser's own engines (the explicitly degraded fallback). */
  provider: () => SpeechVoiceProvider | null;
  /** Realtime transcription (OpenAI). Null when not configured. */
  transcription?: () => TranscriptionAdapter | null;
  /** Streaming speech (ElevenLabs). Null when not configured. */
  speech?: () => SpeechAdapter | null;
  /** PCM capture for the realtime path and the detector. */
  capture?: () => AudioCapture | null;
  detector?: () => BargeInDetector | null;
};

/** How long an open hands-free mic waits for confirmed speech before the turn counts as silence. */
export const NO_SPEECH_MS = 8000;
/** Audio kept from before the interruption was confirmed, so the first words are not cut. */
export const PRE_ROLL_MS = 300;
/** After the companion's audio ends, speech confirmed this soon is treated as its own tail. */
export const ECHO_GUARD_MS = 200;

type Listener<T> = (value: T) => void;

type ActiveCall = {
  callId: number;
  language: UiLanguage;
  provider: SpeechVoiceProvider | null;
  input: TranscriptionAdapter | null;
  output: SpeechAdapter | null;
  capture: AudioCapture | null;
  detector: BargeInDetector | null;
  inputId: InputAdapterId;
  outputId: AdapterId;
  handsFree: boolean;
  duplex: boolean;
  connected: boolean;
  /** The streaming voice has been heard this call: from then on it is never swapped for another voice. */
  outputHeard: boolean;
  unbind: () => void;
};

export class VoiceSessionCoordinator {
  private call: ActiveCall | null = null;
  private callSeq = 0;
  private turnSeq = 0;
  private autoInterrupt = true;
  /** The person muted the mic: no turn opens, nothing is committed, and talking interrupts nothing. */
  private muted = false;
  /** When the last turn was committed, for the stt-final timing (diagnostics only). */
  private committedAt = 0;
  private snapshot: VoiceSnapshot = { status: { kind: "idle", callId: 0 }, lastAssistant: null, capabilities: this.noCapabilities() };
  /** The mic turn that may still deliver a transcript, if any. */
  private listeningTurn: TurnIdentity | null = null;
  /** True once the detector confirmed speech inside the open mic turn. */
  private heardSpeech = false;
  /** The assistant turn whose playback events still count, if any. */
  private speakingTurn: TurnIdentity | null = null;
  /** A line asked for while still connecting; said as soon as the engines are ready. */
  private pendingSpeak: { turn: AssistantTurn; language: UiLanguage } | null = null;
  private noSpeechTimer: ReturnType<typeof setTimeout> | undefined;
  private lastFrameAt = 0;
  private playbackEndedAt = Number.NEGATIVE_INFINITY;
  private slowEndpoint = false;

  private readonly snapshotListeners = new Set<Listener<VoiceSnapshot>>();
  private readonly interimListeners = new Set<Listener<string>>();
  private readonly userTurnListeners = new Set<Listener<UserVoiceTurn>>();
  private readonly assistantTurnListeners = new Set<Listener<AssistantTurn>>();
  private readonly errorListeners = new Set<Listener<VoiceErrorCode>>();
  private readonly fallbackListeners = new Set<Listener<VoiceFallback>>();
  private readonly diagnosticListeners = new Set<Listener<Extract<BargeInEvent, { type: "diagnostic" }>>>();

  constructor(private readonly deps: VoiceDeps) {}

  // ---- Reading ---------------------------------------------------------------

  get status(): VoiceStatus {
    return this.snapshot.status;
  }

  /** The voice bound to the current call (`null` when no call is active). */
  get outputAdapter(): AdapterId | null {
    return this.call?.outputId ?? null;
  }

  get inputAdapter(): InputAdapterId | null {
    return this.call?.inputId ?? null;
  }

  /** `useSyncExternalStore`-shaped: one immutable object, replaced on every change. */
  readonly getSnapshot = (): VoiceSnapshot => this.snapshot;
  readonly subscribe = (cb: Listener<VoiceSnapshot>): (() => void) => this.add(this.snapshotListeners, cb);

  onInterim = (cb: Listener<string>) => this.add(this.interimListeners, cb);
  onUserTurn = (cb: Listener<UserVoiceTurn>) => this.add(this.userTurnListeners, cb);
  onAssistantTurn = (cb: Listener<AssistantTurn>) => this.add(this.assistantTurnListeners, cb);
  onError = (cb: Listener<VoiceErrorCode>) => this.add(this.errorListeners, cb);
  /** An engine was replaced for the rest of the call (one-way). */
  onFallback = (cb: Listener<VoiceFallback>) => this.add(this.fallbackListeners, cb);
  /** Redacted detector numbers (development only). */
  onDiagnostic = (cb: Listener<Extract<BargeInEvent, { type: "diagnostic" }>>) => this.add(this.diagnosticListeners, cb);

  // ---- Call lifecycle ---------------------------------------------------------

  /**
   * A new call: new identity, engines re-read and connected, the voice chosen
   * afresh. With only the browser engines everything is synchronous; with
   * realtime engines the call is `connecting` until they answer, and a line asked
   * for meanwhile is shown at once and said when they are ready.
   */
  startCall(language: UiLanguage = "en"): void {
    if (this.call) this.endCall();
    this.muted = false; // every call starts unmuted
    const callId = ++this.callSeq;
    const provider = this.deps.provider();
    const transcription = this.deps.transcription?.() ?? null;
    const speech = this.deps.speech?.() ?? null;
    const capture = this.deps.capture?.() ?? null;
    const detector = this.deps.detector?.() ?? null;

    const call: ActiveCall = {
      callId,
      language,
      provider,
      input: null,
      output: null,
      capture: transcription ? capture : null,
      detector: transcription && capture ? detector : null,
      inputId: "text-only",
      outputId: "text-only",
      handsFree: false,
      duplex: false,
      connected: false,
      outputHeard: false,
      unbind: () => undefined,
    };
    this.call = call;
    diag("call-start", { realtimeInput: transcription !== null, streamingVoice: speech !== null });

    if (!transcription && !speech) {
      // Browser engines only: the Phase 1 path, synchronous.
      this.bindBrowser(call, provider?.capabilities.recognition ? "input" : null, provider?.capabilities.synthesis ? "output" : null);
      this.finishConnect(call);
      return;
    }

    this.setSnapshot({ status: { kind: "connecting", callId }, lastAssistant: null, capabilities: this.noCapabilities() });
    void this.connect(call, transcription, speech);
  }

  private async connect(call: ActiveCall, transcription: TranscriptionAdapter | null, speech: SpeechAdapter | null): Promise<void> {
    const offs: Array<() => void> = [];
    let input: TranscriptionAdapter | null = null;
    let vad = false;

    if (transcription && call.capture) {
      const mic = await call.capture.start();
      if (this.call !== call) return;
      if (mic.ok) {
        if (call.detector) {
          vad = (await call.detector.start({ callId: call.callId })).vad;
          if (this.call !== call) return;
        }
        if (await transcription.connect({ callId: call.callId, language: call.language })) input = transcription;
        if (this.call !== call) return;
      } else {
        call.capture.stop();
        call.capture = null;
        call.detector = null;
        if (mic.code === "permission-denied" || mic.code === "no-microphone") this.emit(this.errorListeners, mic.code);
      }
    }
    if (!input && call.capture) {
      call.capture.stop();
      call.capture = null;
      call.detector?.stop();
      call.detector = null;
    }

    let output: SpeechAdapter | null = null;
    if (speech && (await speech.connect({ callId: call.callId, language: call.language }))) output = speech;
    if (this.call !== call) return;
    // A configured voice this account can't use (not merely unconfigured) is announced once, before any audio.
    const outputLost = !output && speech?.unavailableReason && speech.unavailableReason !== "unconfigured" ? speech.unavailableReason : null;

    if (input) {
      call.input = input;
      call.inputId = input.id;
      call.handsFree = vad;
      call.duplex = vad;
      offs.push(input.subscribe((e) => this.onTranscription(call, e)));
      if (call.capture) {
        offs.push(
          call.capture.onFrame((frame) => {
            if (this.call !== call) return;
            this.lastFrameAt = frame.at;
            call.detector?.process(frame);
            if (this.listeningTurn && this.listeningTurn.callId === call.callId) input.appendAudio(frame);
          }),
        );
      }
      if (call.detector) {
        call.detector.setEndpointSilenceMs(this.slowEndpoint ? BARGE_IN_DEFAULTS.slowEndpointSilenceMs : BARGE_IN_DEFAULTS.endpointSilenceMs);
        offs.push(call.detector.subscribe((e) => this.onBargeIn(call, e)));
      }
    }
    if (output) {
      call.output = output;
      call.outputId = output.id;
      offs.push(output.subscribe((e) => this.onSpeech(call, e)));
    }
    const prev = call.unbind;
    call.unbind = () => {
      prev();
      offs.forEach((off) => off());
    };
    this.bindBrowser(call, input ? null : call.provider?.capabilities.recognition ? "input" : null, output ? null : call.provider?.capabilities.synthesis ? "output" : null);
    diag("input-ready", { engine: call.inputId, handsFree: call.handsFree });
    diag("output-ready", { engine: call.outputId });
    if (outputLost) {
      diag("fallback", { engine: call.outputId, reason: outputLost });
      this.emit(this.fallbackListeners, { kind: "output", from: "elevenlabs", to: call.outputId, reason: outputLost });
    }
    this.finishConnect(call);
  }

  /** Wraps the browser engines in the same adapter contracts, for whichever side has no realtime engine. */
  private bindBrowser(call: ActiveCall, input: "input" | null, output: "output" | null): void {
    const provider = call.provider;
    if (!provider) return;
    const offs: Array<() => void> = [];
    if (input) {
      const adapter = new BrowserTranscriptionAdapter(provider);
      void adapter.connect({ callId: call.callId }); // synchronous inside for the browser engine
      call.input = adapter;
      call.inputId = "browser";
      call.handsFree = true; // the browser engine endpoints by itself
      offs.push(adapter.subscribe((e) => this.onTranscription(call, e)));
    }
    if (output) {
      const adapter = new BrowserSpeechAdapter(provider);
      void adapter.connect();
      call.output = adapter;
      call.outputId = "browser";
      offs.push(adapter.subscribe((e) => this.onSpeech(call, e)));
    }
    const prev = call.unbind;
    call.unbind = () => {
      prev();
      offs.forEach((off) => off());
    };
  }

  private finishConnect(call: ActiveCall): void {
    call.connected = true;
    const unavailable = call.inputId === "text-only" && call.outputId === "text-only";
    this.setSnapshot({
      status: unavailable ? { kind: "unavailable", callId: call.callId } : { kind: "idle", callId: call.callId },
      lastAssistant: this.snapshot.lastAssistant,
      capabilities: this.capabilitiesOf(call),
    });
    const pending = this.pendingSpeak;
    this.pendingSpeak = null;
    if (pending && pending.turn.id.callId === call.callId) this.play(call, pending.turn, pending.language);
  }

  /** Ends the call: stops mic and voice, releases every engine, and retires every outstanding turn id. */
  endCall(): void {
    const call = this.call;
    this.clearNoSpeechTimer();
    this.listeningTurn = null;
    this.heardSpeech = false;
    this.speakingTurn = null;
    this.pendingSpeak = null;
    if (call) {
      this.call = null;
      call.unbind();
      call.detector?.stop();
      call.capture?.stop();
      void call.input?.disconnect();
      void call.output?.disconnect();
      call.provider?.stopSpeaking();
      call.provider?.stopListening();
    }
    if (call) diag("call-end", { heard: call.outputHeard });
    const callId = ++this.callSeq;
    this.muted = false;
    this.emit(this.interimListeners, "");
    this.setSnapshot({ status: { kind: "idle", callId }, lastAssistant: null, capabilities: this.noCapabilities() });
  }

  // ---- Settings ------------------------------------------------------------------

  /** Whether confirmed speech interrupts the companion by itself (tapping and typing always do). */
  setAutoInterrupt(on: boolean): void {
    this.autoInterrupt = on;
    const call = this.call;
    if (call?.connected) this.setSnapshot({ ...this.snapshot, capabilities: this.capabilitiesOf(call) });
    const st = this.status;
    if (st.kind === "speaking") this.setStatus({ ...st, micOpen: this.micOpenWhileSpeaking(call) });
  }

  /**
   * Mute: the open mic turn is dropped (nothing heard so far is sent or committed),
   * no new turn opens, and confirmed speech no longer interrupts the companion. Audio
   * reaches transcription only through an open turn, so none reaches it while muted.
   * Unmuting resumes the same call. Typing and the interrupt tap still work.
   */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    diag("mute", { muted });
    if (muted && this.listeningTurn) this.stopListening();
    const st = this.status;
    if (st.kind === "speaking") this.setStatus({ ...st, micOpen: this.micOpenWhileSpeaking(this.call) });
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** A longer pause ends a turn, for someone who speaks slowly. */
  setSlowEndpoint(slow: boolean): void {
    this.slowEndpoint = slow;
    this.call?.detector?.setEndpointSilenceMs(slow ? BARGE_IN_DEFAULTS.slowEndpointSilenceMs : BARGE_IN_DEFAULTS.endpointSilenceMs);
  }

  // ---- Input ---------------------------------------------------------------------

  /** Opens the mic as a new turn. A no-op while the companion is talking, connecting, or the mic is already open. */
  startListening(language: UiLanguage): void {
    const call = this.call;
    if (!call?.connected || !call.input || this.muted) return;
    const { kind } = this.status;
    if (kind === "speaking" || kind === "listening" || kind === "connecting") return;
    if (this.listeningTurn) return; // a committed turn is still waiting for its transcript
    this.openTurn(call, language);
  }

  /** Push-to-talk "send": ends the open mic turn and delivers what was heard. */
  commitListening(): void {
    const call = this.call;
    const turn = this.listeningTurn;
    if (!call?.input || !turn) return;
    this.clearNoSpeechTimer();
    this.heardSpeech = false;
    this.setStatus({ kind: "processing", callId: call.callId, turnId: turn.turnId });
    this.committedAt = Date.now();
    diag("stt-commit", { engine: call.inputId });
    call.input.commitTurn(turn);
  }

  /** Closes the mic and drops anything heard but not yet committed. */
  stopListening(): void {
    const call = this.call;
    const had = this.listeningTurn;
    this.listeningTurn = null;
    this.heardSpeech = false;
    this.clearNoSpeechTimer();
    if (had && call?.input) call.input.cancelTurn(had);
    else call?.provider?.stopListening();
    if (!had) return;
    this.emit(this.interimListeners, "");
    const st = this.status;
    if (st.kind === "listening" && st.turnId === had.turnId) this.setStatus({ kind: "idle", callId: st.callId });
  }

  private openTurn(call: ActiveCall, language: UiLanguage, preRollMs = 0): TurnIdentity | null {
    if (!call.input) return null;
    const identity = { callId: call.callId, turnId: ++this.turnSeq };
    this.listeningTurn = identity;
    this.heardSpeech = preRollMs > 0;
    this.setStatus(preRollMs > 0 ? { kind: "listening", callId: call.callId, turnId: identity.turnId, afterInterrupt: true } : { kind: "listening", callId: call.callId, turnId: identity.turnId });
    call.input.beginTurn(identity, { language });
    if (preRollMs > 0 && call.capture) for (const frame of call.capture.preRoll(preRollMs)) call.input.appendAudio(frame);
    // A hands-free realtime mic with nothing confirmed for a while is silence, as the browser engine reports it.
    if (call.input.streamsAudio && call.handsFree && preRollMs === 0) {
      this.clearNoSpeechTimer();
      this.noSpeechTimer = setTimeout(() => {
        if (!sameIdentity(this.listeningTurn, identity) || this.heardSpeech) return;
        this.stopListening();
        this.emit(this.errorListeners, "no-speech");
      }, NO_SPEECH_MS);
    }
    return identity;
  }

  private onTranscription(call: ActiveCall, e: TranscriptionEvent): void {
    if (this.call !== call) return;
    switch (e.type) {
      case "interim":
        if (sameIdentity(this.listeningTurn, e.identity)) this.emit(this.interimListeners, e.text);
        return;
      case "final": {
        const turn = this.listeningTurn;
        if (!sameIdentity(turn, e.identity)) return; // a stopped, restarted or already-answered turn
        const clean = e.text.trim();
        if (!clean) {
          // Nothing heard: a hands-free turn stays open (the browser engine) or closes quietly (realtime, already committed).
          if (this.status.kind === "processing") this.closeTurn(call, e.identity);
          return;
        }
        this.listeningTurn = null; // exactly one committed utterance per mic turn
        this.heardSpeech = false;
        this.clearNoSpeechTimer();
        this.emit(this.interimListeners, "");
        this.setStatus({ kind: "processing", callId: call.callId, turnId: e.identity.turnId });
        diag("stt-final", { engine: call.inputId, ms: this.committedAt ? Date.now() - this.committedAt : 0 });
        this.emit(this.userTurnListeners, { id: e.identity, text: clean, confidence: e.confidence });
        return;
      }
      case "turn-closed":
        if (sameIdentity(this.listeningTurn, e.identity)) this.closeTurn(call, e.identity);
        return;
      case "error":
        this.micFailed(call, e.code);
        return;
      default:
        return;
    }
  }

  /** The engine closed the turn with nothing committed (silence, or an error already reported). */
  private closeTurn(call: ActiveCall, identity: TurnIdentity): void {
    this.listeningTurn = null;
    this.heardSpeech = false;
    this.clearNoSpeechTimer();
    this.emit(this.interimListeners, "");
    const st = this.status;
    if ((st.kind === "listening" || st.kind === "processing") && st.turnId === identity.turnId) this.setStatus({ kind: "idle", callId: call.callId });
  }

  private micFailed(call: ActiveCall, code: VoiceErrorCode): void {
    if (this.listeningTurn) {
      this.listeningTurn = null;
      this.heardSpeech = false;
      this.clearNoSpeechTimer();
      this.emit(this.interimListeners, "");
    }
    if (this.status.kind !== "speaking") this.setStatus({ kind: "error", callId: call.callId, code });
    this.emit(this.errorListeners, code);
  }

  // ---- Barge-in and endpointing -------------------------------------------------------

  private onBargeIn(call: ActiveCall, e: BargeInEvent): void {
    if (this.call !== call) return;
    if (e.type === "diagnostic") return this.emit(this.diagnosticListeners, e);
    if (e.type === "candidate") return; // loudness alone never does anything
    const st = this.status;
    if (e.type === "speech-start") {
      if (st.kind === "listening" && this.listeningTurn && !this.heardSpeech) {
        this.heardSpeech = true; // the open mic heard a person: the no-speech clock no longer applies
        this.clearNoSpeechTimer();
        return;
      }
      if (st.kind !== "speaking" || !this.micOpenWhileSpeaking(call)) return;
      if (e.at < this.playbackEndedAt + ECHO_GUARD_MS) return; // the speaker's own tail
      // A confirmed interruption: stop the voice, keep its words, and start a new user turn
      // that includes the audio from just before the interruption was confirmed.
      this.stopOutput();
      this.setStatus({ kind: "interrupted", callId: call.callId, turnId: st.turnId, reason: "user" });
      diag("barge-in", { interrupted: true, preRollMs: e.at - e.candidateAt + PRE_ROLL_MS });
      this.openTurn(call, call.language, e.at - e.candidateAt + PRE_ROLL_MS);
      return;
    }
    // speech-end: the pause after confirmed speech ends the turn.
    if (st.kind === "listening" && this.listeningTurn && this.heardSpeech) this.commitListening();
  }

  private micOpenWhileSpeaking(call: ActiveCall | null): boolean {
    return !!call && !this.muted && call.duplex && this.autoInterrupt && call.input?.streamsAudio === true;
  }

  // ---- Output ---------------------------------------------------------------------

  /**
   * Says one approved line. The turn is published (visible) before any audio is
   * attempted, an open mic turn is dropped, and whatever was playing is replaced.
   * Returns the turn, or null outside a call or for blank text.
   */
  speak(text: string, language: UiLanguage, opts: { slow?: boolean; source?: AssistantTurn["source"] } = {}): AssistantTurn | null {
    const call = this.call;
    const clean = text.trim();
    if (!call || !clean) return null;
    const turn: AssistantTurn = { id: { callId: call.callId, turnId: ++this.turnSeq }, text: clean, source: opts.source ?? "session", slow: opts.slow ?? false };

    this.stopOutput();
    this.stopListening();
    this.setSnapshot({ ...this.snapshot, lastAssistant: turn });
    this.emit(this.assistantTurnListeners, turn);

    if (!call.connected) {
      this.pendingSpeak = { turn, language }; // said as soon as the engines answer
      return turn;
    }
    this.play(call, turn, language);
    return turn;
  }

  private play(call: ActiveCall, turn: AssistantTurn, language: UiLanguage): void {
    if (call.outputId === "text-only" || !call.output) return; // words only: nothing to play, status unchanged
    this.speakingTurn = turn.id;
    this.setStatus({ kind: "speaking", callId: call.callId, turnId: turn.id.turnId, adapter: call.outputId, audioStarted: false, micOpen: this.micOpenWhileSpeaking(call) });
    call.output.speak({ identity: turn.id, text: turn.text, language, slow: turn.slow });
  }

  /** Quietly stops the voice (the line on screen changed). Not an interruption: the status returns to idle. */
  stopSpeaking(): void {
    const st = this.status;
    this.pendingSpeak = null;
    this.stopOutput();
    if (st.kind === "speaking") this.setStatus({ kind: "idle", callId: st.callId });
  }

  /**
   * The one explicit interruption (a tap, or typing): stops playback and the mic,
   * retires their turn ids so late events change nothing, and leaves the full
   * text on screen. Nothing heard so far is submitted.
   */
  interrupt(): void {
    const st = this.status;
    const turnId = st.kind === "speaking" || st.kind === "listening" ? st.turnId : null;
    this.pendingSpeak = null;
    this.stopOutput();
    this.stopListening();
    if (turnId !== null) this.setStatus({ kind: "interrupted", callId: st.callId, turnId, reason: "user" });
  }

  private onSpeech(call: ActiveCall, e: SpeechEvent): void {
    if (this.call !== call || !sameIdentity(this.speakingTurn, e.identity)) return; // stale: a superseded line or an old call
    const st = this.status;
    if (st.kind !== "speaking" || st.turnId !== e.identity.turnId) return;
    if (e.type === "started") {
      call.detector?.setPlaybackActive(true);
      if (st.adapter !== "browser") call.outputHeard = true;
      if (!st.audioStarted) this.setStatus({ ...st, audioStarted: true });
      return;
    }
    if (e.type === "ended") {
      this.speakingTurn = null;
      this.playbackDone(call);
      this.setStatus({ kind: "idle", callId: call.callId });
      return;
    }
    // failed
    this.speakingTurn = null;
    this.playbackDone(call);
    if (!e.beforeAudio) {
      // The voice stopped mid-line. No other voice finishes the sentence; Repeat is the recovery.
      call.output?.interrupt(e.identity);
      this.setStatus({ kind: "interrupted", callId: call.callId, turnId: st.turnId, reason: "playback" });
      return;
    }
    const turn = this.snapshot.lastAssistant;
    if (!turn || turn.id.turnId !== st.turnId) return this.setStatus({ kind: "idle", callId: call.callId });
    if (e.code === "unapproved" || e.code === "no-approved-text" || e.code === "not-allowed") {
      // Not the engine's fault: this line is not for the streaming voice. It stays on screen,
      // unvoiced; no other voice says it (one voice per call).
      diag("tts-skipped", { reason: e.code });
      return this.setStatus({ kind: "idle", callId: call.callId });
    }
    if (st.adapter === "browser") return this.setStatus({ kind: "interrupted", callId: call.callId, turnId: st.turnId, reason: "playback" });
    if (!call.outputHeard) return this.sayWithBrowser(call, turn, st.adapter, e.code); // one-way, once per call
    // The streaming voice has already been heard: never switch voices mid-call.
    if (TERMINAL_SPEECH_FAILURES.has(e.code)) {
      // It won't come back this call (credits, voice, token): words only from here, said once.
      this.switchOutput(call, null, "text-only", st.adapter, e.code);
      return this.setStatus({ kind: "idle", callId: call.callId });
    }
    // A passing problem with this line: Repeat tries the same voice again.
    this.setStatus({ kind: "interrupted", callId: call.callId, turnId: st.turnId, reason: "playback" });
  }

  /** Nothing of the streaming voice was heard this call: the browser voice says this line and every later one. */
  private sayWithBrowser(call: ActiveCall, turn: AssistantTurn, from: AdapterId, reason: SpeechFailureReason): void {
    const provider = call.provider;
    if (!provider?.capabilities.synthesis) {
      this.switchOutput(call, null, "text-only", from, reason);
      return this.setStatus({ kind: "idle", callId: call.callId });
    }
    const adapter = new BrowserSpeechAdapter(provider);
    void adapter.connect();
    this.switchOutput(call, adapter, "browser", from, reason);
    this.speakingTurn = turn.id;
    this.setStatus({ kind: "speaking", callId: call.callId, turnId: turn.id.turnId, adapter: "browser", audioStarted: false, micOpen: this.micOpenWhileSpeaking(call) });
    adapter.speak({ identity: turn.id, text: turn.text, language: call.language, slow: turn.slow });
  }

  private switchOutput(call: ActiveCall, adapter: SpeechAdapter | null, to: AdapterId, from: AdapterId, reason?: SpeechFailureReason): void {
    void call.output?.disconnect();
    call.output = adapter;
    call.outputId = to;
    if (adapter) {
      const off = adapter.subscribe((e) => this.onSpeech(call, e));
      const prev = call.unbind;
      call.unbind = () => {
        prev();
        off();
      };
    }
    this.setSnapshot({ ...this.snapshot, capabilities: this.capabilitiesOf(call) });
    diag("fallback", { engine: to, ...(reason ? { reason } : {}) });
    this.emit(this.fallbackListeners, { kind: "output", from, to, reason });
  }

  private playbackDone(call: ActiveCall): void {
    call.detector?.setPlaybackActive(false);
    this.playbackEndedAt = this.lastFrameAt;
  }

  private stopOutput(): void {
    const call = this.call;
    const turn = this.speakingTurn;
    this.speakingTurn = null; // first, so the stop() events below are seen as stale
    if (!call) return;
    if (turn) {
      call.output?.interrupt(turn);
      this.playbackDone(call);
    }
    call.provider?.stopSpeaking();
  }

  // ---- Plumbing --------------------------------------------------------------------

  private clearNoSpeechTimer(): void {
    clearTimeout(this.noSpeechTimer);
    this.noSpeechTimer = undefined;
  }

  private capabilitiesOf(call: ActiveCall): VoiceCapabilitiesSnapshot {
    return {
      input: call.inputId,
      output: call.outputId,
      handsFree: call.handsFree && call.inputId !== "text-only",
      duplex: call.duplex,
      autoInterrupt: this.autoInterrupt,
    };
  }

  private noCapabilities(): VoiceCapabilitiesSnapshot {
    return { input: null, output: null, handsFree: false, duplex: false, autoInterrupt: this.autoInterrupt };
  }

  private setStatus(status: VoiceStatus): void {
    this.setSnapshot({ ...this.snapshot, status });
  }

  private setSnapshot(next: VoiceSnapshot): void {
    this.snapshot = next;
    this.emit(this.snapshotListeners, next);
  }

  private emit<T>(set: Set<Listener<T>>, value: T): void {
    set.forEach((l) => l(value));
  }

  private add<T>(set: Set<Listener<T>>, cb: Listener<T>): () => void {
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }
}
