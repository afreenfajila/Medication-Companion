import "server-only";
import { GoogleGenAI } from "@google/genai";
import { parsePcmMimeType, pcmToWav } from "./wav";

// Speech OUTPUT only, and only for text that is already fixed/approved (the same
// copy-catalogue and record strings already sent to browser speechSynthesis) —
// Gemini renders exact text to audio here, it never composes what is said.
// Language is auto-detected from the text itself (Gemini TTS supports this),
// so English and Simplified Chinese both work without a language parameter.

export const DEFAULT_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_VOICE = "Kore"; // a calm, clear voice; matches Google's own examples

export class SpeechUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: "not-configured" | "service-error" | "invalid-output",
  ) {
    super(message);
    this.name = "SpeechUnavailableError";
  }
}

// Finished lines are cached, so repeats and the fixed copy lines every call
// shares (greeting, label question) are instant and cost no Gemini quota.
// ponytail: per-instance Map with oldest-first eviction; a shared store if it ever runs on many instances.
const cache = new Map<string, Buffer>();
const CACHE_MAX = 200;
// A style line sets the warm tone and stops the model treating short or mixed-language text as a prompt.
const STYLE = "Read aloud in a warm, calm, unhurried voice, like a kind friend:";

export function clearSpeechCache(): void {
  cache.clear();
}

/** Returns a ready-to-serve WAV buffer for the given text, or throws SpeechUnavailableError. */
export async function synthesizeSpeechWav(text: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new SpeechUnavailableError("GEMINI_API_KEY is not set", "not-configured");

  const model = process.env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL;
  const key = `${model}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const { pcm, sampleRate, channels } = await synthesizePcm(new GoogleGenAI({ apiKey }), model, text);
  const wav = pcmToWav(pcm, sampleRate, channels);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, wav);
  return wav;
}

async function synthesizePcm(
  ai: GoogleGenAI,
  model: string,
  text: string,
): Promise<{ pcm: Buffer; sampleRate: number; channels: number }> {
  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model,
      contents: `${STYLE} ${text}`,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: DEFAULT_VOICE } } },
      },
    });
  } catch (error) {
    // Server-side diagnostics only (never sent to the client): redact anything key-shaped.
    const detail =
      error instanceof Error
        ? error.message.replace(/AIza[\w-]+/g, "[redacted-key]").slice(0, 300)
        : "unknown error";
    throw new SpeechUnavailableError(`Gemini TTS request failed: ${detail}`, "service-error");
  }

  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    throw new SpeechUnavailableError("Gemini returned no audio", "invalid-output");
  }

  const { sampleRate, channels } = parsePcmMimeType(part.inlineData.mimeType);
  const pcm = Buffer.from(part.inlineData.data, "base64");
  if (pcm.length === 0) throw new SpeechUnavailableError("Gemini returned empty audio", "invalid-output");
  return { pcm, sampleRate, channels };
}
