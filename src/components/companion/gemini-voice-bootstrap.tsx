"use client";

import { useEffect } from "react";
import { GeminiSpeechPlayer, getGeminiSpeechPlayer, setGeminiSpeechPlayer } from "@/lib/voice/gemini-speech-player";

/**
 * Installs the real Gemini speech player once, for actual visitors of
 * `/companion`. Deliberately kept OUT of `CompanionExperience` itself: tests
 * render that component directly (bypassing this page), so by default they
 * get no Gemini player and exercise the synchronous browser-speech fallback,
 * exactly as before this feature existed — no test-file changes needed.
 */
export function GeminiVoiceBootstrap() {
  useEffect(() => {
    if (!getGeminiSpeechPlayer()) setGeminiSpeechPlayer(new GeminiSpeechPlayer());
  }, []);
  return null;
}
