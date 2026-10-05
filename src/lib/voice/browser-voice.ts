import type { UiLanguage } from "@/types/content";
import {
  VoiceError,
  type SpeechVoiceProvider,
  type VoiceCapabilities,
  type VoiceErrorCode,
} from "./provider";

// Minimal structural types for the Web Speech API (not in every TS lib.dom version).
type ResultLike = { isFinal: boolean; 0: { transcript: string; confidence?: number } };
type RecognitionEventLike = { resultIndex: number; results: ArrayLike<ResultLike> };
export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}
interface UtteranceLike {
  lang: string;
  rate: number;
  voice?: VoiceLike | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
export type VoiceEnv = {
  SpeechRecognition?: new () => RecognitionLike;
  webkitSpeechRecognition?: new () => RecognitionLike;
  speechSynthesis?: {
    speak(u: UtteranceLike): void;
    cancel(): void;
    getVoices?(): VoiceLike[];
    onvoiceschanged?: (() => void) | null;
  };
  SpeechSynthesisUtterance?: new (text: string) => UtteranceLike;
};

export const SPEECH_LANG: Record<UiLanguage, string> = { en: "en-US", "zh-Hans": "zh-CN" };

// Voices that are novelty/robotic or known-poor; never chosen if anything else exists.
const AVOID = /espeak|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|princess|ralph/i;
// Neural / network / premium voices sound far more natural than the OS default.
const NATURAL = /natural|neural|online|premium|enhanced|siri|wavenet|studio/i;
const KNOWN_GOOD =
  /google|samantha|ava\b|allison|susan|serena|karen|moira|daniel|xiaoxiao|yunxi|xiaoyi|tingting|meijia|sinji|hanhan|huihui|yaoyao/i;

/**
 * Picks the most natural installed voice for a language. Browsers default to a
 * basic local voice; neural/premium/Google/Apple voices, when present, are
 * chosen instead. Returns null when no voice matches (the engine's default is used).
 */
export function pickVoice(voices: readonly VoiceLike[], language: UiLanguage): VoiceLike | null {
  const want = SPEECH_LANG[language].toLowerCase();
  const prefix = want.slice(0, 2);
  const candidates = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(prefix));
  if (candidates.length === 0) return null;

  const score = (v: VoiceLike): number => {
    let s = 0;
    if (AVOID.test(v.name)) s -= 100;
    if (NATURAL.test(v.name)) s += 50;
    if (KNOWN_GOOD.test(v.name)) s += 25;
    if (v.localService === false) s += 10; // network voices are usually higher quality
    if (v.lang.toLowerCase().replace("_", "-") === want) s += 8; // exact locale
    if (v.default) s += 1;
    return s;
  };
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

const ERROR_MAP: Record<string, VoiceErrorCode> = {
  "not-allowed": "permission-denied",
  "service-not-allowed": "permission-denied",
  "no-speech": "no-speech",
  "audio-capture": "no-microphone",
  network: "network",
  "language-not-supported": "unsupported",
};

type Listener<T> = (value: T) => void;

/**
 * Browser speech recognition + speech synthesis behind the VoiceProvider
 * abstraction. Nothing is opened at construction/connect time: the microphone is
 * only touched when `startListening` runs (a user tap), and speech only plays
 * when `speak` is called (after the user turned sound on). Recognised text is
 * only *emitted* — the app decides what to do with it (same path as typing).
 */
export class BrowserVoiceProvider implements SpeechVoiceProvider {
  private recognition: RecognitionLike | null = null;
  private utterance: UtteranceLike | null = null;
  private transcript = new Set<(text: string, confidence?: number) => void>();
  private interim = new Set<Listener<string>>();
  private assistant = new Set<Listener<string>>();
  private errors = new Set<Listener<Error>>();
  private listening = new Set<Listener<boolean>>();
  private speaking = new Set<Listener<boolean>>();
  private voicesCache: VoiceLike[] = [];

  constructor(private readonly env: VoiceEnv) {
    // Chrome/Edge load the voice list ASYNCHRONOUSLY, and in some versions it never
    // populates at all until something subscribes to `onvoiceschanged` — without
    // this, getVoices() can return [] forever and every utterance falls back to
    // the engine's single most basic default voice (this is the usual cause of
    // "the voice sounds robotic" even though better voices are installed).
    this.refreshVoices();
    const synth = env.speechSynthesis;
    if (synth) synth.onvoiceschanged = () => this.refreshVoices();
  }

  private refreshVoices(): void {
    const list = this.env.speechSynthesis?.getVoices?.() ?? [];
    if (list.length > 0) this.voicesCache = list;
  }

  get capabilities(): VoiceCapabilities {
    return {
      recognition: Boolean(this.env.SpeechRecognition ?? this.env.webkitSpeechRecognition),
      synthesis: Boolean(this.env.speechSynthesis && this.env.SpeechSynthesisUtterance),
    };
  }

  async isAvailable(): Promise<boolean> {
    const c = this.capabilities;
    return c.recognition || c.synthesis;
  }

  /** Deliberately a no-op: no permission prompt and no audio until a user action. */
  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {
    this.stopListening();
    this.stopSpeaking();
  }

  /** Typed input can flow through the same listener channel as speech. */
  async sendTranscript(text: string): Promise<void> {
    const value = text.trim();
    if (value) this.transcript.forEach((l) => l(value));
  }

  onTranscript = (cb: (text: string, confidence?: number) => void) => {
    this.transcript.add(cb);
    return () => {
      this.transcript.delete(cb);
    };
  };
  onInterim = (cb: Listener<string>) => this.subscribe(this.interim, cb);
  onAssistantText = (cb: Listener<string>) => this.subscribe(this.assistant, cb);
  onError = (cb: Listener<Error>) => this.subscribe(this.errors, cb);
  onListeningChange = (cb: Listener<boolean>) => this.subscribe(this.listening, cb);
  onSpeakingChange = (cb: Listener<boolean>) => this.subscribe(this.speaking, cb);

  startListening(language: UiLanguage): void {
    const Ctor = this.env.SpeechRecognition ?? this.env.webkitSpeechRecognition;
    if (!Ctor) return this.fail("unsupported");
    if (this.recognition) return; // already listening

    const rec = new Ctor();
    rec.lang = SPEECH_LANG[language];
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interimText = "";
      let finalText = "";
      // The least confident final segment speaks for the whole utterance.
      let confidence: number | undefined;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          finalText += r[0].transcript;
          const c = r[0].confidence;
          if (typeof c === "number") confidence = confidence === undefined ? c : Math.min(confidence, c);
        } else interimText += r[0].transcript;
      }
      if (interimText.trim()) this.interim.forEach((l) => l(interimText.trim()));
      if (finalText.trim()) this.transcript.forEach((l) => l(finalText.trim(), confidence));
    };
    rec.onerror = (e) => {
      if (e.error === "aborted") return; // we stopped it ourselves
      this.fail(ERROR_MAP[e.error] ?? "unknown");
    };
    rec.onend = () => {
      if (this.recognition === rec) this.recognition = null;
      this.listening.forEach((l) => l(false));
    };

    this.recognition = rec;
    try {
      rec.start();
      this.listening.forEach((l) => l(true));
    } catch {
      this.recognition = null;
      this.fail("unknown");
    }
  }

  stopListening(): void {
    this.recognition?.stop();
  }

  speak(text: string, language: UiLanguage, slow = false): void {
    const { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance } = this.env;
    if (!synth || !Utterance || !text.trim()) return;

    // Only cancel when something is actually in flight. Chrome can silently drop a
    // speak() call issued immediately after cancel() — skipping the redundant cancel
    // on a clean start (e.g. the call's very first greeting) avoids that failure mode.
    if (this.utterance) this.stopSpeaking();
    const utterance = new Utterance(text);
    utterance.lang = SPEECH_LANG[language];
    utterance.rate = slow ? 0.75 : 0.95; // calm and unhurried; slower still for "Repeat slowly"
    this.refreshVoices(); // pick up a list that finished loading since construction
    const voice = pickVoice(this.voicesCache, language);
    if (voice) utterance.voice = voice;
    const done = () => {
      if (this.utterance === utterance) {
        this.utterance = null;
        this.speaking.forEach((l) => l(false));
      }
    };
    utterance.onstart = () => this.speaking.forEach((l) => l(true));
    utterance.onend = done;
    utterance.onerror = done;

    this.utterance = utterance;
    this.assistant.forEach((l) => l(text)); // the visible caption always exists too
    synth.speak(utterance);
  }

  stopSpeaking(): void {
    const had = this.utterance;
    this.utterance = null;
    this.env.speechSynthesis?.cancel();
    if (had) this.speaking.forEach((l) => l(false));
  }

  private fail(code: VoiceErrorCode): void {
    this.errors.forEach((l) => l(new VoiceError(code)));
  }

  private subscribe<T>(set: Set<Listener<T>>, cb: Listener<T>): () => void {
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }
}
