import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCapture, FakeDetector, FakeSpeechAdapter, FakeTranscription, flush, frame } from "@/test/fake-audio";
import { createFakeSpeech } from "@/test/fake-speech";
import { BROWSER_START_TIMEOUT_MS } from "./browser-adapters";
import { BrowserVoiceProvider } from "./browser-voice";
import { ECHO_GUARD_MS, NO_SPEECH_MS, VoiceSessionCoordinator, type AssistantTurn, type UserVoiceTurn, type VoiceFallback, type VoiceStatus } from "./coordinator";
import { VoiceError, type SpeechVoiceProvider, type VoiceCapabilities } from "./provider";

// ---- Fakes -------------------------------------------------------------------------

type Fn<T extends unknown[]> = (...args: T) => void;
class FakeProvider implements SpeechVoiceProvider {
  constructor(public capabilities: VoiceCapabilities = { recognition: true, synthesis: true }) {}
  started: string[] = [];
  stops = 0;
  commits = 0;
  spoken: Array<{ text: string; slow: boolean }> = [];
  speakStops = 0;
  private transcriptCbs = new Set<Fn<[string, number?]>>();
  private interimCbs = new Set<Fn<[string]>>();
  private listenCbs = new Set<Fn<[boolean]>>();
  private speakCbs = new Set<Fn<[boolean]>>();
  private errorCbs = new Set<Fn<[Error]>>();
  async isAvailable() {
    return true;
  }
  async connect() {}
  async disconnect() {}
  async sendTranscript() {}
  onTranscript = (cb: Fn<[string, number?]>) => this.sub(this.transcriptCbs, cb);
  onInterim = (cb: Fn<[string]>) => this.sub(this.interimCbs, cb);
  onListeningChange = (cb: Fn<[boolean]>) => this.sub(this.listenCbs, cb);
  onSpeakingChange = (cb: Fn<[boolean]>) => this.sub(this.speakCbs, cb);
  onError = (cb: Fn<[Error]>) => this.sub(this.errorCbs, cb);
  onAssistantText = () => () => undefined;
  startListening(language: string) {
    this.started.push(language);
    this.listenCbs.forEach((l) => l(true));
  }
  stopListening() {
    this.stops += 1;
    this.listenCbs.forEach((l) => l(false));
  }
  commitListening() {
    this.commits += 1;
  }
  speak(text: string, _language: string, slow = false) {
    this.spoken.push({ text, slow });
  }
  stopSpeaking() {
    this.speakStops += 1;
  }
  // -- drivers (what the engine would do)
  interim = (t: string) => this.interimCbs.forEach((l) => l(t));
  final = (t: string, c?: number) => this.transcriptCbs.forEach((l) => l(t, c));
  ended = () => this.listenCbs.forEach((l) => l(false));
  fail = (code: VoiceError["code"]) => this.errorCbs.forEach((l) => l(new VoiceError(code)));
  voiceStarted = () => this.speakCbs.forEach((l) => l(true));
  voiceEnded = () => this.speakCbs.forEach((l) => l(false));
  /** A transcript callback captured now, to be fired later as a "delayed" event. */
  capture = () => {
    const cbs = [...this.transcriptCbs];
    return (t: string) => cbs.forEach((l) => l(t));
  };
  private sub<T>(set: Set<T>, cb: T) {
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }
}

function collect(c: VoiceSessionCoordinator) {
  const statuses: VoiceStatus[] = [];
  const userTurns: UserVoiceTurn[] = [];
  const assistantTurns: AssistantTurn[] = [];
  const interims: string[] = [];
  const errors: string[] = [];
  const fallbacks: VoiceFallback[] = [];
  c.subscribe((s) => statuses.push(s.status));
  c.onUserTurn((t) => userTurns.push(t));
  c.onAssistantTurn((t) => assistantTurns.push(t));
  c.onInterim((t) => interims.push(t));
  c.onError((e) => errors.push(e));
  c.onFallback((f) => fallbacks.push(f));
  return { statuses, userTurns, assistantTurns, interims, errors, fallbacks };
}

/** Browser engines only (the synchronous path). */
function setup(opts: { provider?: FakeProvider | null; speech?: FakeSpeechAdapter | null } = {}) {
  const provider = opts.provider === undefined ? new FakeProvider() : opts.provider;
  const speech = opts.speech ?? null;
  const c = new VoiceSessionCoordinator({ provider: () => provider, speech: () => speech });
  return { c, provider: provider!, speech, ...collect(c) };
}

/** The realtime engines: OpenAI-shaped input with capture and detector, ElevenLabs-shaped output. */
async function realtime(opts: { vad?: boolean; connect?: boolean; speech?: boolean; mic?: FakeCapture["result"]; provider?: FakeProvider; start?: boolean } = {}) {
  const provider = opts.provider ?? new FakeProvider();
  const transcription = new FakeTranscription();
  transcription.connectResult = opts.connect ?? true;
  const capture = new FakeCapture();
  if (opts.mic) capture.result = opts.mic;
  const detector = new FakeDetector(opts.vad ?? true);
  const speech = opts.speech === false ? null : new FakeSpeechAdapter();
  const c = new VoiceSessionCoordinator({
    provider: () => provider,
    transcription: () => transcription,
    speech: () => speech,
    capture: () => capture,
    detector: () => detector,
  });
  const collected = collect(c);
  if (opts.start !== false) {
    c.startCall("en");
    await flush();
  }
  return { c, provider, transcription, capture, detector, speech: speech!, ...collected };
}

const f = (at: number, amp = 0) => frame(at, amp);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// ---- Input (browser engine) -------------------------------------------------------------------

describe("input turns (browser engine)", () => {
  it("one committed utterance is exactly one UserVoiceTurn, carrying the call and turn identity", () => {
    const { c, provider, userTurns } = setup();
    c.startCall();
    expect(c.getSnapshot().capabilities).toMatchObject({ input: "browser", output: "browser", handsFree: true, duplex: false });
    c.startListening("en");
    expect(c.status.kind).toBe("listening");
    provider.final("I have Metformin 500 milligrams.", 0.9);
    provider.ended();
    expect(userTurns).toEqual([{ id: { callId: 1, turnId: 1 }, text: "I have Metformin 500 milligrams.", confidence: 0.9 }]);
    expect(c.status).toEqual({ kind: "processing", callId: 1, turnId: 1 });
  });

  it("a second final for the same mic turn is dropped: no duplicate submission", () => {
    const { c, provider, userTurns } = setup();
    c.startCall();
    c.startListening("en");
    provider.final("hello");
    provider.final("hello"); // a late duplicate from the same recognition
    expect(userTurns).toHaveLength(1);
  });

  it("interim text replaces the live words and never becomes a turn", () => {
    const { c, provider, userTurns, interims } = setup();
    c.startCall();
    c.startListening("en");
    provider.interim("No, I said");
    provider.interim("No, I said five hundred");
    provider.interim("No, I said five hundred, not eight hundred and fifty.");
    expect(userTurns).toEqual([]);
    expect(interims.at(-1)).toBe("No, I said five hundred, not eight hundred and fifty.");
    provider.final("No, I said five hundred, not eight hundred and fifty.");
    expect(userTurns.map((t) => t.text)).toEqual(["No, I said five hundred, not eight hundred and fifty."]);
    expect(interims.at(-1)).toBe(""); // the live words are cleared once committed
  });

  it("final segments heard across a pause accumulate into one turn (real browser provider)", () => {
    const fake = createFakeSpeech();
    const provider = new BrowserVoiceProvider(fake.env);
    const { c, userTurns } = setup({ provider: provider as unknown as FakeProvider });
    c.startCall();
    c.startListening("en");
    const rec = fake.recognitions[0];
    rec.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: "I have Metformin" }], { isFinal: true })] as never });
    vi.advanceTimersByTime(800);
    rec.onresult?.({
      resultIndex: 1,
      results: [Object.assign([{ transcript: "I have Metformin" }], { isFinal: true }), Object.assign([{ transcript: "500 milligrams." }], { isFinal: true })] as never,
    });
    expect(userTurns).toEqual([]); // still speaking: nothing sent yet
    vi.advanceTimersByTime(1500);
    expect(userTurns.map((t) => t.text)).toEqual(["I have Metformin 500 milligrams."]);
  });

  it("push-to-talk 'send' on the browser engine delivers what was heard instead of dropping it", () => {
    const fake = createFakeSpeech();
    const provider = new BrowserVoiceProvider(fake.env);
    const { c, userTurns } = setup({ provider: provider as unknown as FakeProvider });
    c.startCall();
    c.startListening("en");
    fake.recognitions[0].onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: "I have Metformin 500" }], { isFinal: true })] as never });
    c.commitListening(); // before the 1.5 s pause
    expect(userTurns.map((t) => t.text)).toEqual(["I have Metformin 500"]);
  });

  it("an empty final is ignored and the turn stays open", () => {
    const { c, provider, userTurns } = setup();
    c.startCall();
    c.startListening("en");
    provider.final("   ");
    expect(userTurns).toEqual([]);
    expect(c.status.kind).toBe("listening");
    provider.final("now some words");
    expect(userTurns.map((t) => t.text)).toEqual(["now some words"]);
  });

  it("a transcript from a mic turn that was stopped is rejected", () => {
    const { c, provider, userTurns } = setup();
    c.startCall();
    c.startListening("en");
    c.stopListening();
    provider.final("late words");
    expect(userTurns).toEqual([]);
    c.startListening("en");
    provider.final("fresh words");
    expect(userTurns.map((t) => [t.id.turnId, t.text])).toEqual([[2, "fresh words"]]);
  });

  it("a transcript from a previous call is rejected, even after a new call started", () => {
    const { c, provider, userTurns } = setup();
    c.startCall();
    c.startListening("en");
    const delayed = provider.capture();
    c.endCall();
    delayed("from the old call");
    c.startCall();
    delayed("still from the old call");
    expect(userTurns).toEqual([]);
    c.startListening("en");
    provider.final("new call");
    expect(userTurns.map((t) => t.id.callId)).toEqual([3]); // end and start each advance the call id
  });

  it("the browser mic cannot open while the companion is speaking (no duplex without local detection)", () => {
    const { c, provider } = setup();
    c.startCall();
    c.speak("Hello.", "en");
    c.startListening("en");
    expect(provider.started).toEqual([]);
    expect(c.status).toMatchObject({ kind: "speaking", micOpen: false });
    provider.voiceStarted();
    provider.voiceEnded();
    expect(c.status.kind).toBe("idle");
    c.startListening("en");
    expect(provider.started).toEqual(["en"]);
  });

  it("speaking closes an open mic, and words heard before it are not submitted", () => {
    const { c, provider, userTurns } = setup();
    c.startCall();
    c.startListening("en");
    provider.interim("I was about to");
    c.speak("One moment.", "en");
    expect(provider.stops).toBeGreaterThanOrEqual(1);
    provider.final("I was about to say something");
    expect(userTurns).toEqual([]);
  });

  it("mic errors become a status and an error event; the turn is retired", () => {
    const { c, provider, userTurns, errors } = setup();
    c.startCall();
    c.startListening("en");
    provider.fail("permission-denied");
    provider.ended();
    expect(errors).toEqual(["permission-denied"]);
    expect(c.status).toEqual({ kind: "error", callId: 1, code: "permission-denied" });
    provider.final("ghost");
    expect(userTurns).toEqual([]);
  });
});

// ---- Input (realtime transcription) --------------------------------------------------------------

describe("input turns (realtime transcription, full duplex)", () => {
  it("connecting is a status of its own; then the realtime engines are chosen for the call", async () => {
    const { c, statuses, transcription, capture, detector, speech } = await realtime({ start: false });
    c.startCall("zh-Hans");
    expect(c.status).toEqual({ kind: "connecting", callId: 1 });
    c.startListening("zh-Hans"); // too early: nothing happens
    expect(transcription.begun).toEqual([]);
    await flush();
    expect(statuses.at(-1)).toEqual({ kind: "idle", callId: 1 });
    expect(c.getSnapshot().capabilities).toEqual({ input: "openai-realtime", output: "elevenlabs", handsFree: true, duplex: true, autoInterrupt: true });
    expect(capture.starts).toBe(1);
    expect(detector.starts).toBe(1);
    expect(transcription.connects).toEqual([{ callId: 1, language: "zh-Hans" }]); // the language is passed through
    expect(speech.connects).toBe(1);
  });

  it("audio is sent for transcription only while a user turn is open — never the companion's playback", async () => {
    const { c, transcription, capture, speech } = await realtime();
    capture.feed(f(0, 0.1)); // idle: nothing listens
    c.speak("Here is what your record says.", "en");
    speech.started();
    capture.feed(f(64, 0.3)); // the companion's own voice in the room
    capture.feed(f(128, 0.3));
    expect(transcription.appended).toEqual([]);
    speech.ended();
    c.startListening("en");
    capture.feed(f(192, 0.1));
    expect(transcription.appended.map((a) => a.frame.at)).toEqual([192]);
  });

  it("hands-free: confirmed speech then the endpoint pause commits the turn; the final becomes the one UserVoiceTurn, leading words intact", async () => {
    const { c, transcription, capture, detector, userTurns, interims } = await realtime();
    c.startListening("en");
    const turn = transcription.begun[0];
    capture.feed(f(0, 0.1));
    detector.emit({ type: "candidate", at: 200 });
    detector.emit({ type: "speech-start", at: 500, candidateAt: 200 });
    transcription.interim("I have");
    transcription.interim("I have Metformin");
    expect(interims.at(-1)).toBe("I have Metformin");
    expect(userTurns).toEqual([]); // interim words are never a turn
    detector.emit({ type: "speech-end", at: 1600 });
    expect(transcription.committed).toEqual([turn]);
    expect(c.status).toEqual({ kind: "processing", callId: 1, turnId: turn.turnId });
    transcription.final("I have Metformin 500", turn, 0.93);
    expect(userTurns).toEqual([{ id: turn, text: "I have Metformin 500", confidence: 0.93 }]);
    expect(interims.at(-1)).toBe("");
    transcription.final("I have Metformin 500", turn); // a duplicate final for the same turn
    expect(userTurns).toHaveLength(1);
  });

  it("a committed turn awaiting its transcript is not reopened; its late final still counts, a final after cancel does not", async () => {
    const { c, transcription, detector, userTurns } = await realtime();
    c.startListening("en");
    detector.emit({ type: "speech-start", at: 500, candidateAt: 200 });
    detector.emit({ type: "speech-end", at: 1600 });
    c.startListening("en"); // the listen loop asking again while processing
    expect(transcription.begun).toHaveLength(1);
    transcription.final("the words", transcription.begun[0]);
    expect(userTurns).toHaveLength(1);

    c.startListening("en");
    c.stopListening();
    expect(transcription.cancelled).toEqual([transcription.begun[1]]);
    transcription.final("late words", transcription.begun[1]);
    expect(userTurns).toHaveLength(1);
  });

  it("an open hands-free mic with no confirmed speech is silence after a while: the turn is dropped and reported", async () => {
    const { c, transcription, errors } = await realtime();
    c.startListening("en");
    vi.advanceTimersByTime(NO_SPEECH_MS);
    expect(transcription.cancelled).toHaveLength(1);
    expect(errors).toEqual(["no-speech"]);
    expect(c.status).toEqual({ kind: "idle", callId: 1 });
  });

  it("an empty final (nothing recognised) closes the turn quietly; the engine's turn-closed does too", async () => {
    const { c, transcription, detector, userTurns } = await realtime();
    c.startListening("en");
    detector.emit({ type: "speech-start", at: 500, candidateAt: 200 });
    detector.emit({ type: "speech-end", at: 1600 });
    transcription.final("   ");
    expect(userTurns).toEqual([]);
    expect(c.status).toEqual({ kind: "idle", callId: 1 });
    c.startListening("en");
    transcription.closed();
    expect(c.status).toEqual({ kind: "idle", callId: 1 });
  });

  it("the slow-speaker setting lengthens the endpoint pause", async () => {
    const { c, detector } = await realtime();
    expect(detector.endpointMs.at(-1)).toBe(900);
    c.setSlowEndpoint(true);
    expect(detector.endpointMs.at(-1)).toBe(1400);
  });

  it("without the local VAD there is no hands-free: push-to-talk begins and sends a turn", async () => {
    const { c, transcription, capture, detector, userTurns } = await realtime({ vad: false });
    expect(c.getSnapshot().capabilities).toMatchObject({ input: "openai-realtime", handsFree: false, duplex: false });
    c.startListening("en");
    capture.feed(f(0, 0.1));
    detector.emit({ type: "speech-end", at: 900 }); // nothing confirmed, so nothing to end
    expect(transcription.committed).toEqual([]);
    vi.advanceTimersByTime(NO_SPEECH_MS); // and no silence timer in push-to-talk
    expect(c.status.kind).toBe("listening");
    c.commitListening();
    expect(transcription.committed).toHaveLength(1);
    transcription.final("I have Metformin 500");
    expect(userTurns.map((t) => t.text)).toEqual(["I have Metformin 500"]);
  });

  it("if the realtime input can't connect, the browser's engine is the input for the call (one-way), and the mic is released", async () => {
    const { c, capture, detector, provider } = await realtime({ connect: false });
    expect(c.getSnapshot().capabilities).toMatchObject({ input: "browser", output: "elevenlabs", duplex: false });
    expect(capture.stops).toBeGreaterThan(0);
    expect(detector.stops).toBeGreaterThan(0);
    c.startListening("en");
    expect(provider.started).toEqual(["en"]);
  });

  it("a refused microphone is reported and the browser engine is tried instead", async () => {
    const { c, errors } = await realtime({ mic: { ok: false, code: "permission-denied" } });
    expect(errors).toEqual(["permission-denied"]);
    expect(c.getSnapshot().capabilities.input).toBe("browser");
  });

  it("a realtime input error retires the open turn and surfaces as an error", async () => {
    const { c, transcription, errors, userTurns } = await realtime();
    c.startListening("en");
    transcription.fail("network");
    expect(errors).toEqual(["network"]);
    expect(c.status).toEqual({ kind: "error", callId: 1, code: "network" });
    transcription.final("ghost", transcription.begun[0]);
    expect(userTurns).toEqual([]);
  });
});

// ---- Barge-in ---------------------------------------------------------------------------------------

describe("barge-in: interrupting the companion by speaking", () => {
  it("confirmed speech during playback stops the voice, keeps its words, and opens a user turn that includes the pre-roll", async () => {
    const { c, transcription, capture, detector, speech, assistantTurns, userTurns, statuses } = await realtime();
    c.speak("Your record says one tablet twice daily. What does the label say?", "en");
    speech.started();
    expect(c.status).toMatchObject({ kind: "speaking", adapter: "elevenlabs", audioStarted: true, micOpen: true });
    expect(detector.playbackActive.at(-1)).toBe(true);
    for (let at = 0; at <= 896; at += 64) capture.feed(f(at, 0.05));
    expect(transcription.appended).toEqual([]);

    detector.emit({ type: "candidate", at: 400 }); // loudness alone
    expect(c.status.kind).toBe("speaking");
    expect(speech.interrupts).toEqual([]);

    detector.emit({ type: "speech-start", at: 900, candidateAt: 400 });
    expect(speech.interrupts).toEqual([assistantTurns[0].id]);
    expect(statuses.at(-2)).toEqual({ kind: "interrupted", callId: 1, turnId: 1, reason: "user" });
    expect(c.status).toMatchObject({ kind: "listening", afterInterrupt: true });
    expect(detector.playbackActive.at(-1)).toBe(false);
    // The pre-roll: audio from before the candidate was even raised is part of the turn.
    const turn = transcription.begun[0];
    const appendedAt = transcription.appended.map((a) => a.frame.at);
    expect(appendedAt[0]).toBeLessThan(400);
    expect(appendedAt.at(-1)).toBe(896);
    expect(transcription.appended.every((a) => a.identity === turn)).toBe(true);
    expect(assistantTurns[0].text).toBe("Your record says one tablet twice daily. What does the label say?"); // the words stay

    capture.feed(f(960, 0.1)); // live audio keeps flowing into the turn
    detector.emit({ type: "speech-end", at: 1900 });
    expect(transcription.committed).toEqual([turn]);
    transcription.final("No, I said five hundred, not eight hundred and fifty.", turn);
    expect(userTurns.map((t) => t.text)).toEqual(["No, I said five hundred, not eight hundred and fifty."]);

    speech.ended(assistantTurns[0].id); // a late event from the interrupted line
    speech.breakMidLine(assistantTurns[0].id);
    expect(c.status).toEqual({ kind: "processing", callId: 1, turnId: turn.turnId });
  });

  it("loudness alone (a cough, a door) never interrupts: only a confirmed speech-start does", async () => {
    const { c, detector, speech } = await realtime();
    c.speak("Hello.", "en");
    speech.started();
    detector.emit({ type: "candidate", at: 100 });
    detector.emit({ type: "candidate", at: 300 });
    expect(c.status).toMatchObject({ kind: "speaking", audioStarted: true });
    expect(speech.interrupts).toEqual([]);
  });

  it("with automatic interruption off, confirmed speech does not stop the companion; a tap still does", async () => {
    const { c, detector, speech } = await realtime();
    c.setAutoInterrupt(false);
    expect(c.getSnapshot().capabilities.autoInterrupt).toBe(false);
    c.speak("Hello.", "en");
    speech.started();
    expect(c.status).toMatchObject({ kind: "speaking", micOpen: false });
    detector.emit({ type: "speech-start", at: 900, candidateAt: 400 });
    expect(c.status.kind).toBe("speaking");
    c.interrupt();
    expect(c.status).toEqual({ kind: "interrupted", callId: 1, turnId: 1, reason: "user" });
    expect(speech.interrupts).toHaveLength(1);
  });

  it("speech confirmed right after the companion's audio ended is its own tail, not an interruption of the next line", async () => {
    const { c, capture, detector, speech } = await realtime();
    c.speak("First.", "en");
    speech.started();
    capture.feed(f(1000, 0.05));
    speech.ended();
    c.speak("Second.", "en");
    speech.started();
    detector.emit({ type: "speech-start", at: 1000 + ECHO_GUARD_MS - 1, candidateAt: 800 });
    expect(c.status).toMatchObject({ kind: "speaking", turnId: 2 });
    detector.emit({ type: "speech-start", at: 1000 + ECHO_GUARD_MS + 64, candidateAt: 1000 });
    expect(c.status).toMatchObject({ kind: "listening", afterInterrupt: true });
  });

  it("during a listening turn, confirmed speech only marks the turn as heard (it does not restart it)", async () => {
    const { c, transcription, detector } = await realtime();
    c.startListening("en");
    detector.emit({ type: "speech-start", at: 500, candidateAt: 200 });
    detector.emit({ type: "speech-start", at: 1200, candidateAt: 1000 });
    expect(transcription.begun).toHaveLength(1);
    vi.advanceTimersByTime(NO_SPEECH_MS); // heard speech: the silence clock no longer applies
    expect(c.status.kind).toBe("listening");
  });
});

// ---- Output ------------------------------------------------------------------------------------------

describe("output: one voice per call", () => {
  it("every spoken line exists as a visible AssistantTurn with the same text, before any audio", async () => {
    const { c, speech, assistantTurns } = await realtime();
    const turn = c.speak("  Here is what your record says. ", "en");
    expect(assistantTurns).toEqual([turn]);
    expect(turn?.text).toBe("Here is what your record says.");
    expect(speech.requests.map((s) => s.text)).toEqual(["Here is what your record says."]);
    expect(c.status).toMatchObject({ kind: "speaking", adapter: "elevenlabs", audioStarted: false }); // "preparing voice"
    speech.started();
    expect(c.status).toMatchObject({ kind: "speaking", audioStarted: true });
    speech.ended();
    expect(c.status).toEqual({ kind: "idle", callId: 1 });
  });

  it("a line asked for while connecting is visible at once and voiced when the engines are ready", async () => {
    const { c, speech, assistantTurns } = await realtime({ start: false });
    c.startCall("en");
    const turn = c.speak("Hello, I’m an AI guide.", "en");
    expect(assistantTurns).toEqual([turn]);
    expect(c.getSnapshot().lastAssistant).toEqual(turn);
    expect(speech.requests).toEqual([]);
    await flush();
    expect(speech.requests.map((s) => s.text)).toEqual(["Hello, I’m an AI guide."]);
    expect(c.status).toMatchObject({ kind: "speaking", adapter: "elevenlabs" });
  });

  it("the streaming voice is chosen at call start and stays the voice for every turn of the call", async () => {
    const { c, provider, speech } = await realtime();
    expect(c.outputAdapter).toBe("elevenlabs");
    for (const line of ["Hello.", "What would you like to know?", "Here is what your record says."]) {
      c.speak(line, "en");
      speech.started();
      speech.ended();
      expect(c.status.kind).toBe("idle");
    }
    expect(speech.requests).toHaveLength(3);
    expect(provider.spoken).toEqual([]); // the browser voice never spoke
  });

  it("if the streaming voice fails before any audio, the browser voice says that line and every later one (one-way), and says so", async () => {
    const { c, provider, speech, fallbacks } = await realtime();
    c.speak("Hello.", "en");
    speech.failBeforeAudio();
    expect(provider.spoken.map((s) => s.text)).toEqual(["Hello."]);
    expect(c.outputAdapter).toBe("browser");
    expect(c.status).toMatchObject({ kind: "speaking", adapter: "browser", audioStarted: false });
    expect(fallbacks).toEqual([{ kind: "output", from: "elevenlabs", to: "browser", reason: "websocket-failed" }]);
    expect(speech.disconnects).toBe(1);
    provider.voiceStarted();
    provider.voiceEnded();
    c.speak("Next line.", "en");
    expect(speech.requests).toHaveLength(1); // not tried again this call
    expect(provider.spoken.map((s) => s.text)).toEqual(["Hello.", "Next line."]);
  });

  it("a streaming failure after audio started stops the line: interrupted, no second voice, text kept, Repeat says it again", async () => {
    const { c, provider, speech, assistantTurns } = await realtime();
    c.speak("Your record says one tablet. What does the label say?", "en");
    speech.started();
    speech.breakMidLine();
    expect(c.status).toEqual({ kind: "interrupted", callId: 1, turnId: 1, reason: "playback" });
    expect(provider.spoken).toEqual([]); // the browser did not finish the sentence
    expect(c.outputAdapter).toBe("elevenlabs"); // no mid-utterance switch
    expect(assistantTurns[0].text).toBe("Your record says one tablet. What does the label say?");
    const again = c.speak(assistantTurns[0].text, "en", { slow: true });
    expect(again?.text).toBe(assistantTurns[0].text);
    expect(speech.requests.at(-1)).toMatchObject({ text: assistantTurns[0].text, slow: true });
  });

  it("a line the streaming voice is not allowed to say stays on screen unvoiced: no second voice, the call's voice unchanged", async () => {
    const { c, provider, speech, fallbacks, assistantTurns } = await realtime();
    c.speak("Some line.", "en");
    speech.failBeforeAudio("unapproved");
    expect(provider.spoken).toEqual([]); // one voice per call: the browser does not say it
    expect(assistantTurns.map((t) => t.text)).toEqual(["Some line."]); // still visible
    expect(c.outputAdapter).toBe("elevenlabs");
    expect(fallbacks).toEqual([]);
    expect(c.status.kind).toBe("idle");
    c.speak("Next line.", "en");
    expect(speech.requests.map((s) => s.text)).toEqual(["Some line.", "Next line."]);
  });

  it("once the streaming voice has been heard, a later failure never switches to another voice", async () => {
    // A passing problem with one line: that line is interrupted (Repeat), the voice stays.
    const transient = await realtime();
    transient.c.speak("First.", "en");
    transient.speech.started();
    transient.speech.ended();
    transient.c.speak("Second.", "en");
    transient.speech.failBeforeAudio("websocket-failed");
    expect(transient.provider.spoken).toEqual([]);
    expect(transient.c.status).toMatchObject({ kind: "interrupted", reason: "playback" });
    expect(transient.c.outputAdapter).toBe("elevenlabs");
    expect(transient.fallbacks).toEqual([]);
    transient.c.speak("Second.", "en", { slow: true }); // Repeat: the same voice again
    expect(transient.speech.requests.at(-1)?.text).toBe("Second.");

    // Credits used up mid-call: words only from here, said once — never the browser voice.
    const terminal = await realtime();
    terminal.c.speak("First.", "en");
    terminal.speech.started();
    terminal.speech.ended();
    terminal.c.speak("Second.", "en");
    terminal.speech.failBeforeAudio("quota-exceeded");
    expect(terminal.provider.spoken).toEqual([]);
    expect(terminal.c.outputAdapter).toBe("text-only");
    expect(terminal.c.status.kind).toBe("idle");
    expect(terminal.fallbacks).toEqual([{ kind: "output", from: "elevenlabs", to: "text-only", reason: "quota-exceeded" }]);
    const turn = terminal.c.speak("Third.", "en");
    expect(turn?.text).toBe("Third."); // still a visible turn
    expect(terminal.speech.requests).toHaveLength(2); // not tried again this call
    expect(terminal.provider.spoken).toEqual([]);
  });

  it("a configured voice the account can't use is announced once at call start; an unconfigured one is not", async () => {
    const unusable = await realtime({ start: false });
    unusable.speech.connectResult = false;
    unusable.speech.unavailableReason = "voice-unavailable";
    unusable.c.startCall("en");
    await flush();
    expect(unusable.c.outputAdapter).toBe("browser");
    expect(unusable.fallbacks).toEqual([{ kind: "output", from: "elevenlabs", to: "browser", reason: "voice-unavailable" }]);
    unusable.c.speak("Hello.", "en");
    expect(unusable.speech.requests).toEqual([]);
    expect(unusable.provider.spoken.map((s) => s.text)).toEqual(["Hello."]);

    const unconfigured = await realtime({ start: false });
    unconfigured.speech.connectResult = false;
    unconfigured.speech.unavailableReason = "unconfigured";
    unconfigured.c.startCall("en");
    await flush();
    expect(unconfigured.c.outputAdapter).toBe("browser");
    expect(unconfigured.fallbacks).toEqual([]);
  });

  it("the browser voice is used when no streaming voice connects; words only when there is no voice at all", async () => {
    const { c, provider } = setup();
    c.startCall();
    expect(c.outputAdapter).toBe("browser");
    c.speak("Hello.", "en");
    expect(provider.spoken.map((s) => s.text)).toEqual(["Hello."]);

    const silent = setup({ provider: new FakeProvider({ recognition: false, synthesis: false }) });
    silent.c.startCall();
    expect(silent.c.status).toEqual({ kind: "unavailable", callId: 1 });
    const turn = silent.c.speak("Hello.", "en");
    expect(turn?.text).toBe("Hello."); // still a visible turn
    expect(silent.provider.spoken).toEqual([]);
    expect(silent.c.status.kind).toBe("unavailable");

    const none = await realtime({ connect: false, provider: new FakeProvider({ recognition: false, synthesis: false }) });
    none.speech.connectResult = false;
    none.c.endCall();
    none.c.startCall("en");
    await flush();
    expect(none.c.getSnapshot().capabilities).toMatchObject({ input: "text-only", output: "text-only" });
    expect(none.c.status.kind).toBe("unavailable");
  });

  it("a browser voice that never starts is an interruption, not a second attempt", () => {
    const { c, provider } = setup();
    c.startCall();
    c.speak("Hello.", "en");
    vi.advanceTimersByTime(BROWSER_START_TIMEOUT_MS);
    expect(c.status).toEqual({ kind: "interrupted", callId: 1, turnId: 1, reason: "playback" });
    expect(provider.spoken).toHaveLength(1);
  });

  it("a new call chooses the voice afresh", async () => {
    const { c, speech } = await realtime();
    c.speak("Hello.", "en");
    speech.failBeforeAudio();
    expect(c.outputAdapter).toBe("browser");
    c.endCall();
    c.startCall("en");
    await flush();
    expect(c.outputAdapter).toBe("elevenlabs");
  });
});

describe("stale playback and interruption", () => {
  it("a completion from a superseded line cannot change the current status", async () => {
    const { c, speech } = await realtime();
    c.speak("First.", "en");
    speech.started();
    const first = speech.requests[0].identity;
    c.speak("Second.", "en"); // replaces the first
    expect(speech.interrupts).toEqual([first]);
    speech.ended(first); // the first line's audio reporting its end late
    expect(c.status).toMatchObject({ kind: "speaking", turnId: 2, audioStarted: false });
    speech.started();
    expect(c.status).toMatchObject({ kind: "speaking", turnId: 2, audioStarted: true });
  });

  it("a browser 'speaking ended' before the current line started is a failure to start, whatever call it came from", () => {
    const { c, provider } = setup();
    c.startCall();
    c.speak("Hello.", "en");
    provider.voiceStarted();
    c.endCall();
    c.startCall();
    c.speak("Again.", "en");
    provider.voiceEnded();
    expect(c.status).toEqual({ kind: "interrupted", callId: 3, turnId: 2, reason: "playback" });
  });

  it("interrupt() stops audio, keeps the text, retires the turn and ignores late callbacks", async () => {
    const { c, provider, speech, assistantTurns, statuses } = await realtime();
    c.speak("A long explanation.", "en");
    speech.started();
    c.interrupt();
    expect(c.status).toEqual({ kind: "interrupted", callId: 1, turnId: 1, reason: "user" });
    expect(speech.interrupts).toHaveLength(1);
    expect(provider.speakStops).toBeGreaterThan(0);
    expect(assistantTurns[0].text).toBe("A long explanation.");
    const before = statuses.length;
    speech.ended(); // late completion
    speech.breakMidLine(); // late failure
    expect(statuses).toHaveLength(before);
    expect(c.status.kind).toBe("interrupted");
  });

  it("interrupt() while listening drops the partial transcript and submits nothing", () => {
    const { c, provider, userTurns } = setup();
    c.startCall();
    c.startListening("en");
    provider.interim("I think I");
    c.interrupt();
    expect(c.status).toEqual({ kind: "interrupted", callId: 1, turnId: 1, reason: "user" });
    provider.final("I think I take two");
    expect(userTurns).toEqual([]);
  });

  it("ending the call releases every engine; delayed starts, finals and chunks are ignored", async () => {
    const { c, transcription, capture, detector, speech, provider, userTurns } = await realtime();
    c.startListening("en");
    const turn = transcription.begun[0];
    c.speak("Hello.", "en");
    c.endCall();
    expect(capture.stops).toBe(1);
    expect(detector.stops).toBe(1);
    expect(transcription.disconnects).toBe(1);
    expect(speech.disconnects).toBe(1);
    expect(provider.speakStops).toBeGreaterThan(0);
    expect(provider.stops).toBeGreaterThan(0);
    speech.started();
    transcription.final("late", turn);
    capture.feed(f(5000, 0.3));
    expect(userTurns).toEqual([]);
    expect(transcription.appended).toEqual([]);
    expect(c.status).toEqual({ kind: "idle", callId: 2 });
    expect(c.outputAdapter).toBeNull();
    expect(c.getSnapshot().capabilities.input).toBeNull();
  });

  it("ending the call while it is still connecting discards the connection result", async () => {
    const { c, start } = { ...(await realtime({ start: false })), start: true };
    expect(start).toBe(true);
    c.startCall("en");
    c.endCall();
    await flush();
    expect(c.status).toEqual({ kind: "idle", callId: 2 });
    expect(c.getSnapshot().capabilities.input).toBeNull();
  });
});

describe("mute: nothing the person says reaches transcription or becomes a turn", () => {
  it("muting drops the open turn, opens no new one, and sends no audio", async () => {
    const { c, transcription, capture, userTurns, interims } = await realtime();
    c.startListening("en");
    capture.feed(f(0, 0.1));
    expect(transcription.appended).toHaveLength(1);
    transcription.interim("I have");

    c.setMuted(true);
    expect(c.isMuted).toBe(true);
    expect(transcription.cancelled).toEqual([transcription.begun[0]]);
    expect(interims.at(-1)).toBe(""); // the live words are cleared
    c.startListening("en"); // the listen loop asking again
    c.commitListening();
    capture.feed(f(64, 0.3));
    capture.feed(f(128, 0.3));
    expect(transcription.begun).toHaveLength(1);
    expect(transcription.appended).toHaveLength(1); // nothing after mute
    transcription.final("late words", transcription.begun[0]);
    expect(userTurns).toEqual([]);
  });

  it("muted, confirmed speech does not interrupt the companion, and the status says the mic is not open", async () => {
    const { c, transcription, detector, speech } = await realtime();
    c.speak("Here is what your record says.", "en");
    speech.started();
    expect(c.status).toMatchObject({ kind: "speaking", micOpen: true });
    c.setMuted(true);
    expect(c.status).toMatchObject({ kind: "speaking", micOpen: false });
    detector.emit({ type: "speech-start", at: 5000, candidateAt: 4600 });
    expect(speech.interrupts).toEqual([]);
    expect(transcription.begun).toEqual([]);
    expect(c.status.kind).toBe("speaking");
    c.interrupt(); // a tap still interrupts
    expect(speech.interrupts).toHaveLength(1);
  });

  it("unmuting resumes the same call; a new call always starts unmuted", async () => {
    const { c, transcription, userTurns } = await realtime();
    c.setMuted(true);
    c.setMuted(false);
    c.startListening("en");
    expect(transcription.begun).toHaveLength(1);
    expect(transcription.begun[0].callId).toBe(1);
    transcription.closed();
    c.setMuted(true);
    c.endCall();
    c.startCall("en");
    await flush();
    expect(c.isMuted).toBe(false);
    c.startListening("en");
    expect(transcription.begun.at(-1)?.callId).toBe(3);
    expect(userTurns).toEqual([]);
  });

  it("the browser engine is stopped by mute too, and its late words are dropped", () => {
    const { c, provider, userTurns } = setup();
    c.startCall();
    c.startListening("en");
    c.setMuted(true);
    expect(provider.stops).toBeGreaterThan(0);
    provider.final("I take two");
    c.startListening("en");
    expect(provider.started).toEqual(["en"]);
    expect(userTurns).toEqual([]);
  });
});
