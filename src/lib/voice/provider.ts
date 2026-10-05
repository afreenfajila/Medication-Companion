import type { UiLanguage } from "@/types/content";

/** Provider abstraction from CLAUDE.md. A later GeminiLiveProvider implements the same shape. */
export interface VoiceProvider {
  isAvailable(): Promise<boolean>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendTranscript(text: string): Promise<void>;
  /**
   * `confidence` is the recogniser's 0–1 score when it reports one. Browsers
   * report 0 to mean "not provided"; typed input passes none.
   */
  onTranscript(callback: (text: string, confidence?: number) => void): () => void;
  onAssistantText(callback: (text: string) => void): () => void;
  onError(callback: (error: Error) => void): () => void;
}

export type VoiceErrorCode =
  | "permission-denied"
  | "no-speech"
  | "no-microphone"
  | "network"
  | "unsupported"
  | "unknown";

export class VoiceError extends Error {
  constructor(readonly code: VoiceErrorCode) {
    super(`voice error: ${code}`);
    this.name = "VoiceError";
  }
}

export type VoiceCapabilities = { recognition: boolean; synthesis: boolean };

/** Extra surface for providers that own a microphone and a speaker (browser speech, later live audio). */
export interface SpeechVoiceProvider extends VoiceProvider {
  readonly capabilities: VoiceCapabilities;
  /** Must only be called from a user action: this is what triggers the browser's mic prompt. */
  startListening(language: UiLanguage): void;
  stopListening(): void;
  /** `slow`: "Repeat slowly" — the same approved text at a slower rate. */
  speak(text: string, language: UiLanguage, slow?: boolean): void;
  stopSpeaking(): void;
  onInterim(callback: (text: string) => void): () => void;
  onListeningChange(callback: (listening: boolean) => void): () => void;
  onSpeakingChange(callback: (speaking: boolean) => void): () => void;
}
