import type { RecognitionLike, VoiceEnv } from "@/lib/voice/browser-voice";

/** Controllable fakes for the Web Speech API. */
<<<<<<< HEAD
export function createFakeSpeech(
  opts: { recognition?: boolean; synthesis?: boolean; voices?: Array<Record<string, unknown>> } = {},
) {
  const { recognition = true, synthesis = true, voices = [] } = opts;
=======
export function createFakeSpeech(opts: { recognition?: boolean; synthesis?: boolean } = {}) {
  const { recognition = true, synthesis = true } = opts;
>>>>>>> a2528316cb25c39d4d44554f392e8ee3a5a5e16a

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
    say(transcript: string, isFinal = true) {
      this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal })] as never });
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
<<<<<<< HEAD
    voice: unknown = null;
=======
>>>>>>> a2528316cb25c39d4d44554f392e8ee3a5a5e16a
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly text: string) {}
  }
  const synth = {
<<<<<<< HEAD
    getVoices: () => voices,
=======
>>>>>>> a2528316cb25c39d4d44554f392e8ee3a5a5e16a
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
  return { env, recognitions, utterances, synth };
}
