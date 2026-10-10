# CLAUDE.md — Medication Companion

## 1. Project identity

Medication Companion is a mobile-first, voice-led prototype for
the ELVTR AI Product Design course.

Repository: afreenfajila/Medication-Companion
Target branch: assignment-4

Current primary journey:

```text
Dose-change question
→ confirm medicine
→ confirm label wording
→ compare with current fictional record
→ explain unresolved discrepancy
→ review pharmacist callback request
→ simulate submission
→ show accurate outcome and recovery
```

The product should feel like a calm companion call, not a dashboard,
form wizard, generic chatbot, or automated prescriber.

All patient records and external-service outcomes are fictional
or simulated.

This prototype is not for medical use.
Regulatory qualification of a future deployment has not been determined.


## 2. First action: inspect the repository

Before editing:

1. Check the current branch and working tree.
2. Read the current project specifications.
3. Inspect relevant existing code, tests, dependencies, and scripts.
4. Identify what can be reused.
5. Report blocking contradictions or destructive changes.

Do not:
- Discard, overwrite, or stash user changes without permission.
- Switch branches without permission.
- Rewrite the application when a focused extension is sufficient.
- Add a second competing conversation state machine.
- Invent routes, scripts, dependencies, or implementation status.

If the current branch is not assignment-4, report it before switching.

Do not upgrade dependencies solely because a newer version exists.


## 3. Specification ownership

Read:

| File | Responsibility |
|---|---|
| prd.md | Product scope, outcomes, requirement IDs |
| content-model.md | Data, provenance, approved copy |
| site-contract.md | States, APIs, runtime and recovery |
| design-standard.md | Visual and presentation rules |
| README.md | Setup and current reviewer instructions |
| docs/decisions.md | Decision history and rationale |

This file governs agent workflow and non-negotiable implementation rules.
It does not duplicate the detailed specifications.

When specifications conflict:
1. Identify the exact conflicting rules.
2. Preserve existing safety behaviour.
3. Ask for a decision when the conflict affects scope or safety.
4. Update affected documents together after resolution.

Do not silently select a convenient rule.
Historical amendments are not active alternatives.


## 4. Current build scope

Required:
- Existing call-first experience.
- Medicine confirmation.
- Confirmed label wording.
- Structured instruction comparison.
- Clear unresolved-conflict state.
- Callback sharing preview.
- Editing and cancellation.
- Simulated submission and failure.
- Recovery without restarting.
- Tests and evidence documentation.

Preserve compatible existing:
- Record-backed explanation.
- Voice/text fallback.
- Camera/photo/name-selection pathways.
- Repeat and supported language controls.
- Existing help and safety behaviour.
- Read-only fictional caregiver view.
- Separately gated study mode.

Outside this task:
- Real pharmacy or EHR integration.
- Real calls, messages, or callback booking.
- Clinical triage or medication-interaction assessment.
- New clinical scoring thresholds.
- Production authentication.
- Real health-data storage.
- New emergency dispatch integration.
- Additional dashboards or unrelated features.

Do not remove an existing investigation demo without approval.
Do not use its unvalidated score to control the dose-change flow.


## 5. Non-negotiable safety invariants

1. Never diagnose, prescribe, recommend treatment, or decide whether
   a user should take, stop, skip, substitute, or change a medicine.

2. Never invent medication facts.

3. Medicine identity must be confirmed before record instructions
   are displayed.

4. Label wording must be confirmed at its current revision before
   a discrepancy is established.

5. User confirmation is not clinical verification.

6. A newer record date does not resolve a clinical conflict.

7. Missing or ambiguous information does not establish agreement.

8. Conflicting source instructions may be displayed for comparison,
   but neither may be endorsed as the dose to follow.

9. Unresolved conflicts produce no actionable dose recommendation.

10. Callback submission does not imply recipient acknowledgement,
    callback scheduling, clinical review, or medication resolution.

11. Preserve existing safety information and help pathways.
    Do not silently weaken or remove them.

12. All records and service results remain visibly fictional/simulated.


## 6. Architecture rules

Reuse the existing Next.js App Router, TypeScript, UI components,
design tokens, validation, and test framework.

### Responsibilities

AI:
- Optional bounded extraction and conversational enhancement.
- Never clinical authority.
- Never the owner of confirmation, approval, or delivery status.

Deterministic application:
- Confirmation gates.
- Supported instruction comparison.
- Draft revision and approval.
- State transitions.
- Recovery and stale-result protection.

Server or simulation adapter:
- Secrets.
- Validated record/service responses.
- Allowlisted payload construction.
- Approval/revision validation.
- Simulated submission and deduplication.

Client:
- Input and device permission.
- Presentation and focus.
- Audio playback.
- Typed event dispatch.
- Recoverable session context.

Do not assume client state is production authorisation.

Prefer small typed functions and existing patterns.
Do not introduce libraries or abstractions without a clear need.


## 7. AI boundaries

### Extraction

Treat images, typed content, and model output as untrusted.

Identity extraction and instruction-text extraction are separate tasks.

Instruction extraction may read visible wording only.
It must not:
- Infer missing instructions.
- Calculate doses.
- Resolve abbreviations from general medical knowledge.
- Correct a prescription.
- Recommend an instruction.

Validate output with the existing schema framework.
Schema validity does not prove factual accuracy.

### Conversation

Model-written text must remain within the approved non-clinical scope.

Use fixed content for:
- Safety limitations.
- Consent and sharing.
- Submission outcomes.
- Conflict boundaries.
- Critical operational status.

AI output cannot:
- Confirm a medicine.
- Approve sharing.
- Select a dose.
- Declare a request delivered.
- Mark a conflict resolved.

### Fallback

Core deterministic scenarios must work without successful AI calls.
Do not hide limitations or fabricate successful provider results.


## 8. Voice and audio

Inspect the actual provider implementation before changing it.

Current preferred scope:
- Browser speech recognition where supported.
- Typed fallback.
- Approved text rendered through optional server-side TTS.
- Browser speech synthesis fallback.

Do not reintroduce Gemini Live because an archived specification
mentioned it.

Rules:
- Audio and text refer to the same conversational turn.
- Visible text need not wait for audio.
- Speech completion does not confirm a decision.
- Repeat does not advance the flow.
- Stop recognition/playback on end/reset.
- Preserve typed input.
- Do not describe browser recognition as necessarily on-device.
- Document provider-processing limitations accurately.


## 9. State and correction rules

Extend the existing state authority.

Track relevant versions:
- Session/interaction generation.
- Record version.
- Label revision.
- Callback draft revision.

Correction:
- Preserve unrelated confirmed context.
- Clear confirmation for the edited information.
- Reconfirm the new revision.
- Recompute affected comparisons.
- Invalidate affected sharing approval.

If a correction removes the conflict:
- Discard the stale conflict request.
- Explain the updated comparison.
- Review any new support request separately.

Continuing another task must not silently resolve the conflict.


## 10. Callback sharing rules

Use only explicitly fictional recipients and contact information.

The review must show:
- Recipient.
- Reason.
- Medicine.
- Current record instruction and provenance.
- Confirmed label wording.
- Callback contact.

Submission payload:
- Construct from an allowlist.
- Match the exact reviewed revision.
- Exclude raw images, audio, and full transcript.
- Never serialise the entire session.

Approval:
- Requires explicit user action.
- Applies to the exact current draft.
- Is invalidated by edits.
- Is not restored from query parameters.
- Cancellation makes no submission call.

Do not add redundant confirmation modals after the complete review.


## 11. Simulated submission and recovery

No real communications.

Required states:
- Reviewing.
- Editing.
- Submitting.
- Submitted.
- Failed.
- Unknown outcome.
- Cancelled before submission.

Prevent duplicate logical requests.
Document the scope of idempotency storage.

Submitted:
- Explicitly simulated.
- Medication status remains unresolved.
- No callback-time promise.
- No pharmacist acknowledgement claim.

Known failure:
- State that no request was delivered.
- Preserve the summary.
- Offer retry or another support route.

Unknown outcome:
- Do not claim definite success or definite non-delivery.
- Retry using the same logical request identity where supported.

End/reset:
- Ignore stale asynchronous results.
- Do not claim that ending the UI cancels server-side delivery.


## 12. UX and visual rules

Follow design-standard.md.

Preserve:
- One quiet home CTA.
- Warm canvas, navy actions, restrained teal.
- Non-human companion identity.
- One conversational decision at a time.
- One contextual panel at a time.
- Visible correction, help, and end controls.

Do not add:
- Permanent clinical task cards.
- A dense transcript wall.
- Unnecessary Next clicks.
- Score breakdowns in the main journey.
- Decorative elements that displace essential content.

Use clear source labels.
Do not use a checkmark to imply clinical verification or dose correctness.

Reduce decoration before shrinking important text.


## 13. Accessibility

Implement and check:
- Semantic controls.
- Labels and accessible names.
- Visible keyboard focus.
- Logical focus behaviour.
- Product target-size rules.
- Verified colour combinations.
- Text wrapping and zoom.
- Reduced motion.
- Audio stop/mute.
- Voice alternatives.
- Supported-language expansion.

Avoid:
- Colour-only meaning.
- Competing live-region announcements.
- Focus movement on every transcript update.
- Fixed-height clipping.
- Sticky controls obscuring content.

Do not claim full accessibility compliance from component choice
or automated checks alone.


## 14. Content and language

Use approved copy keys from content-model.md.

Tone:
- Respectful.
- Short.
- Direct.
- No blame.
- Questions only when a decision or clarification is needed.

Do not force every line to:
- Begin with reassurance.
- End with a question.
- Avoid clear failure language.

Do not alter quoted record content to satisfy conversational tone.

English and supported Chinese must preserve meaning.
Flag unreviewed translations.
Do not imply complete support if critical copy is missing.


## 15. Privacy and security

- Fictional data only.
- Warn against uploading real records.
- Server credentials remain server-side.
- No secrets in NEXT_PUBLIC variables, logs, or bundles.
- Validate requests and model output.
- Constrain upload size/type.
- Do not store raw media in browser storage.
- Redact logs and errors.
- Do not execute model-generated HTML, tools, or arbitrary URLs.

Do not claim:
- Provider-side deletion without verification.
- Production consent or authorisation.
- Caregiver access controls that do not exist.
- Production-grade persistence or idempotency.

No new persistence or external-service connection without approval.


## 16. Build order

1. Inspect implementation and specifications.
2. Establish fictional scenario fixtures.
3. Implement state transitions and comparison.
4. Implement correction.
5. Implement sharing review and approval.
6. Implement simulated submission and recovery.
7. Integrate existing voice/audio behaviour.
8. Run tests.
9. Conduct manual checks.
10. Update evidence and documentation.

Build one complete journey before expanding scenarios.


## 17. Testing requirements

Use actual package scripts.
Do not invent commands or claim unrun tests passed.

Cover:
- Medicine and label gates.
- Comparison outcomes.
- Formatting versus meaningful differences.
- Missing information.
- Correction without restart.
- Draft revision and approval invalidation.
- Exact payload construction.
- Cancellation.
- Duplicate submission.
- Known failure and retry.
- Unknown outcome.
- End/reset and stale results.
- Submitted versus unresolved status.

Regression-check:
- Existing explanation.
- Voice/text.
- Camera decline.
- Repeat.
- Language.
- Help/safety.
- Study-mode isolation.

Manual checks:
- 320–430 px widths.
- Desktop.
- 200% zoom.
- Keyboard.
- Reduced motion.
- Mobile keyboard.
- Supported languages.
- No-key deterministic path.

Report pre-existing failures separately from new regressions.

Prototype tests demonstrate specified behaviour,
not clinical safety or representative-user comprehension.


## 18. Documentation and evidence

Update only affected documents, keeping current rules consistent.

Record:
- Requirement IDs.
- Implemented versus simulated behaviour.
- Commands and actual results.
- Manual observations.
- Remaining limitations.
- Build identifier.
- Screenshot or recording references.

Use docs/decisions.md for:
- Decision.
- Reason.
- Evidence source.
- Trade-off.
- Unvalidated assumption.
- Retest outcome.

Do not fabricate:
- User quotes.
- Participant findings.
- Clinical review.
- Test results.
- Deployment success.


## 19. External actions and working-tree protection

Do not:
- Commit.
- Push.
- Deploy.
- Modify external configuration.
- Send messages.
- Contact a pharmacy or caregiver.
- Enable real calling.
- Delete branches or user files.

These require explicit approval.

Do not run destructive commands to make checks pass.
Do not overwrite unrelated user changes.


## 20. Definition of done

The change is ready for review when:

- The primary journey works end to end.
- Confirmation and approval gates remain intact.
- Corrections preserve context.
- Comparison does not choose a dose.
- Preview and payload match.
- Cancellation submits nothing.
- Submission status is accurate and simulated.
- Medication status remains unresolved after submission.
- Recovery retains the summary.
- Stale results are guarded.
- Core regression checks are completed.
- Documentation matches implemented behaviour.
- Remaining gaps are explicitly reported.

Do not equate “ready for design review” with “ready for clinical use.”


## 21. Final response after implementation

Report:

1. Files changed and purpose.
2. Implemented flow and recovery.
3. Commands run and actual results.
4. Manual checks completed or still needed.
5. Actual demo route.
6. Implemented, simulated, and proposed capabilities.
7. Remaining safety, language, privacy, or runtime limitations.
8. Any unresolved specification conflict.

Do not commit, push, or deploy as part of this final step.