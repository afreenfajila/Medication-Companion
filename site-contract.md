# Site Contract — Medication Companion

## 1. Document status

| Field | Value |
|---|---|
| Version | 0.4 — proposed Assignment 4 implementation contract |
| Last updated | 10 October 2026 |
| Repository | afreenfajila/Medication-Companion |
| Target branch | assignment-4 |
| Primary journey | Dose-change discrepancy → reviewed pharmacist callback |
| Data | Fictional only |
| External communications | Simulated only |
| Implementation verification | Pending code review and tests |

This document defines intended runtime behaviour.

It does not establish:
- That every route already exists.
- That the application satisfies every requirement.
- Clinical safety or regulatory qualification.
- Real pharmacy integration or callback availability.

Inspect the existing implementation before applying this contract.
Reuse compatible routes, reducers, services, and components.
Do not create duplicate APIs or a competing conversation state machine.


## 2. Document ownership

| Document | Owns |
|---|---|
| prd.md | Scope, user outcomes, requirement IDs |
| content-model.md | Data structures, provenance, approved copy |
| design-standard.md | Visual and interaction-presentation rules |
| site-contract.md | Runtime ownership, states, APIs, recovery |
| CLAUDE.md | Agent workflow and validation instructions |
| README.md | Setup and reviewer instructions |
| docs/decisions.md | Decisions, evidence, and trade-offs |

When current documents conflict:
1. Identify the conflict.
2. Preserve existing safety behaviour.
3. Resolve the specification before implementation.
4. Update affected documents together.

Historical amendments belong in the decision log or archive,
not as competing active requirements.


## 3. Architecture

Use the existing:
- Next.js App Router.
- TypeScript.
- Tailwind/design tokens.
- Reusable UI primitives.
- Zod validation.
- Test framework.
- Server-side AI integrations where available.

### Runtime responsibilities

Client:
- Render the continuous call.
- Capture user input and device consent.
- Manage presentation, focus, and audio playback.
- Dispatch typed events.
- Display validated results.
- Preserve recoverable work within the current session.

Deterministic application logic:
- Enforce confirmation gates.
- Compare supported instruction fields.
- Version callback drafts.
- Bind approval to the reviewed draft.
- Manage submission and recovery states.

Server or server-side simulation service:
- Protect credentials.
- Validate API payloads.
- Return fictional records.
- Validate bounded AI output.
- Validate draft revisions and approval before submission.
- Construct allowlisted communication payloads.
- Deduplicate simulated submissions.

AI:
- Optional bounded extraction and conversational enhancement.
- Never clinical authority.
- Never the owner of approval, delivery, or resolution status.

Do not assume client state is a production authorisation boundary.
The prototype must use fictional data only.


## 4. Current voice architecture

Preferred current prototype architecture:

```text
User speech
  → supported browser speech recognition
  → transcript confirmation where required
  → deterministic conversation/state logic
  → approved response text
  → optional server-side Gemini TTS
  → browser speech synthesis fallback
```

Typed input remains available.

Before implementation, verify this against the code.

Gemini Live is not a required feature for this assignment.
Do not reintroduce streaming voice solely because historical
documentation specified it.

If an existing streaming integration is retained:
- Document its actual role.
- Keep credentials secure.
- Preserve the same state and confirmation gates.
- Do not allow it to independently generate medication guidance.

Browser speech recognition must not be described as necessarily
on-device or private without verifying provider behaviour.

Document actual provider processing and retention separately.


## 5. Routes and entry behaviour

### User-facing routes

| Route | Purpose |
|---|---|
| `/` | Prototype introduction or existing persona entry |
| `/companion` | Continuous companion call |
| `/caregiver` | Existing fictional read-only caregiver view |
| `/about` | Scope, simulation, privacy, and AI disclosure |

### Reviewer demo

Provide a dedicated dose-change demo entry.

Proposed route:

```text
/companion/a4-dose-change-demo
```

Reuse a suitable existing route if preferable.
Document the final implemented route in README.md.

Reviewer controls:
- Select deterministic scenario.
- Reset the demo.
- Select simulated submission success/failure.
- Inspect non-sensitive scenario status.

Keep these outside the patient-facing conversation.

### Entry guards

- Loading a route does not imply that a call started.
- Query parameters do not bypass confirmation.
- Direct links do not unlock instruction display.
- Reviewer scenario selection sets fictional fixtures only.
- Scenario reset cancels or invalidates pending interaction updates.

Keep the existing investigation demo if present.
Do not remove it without explicit approval.
It must not control the dose-change journey through an
unvalidated escalation score.


## 6. Continuous call contract

### Home

One prominent action:

```text
Call with companion
```

Small utilities may include:
- Help.
- Language.
- Settings.

Do not show permanent label/schedule task cards.

### Active call

Provide:
- Voice/text input.
- Repeat.
- Get help.
- End call.
- A current companion message.
- Latest user response with correction.
- One contextual panel at a time.

The call is not a sequence of mandatory Next-button pages.

Explicit user decisions remain necessary for:
- Medicine confirmation.
- Label-wording confirmation.
- Device permission.
- Sharing approval.


## 7. State ownership

Extend the existing session reducer or equivalent state authority.

Do not maintain independent booleans that can contradict the
authoritative flow.

A nested dose-change state is acceptable if owned by the same session.

### Conceptual state model

```ts
type CallLifecycle = "not-started" | "active" | "ended";

type DoseChangeStage =
  | "idle"
  | "identifying-medicine"
  | "confirming-medicine"
  | "checking-record"
  | "confirming-label"
  | "comparing"
  | "comparison-match"
  | "comparison-incomplete"
  | "conflict-unresolved"
  | "callback-offered"
  | "reviewing-callback"
  | "submitting-callback"
  | "callback-submitted"
  | "callback-failed"
  | "callback-cancelled"
  | "support-interruption";
```

Names may be adapted to existing code.
The behaviours and invariants must remain equivalent.

Audio status is separate from journey status.
Finishing speech does not automatically confirm a decision.


## 8. Main transitions

```text
CALL_STARTED
  → active call

DOSE_CHANGE_REQUEST
  → identify medicine if needed

MEDICINE_CANDIDATE_FOUND
  → confirming medicine

MEDICINE_CONFIRMED
  → checking record

RECORD_AVAILABLE
  → confirming label

LABEL_CONFIRMED
  → comparing

COMPARISON_MATCH
  → comparison match
  → bounded explanation or further help

COMPARISON_INCOMPLETE
  → limitation
  → support option

COMPARISON_CONFLICT
  → conflict unresolved
  → callback offer

CALLBACK_ACCEPTED
  → create draft
  → reviewing callback

DRAFT_EDITED
  → increment revision
  → clear approval
  → review updated content

CALLBACK_APPROVED
  → bind approval to exact revision
  → submitting callback

SUBMISSION_SUCCEEDED
  → callback submitted
  → medication remains unresolved

SUBMISSION_FAILED
  → callback failed
  → preserve draft

RETRY_SELECTED
  → submit same logical approved request,
    subject to retry rules

CANCEL_SELECTED
  → nothing submitted
  → preserve comparison

END_CALL / RESET
  → terminate current interaction generation
  → invalidate pending callbacks
```

### Correction branch

```text
LABEL_CORRECTED
  → increment label revision
  → clear label confirmation
  → reconfirm wording
  → invalidate comparison
  → recompute
  → invalidate callback approval/draft when affected
```

If the conflict disappears:
- Do not send an obsolete discrepancy request.
- Explain the changed comparison.
- Allow a new, appropriately described support request if wanted.


## 9. State invariants

1. Active conversation requires an explicit call-start event.

2. Record instruction display requires confirmed medicine identity.

3. Label comparison requires confirmation of the current label revision.

4. Comparison uses the current record version and confirmed label revision.

5. Missing information never produces automatic agreement.

6. Unresolved conflict never produces a dose recommendation.

7. Source instructions may be displayed for comparison, but neither
   is selected as clinically correct.

8. Draft edits invalidate previous approval.

9. Submission requires approval of the exact current draft.

10. Cancel before submission produces no service call.

11. Submission success does not establish recipient acknowledgement,
    callback scheduling, clinical review, or resolution.

12. End/reset prevents stale results from changing current UI state.

13. Continuing another task does not silently clear an unresolved conflict.

14. AI output cannot bypass any invariant.


## 10. Session and storage

### Prototype scope

- Fictional records only.
- No production authentication or patient authorisation.
- No real messaging.
- No persistent health-data storage.
- No raw media in browser storage.

Document where each session object actually lives:
- Client memory.
- Server-side temporary store.
- Browser session storage, if used.

Do not claim durable session persistence if it does not exist.

### Serverless limitations

If temporary server memory is used:
- Do not rely on requests always reaching the same instance.
- Treat store loss as a recoverable session-expiry condition.
- Return an explicit error rather than accepting an unknown draft.
- Do not claim production-grade idempotency across deployments.

If reliable demo continuity requires a shared temporary store,
add it only after assessing scope and complexity.

### Reload

If refresh loses the session:
- Return to a safe entry.
- Explain that the previous call is no longer available.
- Do not reconstruct approval from a URL.
- Do not imply that an in-flight request definitely failed.

The client must distinguish known failure from unknown outcome.


## 11. API conventions

All external API input and output must be validated.

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
    retryable: boolean;
    safeNextAction:
      | "retry"
      | "correct"
      | "review"
      | "get-help"
      | "restart";
  };
  requestId: string;
};
```

These endpoint shapes are proposed.
Map them onto existing compatible routes rather than adding
parallel implementations.

Errors must not expose:
- Credentials.
- Provider prompts.
- Raw uploaded content.
- Internal stack traces.
- Unnecessary personal information.


## 12. Record retrieval

Reuse the existing simulated PharmacyService.

Conceptual request:

```ts
{
  sessionId: string;
  medicineId: string;
}
```

Response:
- Fictional medicine identity.
- Structured instruction.
- Record provenance and version.
- Explicit fictional status.

Rules:
- Retrieve only known fixture records.
- Validate medicine/session association.
- Return unavailable when required data cannot be retrieved.
- Do not use a later date to resolve an instruction conflict.


## 13. Label input and extraction

Reuse the existing label route where compatible.

Separate:
- Identity extraction.
- Instruction-text extraction.

Do not silently expand identity extraction into dose interpretation.

### Identity route behaviour

- Extract only permitted identity fields.
- Validate output.
- Run deterministic matching.
- Return possible candidate or limitation.

### Instruction-text behaviour

- Extract verbatim visible wording only.
- Never infer missing instruction text.
- Never calculate or recommend a dose.
- Require user confirmation.
- Use approved deterministic parsing for supported fixtures.
- If parsing is uncertain, return insufficient information.

### Media handling

- Explicit action before capture/upload.
- Validate file type, size, and decoding.
- Apply existing supported-image limits.
- Re-encode/strip metadata where implemented.
- Do not claim images are never retained by external providers
  without verifying the provider configuration.
- No image inclusion in callback payloads.
- Provide typed entry or a fixture fallback.


## 14. Comparison service

Comparison may be implemented as a shared pure function.

Inputs:
- Confirmed medicine.
- Current record and version.
- Confirmed label and revision.
- Supported structured instruction fields.

Outputs:
- Match.
- Conflict.
- Insufficient information.
- Compared, differing, and missing fields.

Rules:
- Ignore only harmless formatting differences.
- Preserve units, decimals, negations, and conditional wording.
- Do not infer equivalence using general LLM reasoning.
- Recompute after relevant edits.
- Validate versions before callback draft creation.

The server must validate or recompute relevant comparison facts
before accepting a callback submission.


## 15. Callback draft lifecycle

Reuse or extend the existing help-service contract.

Conceptual draft creation:

```text
POST /api/help/draft
```

Request:

```ts
{
  sessionId: string;
  reason:
    | "instruction-discrepancy"
    | "comparison-incomplete"
    | "record-unavailable";
  medicineId: string;
  confirmedLabelRevision?: number;
}
```

The application constructs the draft from allowed session facts.

Response:
- Draft ID.
- Revision.
- Recipient.
- Exact reviewable payload.
- Simulated status.

### Editing

Conceptual operation:

```text
PATCH /api/help/draft
```

Allowlisted editable values:
- Callback contact.
- User concern.
- Confirmed label wording through the correction flow.
- Valid recipient selection, if implemented.

Record facts are not user-editable.

Any payload change:
- Increments draft revision.
- Clears approval.
- Updates the preview.
- Revalidates the comparison when applicable.


## 16. Approval and submission

Reuse the existing:

```text
POST /api/help/request
```

Extend its contract rather than keeping both old and new submission APIs.

Conceptual request:

```ts
{
  sessionId: string;
  draftId: string;
  approvedRevision: number;
  idempotencyKey: string;
}
```

### Server checks

- Session is valid.
- Draft exists and belongs to the session.
- Draft revision matches the approved revision.
- Required confirmed data is still current.
- Recipient is a permitted fictional recipient.
- Payload is constructed from an allowlist.
- Request is not already submitted.
- Request is simulated.

The explicit Send action authorises this exact reviewed revision.
Do not describe this prototype mechanism as production proof
of identity or consent.

### Result

```ts
type SubmissionResult =
  | {
      ok: true;
      simulated: true;
      status: "submitted";
      requestId: string;
    }
  | {
      ok: false;
      simulated: true;
      status: "failed";
      requestId: string;
      reasonCode: string;
      retryable: boolean;
    };
```

Do not return:
- A promised callback time.
- Pharmacist acknowledgement.
- Clinical resolution.
- A claim that a real message was sent.


## 17. Idempotency and retry

- Use one logical key per approved draft submission.
- Repeated taps while submitting do not create additional calls.
- Retry of the same logical request reuses the key.
- Same key with different content is rejected.
- Editing creates a new review revision and new submission identity.
- Successful submission cannot be resent as a duplicate.
- Document the storage scope and expiry of deduplication records.

### Unknown outcome

A transport timeout is not proof that no request was processed.

Only display “No one has been notified” when the simulation
definitively reports failure before delivery.

For an unknown result:
- Explain that submission could not be confirmed.
- Retry with the same logical key.
- Do not claim definite success or definite non-delivery.

The required failure demo should use a deterministic known failure.


## 18. Asynchronous lifecycle

Use session/turn identifiers or equivalent guards.

For record retrieval, extraction, speech, and submission:
- Associate results with the initiating session and revision.
- Ignore stale results.
- Cancel work where supported.
- Stop recognition/playback on end/reset.
- Release camera media tracks when no longer needed.
- Avoid duplicate speech or auto-advancing required decisions.

Ending the UI does not guarantee that server-side work stopped.
Do not equate an aborted client request with cancelled delivery.


## 19. Submission UI states

### Reviewing
- Nothing submitted.
- Recipient and content inspectable.

### Editing
- Approval cleared.
- Context retained.

### Submitting
- Progress visible.
- Send disabled against duplicates.
- Do not offer “cancel delivery” unless that capability exists.

### Submitted
- Explicit simulated submission.
- Medication issue unresolved.
- No response-time promise.

### Failed
- Definitive failed result.
- Summary preserved.
- Retry and alternative support available.

### Unknown
- Outcome not confirmed.
- No false delivery/non-delivery claim.
- Idempotent retry available.

### Cancelled before submission
- Nothing shared.
- Return to comparison/call.


## 20. Symptom and urgent-language interruption

The dose-change flow must not infer that a symptom is caused
by a medication change.

When a symptom is reported:
- Pause routine explanation.
- Preserve confirmed context.
- Use the existing bounded support behaviour.
- Do not apply the historical additive interaction score.
- Do not add new clinical tiers or rules in this implementation.

Keep these separate:
1. Existing language detection.
2. Existing static safety guidance.
3. Future emergency calling or dispatch integration.

Preserve existing safety information.
Any expanded routing requires separately reviewed requirements.

A support interruption must not silently reset approval or
resume a stale callback request.
Require review if the request content changes.


## 21. Language and audio

- Supported language values follow content-model.md.
- Critical copy uses fixed reviewed keys.
- Preserve confirmation and comparison across language changes.
- Do not imply complete language support when critical copy is missing.
- Record language-review limitations.

Audio:
- Uses the same approved content as visible text.
- Can be stopped, muted, or repeated.
- Does not automatically approve choices.
- Does not need to finish before text appears.
- Avoids competing screen-reader announcements.
- Has a typed fallback.

Provider failure must not produce a misleading message that
all voice input is unavailable when only speech output failed.


## 22. Privacy and security

- Fictional input only; warn users not to upload real records.
- Server-side secrets only.
- Validate input/output with Zod or existing equivalent schemas.
- Validate sessions and fixture IDs.
- Constrain request sizes and AI usage.
- Treat input and model output as untrusted.
- Never execute model-generated tools, HTML, or arbitrary URLs.
- Escape user-provided text in UI.
- Exclude raw media and transcripts from sharing and audit events.
- Redact sensitive values from errors and logs.
- Keep .env.local out of version control.

If external AI processes uploaded content:
- Disclose the actual processing.
- Verify retention settings before making deletion claims.

If persistence is introduced:
- Specify retention, access, deletion, and deployment scope.
- Do not silently enable production data collection.

A fictional caregiver view does not establish production
caregiver authorisation.


## 23. Audit behaviour

Use content-model.md event types.

Record:
- Event category.
- Scenario ID.
- Record/label/draft revision.
- Simulated outcome.
- Non-sensitive request reference.

Do not record:
- Callback number.
- Raw transcript.
- Image/audio.
- Full payload.
- Unnecessary symptom details.

Keep these events distinct:
- Draft created.
- Approved.
- Submission attempted.
- Submitted.
- Failed.
- Cancelled.

Never record clinical resolution after callback submission.


## 24. Reviewer scenarios

Required:
- Conflict → simulated success.
- Conflict → definitive simulated failure.
- Misread label → correction.
- Matching instructions.
- Record unavailable.

Reviewer controls:
- Clearly separate from user controls.
- Reset deterministically.
- Show fictional/simulated framing.
- Do not bypass required confirmations.

Existing study-mode wrong-explanation injection:
- Remains separately gated.
- Must not leak into ordinary demo scenarios.
- Must not be described as real model behaviour.


## 25. Test contract

### Unit checks

- Identity gates.
- Label revision confirmation.
- Structured comparison.
- Missing-field handling.
- Draft revision and approval invalidation.
- Allowlisted payload construction.
- Idempotency.
- Stale-result rejection.
- Approved copy resolution.

### Interaction checks

- One home CTA.
- Corrections without restart.
- Conflict with no dose recommendation.
- Exact sharing preview.
- Edit and reapproval.
- Cancellation without submission.
- Submitted versus unresolved status.
- Failed-submission recovery.
- End/reset during pending work.

### Regression checks

- Existing medicine explanation.
- Voice/text fallback.
- Camera decline.
- Repeat and language controls.
- Existing help and safety routes.
- Study-mode isolation.

### Manual checks

- 320, 360, 393, and 430 px widths.
- Desktop layout.
- 200% zoom.
- Keyboard operation and focus.
- Reduced motion.
- Mobile keyboard.
- Audio interruption.
- English and supported Chinese.
- No-keys deterministic demo.

Record actual results.
Passing tests does not establish clinical safety.


## 26. Deployment and evidence

- Use existing package scripts.
- Inspect commands before running.
- Report commands actually executed.
- Separate pre-existing failures from new regressions.
- Verify the demonstrated build matches captured screenshots.
- Check preview configuration and service simulation.
- Confirm no real messaging or calling integration is enabled.

Do not commit, push, deploy, or change external service configuration
without explicit approval.

README.md must contain:
- Actual demo route.
- Build/run instructions.
- Scenario instructions.
- Implemented/simulated/proposed status.
- Known limitations.

Evidence should link:
Requirement ID → test → actual result → screenshot/build.

Freeze a named reviewed version before submission.


## 27. Definition of done

- [ ] Main dose-change journey is coherent and complete.
- [ ] Confirmation gates cannot be bypassed.
- [ ] Comparison preserves provenance and uncertainty.
- [ ] No conflicting dose is recommended.
- [ ] Callback payload matches the reviewed revision.
- [ ] Edits invalidate approval.
- [ ] Cancellation makes no submission.
- [ ] Duplicate requests are prevented within the documented scope.
- [ ] Failure preserves work.
- [ ] Unknown outcomes do not create false claims.
- [ ] Submission does not imply medication resolution.
- [ ] End/reset protects against stale updates.
- [ ] Simulation is visible.
- [ ] Existing functionality is regression-tested.
- [ ] Actual validation and remaining gaps are documented.
- [ ] Active specifications agree.