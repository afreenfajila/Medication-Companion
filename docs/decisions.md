# Decisions (Phase 1–2)

Scope: local deterministic flow only. No API keys, Supabase, Claude, Gemini, camera or microphone.

## Architecture
- **Pure reducer, external store.** `src/lib/session/state-machine.ts` is a pure reducer; an illegal
  event returns the *same* session object (reference-equal), so a blocked transition is testable.
  `session-store.ts` wraps it with `useSyncExternalStore` (no setState-in-effect) and persists only
  redacted audit events + persona (sessionStorage) and language (localStorage).
- **URL never drives state.** `/companion?state=x` is compared with the session's real state and the
  URL is rewritten to match. A fresh load of `?state=explain` renders `start`.
- **Assistant text is stored as a copy key**, not a string, so the language toggle re-translates
  the current message without touching state.
- **Audit is redacted by construction:** typed text is never stored (only intent + length).

## Judgement calls (where the contracts were silent or ambiguous)
- **Matching is stricter than the scoring rule alone.** Any *provided* field that conflicts —
  including optional patient name and dosage form — is `no-match`. With only name+strength summing to
  exactly the 0.80 threshold, a wrong-patient label would otherwise still become a candidate.
- **"What is this for? When do I take it?"** routes as an unknown-medicine question (only
  `Show medicine`), per PRD §5 step 4. Schedule words alone → the two-action clarification.
- **Schedule question with a confirmed record** goes straight to the record-backed explanation
  (chunk 2); without one, `Ask about my schedule` stays in `listening` and asks for the label.
- **Contextual actions must have been offered** before `SELECT_ROUTE` is accepted.
- **Extensions to content-model types:** `help-requested` SafetyReason; audit types `call-ended`,
  `message-classified`, `route-selected`, `understanding-confirmed`; demo assets
  `sample_unreadable_label` / `sample_mismatch_label` so the safety path is reachable without a camera.
- **Chinese safety patterns** were added alongside the English ones, since the app has a 中文 mode.
- **`--color-teal-800` (#2F6B68)** added for teal *text*; `#5B9B98` is ~3.3:1 on white, below AA.
  Supporting copy uses navy-700 rather than slate-600 for the same reason.
- **Honest camera step.** "Yes, switch camera" records consent but opens no camera in this build; the
  guidance screen says so and the demo label is the way forward. Real `getUserMedia` is Phase 3.
- **Caregiver dashboard** shows seeded, badged "Sample" events until a live session exists.
- **Voice** is not offered; the listening screen says typing is the input for now.

## Deferred (later phases)
Camera/upload/typed-label UI (3), API routes + Zod envelopes + Claude (4), voice (5), deploy polish (6).
