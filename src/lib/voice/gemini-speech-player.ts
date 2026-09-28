import type { UiLanguage } from "@/types/content";
import { requestGeminiSpeech } from "./gemini-speech-client";

export type AudioLike = {
  play(): Promise<void>;
  pause(): void;
  src: string;
  playbackRate: number;
  onplay: (() => void) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
};
export type AudioEnv = {
  createAudio: (url: string) => AudioLike;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
};

const browserAudioEnv: AudioEnv = {
  createAudio: (url) => new Audio(url) as unknown as AudioLike,
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
};

/**
 * Plays Gemini-generated speech through an `<audio>` element, so the voice
 * sounds identical everywhere instead of depending on the visitor's installed
 * browser/OS voices. Never generates content — it only renders whatever exact
 * approved text the caller passes in, exactly like `speechSynthesis` did.
 *
 * `speak()` resolves `true` once Gemini audio is actually playing, or `false`
 * for any failure (network, empty response, browser autoplay block) — the
 * caller is expected to fall back to browser speech synthesis on `false`.
 */
export class GeminiSpeechPlayer {
  private audio: AudioLike | null = null;
  private objectUrl: string | null = null;
  private controller: AbortController | null = null;
  private speaking = new Set<(v: boolean) => void>();

  constructor(private readonly env: AudioEnv = browserAudioEnv) {}

  onSpeakingChange(cb: (v: boolean) => void): () => void {
    this.speaking.add(cb);
    return () => {
      this.speaking.delete(cb);
    };
  }

  /** Stops any current fetch and any currently-playing Gemini audio. */
  stop(): void {
    this.controller?.abort();
    this.controller = null;
    const had = this.audio;
    if (had) {
      had.onplay = null;
      had.onended = null;
      had.onerror = null;
      had.pause();
    }
    this.audio = null;
    if (this.objectUrl) {
      this.env.revokeObjectUrl(this.objectUrl);
      this.objectUrl = null;
    }
    if (had) this.speaking.forEach((l) => l(false));
  }

  async speak(text: string, language: UiLanguage, slow = false): Promise<boolean> {
    this.stop();
    const controller = new AbortController();
    this.controller = controller;

    const blob = await requestGeminiSpeech(text, language, controller.signal);
    if (controller.signal.aborted) return true; // superseded by a newer speak()/stop()
    if (!blob) {
      this.controller = null;
      return false;
    }

    const url = this.env.createObjectUrl(blob);
    const audio = this.env.createAudio(url);
    this.audio = audio;
    this.objectUrl = url;
    if (slow) audio.playbackRate = 0.8; // pitch is preserved by default

    audio.onplay = () => this.speaking.forEach((l) => l(true));
    const done = () => this.speaking.forEach((l) => l(false));
    audio.onended = done;
    audio.onerror = done;

    try {
      await audio.play();
    } catch {
      // Autoplay blocked, decode failure, etc. — fall back to browser speech.
      this.stop();
      return false;
    }
    this.controller = null;
    return true;
  }
}

// One player for the app lifetime. Unlike the browser voice provider, this is
// NOT lazily auto-constructed on first use: `speak()` always makes a real
// network request, so there is no free "unsupported, no-op" capability check
// the way there is for speechSynthesis. Deliberately requiring an explicit
// `set` keeps every test (and any other caller that never installs one)
// safely on the synchronous browser-speech fallback with zero network calls.
// The real app installs one via <GeminiVoiceBootstrap>, mounted only from
// /companion's page — never from CompanionExperience itself, which tests
// render directly.
let instance: GeminiSpeechPlayer | null = null;

export function getGeminiSpeechPlayer(): GeminiSpeechPlayer | null {
  return instance;
}

/** Installs (or clears) the singleton. */
export function setGeminiSpeechPlayer(next: GeminiSpeechPlayer | null): void {
  instance = next;
}
