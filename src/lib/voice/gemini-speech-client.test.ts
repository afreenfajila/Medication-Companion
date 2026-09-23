import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestGeminiSpeech } from "./gemini-speech-client";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Partial<Response>>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("requestGeminiSpeech", () => {
  it("posts the exact text and language, and returns the audio blob on success", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
    let seen: { url: string; init: RequestInit } | null = null;
    stubFetch(async (url, init) => {
      seen = { url, init };
      return { ok: true, headers: new Headers({ "content-type": "audio/wav" }), blob: async () => blob };
    });

    const result = await requestGeminiSpeech("Hello there", "en");
    expect(result).toBe(blob);
    expect(seen!.url).toBe("/api/companion/speak");
    expect(JSON.parse(seen!.init.body as string)).toEqual({ text: "Hello there", language: "en" });
  });

  it("returns null on a non-ok response", async () => {
    stubFetch(async () => ({ ok: false, headers: new Headers(), blob: async () => new Blob() }));
    expect(await requestGeminiSpeech("hi", "en")).toBeNull();
  });

  it("returns null when the response isn't audio (e.g. a JSON error envelope)", async () => {
    stubFetch(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      blob: async () => new Blob(),
    }));
    expect(await requestGeminiSpeech("hi", "en")).toBeNull();
  });

  it("returns null for an empty audio blob", async () => {
    stubFetch(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "audio/wav" }),
      blob: async () => new Blob([]),
    }));
    expect(await requestGeminiSpeech("hi", "en")).toBeNull();
  });

  it("returns null instead of throwing on a network error", async () => {
    stubFetch(async () => {
      throw new TypeError("network down");
    });
    expect(await requestGeminiSpeech("hi", "en")).toBeNull();
  });

  it("aborts and returns null if the caller's signal fires", async () => {
    stubFetch(
      (url, init) =>
        new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const controller = new AbortController();
    const pending = requestGeminiSpeech("hi", "en", controller.signal);
    controller.abort();
    expect(await pending).toBeNull();
  });
});
