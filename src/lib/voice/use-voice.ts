"use client";

import { useSyncExternalStore } from "react";
import { isApprovedSpeech } from "@/lib/content/speech-guard";
import type { AudioCapture, BargeInDetector, SpeechAdapter, TranscriptionAdapter } from "./adapters";
import { browserCaptureDeps, CAPTURE_SAMPLE_RATE, WorkletAudioCapture, type CaptureContextLike } from "./audio-capture";
import { HybridBargeInDetector } from "./barge-in";
import { BrowserVoiceProvider, type VoiceEnv } from "./browser-voice";
import { VoiceSessionCoordinator } from "./coordinator";
import { ElevenLabsSpeech, requestElevenLabsToken } from "./elevenlabs-speech";
import { diag } from "./voice-diagnostics";
import { OpenAiRealtimeTranscription, requestOpenAiSession } from "./openai-transcription";
import { WebAudioPlaybackQueue, type PlaybackContextLike } from "./playback-queue";
import type { SpeechVoiceProvider, VoiceCapabilities } from "./provider";
import { loadSileroVad, type OrtLike } from "./silero-vad";

// One provider per page, created lazily on the client. Creating it opens
// nothing; the microphone is only used once a call starts.
let provider: SpeechVoiceProvider | null = null;
let capabilities: VoiceCapabilities = { recognition: false, synthesis: false };

const SERVER_CAPABILITIES: VoiceCapabilities = { recognition: false, synthesis: false };

export function getVoiceProvider(): SpeechVoiceProvider | null {
  if (typeof window === "undefined") return null;
  if (!provider) {
    provider = new BrowserVoiceProvider(window as unknown as VoiceEnv);
    capabilities = provider.capabilities;
  }
  return provider;
}

/** Test seam: replace (or clear) the browser provider. */
export function setVoiceProvider(next: SpeechVoiceProvider | null): void {
  provider = next;
  capabilities = next ? next.capabilities : SERVER_CAPABILITIES;
}

// ---- The realtime engines ------------------------------------------------------------------

/** One 24 kHz AudioContext for capture and playback (created on the first call, after the user's tap). */
let audioContext: AudioContext | null = null;
function getAudioContext(): (CaptureContextLike & PlaybackContextLike) | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  audioContext ??= new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE });
  return audioContext as unknown as CaptureContextLike & PlaybackContextLike;
}

type RealtimeAdapters = {
  transcription: () => TranscriptionAdapter | null;
  speech: () => SpeechAdapter | null;
  capture: () => AudioCapture | null;
  detector: () => BargeInDetector | null;
};

let realtime: RealtimeAdapters | null = null;
let realtimeOverride: Partial<RealtimeAdapters> | null = null;

/**
 * The real engines: OpenAI realtime transcription over a browser WebSocket
 * (short-lived credential from our own route), ElevenLabs streaming speech
 * (single-use token from our own route) through Web Audio, an AudioWorklet mic,
 * and the local Silero VAD. Each is created once per page; they open nothing
 * until a call connects them.
 */
function browserRealtime(): RealtimeAdapters {
  if (realtime) return realtime;
  let transcription: TranscriptionAdapter | null = null;
  let speech: SpeechAdapter | null = null;
  let capture: AudioCapture | null = null;
  let detector: BargeInDetector | null = null;
  realtime = {
    transcription: () => {
      if (typeof WebSocket === "undefined") return null;
      transcription ??= new OpenAiRealtimeTranscription({ fetchSession: requestOpenAiSession, WebSocket });
      return transcription;
    },
    speech: () => {
      if (typeof WebSocket === "undefined" || !getAudioContext()) return null;
      speech ??= new ElevenLabsSpeech({
        fetchToken: requestElevenLabsToken,
        WebSocket,
        playback: new WebAudioPlaybackQueue(getAudioContext),
        approve: isApprovedSpeech, // only approved, visible wording is ever voiced
      });
      return speech;
    },
    capture: () => {
      const deps = browserCaptureDeps(getAudioContext);
      if (!deps) return null;
      capture ??= new WorkletAudioCapture(deps);
      return capture;
    },
    detector: () => {
      detector ??= new HybridBargeInDetector({ loadModel: () => loadSileroVad({ importOrt: () => import("onnxruntime-web/wasm") as unknown as Promise<OrtLike> }) });
      return detector;
    },
  };
  return realtime;
}

/**
 * Test seam: realtime engines for the next call (fakes), or `null` for none —
 * tests default to the browser engines only, with no network. Pass `{}` to
 * restore the real engines.
 */
export function setVoiceAdaptersForTest(next: Partial<RealtimeAdapters> | null): void {
  realtimeOverride = next;
}

const IS_TEST = typeof process !== "undefined" && process.env.NODE_ENV === "test";

function adapters(): Partial<RealtimeAdapters> {
  if (realtimeOverride) return realtimeOverride;
  if (IS_TEST || typeof window === "undefined") return {};
  return browserRealtime();
}

// One coordinator per page. It re-reads the engines at each call start, so the
// test seams above keep working.
let coordinator: VoiceSessionCoordinator | null = null;

export function getVoiceCoordinator(): VoiceSessionCoordinator {
  if (!coordinator) {
    coordinator = new VoiceSessionCoordinator({
      provider: getVoiceProvider,
      transcription: () => adapters().transcription?.() ?? null,
      speech: () => adapters().speech?.() ?? null,
      capture: () => adapters().capture?.() ?? null,
      detector: () => adapters().detector?.() ?? null,
    });
    // Development only (silent otherwise): loudness numbers, scaled to integers. Never words, audio or keys.
    let n = 0;
    coordinator.onDiagnostic((d) => {
      if (n++ % 15 !== 0) return;
      diag("barge-in", {
        rmsMilli: d.rms * 1000,
        floorMilli: d.floor * 1000,
        thresholdMilli: d.threshold * 1000,
        ...(d.probability !== null ? { speechPct: d.probability * 100 } : {}),
      });
    });
  }
  return coordinator;
}

/** Feature detection without a hydration mismatch (server + first client render report "none"). */
export function useVoiceCapabilities(): VoiceCapabilities {
  return useSyncExternalStore(
    () => () => undefined,
    () => {
      getVoiceProvider();
      return capabilities;
    },
    () => SERVER_CAPABILITIES,
  );
}
