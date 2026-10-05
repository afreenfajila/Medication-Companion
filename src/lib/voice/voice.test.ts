import { describe, expect, it, vi } from "vitest";
import { resolveExplanation } from "@/lib/content/explanation";
import { t as translate } from "@/lib/content/translations";
import { createFakeSpeech } from "@/test/fake-speech";
import { toConfirmMatch, toExplain, run, startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo, resolve } from "@/test/helpers";
import { BrowserVoiceProvider, pickVoice } from "./browser-voice";
import { interpretUtterance } from "./commands";
import { VoiceError } from "./provider";
import { speakableText } from "./speakable";

const en = (k: Parameters<typeof translate>[1]) => translate("en", k);

describe("pickVoice", () => {
  it("prefers a natural/neural/network voice over a classic local one", () => {
    const voices = [
      { name: "Microsoft David Desktop", lang: "en-US", localService: true },
      { name: "Google US English", lang: "en-US", localService: false },
    ];
    expect(pickVoice(voices, "en")?.name).toBe("Google US English");
  });

  it("never picks a novelty/joke voice even if it's the only close match", () => {
    const voices = [
      { name: "Zarvox", lang: "en-US" },
      { name: "Some Generic Voice", lang: "en-US" },
    ];
    expect(pickVoice(voices, "en")?.name).toBe("Some Generic Voice");
  });

  it("only considers voices matching the requested language", () => {
    const voices = [
      { name: "Google 普通话（中国大陆）", lang: "zh-CN" },
      { name: "Google US English", lang: "en-US" },
    ];
    expect(pickVoice(voices, "zh-Hans")?.name).toBe("Google 普通话（中国大陆）");
  });

  it("returns null when nothing matches the requested language", () => {
    expect(pickVoice([{ name: "Google US English", lang: "en-US" }], "zh-Hans")).toBeNull();
  });

  it("returns null for an empty list rather than throwing", () => {
    expect(pickVoice([], "en")).toBeNull();
  });
});

describe("BrowserVoiceProvider", () => {
  it("opens nothing on construct/connect: no mic use and no speech until a user action", async () => {
    const fake = createFakeSpeech();
    const p = new BrowserVoiceProvider(fake.env);
    await p.connect();
    expect(await p.isAvailable()).toBe(true);
    expect(fake.recognitions).toHaveLength(0);
    expect(fake.utterances).toHaveLength(0);
  });

  it("reports capabilities and falls back cleanly when unsupported", async () => {
    const none = new BrowserVoiceProvider(createFakeSpeech({ recognition: false, synthesis: false }).env);
    expect(none.capabilities).toEqual({ recognition: false, synthesis: false });
    expect(await none.isAvailable()).toBe(false);
    const errors: Error[] = [];
    none.onError((e) => errors.push(e));
    none.startListening("en");
    expect(errors[0]).toMatchObject({ code: "unsupported" });
    expect(() => none.speak("hello", "en")).not.toThrow();
  });

  it("accepts the webkit-prefixed recognition constructor", () => {
    const fake = createFakeSpeech();
    const env = { webkitSpeechRecognition: fake.env.SpeechRecognition };
    expect(new BrowserVoiceProvider(env).capabilities.recognition).toBe(true);
  });

  it("emits interim then final transcripts, with language-specific recognition", () => {
    const fake = createFakeSpeech();
    const p = new BrowserVoiceProvider(fake.env);
    const interim = vi.fn();
    const final = vi.fn();
    const listening = vi.fn();
    p.onInterim(interim);
    p.onTranscript(final);
    p.onListeningChange(listening);

    p.startListening("zh-Hans");
    const rec = fake.recognitions[0];
    expect(rec.lang).toBe("zh-CN");
    expect(rec.interimResults).toBe(true);
    expect(rec.continuous).toBe(false);
    expect(listening).toHaveBeenLastCalledWith(true);

    rec.say("what is", false);
    rec.say("What is this for?", true);
    expect(interim).toHaveBeenCalledWith("what is");
    expect(final).toHaveBeenCalledWith("What is this for?", undefined); // no confidence reported

    p.startListening("en");
    fake.recognitions.at(-1)!.say("met for pain", true, 0.31);
    expect(final).toHaveBeenLastCalledWith("met for pain", 0.31);

    rec.stop();
    expect(listening).toHaveBeenLastCalledWith(false);
  });

  it("does not start a second recognition while one is running", () => {
    const fake = createFakeSpeech();
    const p = new BrowserVoiceProvider(fake.env);
    p.startListening("en");
    p.startListening("en");
    expect(fake.recognitions).toHaveLength(1);
  });

  it.each([
    ["not-allowed", "permission-denied"],
    ["service-not-allowed", "permission-denied"],
    ["no-speech", "no-speech"],
    ["audio-capture", "no-microphone"],
    ["network", "network"],
    ["something-new", "unknown"],
  ])("maps recognition error %s → %s", (raw, code) => {
    const fake = createFakeSpeech();
    const p = new BrowserVoiceProvider(fake.env);
    const errors: Error[] = [];
    p.onError((e) => errors.push(e));
    p.startListening("en");
    fake.recognitions[0].fail(raw);
    expect(errors[0]).toBeInstanceOf(VoiceError);
    expect((errors[0] as VoiceError).code).toBe(code);
  });

  it("ignores 'aborted' (our own stop) and recovers so the user can try again", () => {
    const fake = createFakeSpeech();
    const p = new BrowserVoiceProvider(fake.env);
    const errors: Error[] = [];
    p.onError((e) => errors.push(e));
    p.startListening("en");
    fake.recognitions[0].fail("aborted");
    expect(errors).toHaveLength(0);
    p.startListening("en");
    expect(fake.recognitions).toHaveLength(2);
  });

  it("start() throwing (e.g. already started) becomes a typed error, not a crash", () => {
    const fake = createFakeSpeech();
    const p = new BrowserVoiceProvider(fake.env);
    const errors: Error[] = [];
    p.onError((e) => errors.push(e));
    p.startListening("en");
    fake.recognitions[0].onend?.(); // finished
    // next instance throws on start
    const Ctor = fake.env.SpeechRecognition!;
    const orig = Ctor.prototype.start;
    Ctor.prototype.start = () => {
      throw new Error("InvalidStateError");
    };
    p.startListening("en");
    Ctor.prototype.start = orig;
    expect(errors.at(-1)).toMatchObject({ code: "unknown" });
  });

  it("speaks with the right language, calm rate, a caption event and speaking-state changes", () => {
    const fake = createFakeSpeech();
    const p = new BrowserVoiceProvider(fake.env);
    const caption = vi.fn();
    const speaking = vi.fn();
    p.onAssistantText(caption);
    p.onSpeakingChange(speaking);

    p.speak("Hello there", "zh-Hans");
    expect(fake.utterances[0]).toMatchObject({ text: "Hello there", lang: "zh-CN" });
    expect(fake.utterances[0].rate).toBeLessThan(1);
    expect(caption).toHaveBeenCalledWith("Hello there");
    expect(speaking).toHaveBeenLastCalledWith(true);

    fake.utterances[0].onend?.();
    expect(speaking).toHaveBeenLastCalledWith(false);
  });

  it("picks up a voice list that finishes loading AFTER construction (the usual cause of a robotic voice)", () => {
    // Chrome/Edge often return an empty voice list synchronously and only populate
    // it asynchronously; a naive one-shot getVoices() call at speak-time can miss it
    // forever unless something reacts to `onvoiceschanged`.
    const fake = createFakeSpeech({ voices: [] });
    const p = new BrowserVoiceProvider(fake.env);

    p.speak("Hello there", "en");
    expect(fake.utterances[0].voice).toBeNull(); // nothing installed yet — no crash, just the engine default

    fake.deliverVoices([
      { name: "Microsoft David Desktop", lang: "en-US" }, // classic robotic SAPI voice
      { name: "Google US English (Natural)", lang: "en-US", localService: false },
    ]);
    p.speak("Here is what your record says.", "en");
    expect(fake.utterances[1].voice).toMatchObject({ name: "Google US English (Natural)" });
  });

  it("re-checks the voice list on every speak() in case it loaded without firing the event", () => {
    const fake = createFakeSpeech({ voices: [] });
    const p = new BrowserVoiceProvider(fake.env);
    p.speak("one", "en");
    expect(fake.utterances[0].voice).toBeNull();

    // Some engines populate the array without ever calling onvoiceschanged.
    fake.synth.getVoices = () => [{ name: "Samantha", lang: "en-US" }];
    p.speak("two", "en");
    expect(fake.utterances[1].voice).toMatchObject({ name: "Samantha" });
  });

  it("keeps the last known-good voice list if a later getVoices() call returns empty", () => {
    const fake = createFakeSpeech({
      voices: [{ name: "Google US English (Natural)", lang: "en-US", localService: false }],
    });
    const p = new BrowserVoiceProvider(fake.env);
    fake.synth.getVoices = () => []; // a transient empty read after the real list was already seen
    p.speak("one", "en");
    expect(fake.utterances[0].voice).toMatchObject({ name: "Google US English (Natural)" });
  });

  it("a new utterance replaces the old one, and stopSpeaking cancels", () => {
    const fake = createFakeSpeech();
    const p = new BrowserVoiceProvider(fake.env);
    const speaking = vi.fn();
    p.onSpeakingChange(speaking);
    p.speak("one", "en");
    p.speak("two", "en");
    expect(fake.utterances.map((u) => u.text)).toEqual(["one", "two"]);
    // Cancelling "one" must not flip the state to "not speaking" while "two" plays.
    expect(speaking).toHaveBeenLastCalledWith(true);
    p.stopSpeaking();
    expect(speaking).toHaveBeenLastCalledWith(false);
    p.speak("   ", "en"); // blank text is never spoken
    expect(fake.utterances).toHaveLength(2);
  });

  it("disconnect stops listening and speaking; unsubscribe works; typed text can use the same channel", async () => {
    const fake = createFakeSpeech();
    const p = new BrowserVoiceProvider(fake.env);
    const cb = vi.fn();
    const off = p.onTranscript(cb);
    await p.sendTranscript("  typed words ");
    await p.sendTranscript("   ");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith("typed words");
    off();
    await p.sendTranscript("ignored");
    expect(cb).toHaveBeenCalledTimes(1);

    p.startListening("en");
    p.speak("hi", "en");
    await p.disconnect();
    expect(fake.recognitions[0].started).toBe(false);
  });
});

describe("speakableText — spoken output is approved wording only, and gated", () => {
  const t = en;

  it("never speaks medicine content before confirmation", () => {
    const pending = toConfirmMatch();
    const said = speakableText(pending, t, resolveExplanation(pending, "en"))!;
    expect(said).toContain("possible match");
    expect(said).toContain("Metformin, 500 mg"); // identity only
    expect(said).not.toMatch(/blood sugar|Take 1 tablet|twice daily|meals/i);
  });

  it("speaks explanation chunks only when a confirmed-match explanation exists", () => {
    const confirmed = toExplain();
    const view = resolveExplanation(confirmed, "en");
    expect(speakableText(confirmed, t, view)).toContain("Metformin helps manage blood sugar.");
    expect(speakableText({ ...confirmed, explainStep: 1 }, t, view)).toContain("Take 1 tablet twice daily with meals.");
    expect(speakableText({ ...confirmed, explainStep: 2 }, t, view)).toContain("cannot change your medicine instructions");
    // Gate: same state but no explanation → nothing medical is spoken.
    expect(speakableText(confirmed, t, null)).toBeNull();
  });

  it("speaks Chinese explanation text from the local record when the language is Chinese", () => {
    const confirmed = { ...toExplain(), language: "zh-Hans" as const };
    const view = resolveExplanation(confirmed, "zh-Hans");
    const tz = (k: Parameters<typeof translate>[1]) => translate("zh-Hans", k);
    expect(speakableText({ ...confirmed, explainStep: 1 }, tz, view)).toContain("随餐每日服用一片，每日两次。");
  });

  it("safety states speak the limitation and human help, never instructions", () => {
    const blocked = run([startCall, askUnknown, chooseShowMedicine, grantCamera, submitDemo("sample_mismatch_label"), resolve]);
    const said = speakableText(blocked, t, resolveExplanation(blocked, "en"))!;
    expect(said).toContain("Let’s check this one together.");
    expect(said).not.toMatch(/Take 1 tablet|twice daily|blood sugar/i);

    const urgent = run([startCall, { type: "USER_MESSAGE", text: "I have chest pain" }]);
    expect(speakableText(urgent, t, null)).toContain("This may need urgent help.");
  });

  it("says nothing on the start screen (no autoplay of anything)", () => {
    expect(speakableText(run([]), t, null)).toBeNull();
  });

  it("listening speaks the current approved companion message", () => {
    const s = run([startCall, askUnknown]);
    expect(speakableText(s, t, null)).toBe("Let’s check this together. Would you like to show me the medicine label?");
  });
});

describe("interpretUtterance — explanation answers", () => {
  const explainCtx = (over: Partial<Parameters<typeof interpretUtterance>[1]> = {}) => ({
    state: "explain" as const,
    contextualActions: [],
    candidateId: "cand_med_metformin_500_demo",
    explainStep: 1 as const,
    cameraLive: false,
    pendingSpokenMedicineName: null,
    ...over,
  });

  it.each([
    ["It looks different", false],
    ["no", false],
    ["不一样", false],
    ["yes it matches", true],
    ["yes", true],
    ["一样", true],
  ] as const)("beside the instruction, %j answers the label check (matches: %s)", (text, matches) => {
    expect(interpretUtterance(text, explainCtx())).toEqual({ kind: "event", event: { type: "LABEL_CHECK", matches } });
  });

  it("a dispute goes to the reducer as a message; then pharmacist / carry on answer it and a bare yes re-asks", () => {
    expect(interpretUtterance("My doctor said to take it at night", explainCtx()).kind).toBe("message");
    const raised = explainCtx({ recordConflict: true });
    expect(interpretUtterance("the pharmacist please", raised)).toEqual({
      kind: "event",
      event: { type: "RECORD_CONFLICT_CHOICE", choice: "pharmacist" },
    });
    expect(interpretUtterance("carry on", raised)).toEqual({
      kind: "event",
      event: { type: "RECORD_CONFLICT_CHOICE", choice: "carry-on" },
    });
    expect(interpretUtterance("yes", raised)).toEqual({ kind: "unclear" });
  });
});

describe("interpretUtterance — family consent", () => {
  const ctx = {
    state: "listening" as const,
    contextualActions: [],
    candidateId: null,
    explainStep: 0 as const,
    cameraLive: false,
    pendingSpokenMedicineName: null,
    familyConsentPending: true,
  };

  it("only a clear, short yes consents; no or a hedge declines; anything else re-asks", () => {
    expect(interpretUtterance("yes please", ctx)).toEqual({ kind: "event", event: { type: "FAMILY_CONSENT", granted: true } });
    expect(interpretUtterance("not now", ctx)).toEqual({ kind: "event", event: { type: "FAMILY_CONSENT", granted: false } });
    expect(interpretUtterance("maybe", ctx)).toEqual({ kind: "event", event: { type: "FAMILY_CONSENT", granted: false } });
    expect(interpretUtterance("what would they be told about my medicine", ctx)).toEqual({ kind: "unclear" });
  });
});
