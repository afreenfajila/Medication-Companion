# Medication Companion — voice architecture

Status: implemented on `assignment-4` (working tree over `a5b0740`), 12 October 2026.
Verified with automated tests using fakes; not yet exercised against the live
providers from this checkout (no OpenAI or ElevenLabs key configured here).

All records and service outcomes are fictional or simulated. Not for medical use.


## 1. Pipeline

```text
Microphone
  → AudioWorklet PCM capture            src/lib/voice/audio-capture.ts
  → adaptive RMS candidate detection    src/lib/voice/barge-in.ts
  → local Silero VAD confirmation       src/lib/voice/silero-vad.ts (onnxruntime-web)
  → OpenAI Realtime transcription       src/lib/voice/openai-transcription.ts
  → final UserVoiceTurn                 src/lib/voice/coordinator.ts
  → deterministic safety classifier     src/lib/session/intent.ts, classifySafety
  → Claude Sonnet 5.5 (bounded)         src/lib/ai/claude.ts (server routes only)
  → Zod and content validation          src/lib/api/schemas.ts, speech-guard.ts
  → reduceSession() guarded transition  src/lib/session/state-machine.ts
  → visible AssistantTurn               coordinator.speak() publishes before audio
  → ElevenLabs streaming TTS            src/lib/voice/elevenlabs-speech.ts
  → Web Audio playback                  src/lib/voice/playback-queue.ts
```

The microphone stays open during playback. Confirmed user speech interrupts
playback and begins a new guarded turn. Typed input is always available and is
handled as the same kind of turn.


## 2. Who does what

| Part | Owns | Never |
|---|---|---|
| `reduceSession()` | Every product-state transition (confirmation gates, label revisions, callback draft/approval). Illegal events return the same object. | — |
| `VoiceSessionCoordinator` | Voice mechanics only: call/turn identity, mic turns, barge-in, playback, one voice per call, fallback, stale-result guards | Product state, approvals, submissions |
| OpenAI Realtime | Transcription only (`session.type: "transcription"`, `turn_detection: null`) | Replies, confirmation, record access |
| Silero VAD (on device) | Speech probability per 512-sample window at 16 kHz | Sending audio anywhere |
| Claude | Bounded understanding and vision over committed words and the medicine's name | Raw audio, interim transcripts, final medicine matches, dose choice, approvals, state mutation |
| ElevenLabs | Speaks the exact validated, visible AssistantTurn text | Composing text; speaking anything not on screen |
| Browser speech engines | The explicitly labelled degraded fallback (recognition and synthesis) | Being described as on-device |

Credentials: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY` are
server-only. The browser receives a short-lived OpenAI client secret from
`POST /api/voice/openai-session` and a single-use ElevenLabs token from
`POST /api/voice/elevenlabs-token`. Both routes are same-origin, rate-limited,
validated with Zod, attach no medicine data, and log no audio or transcript.
No `NEXT_PUBLIC_` variable carries a key; `npm run check:bundle` fails if a key,
secret variable name, credential endpoint or the removed Google SDK reaches the
client bundle.


## 3. Turn lifecycle

1. **Connecting.** `startCall(language)` starts capture, loads the detector
   (lazy VAD), connects transcription and speech. Status "Getting the call
   ready…". A line requested meanwhile is visible at once and voiced when ready.
2. **Listening.** `openTurn()` assigns `{callId, turnId}`, tells OpenAI to clear
   its buffer, and streams PCM frames **only while this turn is open**. Interim
   deltas update the live caption and go nowhere else.
3. **Endpoint.** Hands-free: the detector's `speech-end` (900 ms of silence
   after confirmed speech; 1400 ms once the person has been slow) commits the
   turn. Push-to-talk (no VAD): the mic button commits. Status "Checking what I
   heard…". A turn with less than 120 ms of audio is cleared, not committed.
4. **Final.** Exactly one `completed` transcript per committed turn becomes the
   `UserVoiceTurn` (leading words preserved, markup stripped, bounded). Empty,
   duplicate, late and cancelled finals are dropped. No final within 6 s closes
   the turn quietly.
5. **Classifier → Claude → reducer.** Unchanged from the typed path: the
   deterministic safety classifier runs first; Claude is optional and bounded;
   every gate lives in `reduceSession()`.
6. **Speaking.** `speak()` publishes the AssistantTurn (visible), then streams
   it. "Preparing voice…" until the first audio chunk is scheduled and reached;
   "Speaking…" only from actual playback start. In duplex: "Speaking… I'm still
   listening, so you can talk any time."
7. **Interruption.** During playback the detector's threshold is raised ×2 and
   only `speech-start` (loudness **and** VAD agreement for 300 ms, after a 200 ms
   post-playback echo guard) interrupts: playback stops, the assistant text
   stays, status "I heard you — go ahead.", a new turn opens with 300 ms of
   pre-roll plus the candidate-to-confirmation audio. A `candidate` alone does
   nothing. Automatic interruption can be switched off; typing and the mic
   button always interrupt.
8. **End/reset.** Every engine is released; late finals, chunks and completions
   from the old call are ignored (call id check). Ending the UI does not claim
   to cancel anything server-side.


## 4. Barge-in defaults (`BARGE_IN_DEFAULTS`, untuned)

| Parameter | Value |
|---|---|
| Frame | 1536 samples at 24 kHz (64 ms) |
| Pre-roll kept | 1500 ms ring; 300 ms injected on interruption |
| Candidate | RMS > max(floor × 4, 0.008) for 200 ms |
| Confirmation | VAD probability ≥ 0.5 for 300 ms within a candidate |
| Candidate dropped | 300 ms neither loud nor speech |
| Endpoint | 900 ms silence (1400 ms slow) |
| During playback | threshold × 2; floor frozen |
| Post-playback echo guard | 200 ms (capture time) |
| Noise floor | mean of the first 8 frames; then moves only during quiet non-speech |

Without the VAD (load failure, CSP, or still loading): `handsFree=false`,
push-to-talk, no automatic interruption. RMS alone can never interrupt.


## 5. Fallback policy

Sticky and one-way within a call, with a visible notice:

- Output: ElevenLabs → browser synthesis → text only, decided by the call's
  history, never mid-sentence:
  - **Pre-flight** (server, cached): the configured voice and model must be
    usable through the API before a token is minted. Reason codes:
    `unconfigured`, `token-unavailable`, `voice-unavailable`,
    `model-unavailable`, `quota-exceeded`.
  - **Pre-flight** (browser, per line, before a socket opens): the line belongs
    to this call (`not-allowed`), is approved visible text (`no-approved-text`,
    `unapproved`), and has a token, a voice id and a model.
  - **Not yet heard this call**: any failure before audio switches to the
    browser voice for the rest of the call, once, with a sticky notice.
  - **Already heard this call**: never another voice. `websocket-failed`,
    `playback-decode-failed` or `timeout` interrupt that line (Repeat retries);
    a terminal reason leaves the rest of the call as words only, with a sticky
    notice. After a terminal reason no token is fetched and no socket opened
    again until the next call.
  - A guard-refused line is shown, not voiced.
- Input: OpenAI Realtime → browser recognition → text only. The mic is released
  when the realtime input cannot connect.

Core deterministic scenarios work with no provider configured: browser engines
where they exist, otherwise typed input.


## 6. Privacy and observability

- No raw audio or images are persisted; the pre-roll ring is in memory and
  cleared on stop.
- Callback payloads are allowlisted and exclude audio, images and transcripts.
- Development diagnostics (`src/lib/voice/voice-diagnostics.ts`) log only stage
  names, elapsed milliseconds, booleans, reason codes and engine ids. Every field
  is sanitised; words, tokens, keys, medicine names, audio and callback content
  can't be printed. Silent in production and tests. No full-conversation logging.
- Interim text never reaches Claude, the classifier or session state.
- Anything sent to another party is reviewed first, then sent only on an
  explicit "send" (said or typed) for the exact revision on screen; a plain
  "yes", a question, a hedge, a low-confidence transcript or the AI never sends
  (owner decision, 12 October 2026). The companion's own playback is never
  transcribed, and the echo guard still applies.


## 7. Files

| Area | Files |
|---|---|
| Contracts | `src/lib/voice/adapters.ts` |
| Capture, VAD, barge-in | `audio-capture.ts`, `silero-vad.ts`, `barge-in.ts`, `scripts/copy-vad-assets.mjs` |
| Transcription | `openai-transcription.ts`, `src/app/api/voice/openai-session/route.ts` |
| Speech | `elevenlabs-speech.ts`, `playback-queue.ts`, `src/app/api/voice/elevenlabs-token/route.ts` |
| Fallback engines | `browser-voice.ts`, `browser-adapters.ts` |
| Coordinator and hook | `coordinator.ts`, `use-voice.ts`, `src/components/companion/use-conversation.ts`, `voice-bar.tsx` |
| Tests | `*.test.ts` beside each module, `src/test/fake-audio.ts`, `src/test/google-voice-removed.test.ts`, `voice-experience.test.tsx` |
