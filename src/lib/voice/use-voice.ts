"use client";

import { useSyncExternalStore } from "react";
import { BrowserVoiceProvider, type VoiceEnv } from "./browser-voice";
import type { SpeechVoiceProvider, VoiceCapabilities } from "./provider";

// One provider per page, created lazily on the client. Creating it opens
// nothing; the microphone is only used when the user taps "speak".
let provider: SpeechVoiceProvider | null = null;
let capabilities: VoiceCapabilities = { recognition: false, synthesis: false };

const SERVER_CAPABILITIES: VoiceCapabilities = { recognition: false, synthesis: false };

export function getVoiceProvider(): SpeechVoiceProvider | null {
  if (typeof window === "undefined") return null;
  if (!provider) {
    provider = new BrowserVoiceProvider(window as unknown as VoiceEnv);
    capabilities = provider.capabilities;
  }
  return provider;
}

/** Test seam: replace (or clear) the provider. */
export function setVoiceProvider(next: SpeechVoiceProvider | null): void {
  provider = next;
  capabilities = next ? next.capabilities : SERVER_CAPABILITIES;
}

/** Feature detection without a hydration mismatch (server + first client render report "none"). */
export function useVoiceCapabilities(): VoiceCapabilities {
  return useSyncExternalStore(
    () => () => undefined,
    () => {
      getVoiceProvider();
      return capabilities;
    },
    () => SERVER_CAPABILITIES,
  );
}
