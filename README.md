# Medication Companion

A calm, voice-first prototype that helps an older adult understand
a medication record and prepare a request for human help when
information cannot be resolved.

Built for the ELVTR AI Product Design course.

> Prototype only · Fictional data · Not for medical use  
> No real pharmacy, pharmacist, caregiver, or emergency service
> is contacted.


## Current scope

The Assignment 4 journey focuses on a medication instruction
that differs between the current fictional pharmacy record
and the label on the user's medicine box.

The companion:
- Confirms the medicine.
- Confirms or corrects label wording.
- Makes the discrepancy visible.
- Explains what it cannot resolve.
- Prepares a pharmacist callback summary.
- Lets the user review, edit, approve, or cancel.
- Simulates submission and recovery.

It does not decide which conflicting dose the user should take.

This README describes the target scope.
Implementation status must be checked against the current build.


## Implementation status

Update this table after running the code and tests.
Do not mark a capability implemented solely because it is specified.

Checked against the working tree on `assignment-4` (base commit `73cc2c3`, uncommitted
changes), 10 October 2026. "Implemented" means covered by automated tests; manual and
device checks are listed under Manual testing.

| Capability | Status |
|---|---|
| Existing call-first interface | Implemented; regression tests pass |
| Medicine confirmation | Implemented; regression tests pass |
| Dose-change comparison | Implemented (deterministic, fields: amount, times a day, timing) |
| Label correction without restart | Implemented (label revisions, reconfirmation) |
| Callback sharing preview | Implemented (allowlisted payload matches the preview) |
| Simulated submission and failure recovery | Implemented (submitted, failed, unknown, cancelled) |
| Manual device, zoom and screen-reader checks | Pending |
| Real pharmacy integration | Not implemented |
| Real callback or messaging | Not implemented |
| Pharmacist acknowledgement or clinical review | Not implemented |
| Representative-user validation of the new flow | Pending |
| Clinical validation of the new flow | Pending |
| Regulatory qualification for deployment | Not determined |


## The main experience

### Fictional scenario

Mei Ling has returned from a clinic visit.
She remembers that her medicine instruction changed, but the box
she is holding shows a different instruction.

She asks:

“My doctor changed my medicine, but this box still says the old amount.
How many should I take now?”

### Journey

```text
Start call
→ identify and confirm medicine
→ confirm label wording
→ compare with current record
→ explain unresolved discrepancy
→ offer pharmacist callback
→ review sharing
→ simulate submission
→ show outcome and recovery
```

### Successful outcome

Success means:
- The discrepancy is understandable.
- The companion's limits are clear.
- The user controls sharing.
- The request outcome is accurate.
- The medication question remains unresolved.

Success does not mean:
- A dose has been selected.
- A pharmacist has reviewed the request.
- A callback has been scheduled.
- The medication is safe to take.


## Try the dose-change demo

### Demo route

Implemented route (`npm run dev`, then open):

```text
http://localhost:3000/companion/dose-check-demo
```

The reviewer controls sit above the phone frame. Pick a scenario, tap **Call with companion**,
then say or type: "My doctor changed my medicine, but this box still says the old amount.
How many should I take now?" `/companion` runs the same journey without a scenario.
Details: `docs/a4-dose-change-demo.md`.

### Reviewer walkthrough

1. Open the dose-change demo.
2. Select the conflict scenario.
3. Start the companion call.
4. Type or speak the dose-change question.
5. Confirm the medicine.
6. Confirm or correct the label wording.
7. Inspect the source comparison.
8. Request a pharmacist callback.
9. Review the recipient and exact summary.
10. Approve or cancel simulated sharing.
11. Inspect the request outcome.

A visible notice must explain that no real request is sent.

### Deterministic scenarios

| ID | Scenario (reviewer control) | What to inspect |
|---|---|---|
| DEMO-01 | 1. Conflict → callback submitted | Reviewed request; unresolved medication status |
| DEMO-02 | 2. Conflict → submission fails | No delivery; summary retained; Try again sends the same request |
| DEMO-03 | 3. Misread label → correction | Updated comparison without restarting |
| DEMO-04 | 4. Label matches record | No false conflict |
| DEMO-05 | 5. Record unavailable | Limitation; question for a pharmacist with no record facts invented |
| (extra) | 6. Conflict → outcome unknown | No claim either way; Try again finds it was delivered, one request only |

Reviewer controls are separate from the patient-facing call.

Use only fictional test information.
Do not upload real prescriptions, labels, or personal health data.


## What is fictional or simulated?

| Item | Meaning |
|---|---|
| Mei Ling | Fictional design persona |
| BrightCare Pharmacy | Fictional pharmacy |
| Medication record | Local fictional fixture |
| Record verification/date | Part of the fictional scenario |
| Callback contact | Fictional, non-routable demo value |
| Callback submission | Simulated service outcome |
| Submission reference | Demo identifier, not a booking |
| Caregiver view | Fictional read-only demonstration |

A simulated success does not establish:
- Real delivery.
- Recipient acknowledgement.
- A response-time commitment.
- Clinical resolution.


## Safety boundaries

The companion must not:
- Diagnose.
- Prescribe.
- Recommend treatment.
- Decide whether to take, stop, skip, or change a medicine.
- Invent missing medication facts.
- Resolve conflicting instructions.
- Treat user confirmation as clinical verification.
- Infer that a symptom was caused by medication.
- Present an experimental score as clinical confidence.

Source instructions may be displayed for comparison after
medicine confirmation, but neither conflicting instruction
is endorsed as the dose to follow.

Existing bounded safety/help behaviour must remain intact.
Expanded clinical routing requires separate review.


## Interaction design

The prototype should feel like one continuous call.

Principles:
- One quiet home action.
- One conversational decision at a time.
- One contextual panel at a time.
- Voice and text alternatives.
- Visible sources and uncertainty.
- Correction without restart.
- Review before sharing.
- Recovery without repeating the story.

The primary call does not use:
- Permanent clinical task cards.
- A dense dashboard.
- Forced Next clicks between routine turns.
- An endless transcript wall.
- A score breakdown.


## How AI is used

| Part | Permitted contribution | Boundary |
|---|---|---|
| Label identity extraction | Read visible identity fields | Does not decide clinical correctness |
| Label instruction extraction, if implemented | Read visible wording verbatim | Does not interpret or recommend a dose |
| Conversation understanding | Understand ordinary requests | Cannot bypass deterministic gates |
| Speech output | Speak approved content | Does not independently choose medication advice |
| Deterministic logic | Confirmation, comparison, approval, and outcomes | Must follow documented rules |

Current provider roles must be verified against the implementation.

Preferred voice scope:
- Browser speech recognition where supported.
- Typed fallback.
- Optional server-side text-to-speech.
- Browser speech synthesis fallback.

Gemini Live is not required for the current build.
Do not claim it is implemented unless verified.

Browser speech recognition is not necessarily on-device.
Provider processing and retention must be described accurately.


## Run locally

Check the repository's package.json and lockfile for the actual
runtime requirements and package manager.

For an npm-based checkout:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The environment file is optional for deterministic no-key flows.
Add credentials only to enable supported provider features.

The standard development address is:

```text
http://localhost:3000
```

Use the actual address printed by the development server if different.

Do not commit .env.local.


## Configuration

Use .env.example and the implementation as the source of truth.

Typical configuration categories:

| Variable/category | Purpose |
|---|---|
| ANTHROPIC_API_KEY | Optional bounded extraction/understanding |
| ANTHROPIC_MODEL | Supported model override, if implemented |
| GEMINI_API_KEY | Optional speech provider |
| GEMINI_TTS_MODEL | Supported speech-model override, if implemented |
| SERVICE_MODE | Simulation selection, if implemented |
| SIMULATED_SERVICE_FAILURE | Deterministic failure testing, if implemented |
| STUDY_MODE | Separately gated study fixtures, if retained |
| SUPABASE_* | Use only if persistence is actually implemented |

Do not copy unverified model defaults from historical documents.

Rules:
- Permanent provider credentials remain server-side.
- No provider secrets in NEXT_PUBLIC variables.
- Never enable real communications for this demo.
- Do not enable study error injection in the ordinary reviewer flow.
- Document changes to configuration explicitly.


## Validation

Inspect package.json before running commands.

Previously documented commands include:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:bundle
npm run verify
```

Run only scripts that actually exist.
Check whether a script requires an earlier build.

Report:
- Command.
- Date/build.
- Actual result.
- Pre-existing failure versus new regression.

Do not describe unrun checks as passing.

### Latest results

10 October 2026, working tree on `assignment-4` (base `73cc2c3`, uncommitted).
`npm run verify` (lint, typecheck, test, build, bundle check) passes as one command.

| Command | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (the 3 pre-existing unescaped-apostrophe errors in `medication-investigation-feed.tsx` were fixed) |
| `npm run test` | 33 files, 631 tests pass |
| `npm run build` | Pass; `/companion/dose-check-demo` is a static route |
| `npm run check:bundle` | Pass: no secrets or server-only SDK in client files |


## Manual testing

Use the manual test kit and requirements in prd.md.

Core checks:
- Reject medicine match.
- Leave label wording unconfirmed.
- Correct a misread label.
- Compare matching instructions.
- Compare conflicting instructions.
- Handle unavailable records.
- Edit sharing information.
- Cancel sharing.
- Prevent duplicate submission.
- Recover from known failure.
- Handle unknown submission outcome.
- End/reset during pending work.

UX checks:
- Can the user identify the next action?
- Are sources distinguishable?
- Is uncertainty clear?
- Is correction reachable?
- Is the recipient and payload inspectable?
- Is submission distinct from resolution?

Check:
- Mobile widths from 320–430 px.
- Desktop.
- 200% zoom.
- Keyboard operation.
- Reduced motion.
- Mobile keyboard.
- Supported languages.
- No-key fallback.

Designer-led testing is not representative-user research.
Functional tests are not clinical validation.


## Privacy and data handling

- Use fictional input only.
- Do not upload real patient information.
- Callback payloads exclude images, audio, and full transcripts.
- Audit events contain minimal operational metadata.
- Credentials are not exposed to the client.
- No real external communication occurs.

Verify before claiming:
- Images are deleted by external providers.
- Speech processing is local.
- Nothing is persisted.
- Session data survives refresh.
- Caregiver access is authorised.

Any optional persistence must document:
- Storage location.
- Retention.
- Access controls.
- Deletion.
- Deployment scope.


## Known limitations

Update against the demonstrated build.

Expected limitations include:
- Fictional records and recipients.
- No live pharmacy integration.
- No real callback.
- No clinical resolution.
- New-flow user validation pending.
- New language copy may require review.
- Voice support depends on browser/provider capabilities.
- A refresh ends the call (the start screen says so); nothing about it is rebuilt.
- Deduplication is an in-memory map per browser tab, lost on reload: not production-grade.
- The callback is simulated in the browser; there is no server-side approval check.
- The instruction comparison only understands this record's wording (English and Chinese).
- Camera reading of the instruction line is simulated by reviewer scenarios only.
- New Simplified Chinese copy has not had native-speaker review.
- Regulatory qualification has not been determined.

Do not hide these limitations behind a generic disclaimer.


## Project documents

| Document | Responsibility |
|---|---|
| prd.md | Scope, outcomes, requirement IDs |
| content-model.md | Data, provenance, approved copy |
| site-contract.md | States, APIs, runtime and recovery |
| design-standard.md | Visual and interaction rules |
| CLAUDE.md | Agent workflow and invariants |
| docs/decisions.md | Decisions, evidence, and trade-offs |

Current documents should agree.
Historical requirements belong in an archive or decision log.


## Assignment evidence

Record:
- Demonstrated build/commit.
- End-to-end flow.
- Confirmation and correction states.
- Comparison.
- Sharing preview.
- Submitted and failed outcomes.
- Actual test results.
- Design changes and reasons.
- Remaining validation needs.

Suggested traceability:

```text
Requirement → test → observed result → revision → retest
```

Do not fabricate participant quotes, findings, or clinical review.


## Generative AI disclosure

Document actual material uses of AI, such as:
- Brainstorming.
- Specification drafting.
- Copy drafting.
- Implementation assistance.
- Test scaffolding.

Separate:
- External evidence.
- Generated assumptions.
- Observed prototype results.
- Designer decisions.

Final disclosure wording must match the work actually completed.


## Deployment

Use a preview deployment for evaluation.

Before deployment:
- Confirm fictional data and simulation mode.
- Run available checks.
- Check secrets and bundle output.
- Verify reviewer scenarios.
- Confirm screenshots match the build.

Do not commit, push, deploy, enable real communications,
or modify external configuration without explicit approval.

The README must be updated with the actual deployed demo URL
only after it has been verified.