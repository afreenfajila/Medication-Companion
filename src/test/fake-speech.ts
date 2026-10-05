import type { RecognitionLike, VoiceEnv } from "@/lib/voice/browser-voice";

/** Controllable fakes for the Web Speech API. */
export function createFakeSpeech(
  opts: { recognition?: boolean; synthesis?: boolean; voices?: Array<Record<string, unknown>> } = {},
) {
  const { recognition = true, synthesis = true } = opts;
  let voices = opts.voices ?? [];

  const recognitions: FakeRecognition[] = [];
  class FakeRecognition implements RecognitionLike {
    lang = "";
    interimResults = false;
    continuous = true;
    maxAlternatives = 0;
    onresult: RecognitionLike["onresult"] = null;
    onerror: RecognitionLike["onerror"] = null;
    onend: RecognitionLike["onend"] = null;
    started = false;
    startImpl: () => void = () => undefined;
    constructor() {
      recognitions.push(this);
    }
    start() {
      this.startImpl();
      this.started = true;
    }
    stop() {
      this.started = false;
      this.onend?.();
    }
    // --- test drivers
    say(transcript: string, isFinal = true, confidence?: number) {
      this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript, confidence }], { isFinal })] as never });
      // Real engines run with continuous=false (see BrowserVoiceProvider.startListening):
      // a final result auto-ends the recognition, just like a real browser would.
      if (isFinal) {
        this.started = false;
        this.onend?.();
      }
    }
    fail(error: string) {
      this.onerror?.({ error });
      this.onend?.();
    }
  }

  const utterances: FakeUtterance[] = [];
  class FakeUtterance {
    lang = "";
    rate = 1;
    voice: unknown = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly text: string) {}
  }
  const synth = {
    onvoiceschanged: null as (() => void) | null,
    getVoices: () => voices,
    speak: (u: FakeUtterance) => {
      utterances.push(u);
      u.onstart?.();
    },
    cancel: () => {
      /* real engines fire onend/onerror for the cancelled utterance */
      const last = utterances.at(-1);
      if (last) last.onend?.();
    },
  };

  const env: VoiceEnv = {
    ...(recognition ? { SpeechRecognition: FakeRecognition as unknown as VoiceEnv["SpeechRecognition"] } : {}),
    ...(synthesis
      ? {
          speechSynthesis: synth as unknown as VoiceEnv["speechSynthesis"],
          SpeechSynthesisUtterance: FakeUtterance as unknown as VoiceEnv["SpeechSynthesisUtterance"],
        }
      : {}),
  };

  /** Simulates the browser's voice list finishing its async load some time later. */
  const deliverVoices = (list: Array<Record<string, unknown>>) => {
    voices = list;
    synth.onvoiceschanged?.();
  };

  return { env, recognitions, utterances, synth, deliverVoices };
}
