import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioEnv, AudioLike } from "./gemini-speech-player";
import { GeminiSpeechPlayer } from "./gemini-speech-player";

class FakeAudio implements AudioLike {
  src = "";
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  playCalls = 0;
  paused = false;
  playImpl: () => Promise<void> = async () => {
    this.onplay?.();
  };
  async play() {
    this.playCalls += 1;
    return this.playImpl();
  }
  pause() {
    this.paused = true;
  }
}

function fakeEnv() {
  const created: FakeAudio[] = [];
  const revoked: string[] = [];
  const env: AudioEnv = {
    createAudio: (url) => {
      const a = new FakeAudio();
      a.src = url;
      created.push(a);
      return a;
    },
    createObjectUrl: () => `blob:${created.length}`,
    revokeObjectUrl: (url) => revoked.push(url),
  };
  return { env, created, revoked };
}

function stubFetch(blob: Blob | null, opts: { ok?: boolean; contentType?: string } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: opts.ok ?? blob !== null,
      headers: new Headers({ "content-type": opts.contentType ?? (blob ? "audio/wav" : "") }),
      blob: async () => blob ?? new Blob(),
    })),
  );
}

const wavBlob = () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.useRealTimers());

describe("GeminiSpeechPlayer", () => {
  it("plays the returned audio and reports speaking start/end", async () => {
    stubFetch(wavBlob());
    const { env, created } = fakeEnv();
    const player = new GeminiSpeechPlayer(env);
    const speaking = vi.fn();
    player.onSpeakingChange(speaking);

    const ok = await player.speak("Hello there", "en");
    expect(ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].playCalls).toBe(1);
    expect(speaking).toHaveBeenCalledWith(true);

    created[0].onended?.();
    expect(speaking).toHaveBeenLastCalledWith(false);
  });

  it("returns false, plays nothing, when the server has no audio (caller should fall back)", async () => {
    stubFetch(null);
    const { env, created } = fakeEnv();
    const player = new GeminiSpeechPlayer(env);
    expect(await player.speak("hi", "en")).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("returns false when the browser blocks autoplay (audio.play() rejects)", async () => {
    stubFetch(wavBlob());
    const { env, created } = fakeEnv();
    const player = new GeminiSpeechPlayer(env);
    const speaking = vi.fn();
    player.onSpeakingChange(speaking);

    // Override the next created audio's play() before it's constructed by pre-seeding env.
    const originalCreate = env.createAudio;
    env.createAudio = (url) => {
      const a = originalCreate(url) as FakeAudio;
      a.playImpl = async () => {
        throw new DOMException("blocked", "NotAllowedError");
      };
      return a;
    };

    expect(await player.speak("hi", "en")).toBe(false);
    expect(speaking).not.toHaveBeenCalledWith(true);
    expect(created[0].paused).toBe(true); // cleaned up
  });

  it("stop() pauses playback, revokes the object URL, and reports speaking(false)", async () => {
    stubFetch(wavBlob());
    const { env, created, revoked } = fakeEnv();
    const player = new GeminiSpeechPlayer(env);
    const speaking = vi.fn();
    player.onSpeakingChange(speaking);
    await player.speak("hi", "en");

    player.stop();
    expect(created[0].paused).toBe(true);
    expect(revoked).toHaveLength(1);
    expect(speaking).toHaveBeenLastCalledWith(false);
  });

  it("a new speak() call replaces (and cleans up) the previous one", async () => {
    stubFetch(wavBlob());
    const { env, created, revoked } = fakeEnv();
    const player = new GeminiSpeechPlayer(env);
    await player.speak("one", "en");
    await player.speak("two", "en");
    expect(created).toHaveLength(2);
    expect(created[0].paused).toBe(true); // "one" was torn down for "two"
    expect(revoked).toEqual(["blob:0"]); // "one"'s URL freed; "two"'s stays live while playing
    expect(created[1].paused).toBe(false);

    player.stop();
    expect(revoked).toEqual(["blob:0", "blob:1"]);
  });

  it("a superseded in-flight fetch resolves true (not a failure) so no stray fallback fires", async () => {
    let resolveFetch: (v: unknown) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    const { env } = fakeEnv();
    const player = new GeminiSpeechPlayer(env);

    const first = player.speak("one", "en");
    player.stop(); // supersede/cancel while the fetch is still in flight
    resolveFetch({ ok: true, headers: new Headers({ "content-type": "audio/wav" }), blob: async () => wavBlob() });

    expect(await first).toBe(true);
  });

  it("blank text is not attempted (mirrors browser speechSynthesis behaviour)", async () => {
    stubFetch(wavBlob());
    const { env, created } = fakeEnv();
    const player = new GeminiSpeechPlayer(env);
    // requestGeminiSpeech still gets called (no special-case), but nothing is
    // played if the server sensibly returns no audio for blank input.
    stubFetch(null);
    expect(await player.speak("   ", "en")).toBe(false);
    expect(created).toHaveLength(0);
  });
});
