// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class GoogleGenAI {
    models = { generateContent };
  },
}));

import { clearSpeechCache, SpeechUnavailableError, synthesizeSpeechWav } from "./speech";

const audioResponse = (base64: string, mimeType = "audio/l16; rate=24000; channels=1") => ({
  candidates: [{ content: { parts: [{ inlineData: { data: base64, mimeType } }] } }],
});
const shortPcmBase64 = Buffer.from([1, 2, 3, 4]).toString("base64");

beforeEach(() => {
  generateContent.mockReset();
  clearSpeechCache();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_TTS_MODEL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("synthesizeSpeechWav", () => {
  it("fails closed without calling the SDK when no key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(synthesizeSpeechWav("hello")).rejects.toMatchObject({ reason: "not-configured" });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("requests audio-only output with a voice, and returns a valid WAV", async () => {
    generateContent.mockResolvedValue(audioResponse(shortPcmBase64));
    const wav = await synthesizeSpeechWav("Here is what your record says.");

    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(24000); // sample rate parsed from the mime type
    expect(wav.subarray(44)).toEqual(Buffer.from([1, 2, 3, 4]));

    const req = generateContent.mock.calls[0][0];
    expect(req.model).toBe("gemini-3.1-flash-tts-preview");
    expect(req.contents).toMatch(/warm.*: Here is what your record says.$/);
    expect(req.config.responseModalities).toEqual(["AUDIO"]);
    expect(req.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBeTruthy();
  });

  it("honours GEMINI_TTS_MODEL", async () => {
    vi.stubEnv("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts");
    generateContent.mockResolvedValue(audioResponse(shortPcmBase64));
    await synthesizeSpeechWav("hi");
    expect(generateContent.mock.calls[0][0].model).toBe("gemini-2.5-flash-preview-tts");
  });

  it("parses a different mime-type format for sample rate/channels", async () => {
    generateContent.mockResolvedValue(audioResponse(shortPcmBase64, "audio/L16;codec=pcm;rate=16000"));
    const wav = await synthesizeSpeechWav("hi");
    expect(wav.readUInt32LE(24)).toBe(16000);
  });

  it.each([
    ["no candidates", { candidates: [] }],
    ["no inline audio part", { candidates: [{ content: { parts: [{ text: "oops, a text reply" }] } }] }],
    ["empty audio data", audioResponse("")],
  ])("treats %s as invalid output", async (_name, response) => {
    generateContent.mockResolvedValue(response);
    await expect(synthesizeSpeechWav("hi")).rejects.toMatchObject({
      name: "SpeechUnavailableError",
      reason: "invalid-output",
    });
  });

  it("maps SDK/network errors to service-error without leaking the cause", async () => {
    generateContent.mockRejectedValue(new Error("connect ECONNRESET AIzaSecretKey123"));
    const err = await synthesizeSpeechWav("hi").catch((e: Error) => e);
    expect(err).toBeInstanceOf(SpeechUnavailableError);
    expect((err as SpeechUnavailableError).reason).toBe("service-error");
    expect((err as Error).message).not.toMatch(/AIzaSecretKey123/);
  });

  it("caches a finished line, so a repeat costs no Gemini call", async () => {
    generateContent.mockResolvedValue(audioResponse(shortPcmBase64));
    const first = await synthesizeSpeechWav("Shall we check the label?");
    expect(await synthesizeSpeechWav("Shall we check the label?")).toBe(first);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("when the first model is rate-limited, the fallback model speaks, and the busy one rests for a minute", async () => {
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error('{"error":{"code":429}}'), { status: 429 }))
      .mockResolvedValue(audioResponse(shortPcmBase64));
    await synthesizeSpeechWav("Shall we check the label?");
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual([
      "gemini-3.1-flash-tts-preview",
      "gemini-2.5-flash-preview-tts",
    ]);

    await synthesizeSpeechWav("Would you like to type it?");
    expect(generateContent.mock.calls[2][0].model).toBe("gemini-2.5-flash-preview-tts");
  });
});
