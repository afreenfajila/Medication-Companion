import type { UiLanguage } from "@/types/content";
import {
  VoiceError,
  type SpeechVoiceProvider,
  type VoiceCapabilities,
  type VoiceErrorCode,
} from "./provider";

// Minimal structural types for the Web Speech API (not in every TS lib.dom version).
type ResultLike = { isFinal: boolean; 0: { transcript: string } };
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
interface UtteranceLike {
  lang: string;
  rate: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
export type VoiceEnv = {
  SpeechRecognition?: new () => RecognitionLike;
  webkitSpeechRecognition?: new () => RecognitionLike;
  speechSynthesis?: { speak(u: UtteranceLike): void; cancel(): void };
  SpeechSynthesisUtterance?: new (text: string) => UtteranceLike;
};

export const SPEECH_LANG: Record<UiLanguage, string> = { en: "en-US", "zh-Hans": "zh-CN" };

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
  private transcript = new Set<Listener<string>>();
  private interim = new Set<Listener<string>>();
  private assistant = new Set<Listener<string>>();
  private errors = new Set<Listener<Error>>();
  private listening = new Set<Listener<boolean>>();
  private speaking = new Set<Listener<boolean>>();

  constructor(private readonly env: VoiceEnv) {}

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

  onTranscript = (cb: Listener<string>) => this.subscribe(this.transcript, cb);
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
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (interimText.trim()) this.interim.forEach((l) => l(interimText.trim()));
      if (finalText.trim()) this.transcript.forEach((l) => l(finalText.trim()));
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

  speak(text: string, language: UiLanguage): void {
    const { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance } = this.env;
    if (!synth || !Utterance || !text.trim()) return;

    this.stopSpeaking();
    const utterance = new Utterance(text);
    utterance.lang = SPEECH_LANG[language];
    utterance.rate = 0.95; // calm and unhurried
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
