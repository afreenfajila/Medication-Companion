# Site Contract — Medication Companion

## 1. Purpose

This contract defines the implementation boundary for the Medication Companion prototype. It tells contributors what routes, APIs, client/server responsibilities, data flows, fallbacks, and safety checks are required.

The application is a **prototype with fictional demo data**. It must be reliable in presentation mode even when third-party AI, camera, microphone, or Supabase services are unavailable.

## 2. Recommended architecture

```text
Next.js (App Router) + TypeScript
├── Tailwind CSS
├── shadcn/ui primitives where useful
├── Lucide icons
├── Framer Motion or CSS animations, with reduced-motion support
├── Anthropic TypeScript SDK (server only)
├── Google Gen AI SDK / Gemini Live integration (server-assisted session setup)
├── Supabase (optional persistence and seeded demo data)
├── Zod validation for all API input/output contracts
└── Vercel deployment
```

### Architectural rule

The client renders interaction state and captures user input. The server owns all secrets, validates all AI responses, selects the safe route, and constructs any medicine explanation from trusted local data.

The LLM is never the source of truth for medicine data.

## 3. Routes

### Primary user routes

| Route | Purpose |
|---|---|
| `/` | Persona picker and prototype introduction |
| `/companion` | Main mobile companion shell; starts in the quiet single-CTA home state |
| `/companion?state=start` | Landing state; one prominent `Call with companion` CTA only |
| `/companion?state=listening` | Active conversation/listening state; contextual decisions appear here |
| `/companion?state=camera-permission` | Camera consent state |
| `/companion?state=camera-guidance` | Local camera / upload guidance state |
| `/companion?state=confirm-match` | Candidate confirmation state |
| `/companion?state=explain` | Record-backed explanation state |
| `/companion?state=safety` | Escalation state |

### Secondary routes

| Route | Purpose |
|---|---|
| `/caregiver` | Caregiver demo dashboard for Mei Ling |
| `/caregiver/record` | Mock record detail page, if enabled |
| `/about` | Prototype limitations, privacy, AI-use and assignment disclosure |

### Routing rule

Routes may reflect state for demo navigation, but the active session state machine is authoritative.

A user cannot:

- Access `/companion?state=explain` unless a valid confirmed candidate exists in the session.
- Access `/companion?state=camera-permission` or `/companion?state=camera-guidance` until an active call has produced the contextual `show-medicine` decision.
- Access schedule explanation unless a confirmed record authorises record-backed schedule content.

Otherwise redirect/render the safe start or safety state.

## 4. Home and call interaction contract

### Home state

The `start` state exposes only these primary-user controls:

```ts
{
  primaryAction: "call-with-companion";
  utilities: ["help", "language", "settings"];
}
```

The start state must not render `show-medicine`, `ask-schedule`, `repeat`, `get-help`, or `end-call` as primary navigation actions. It contains no shortcut cards.

### Active call state

After `call-with-companion`, transition to `listening`. Only then show:

```text
Repeat · Get help · End call
```

The call state accepts spoken or typed input and can reveal temporary contextual action buttons.

### Conversation routing

| Classified intent | Assistant response | Temporary action / state |
|---|---|---|
| Unknown medicine question | “Let’s check this together. Would you like to show me the medicine label?” | `Show medicine`; remain `listening` |
| Schedule question with confirmed record | Use approved record-backed schedule content only | `explain` or approved schedule substate |
| Schedule question without confirmed record | “Would you like to show me a medicine label, or ask about your medicine schedule?” | `Show medicine`, `Ask about my schedule`; remain `listening` |
| Broad / unclear need | Same approved clarification question | `Show medicine`, `Ask about my schedule`; remain `listening` |
| Human-help request | Explain help options | `safety` |
| Unsafe / unsupported medical question | Explain limitation, no medical advice | `safety` |

`Show medicine` and `Ask about my schedule` are contextual actions. They must disappear or be replaced after a selection and must never appear as permanent landing navigation.

## 5. Client responsibilities

The browser may:

- Render the mobile phone shell and static screen states.
- Render the single-CTA landing state and contextual in-call action choices.
- Collect typed input.
- Start/stop browser speech recognition if available.
- Play speech synthesis if enabled.
- Request camera/microphone permission only after user action.
- Render local camera preview.
- Switch between available device cameras when browser support permits.
- Capture a still image after explicit user action.
- Upload a label image through a controlled form.
- Display candidate, explanation, errors, and safety state returned by the server.
- Persist non-sensitive demo UI preferences locally, such as language and reduced-motion choice.

The browser must not:

- Contain Anthropic, Gemini, Supabase service-role, or any permanent server key.
- Decide whether a label matches a record.
- Generate or alter medication advice.
- Bypass confirmation to show a record explanation.
- Store raw uploaded label images in local storage.
- Render contextual medicine/schedule route choices on the home state.

## 6. Server responsibilities

The server must:

- Keep secret credentials private.
- Validate every request with Zod.
- Rate-limit or constrain AI routes as practical for a prototype.
- Retrieve only the seeded/authorised demo record.
- Classify incoming active-call messages into safe UI intents.
- Call Claude for structured extraction or conversational content only under a strict schema.
- Validate Claude output against local data before UI rendering.
- Route unknown, ambiguous, unsafe, or AI-error states to the safety response.
- Write redacted audit events if persistence is enabled.
- Return plain-language, structured errors.

## 7. State machine

```text
START
  → CALL_STARTED
  → LISTENING
  → UNKNOWN_MEDICINE_QUESTION → OFFER_SHOW_MEDICINE
  → BROAD_OR_UNCONFIRMED_SCHEDULE_QUESTION → OFFER_ROUTE_CLARIFICATION

OFFER_SHOW_MEDICINE
  → SHOW_MEDICINE_SELECTED
  → CAMERA_PERMISSION
  → CAMERA_GUIDANCE
  → LABEL_SUBMITTED
  → CANDIDATE_MATCH | NO_MATCH | AMBIGUOUS | INPUT_ERROR

OFFER_ROUTE_CLARIFICATION
  → SHOW_MEDICINE_SELECTED → CAMERA_PERMISSION
  → ASK_SCHEDULE_SELECTED → CONFIRMED_RECORD_CHECK | SAFETY

CANDIDATE_MATCH
  → USER_CONFIRMED → EXPLAIN
  → USER_DENIED → SAFETY
  → USER_UNSURE → SAFETY

EXPLAIN
  → UNDERSTOOD → COMPLETE
  → ASK_HELP → SAFETY
  → NEW_MEDICINE → LISTENING

Any active-call state
  → URGENT_RISK → URGENT_SAFETY
  → API_FAILURE → LOCAL_FALLBACK
  → PERMISSION_DENIED → TYPED_OR_DEMO_LABEL_FALLBACK
  → END_CALL → START
```

### State invariants

- `LISTENING` requires a call-start event.
- `CAMERA_PERMISSION` requires contextual `show-medicine` selection during an active call.
- `EXPLAIN` requires `match.status === "confirmed"`.
- A candidate must have a `source === "demo-record"` and a server-side validation result.
- No match or ambiguity must never create an explanation payload.
- Urgent-risk classification overrides the normal conversation path.

## 8. API contract

All API routes return JSON with this envelope:

```ts
type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId: string;
};

type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    safeNextAction: "retry" | "use_demo_label" | "type_label" | "get_help" | "return_home";
  };
  requestId: string;
};
```

### `POST /api/session`

Creates or restores an anonymous prototype session.

Request:

```ts
{
  persona: "mei-ling" | "caregiver";
  language: "en" | "zh-Hans";
}
```

Response data:

```ts
{
  sessionId: string;
  persona: "mei-ling" | "caregiver";
  language: "en" | "zh-Hans";
  activeState: "start";
  demoMode: true;
}
```

### `POST /api/call/start`

Starts an active companion call and creates an audit event.

Request:

```ts
{
  sessionId: string;
}
```

Response data:

```ts
{
  assistantText: string;
  speakableText: string;
  nextState: "listening";
  callControls: ["repeat", "get-help", "end-call"];
}
```

### `POST /api/companion/message`

Accepts typed transcript input from an active call. It does not return free-form medical advice. It returns a UI-safe intent/state response.

Request:

```ts
{
  sessionId: string;
  text: string;
  language: "en" | "zh-Hans";
}
```

Response data:

```ts
{
  intent:
    | "unknown_medicine_question"
    | "schedule_question"
    | "show_medicine"
    | "ask_schedule"
    | "get_help"
    | "unsupported_medical_question"
    | "urgent_risk"
    | "general";
  assistantText: string;
  speakableText: string;
  nextState: "listening" | "camera-permission" | "safety" | "explain";
  contextualActions?: Array<{
    id: "show-medicine" | "ask-schedule";
    label: string;
  }>;
}
```

Rules:

- Do not include `contextualActions` on the start/home screen.
- For an unknown-medicine question, return only `show-medicine`.
- For an unconfirmed schedule/broad question, return both contextual actions with the approved clarification prompt.
- For confirmed record content, use the record-backed response route only.

### `POST /api/label/analyze`

Accepts a captured/uploaded image or typed label fallback. Server sends image to Claude only if enabled. The route never returns medication instructions.

Request multipart or JSON metadata:

```ts
{
  sessionId: string;
  inputMode: "demo" | "image" | "typed";
  typedLabel?: {
    patientName?: string;
    medicineName?: string;
    strength?: string;
  };
  image?: File;
}
```

Response data:

```ts
type LabelAnalysis = {
  outcome: "candidate" | "no-match" | "ambiguous" | "unreadable" | "blocked";
  userMessage: string;
  nextState: "confirm-match" | "safety";
  candidate?: {
    candidateId: string;
    patientName: string;
    medicineName: string;
    strength: string;
    dosageForm: string;
    sourceLabel: "BrightCare Pharmacy — demo record";
    matchStatus: "possible";
  };
  reasonCode?: "low-confidence" | "conflict" | "missing-fields" | "multiple-candidates" | "unsafe-request";
};
```

Server rule: a candidate is returned only if required identity fields match the local record under deterministic matching rules. Claude-reported confidence is supporting metadata, never sufficient proof.

### `POST /api/match/confirm`

Request:

```ts
{
  sessionId: string;
  candidateId: string;
  decision: "confirmed" | "denied" | "unsure";
}
```

Response:

```ts
{
  nextState: "explain" | "safety";
  message: string;
}
```

### `GET /api/record/explanation`

Returns data only when session match is confirmed.

Query:

```text
?sessionId=...&language=en|zh-Hans
```

Response data:

```ts
{
  recordSource: "BrightCare Pharmacy — demo record";
  medicine: {
    name: string;
    strength: string;
    whatItIsFor: string;
    instructions: string;
  };
  explanation: {
    title: string;
    purpose: string;
    instruction: string;
    caution: string;
  };
  allowedActions: ["repeat", "switch-language", "get-help", "i-understand"];
}
```

The response is built from the local content model, not an unconstrained LLM answer.

### `POST /api/help/request`

Creates a demo audit event and returns non-deceptive help options.

Request:

```ts
{
  sessionId: string;
  reason: "unreadable" | "mismatch" | "unsure" | "medical-question" | "urgent-risk";
}
```

Response:

```ts
{
  title: string;
  message: string;
  actions: Array<{
    id: "try-again" | "pharmacy-demo" | "clinic-demo" | "trusted-helper-demo" | "urgent-care";
    label: string;
    implemented: boolean;
  }>;
}
```

### `POST /api/live/session`

Creates a limited session configuration for Gemini Live or returns fallback capability.

Rules:

- Never return a permanent Gemini server key.
- Prefer short-lived/ephemeral credentials or a server-assisted session establishment pattern supported by the selected SDK.
- Return `fallback: true` if not configured or unavailable.

Response data:

```ts
{
  mode: "gemini-live" | "browser-fallback";
  ephemeralToken?: string;
  expiresAt?: string;
  systemContextVersion: string;
}
```

### `GET /api/caregiver/overview`

Returns only seeded demo record and redacted audit events for the selected prototype session/patient.

## 9. AI boundaries

### Claude call pattern

Claude can be called for two bounded tasks:

1. **Visual extraction:** return structured possible identity fields from the image. No medical instructions.
2. **Plain-language phrasing:** only rewrite server-supplied verified fields into approved language schema.

Claude requests must include:

- Demo/prototype declaration.
- Prohibition on medical diagnosis/prescribing.
- Requirement to emit JSON matching Zod schema.
- Requirement to output `unreadable`, `ambiguous`, or `no-match` rather than guess.
- No permission to add facts beyond the supplied record.

### Gemini Live role

Gemini Live may provide a natural spoken interaction wrapper. It must receive the same safety system context and it must not be trusted as the medication source.

For the MVP selected scope:

- Use live **audio** where configured.
- Use local user camera preview only.
- Send captured still image to the label analysis route after explicit user action.
- Do not continuously stream user camera frames to the model.
- Start the live interaction only after `Call with companion` is selected.
- Do not ask users to choose label/schedule pathways before the active conversation starts.

### Post-model validation

After any model response:

1. Parse with Zod.
2. Verify status is permitted.
3. Compare candidate identity fields to local mock record.
4. Reject extra medical claims.
5. Store only redacted audit result.
6. Return a safe fallback if validation fails.

## 10. Failure and fallback contract

| Failure | Required UI response |
|---|---|
| No microphone | Show typed input and optional browser text-to-speech |
| Speech recognition unavailable | Continue with typed input |
| Gemini unavailable | Show “Voice connection is unavailable. You can continue by typing.” |
| Camera permission denied | Offer demo label, upload, and typed-label fallback after in-call label route is selected |
| No rear camera | Use available camera and explain user can upload a photo |
| Claude unavailable | Demo label still returns deterministic seeded candidate; image flow offers try again/help |
| Supabase unavailable | Use in-memory/local demo session and show that activity will not persist |
| Invalid AI JSON | Log failure and route to safe fallback |
| Network error | Preserve local UI state and offer retry or deterministic demo path |

## 11. Data persistence contract

### Default

- Session state is in memory/client state plus a short-lived anonymous session ID.
- Raw images are not stored.
- Demo label image may be served from static assets.

### Optional Supabase persistence

Persist only:

- Anonymous session metadata.
- Selected language and persona.
- Call-start state and contextual route selected.
- Candidate result status, never raw image.
- Confirmation/denial state.
- Redacted audit event.
- Help-request event.

Never persist:

- API keys.
- Raw microphone audio.
- Camera video.
- Production health information.
- Full model prompt/response containing unnecessary user input.

## 12. Environment variables

Server-only variables:

```bash
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_BASE_URL=
```

Public variables allowed only when non-secret:

```bash
NEXT_PUBLIC_APP_NAME=Medication Companion
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Rules:

- Do not prefix Anthropic, Gemini, or service-role secrets with `NEXT_PUBLIC_`.
- Keep `.env.local` out of Git.
- Supply production and preview variables in Vercel Project Settings.

## 13. Security requirements

- Validate content type, size, and dimensions for image upload.
- Limit image size to a conservative prototype maximum, such as 5 MB.
- Use server-side request size limits.
- Strip or ignore EXIF metadata before further handling when practical.
- Add basic origin/CSRF protections according to chosen session model.
- Never execute model-generated HTML, URLs, or tool calls.
- Sanitize audit/event fields before rendering.
- Use Supabase RLS if any persisted tables are exposed to browser clients.

## 14. Test contract

### Unit tests

- Deterministic record matching.
- Call-start gate prevents contextual route actions on home state.
- Conversation routing: unknown medicine returns `show-medicine` only.
- Conversation routing: broad/unconfirmed schedule returns contextual clarification options.
- Explanation gate rejects unconfirmed session.
- Safety trigger detector.
- Zod model response validation.
- Language content resolver.

### Integration tests

- Landing screen contains exactly one primary CTA.
- Happy path with call start and demo label.
- Rejected match path.
- Unreadable upload path.
- Claude failure fallback.
- Camera permission denial fallback.
- Gemini Live fallback.

### Manual demo checklist

- Test in Chrome desktop and mobile Safari/Chrome if possible.
- Test without camera/microphone permissions.
- Test reduced motion.
- Test keyboard navigation.
- Test English and Chinese rendering.
- Test Vercel preview with environment variables set.

## 15. Deployment contract

1. Push repository to GitHub.
2. Import repository into Vercel.
3. Add server-only environment variables.
4. Deploy preview first.
5. Run seeded demo label route on preview.
6. Confirm no secret appears in browser network payloads or built JavaScript.
7. Promote to production after manual checklist passes.

The deployed site must include a visible prototype disclaimer and a link to `/about`.

## 16. Assignment 3 experience amendments

See CLAUDE.md § Assignment 3 experience amendments and `content-model.md` §19 for the copy.

### A. Companion tone contract

- `POST /api/companion/understand` validates the model reply with `isSafeCompanionReply(reply, language)`: the existing number/dosing/advice/match-claim/markup filters, plus the tone-contract blame words, advice phrased as an instruction, the requested language, and a closing question. Any failure returns the deterministic approved line (`source: "fallback"`).

### B. Gentler label-failure copy

- `buildEscalation` picks `labelSafetyHeading` / `labelSafetyBody` for the four non-urgent label reasons. No state, transition, action or retry rule changes.

### C. Record conflict

- Session flag `recordConflict` (state stays `explain`). Set by `USER_MESSAGE` when `routeMessage` returns `record-conflict` in `explain` with a confirmed match.
- `RECORD_CONFLICT_CHOICE`: `pharmacist` → `safety` (`help-requested`, confirmed candidate kept, audit detail `from: record-conflict`); `carry-on` → clears the flag, same step. Ignored when no conflict is raised.
- Moving a step, `UNDERSTOOD`, `NEW_MEDICINE` and any safety entry clear the flag.
- Voice/typed: in `explain`, a dispute is sent as a message; while the flag is set, "pharmacist" or "carry on / next" answers it, and a bare "yes" re-asks.
- No model is called: the understanding pass and rephrase only run in `listening`.

### D. Label check on the explanation

- `LABEL_CHECK { matches }`, valid only in `explain` at step 1 with a confirmed match and no open record conflict. `matches: true` → step 2. `matches: false` → `safety` (`label-differs`), candidate and match status cleared, so the explanation is unreachable until a new label is confirmed.
- Voice/typed at step 1: "different / doesn't match / 不一样" or a short "no" → differs; "matches / same / 一样" or a short "yes" → matches; "next" still moves on without answering.

### E. Off-topic, health signals and wellbeing

- `ContextualActionId` adds `end-call` (after the wrap-up) and `carry-on` (after wellbeing). `SELECT_ROUTE` accepts them only when offered: `end-call` → `END_CALL`; `carry-on` → `anotherMedicineGuide`, no actions. The understanding pass still offers only the two doors.
- Session `offTopicStreak`: +1 on an off-topic message, reset by any other message or a route taken; the wrap-up fires at `OFF_TOPIC_TURN_CAP` (2).
- `VoiceProvider.onTranscript(callback: (text, confidence?) => void)`: the browser provider passes the lowest confidence of the final segments. Typed input has none.
- `buildEscalation(..., selfHarm)` adds `crisisKey` on the urgent path; the caller derives it from the triggering message with `mentionsSelfHarm`.

### F. Family help with consent

- `ASK_FAMILY` (also `SELECT_ROUTE ask-family` when offered) sets `familyConsentPending`. Valid in non-urgent `safety`, or in `listening` when `ask-family` was offered.
- `FAMILY_CONSENT { granted }`, only while pending. `true` writes `caregiver-help-requested` and shows the demo notice; `false` just closes the question. Any new message, a safety entry or returning to the call also closes it without writing anything.
- Voice: while pending, only a short clear "yes" consents; "no", "not now" or a hedge declines; anything else re-asks.
- `HELP_ACTION` never carries `ask-family`, so no demo-action audit can bypass consent.
