import { describe, expect, it } from "vitest";
import { parsePcmMimeType, pcmToWav } from "./wav";

describe("pcmToWav", () => {
  it("produces a valid RIFF/WAVE header with the correct declared sizes", () => {
    const pcm = Buffer.from(new Uint8Array(1000));
    const wav = pcmToWav(pcm, 24000, 1, 16);

    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.subarray(12, 16).toString("ascii")).toBe("fmt ");
    expect(wav.subarray(36, 40).toString("ascii")).toBe("data");
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length); // RIFF chunk size
    expect(wav.readUInt32LE(40)).toBe(pcm.length); // data chunk size
    expect(wav.readUInt16LE(20)).toBe(1); // PCM format code
    expect(wav.readUInt16LE(22)).toBe(1); // channels
    expect(wav.readUInt32LE(24)).toBe(24000); // sample rate
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
    // byte rate = sampleRate * channels * bitsPerSample/8
    expect(wav.readUInt32LE(28)).toBe(24000 * 1 * 2);
  });

  it("appends the exact PCM bytes unchanged after the header", () => {
    const pcm = Buffer.from([1, 2, 3, 4, 5, 6]);
    const wav = pcmToWav(pcm, 16000);
    expect(wav.subarray(44)).toEqual(pcm);
  });

  it("reflects a different channel count and sample rate in the header", () => {
    const wav = pcmToWav(Buffer.alloc(4), 16000, 2, 16);
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt16LE(32)).toBe(4); // blockAlign = channels * bytesPerSample
  });
});

describe("parsePcmMimeType", () => {
  it.each([
    ["audio/l16; rate=24000; channels=1", 24000, 1],
    ["audio/L16;codec=pcm;rate=24000", 24000, 1],
    ["audio/L16;rate=16000;channels=2", 16000, 2],
  ])("parses %s", (mime, rate, channels) => {
    expect(parsePcmMimeType(mime)).toEqual({ sampleRate: rate, channels });
  });

  it("defaults to 24000 Hz mono when fields are missing or the mime type is absent", () => {
    expect(parsePcmMimeType(undefined)).toEqual({ sampleRate: 24000, channels: 1 });
    expect(parsePcmMimeType("audio/l16")).toEqual({ sampleRate: 24000, channels: 1 });
  });
});
