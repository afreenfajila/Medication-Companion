import { resample, rmsOf, type AudioFrame, type BargeInDetector, type BargeInEvent, type SpeechProbabilityModel } from "./adapters";
import { VAD_SAMPLE_RATE, Windower } from "./silero-vad";

/**
 * Two-stage speech detection for a hands-free call.
 *
 *   1. Adaptive loudness (RMS over a noise floor measured in this room, on this
 *      call) says "something is happening" — a *candidate*.
 *   2. A local speech-probability model (Silero) has to agree, for long enough,
 *      before it becomes "a person is talking" — *speech-start*.
 *
 * Loudness alone never confirms anything: a cough, a dropped spoon or the TV
 * raises a candidate at most. Without the model, speech can never be confirmed,
 * so the coordinator falls back to push-to-talk instead of guessing.
 *
 * The same machine also finds the *end* of a turn: a pause of
 * `endpointSilenceMs` after confirmed speech — longer for slow speakers.
 *
 * All numbers below are tuning defaults, not guarantees. ponytail: fixed
 * ratios; calibrate against real rooms, headsets and older voices.
 */
export const BARGE_IN_DEFAULTS = {
  /** Loudness must stay over the threshold this long before it is a candidate. */
  candidateMs: 200,
  /** The model must say "speech" for this long (within a candidate) to confirm. */
  confirmMs: 300,
  /** A pause this long after confirmed speech ends the turn. */
  endpointSilenceMs: 900,
  /** …and this long when the person has shown they speak slowly. */
  slowEndpointSilenceMs: 1400,
  /** Threshold = max(floor × margin, absoluteMinimum). */
  floorMargin: 4,
  absoluteMinimum: 0.008,
  /** While the companion's audio plays, the margin is raised by this factor. */
  playbackFactor: 2,
  /** Frames the floor is averaged over at call start. */
  calibrationFrames: 8,
  /** Speech probability at/over which a window counts as speech… */
  speechProbability: 0.5,
  /** …and under which it counts as silence (between the two: undecided). */
  silenceProbability: 0.35,
  /** A candidate that is neither loud nor speech for this long is dropped. */
  candidateDropMs: 300,
} as const;

export type BargeInOptions = Partial<typeof BARGE_IN_DEFAULTS>;

export type BargeInDeps = {
  /** Resolves the local model, or null when it can't load. */
  loadModel: () => Promise<SpeechProbabilityModel | null>;
  options?: BargeInOptions;
};

export class HybridBargeInDetector implements BargeInDetector {
  private readonly o: typeof BARGE_IN_DEFAULTS;
  private listeners = new Set<(e: BargeInEvent) => void>();
  private model: SpeechProbabilityModel | null = null;
  private generation = 0;
  private chain: Promise<void> = Promise.resolve();
  private windower = new Windower();

  // Loudness
  private floor = 0;
  private calibrated = 0;
  private playbackActive = false;
  private loudMs = 0;
  // Candidate / speech state
  private candidateAt: number | null = null;
  private candidateQuietMs = 0;
  private speechMs = 0;
  private inSpeech = false;
  private silenceMs = 0;
  private endpointSilenceMs: number;

  constructor(private readonly deps: BargeInDeps) {
    this.o = { ...BARGE_IN_DEFAULTS, ...deps.options };
    this.endpointSilenceMs = this.o.endpointSilenceMs;
  }

  async start(): Promise<{ vad: boolean }> {
    this.stop();
    const generation = ++this.generation;
    const model = await this.deps.loadModel().catch(() => null);
    if (generation !== this.generation) {
      model?.dispose();
      return { vad: false };
    }
    this.model = model;
    return { vad: model !== null };
  }

  process(frame: AudioFrame): void {
    const generation = this.generation;
    this.chain = this.chain.then(async () => {
      if (generation !== this.generation) return;
      await this.step(frame, generation);
    });
  }

  setPlaybackActive(active: boolean): void {
    this.playbackActive = active;
  }

  setEndpointSilenceMs(ms: number): void {
    this.endpointSilenceMs = ms;
  }

  stop(): void {
    this.generation += 1;
    this.model?.dispose();
    this.model = null;
    this.windower.reset();
    this.floor = 0;
    this.calibrated = 0;
    this.resetUtterance();
  }

  subscribe(listener: (e: BargeInEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ---- The per-frame decision ---------------------------------------------------------

  private async step(frame: AudioFrame, generation: number): Promise<void> {
    const ms = (frame.samples.length / frame.sampleRate) * 1000;
    const rms = rmsOf(frame.samples);

    // Speech probability for this frame: the most speech-like window in it.
    let probability: number | null = null;
    if (this.model) {
      const windows = this.windower.push(resample(frame.samples, frame.sampleRate, VAD_SAMPLE_RATE));
      for (const w of windows) {
        const p = await this.model.probability(w);
        if (generation !== this.generation) return;
        probability = probability === null ? p : Math.max(probability, p);
      }
    }
    const isSpeech = probability !== null && probability >= this.o.speechProbability;
    const isSilence = probability === null || probability < this.o.silenceProbability;

    // Noise floor: first frames calibrate it; afterwards it only moves during quiet,
    // probable non-speech — a loud sound or a person talking is not "the room".
    const threshold = Math.max(this.floor * this.o.floorMargin, this.o.absoluteMinimum) * (this.playbackActive ? this.o.playbackFactor : 1);
    const loud = this.calibrated >= this.o.calibrationFrames && rms > threshold;
    if (this.calibrated < this.o.calibrationFrames) {
      this.floor = (this.floor * this.calibrated + rms) / (this.calibrated + 1);
      this.calibrated += 1;
    } else if (!loud && !this.inSpeech && this.candidateAt === null && isSilence) {
      this.floor += (rms - this.floor) * 0.05;
    }

    this.emit({ type: "diagnostic", at: frame.at, rms, floor: this.floor, threshold, probability });

    if (this.inSpeech) {
      if (isSpeech || loud) this.silenceMs = 0;
      else {
        this.silenceMs += ms;
        if (this.silenceMs >= this.endpointSilenceMs) {
          this.emit({ type: "speech-end", at: frame.at });
          this.resetUtterance();
        }
      }
      return;
    }

    // Stage 1: loudness over the adaptive threshold, for long enough.
    if (loud) {
      this.loudMs += ms;
      if (this.candidateAt === null && this.loudMs >= this.o.candidateMs) {
        this.candidateAt = frame.at - this.loudMs + ms;
        this.candidateQuietMs = 0;
        this.speechMs = 0;
        this.emit({ type: "candidate", at: this.candidateAt });
      }
    } else this.loudMs = 0;

    // Stage 2: the model must agree, for long enough, while the candidate is open.
    if (this.candidateAt !== null) {
      if (isSpeech) {
        this.speechMs += ms;
        this.candidateQuietMs = 0;
        if (this.speechMs >= this.o.confirmMs) {
          this.inSpeech = true;
          this.silenceMs = 0;
          this.emit({ type: "speech-start", at: frame.at, candidateAt: this.candidateAt });
        }
      } else if (!loud) {
        this.candidateQuietMs += ms;
        if (this.candidateQuietMs >= this.o.candidateDropMs) this.resetUtterance(); // a thump, a cough, a door
      }
    }
  }

  private resetUtterance(): void {
    this.candidateAt = null;
    this.candidateQuietMs = 0;
    this.speechMs = 0;
    this.inSpeech = false;
    this.silenceMs = 0;
    this.loudMs = 0;
  }

  private emit(e: BargeInEvent): void {
    this.listeners.forEach((l) => l(e));
  }
}
