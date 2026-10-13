import type { UiLanguage } from "@/types/content";
import type { VoiceErrorCode } from "./provider";

/**
 * Provider-neutral contracts for the voice layer. The coordinator talks only to
 * these; OpenAI, ElevenLabs and the browser's own speech engines each sit behind
 * one of them. None of them knows anything about medicines, sessions or copy.
 */

export type TurnIdentity = {
  /** Increases on every call start and end; events from another call are ignored. */
  callId: number;
  /** One monotonic sequence for user and assistant turns alike, across the page. */
  turnId: number;
};

/** Mono PCM in the range -1..1. `at` is milliseconds since capture started. */
export type AudioFrame = { samples: Float32Array; sampleRate: number; at: number };

// ---- Microphone capture ------------------------------------------------------------

export type CaptureDiagnostics = {
  /** What the track reports after acquisition — not what was asked for. */
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sampleRate: number;
};

export interface AudioCapture {
  /** Opens the microphone (must follow a user action). Resolves false with a code when it can't. */
  start(): Promise<{ ok: true; diagnostics: CaptureDiagnostics } | { ok: false; code: VoiceErrorCode }>;
  onFrame(listener: (frame: AudioFrame) => void): () => void;
  /** The most recent `ms` of audio, oldest first (copies — never the live buffers). */
  preRoll(ms: number): AudioFrame[];
  /** Releases the tracks and the worklet; late worklet messages are dropped. */
  stop(): void;
}

// ---- Speech input (transcription) ---------------------------------------------------

export type TranscriptionAdapterId = "openai-realtime" | "browser" | "text-only";

export type TranscriptionEvent =
  | { type: "ready"; callId: number }
  | { type: "interim"; identity: TurnIdentity; text: string }
  | { type: "final"; identity: TurnIdentity; text: string; confidence?: number }
  /** The engine closed the turn with nothing to commit (silence, no speech). */
  | { type: "turn-closed"; identity: TurnIdentity }
  | { type: "error"; callId: number; code: VoiceErrorCode };

export interface TranscriptionAdapter {
  readonly id: TranscriptionAdapterId;
  /**
   * True when the adapter takes PCM through `appendAudio` (so gating and pre-roll
   * work); false when it owns its own microphone and endpointing (browser recognition).
   */
  readonly streamsAudio: boolean;
  /** Resolves false when this provider can't serve the call (not configured, refused, offline). */
  connect(context: { callId: number; language: UiLanguage }): Promise<boolean>;
  beginTurn(identity: TurnIdentity, options: { language: UiLanguage }): void;
  appendAudio(frame: AudioFrame): void;
  /** Ends the turn now: whatever was heard becomes the final transcript. */
  commitTurn(identity: TurnIdentity): void;
  /** Drops the turn: nothing heard so far is ever delivered. */
  cancelTurn(identity: TurnIdentity): void;
  disconnect(): Promise<void>;
  subscribe(listener: (event: TranscriptionEvent) => void): () => void;
}

// ---- Speech output ------------------------------------------------------------------------

export type SpeechAdapterId = "elevenlabs" | "browser" | "text-only";

export type SpeechRequest = { identity: TurnIdentity; text: string; language: UiLanguage; slow: boolean };

/**
 * Why a line was not voiced (or the voice could not be used at all). Internal
 * codes only: never shown raw, never carrying provider payloads or tokens.
 */
export type SpeechFailureReason =
  /** No key or no voice id on the server: a deliberate setup, not a failure to announce. */
  | "unconfigured"
  | "token-unavailable"
  | "voice-unavailable"
  | "model-unavailable"
  /** The account's credits are used up (free tier). */
  | "quota-exceeded"
  | "websocket-failed"
  | "playback-decode-failed"
  /** Nothing played within the start window. */
  | "timeout"
  /** The browser's own voice reported an error before speaking. */
  | "engine-failed"
  /** The line is not for this call (ended, superseded) — nothing to voice. */
  | "not-allowed"
  /** Empty, or refused by the approved-wording guard: shown, not voiced. */
  | "no-approved-text"
  | "unapproved";

/** These won't fix themselves within a call: the voice is not tried again until the next call. */
export const TERMINAL_SPEECH_FAILURES: ReadonlySet<SpeechFailureReason> = new Set([
  "unconfigured",
  "token-unavailable",
  "voice-unavailable",
  "model-unavailable",
  "quota-exceeded",
]);

export type SpeechEvent =
  /** Audio is actually coming out of the speaker. */
  | { type: "started"; identity: TurnIdentity }
  | { type: "ended"; identity: TurnIdentity }
  | { type: "failed"; identity: TurnIdentity; beforeAudio: boolean; code: SpeechFailureReason };

export interface SpeechAdapter {
  readonly id: SpeechAdapterId;
  /** Why the last `connect()` returned false, when the adapter knows. */
  readonly unavailableReason?: SpeechFailureReason | null;
  connect(context: { callId: number; language: UiLanguage }): Promise<boolean>;
  /** Says exactly `text`; the adapter never changes a character of it. */
  speak(request: SpeechRequest): void;
  /** Stops this turn's audio and drops anything still queued or in flight for it. */
  interrupt(identity: TurnIdentity): void;
  disconnect(): Promise<void>;
  subscribe(listener: (event: SpeechEvent) => void): () => void;
}

// ---- Barge-in / endpointing -----------------------------------------------------------------

export type BargeInEvent =
  /** Loudness alone: a *possible* interruption. Never acts on its own. */
  | { type: "candidate"; at: number }
  /** Loudness AND local speech probability, long enough: a person is talking. */
  | { type: "speech-start"; at: number; candidateAt: number }
  /** The endpoint pause elapsed after confirmed speech. */
  | { type: "speech-end"; at: number }
  /** Redacted numbers only, for development. */
  | { type: "diagnostic"; at: number; rms: number; floor: number; threshold: number; probability: number | null };

export interface BargeInDetector {
  /** Loads the local VAD. `vad: false` means loudness can still be measured but speech can never be confirmed. */
  start(context: { callId: number }): Promise<{ vad: boolean }>;
  process(frame: AudioFrame): void;
  /** The companion's audio is playing: be more conservative about loudness. */
  setPlaybackActive(active: boolean): void;
  /** How long a pause ends a turn (longer for slow speakers). */
  setEndpointSilenceMs(ms: number): void;
  stop(): void;
  subscribe(listener: (event: BargeInEvent) => void): () => void;
}

/** A local model that scores one 16 kHz window (512 samples) for speech. */
export interface SpeechProbabilityModel {
  probability(window16k: Float32Array): Promise<number>;
  reset(): void;
  dispose(): void;
}

// ---- Small shared helpers --------------------------------------------------------------------

export function sameIdentity(a: TurnIdentity | null | undefined, b: TurnIdentity | null | undefined): boolean {
  return !!a && !!b && a.callId === b.callId && a.turnId === b.turnId;
}

export function rmsOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Linear resampling — plenty for loudness and speech-probability, and for a 24 → 16 kHz feed. */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const length = Math.max(1, Math.round((samples.length * to) / from));
  const out = new Float32Array(length);
  const step = from / to;
  for (let i = 0; i < length; i++) {
    const pos = i * step;
    const lo = Math.floor(pos);
    const hi = Math.min(samples.length - 1, lo + 1);
    const frac = pos - lo;
    out[i] = samples[lo] * (1 - frac) + samples[hi] * frac;
  }
  return out;
}

export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function pcm16ToFloat(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / (pcm[i] < 0 ? 0x8000 : 0x7fff);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
