import { describe, expect, it } from "vitest";
import { flush, frame, FRAME_MS, noise, ScriptedModel, silence, tone } from "@/test/fake-audio";
import type { BargeInEvent } from "./adapters";
import { BARGE_IN_DEFAULTS, HybridBargeInDetector } from "./barge-in";

/** A detector over a scripted model; frames are fed in order and settled before reading events. */
async function detector(model: ScriptedModel | null, options?: ConstructorParameters<typeof HybridBargeInDetector>[0]["options"]) {
  const d = new HybridBargeInDetector({ loadModel: async () => model, options });
  const events: BargeInEvent[] = [];
  d.subscribe((e) => {
    if (e.type !== "diagnostic") events.push(e);
  });
  const diagnostics: Array<Extract<BargeInEvent, { type: "diagnostic" }>> = [];
  d.subscribe((e) => {
    if (e.type === "diagnostic") diagnostics.push(e);
  });
  const vad = await d.start();
  let at = 0;
  const feed = async (samples: Float32Array, count = 1) => {
    for (let i = 0; i < count; i++) {
      d.process(frame(at, samples));
      at += FRAME_MS;
    }
    await flush(count * 8);
  };
  return { d, events, diagnostics, vad, feed, now: () => at };
}

const quiet = () => noise(1536, 0.002, 7); // a room's hum
const loud = () => tone(1536, 0.3);
const CAL = BARGE_IN_DEFAULTS.calibrationFrames;
const framesFor = (ms: number) => Math.ceil(ms / FRAME_MS);

describe("hybrid barge-in detector", () => {
  it("calibrates the noise floor at call start and never reacts to a quiet room", async () => {
    const t = await detector(new ScriptedModel([0.05]));
    await t.feed(quiet(), CAL + 20);
    expect(t.events).toEqual([]);
    const last = t.diagnostics.at(-1)!;
    expect(last.floor).toBeGreaterThan(0);
    expect(last.threshold).toBeGreaterThanOrEqual(BARGE_IN_DEFAULTS.absoluteMinimum);
  });

  it("loudness alone (the model says no speech) raises a candidate at most — never speech-start", async () => {
    const t = await detector(new ScriptedModel([0.05]));
    await t.feed(quiet(), CAL);
    await t.feed(loud(), framesFor(2000));
    expect(t.events.map((e) => e.type)).toEqual(["candidate"]);
  });

  it("speech probability alone (quiet speech under the threshold) is not enough either", async () => {
    const t = await detector(new ScriptedModel([0.95]));
    await t.feed(quiet(), CAL);
    await t.feed(quiet(), framesFor(2000));
    expect(t.events).toEqual([]);
  });

  it("loudness AND speech for long enough confirm speech-start, reporting when the candidate began", async () => {
    const model = new ScriptedModel(new Array(CAL * 2).fill(0.05).concat([0.9]));
    const t = await detector(model);
    await t.feed(quiet(), CAL);
    const start = t.now();
    await t.feed(loud(), framesFor(BARGE_IN_DEFAULTS.candidateMs + BARGE_IN_DEFAULTS.confirmMs + FRAME_MS));
    const types = t.events.map((e) => e.type);
    expect(types).toEqual(["candidate", "speech-start"]);
    const s = t.events[1] as Extract<BargeInEvent, { type: "speech-start" }>;
    expect(s.candidateAt).toBeGreaterThanOrEqual(start);
    expect(s.at - s.candidateAt).toBeGreaterThanOrEqual(BARGE_IN_DEFAULTS.confirmMs - FRAME_MS);
  });

  it("a short loud sound (a cough) is a candidate that is dropped, not speech", async () => {
    const t = await detector(new ScriptedModel([0.05]));
    await t.feed(quiet(), CAL);
    await t.feed(loud(), framesFor(BARGE_IN_DEFAULTS.candidateMs + FRAME_MS));
    expect(t.events.map((e) => e.type)).toEqual(["candidate"]);
    await t.feed(quiet(), framesFor(BARGE_IN_DEFAULTS.candidateDropMs + FRAME_MS));
    await t.feed(loud(), framesFor(BARGE_IN_DEFAULTS.candidateMs + FRAME_MS));
    expect(t.events.map((e) => e.type)).toEqual(["candidate", "candidate"]); // a fresh candidate: the first was dropped
  });

  it("the endpoint pause after confirmed speech emits speech-end — longer when set for a slow speaker", async () => {
    for (const [slow, pause] of [
      [false, BARGE_IN_DEFAULTS.endpointSilenceMs],
      [true, BARGE_IN_DEFAULTS.slowEndpointSilenceMs],
    ] as const) {
      const loudFrames = framesFor(BARGE_IN_DEFAULTS.candidateMs + BARGE_IN_DEFAULTS.confirmMs + FRAME_MS);
      // two 512-sample windows per frame: the model says "speech" exactly while the loud frames last
      const model = new ScriptedModel(new Array(CAL * 2).fill(0.05).concat(new Array(loudFrames * 2).fill(0.9), [0.05]));
      const t = await detector(model);
      if (slow) t.d.setEndpointSilenceMs(BARGE_IN_DEFAULTS.slowEndpointSilenceMs);
      await t.feed(quiet(), CAL);
      await t.feed(loud(), loudFrames);
      expect(t.events.map((e) => e.type)).toEqual(["candidate", "speech-start"]);
      await t.feed(quiet(), framesFor(pause) - 2);
      expect(t.events.map((e) => e.type)).toEqual(["candidate", "speech-start"]); // not yet
      await t.feed(quiet(), 3);
      expect(t.events.map((e) => e.type)).toEqual(["candidate", "speech-start", "speech-end"]);
    }
  });

  it("without the local model nothing can ever be confirmed (vad: false), so the caller must use push-to-talk", async () => {
    const t = await detector(null);
    expect(t.vad).toEqual({ vad: false });
    await t.feed(quiet(), CAL);
    await t.feed(loud(), framesFor(3000));
    expect(t.events.map((e) => e.type)).toEqual(["candidate"]);
  });

  it("while the companion's audio plays the loudness threshold is raised, and the floor is not learnt from speech", async () => {
    const t = await detector(new ScriptedModel([0.05]));
    await t.feed(quiet(), CAL + 2);
    const before = t.diagnostics.at(-1)!;
    t.d.setPlaybackActive(true);
    await t.feed(quiet(), 1);
    const during = t.diagnostics.at(-1)!;
    expect(during.threshold).toBeCloseTo(before.threshold * BARGE_IN_DEFAULTS.playbackFactor, 6);
    t.d.setPlaybackActive(false);

    const speechy = new ScriptedModel(new Array(CAL * 2).fill(0.05).concat([0.9]));
    const u = await detector(speechy);
    await u.feed(quiet(), CAL);
    const floorBefore = u.diagnostics.at(-1)!.floor;
    await u.feed(loud(), framesFor(2000));
    expect(u.events.map((e) => e.type)).toEqual(["candidate", "speech-start"]);
    expect(u.diagnostics.at(-1)!.floor).toBeCloseTo(floorBefore, 6); // a person talking is not "the room"
  });

  it("stop() disposes the model and ignores frames still in flight", async () => {
    const model = new ScriptedModel([0.9]);
    const t = await detector(model);
    t.d.process(frame(0, silence()));
    t.d.stop();
    await flush();
    expect(model.disposed).toBe(true);
  });

  it("diagnostics carry numbers only — no samples, no words", async () => {
    const t = await detector(new ScriptedModel([0.3]));
    await t.feed(quiet(), 2);
    expect(Object.keys(t.diagnostics[0]).sort()).toEqual(["at", "floor", "probability", "rms", "threshold", "type"]);
  });
});
