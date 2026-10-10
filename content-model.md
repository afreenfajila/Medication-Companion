# Content Model — Medication Companion

## 1. Document status

| Field | Value |
|---|---|
| Version | 0.4 — proposed Assignment 4 content contract |
| Last updated | 10 October 2026 |
| Primary journey | Dose-change discrepancy → reviewed pharmacist callback |
| Data | Fictional only |
| External services | Simulated only |
| Implementation verification | Pending code review and tests |
| Language review | English draft; Simplified Chinese review pending |

This document defines intended data structures and approved content.
It does not establish implementation completeness, clinical validity,
or language validation.

Use this document with:
- prd.md for scope and requirement IDs.
- site-contract.md for transitions and API behaviour.
- design-standard.md for presentation.
- docs/decisions.md for history and rationale.

Do not retain conflicting historical copy as an active alternative.


## 2. Content principles

1. Record facts come from the fictional pharmacy fixture.
2. Extracted text is unconfirmed until the user checks it.
3. User confirmation does not establish clinical correctness.
4. User recollection remains user-reported information.
5. Missing information is not evidence of agreement.
6. Comparison identifies differences; it does not choose a dose.
7. Request submission is not recipient acknowledgement or resolution.
8. Sharing uses only the exact reviewed content.
9. No model may invent medication facts or resolve a clinical conflict.


## 3. Prototype disclosure

Use a persistent visible label:

“Prototype · Fictional data”

Use an additional disclosure at sharing and request outcomes:

“Demo only — no real callback request is sent.”

The About page must explain that:
- The patient, pharmacy, record, and contact details are fictional.
- Medicine examples are not instructions for real use.
- Callback submission is simulated.
- No real pharmacist is contacted.
- Clinical and representative-user validation remain pending.

“AI guide · Not a pharmacist or doctor” is an identity statement.
It does not replace the prototype disclosure.


## 4. Core types

```ts
type SupportedLanguage = "en" | "zh-Hans";

type FutureLanguage = "ms" | "ta";

type Persona = "mei-ling" | "caregiver";

type ConfirmationStatus =
  | "unconfirmed"
  | "confirmed"
  | "rejected"
  | "unsure";

type InputSource =
  | "typed"
  | "speech-transcript"
  | "image-extraction"
  | "record-selection"
  | "fixture";

type ComparisonStatus =
  | "match"
  | "conflict"
  | "insufficient-information";

type MedicationResolutionStatus =
  | "not-assessed"
  | "not-required-for-this-comparison"
  | "unresolved";

type SubmissionStatus =
  | "not-submitted"
  | "submitting"
  | "submitted"
  | "failed";
```

Future languages must not be advertised as available.
“Confirmed” means confirmed by the user for this interaction,
not clinically verified.


## 5. Fictional patient and recipient

```ts
type DemoPatient = {
  id: string;
  displayName: string;
  preferredLanguage: SupportedLanguage;
  supportedLanguages: SupportedLanguage[];
  fictional: true;
};

type DemoRecipient = {
  id: string;
  displayName: string;
  kind: "pharmacy";
  simulated: true;
};

type CallbackContact = {
  value: string;
  userConfirmed: boolean;
  fictional: true;
};
```

Seed identity:

- Patient: Mei Ling Tan.
- Pharmacy: BrightCare Pharmacy.
- Both explicitly fictional.

Use a non-routable fictional callback value in demo fixtures.
Do not use a real person's phone number.

Mask callback details by default, but provide a labelled way
to inspect and edit the full value.


## 6. Record provenance

```ts
type RecordProvenance = {
  sourceId: string;
  sourceName: string;
  recordId: string;
  recordVersion: string;
  recordedAt: string;
  verificationStatus: "fixture-simulated-verified";
  fictional: true;
};
```

Dates and verification status describe the fictional scenario.

They do not establish:
- Live pharmacy integration.
- Real pharmacist verification.
- Clinical authority over a conflicting instruction.

A newer date must never automatically resolve the conflict.


## 7. Medication identity

```ts
type MedicationIdentity = {
  medicineId: string;
  displayName: string;
  strengthText: string;
  dosageForm: string;
  approvedAliases: string[];
};

type MedicineCandidate = {
  candidateId: string;
  identity: MedicationIdentity;
  sourceRecordId: string;
  status: "possible";
  matchedFields: string[];
};

type MedicineConfirmation = {
  candidateId: string;
  recordVersion: string;
  status: ConfirmationStatus;
  revision: number;
  confirmedAt?: string;
};
```

Matching requirements:
- Name and strength must satisfy the defined identity rules.
- Known identity conflicts do not produce a confirmed candidate.
- Ambiguity or missing required identity data remains unresolved.
- Candidate selection does not bypass user confirmation.
- Confirmation must be invalidated when the selected medicine changes.

Do not display identity-match scores as clinical confidence.


## 8. Structured instruction

```ts
type InstructionFields = {
  doseQuantity: string | null;
  doseUnit: string | null;
  frequencyCode: string | null;
  timingCode: string | null;
  additionalInstructionCode: string | null;
};

type RecordInstruction = {
  fields: InstructionFields;
  canonicalText: Record<SupportedLanguage, string>;
  provenance: RecordProvenance;
};
```

Use controlled values or explicitly approved mappings.

Preserve distinctions such as:
- Tablet strength versus number of tablets.
- Dose quantity versus frequency.
- Scheduled versus as-needed instructions.
- Food/timing conditions.

Do not use general model reasoning to infer equivalence.


## 9. Label instruction and confirmation

```ts
type LabelInstruction = {
  id: string;
  rawText: string;
  correctedText?: string;
  inputSource: InputSource;
  extractionStatus:
    | "not-used"
    | "readable"
    | "unreadable"
    | "ambiguous";
  parsedFields: InstructionFields | null;
  revision: number;
  confirmationStatus: ConfirmationStatus;
  confirmedRevision?: number;
  confirmedAt?: string;
};
```

Effective label text is:
- correctedText when present;
- otherwise rawText.

Rules:
- Any edit increments revision.
- Any edit clears previous confirmation.
- Confirmation applies to the displayed revision.
- The user must be able to inspect the actual wording.
- A model-generated interpretation is not user-confirmed merely
  because the original image was accepted.
- If parsing is uncertain, request clarification or return
  insufficient information.

No conflict is established from unconfirmed extraction.


## 10. Bounded extraction contracts

### Identity extraction

```ts
type IdentityExtraction = {
  status: "readable" | "unreadable" | "ambiguous";
  medicineName: string | null;
  strengthText: string | null;
  dosageForm: string | null;
  ambiguityReason: string | null;
};
```

Avoid patient-name extraction unless the implemented flow requires it.

### Instruction extraction

Instruction extraction is a separate capability.
It must not silently expand the identity extractor.

```ts
type InstructionExtraction = {
  status: "readable" | "unreadable" | "ambiguous";
  verbatimText: string | null;
  ambiguityReason: string | null;
};
```

Approved instruction-extraction prompt:

“Extract only the visible medication instruction text.
Preserve the wording. Do not infer missing text, calculate a dose,
correct the prescription, interpret abbreviations from general
knowledge, or recommend what the user should take.
If the text is unclear, return unreadable or ambiguous.
Return only the specified JSON.”

Validate output structurally.
Schema validity does not prove extraction accuracy.

A deterministic typed/fixture route must remain available.

Do not store raw images in callback payloads or audit events.
Image-processing and provider-retention details belong in
site-contract.md and must match actual behaviour.


## 11. Instruction comparison

```ts
type InstructionComparison = {
  id: string;
  medicineId: string;
  recordVersion: string;
  labelRevision: number;
  status: ComparisonStatus;
  comparedFields: Array<keyof InstructionFields>;
  differingFields: Array<keyof InstructionFields>;
  missingOrUnclearFields: Array<keyof InstructionFields>;
  resolutionStatus: MedicationResolutionStatus;
};
```

Comparison prerequisites:
- Medicine identity is confirmed.
- Label wording is confirmed at its current revision.
- Record version is available.
- Relevant comparison fields are interpretable.

Rules:
- Compare structured values, not only display strings.
- Whitespace, casing, or terminal punctuation alone does not
  create a conflict.
- Do not remove meaningful decimal points, units, negations,
  or conditional wording during normalisation.
- Do not infer equivalence between clinically different instructions.
- Incomplete data must not produce “match.”
- If clear differences and missing information coexist, preserve
  both in the comparison; do not imply a complete assessment.
- Changes to label or record invalidate the previous comparison.

User-facing “match” means only:
“The confirmed wording matches for the fields checked.”

It does not mean:
“The medication is safe” or “This dose is clinically correct.”


## 12. Comparison presentation content

### Labels

| Key | English |
|---|---|
| comparisonHeading | Let’s check the difference |
| currentRecordLabel | Current record |
| confirmedLabelLabel | Label you confirmed |
| sourceLabel | Source |
| recordDateLabel | Record date |
| conflictHeading | These instructions differ |
| insufficientHeading | I cannot complete this comparison |
| medicationUnresolved | Medication instruction: unresolved |

### Conflict message

“I can show you the difference, but I cannot confirm which
instruction you should follow.”

### Agreement message

“The confirmed label wording matches the record for the
details we checked.”

### Insufficient-information message

“I do not have enough confirmed information to compare these
instructions. I can help you prepare a question for your pharmacist.”

### Actions

- Ask for a pharmacist callback.
- Correct label wording.
- Hear the comparison again.
- Review details.
- End call.

Do not label either conflicting instruction “correct.”
Do not use success styling to endorse a dose.


## 13. Callback draft

```ts
type CallbackReason =
  | "instruction-discrepancy"
  | "comparison-incomplete"
  | "record-unavailable";

type CallbackPayload = {
  recipientId: string;
  patientId: string;
  medicine: {
    medicineId: string;
    displayName: string;
    strengthText: string;
  };
  reason: CallbackReason;
  concernSummary: string;
  currentRecord: {
    instructionText: string;
    sourceName: string;
    recordedAt: string;
    recordVersion: string;
  } | null;
  confirmedLabel: {
    instructionText: string;
    labelRevision: number;
  } | null;
  callbackContact: string;
  simulated: true;
};

type CallbackDraft = {
  draftId: string;
  revision: number;
  payload: CallbackPayload;
  approval: {
    approvedRevision: number;
    approvedAt: string;
  } | null;
};
```

Payload construction:
- Build from an allowlist.
- Never serialise the entire session into a request.
- Include only available, confirmed information.
- Do not invent missing record details.
- User-edited concern text remains explicitly user-reported.

Excluded:
- Raw image.
- Full transcript.
- Audio/video.
- Model prompts or responses.
- Unrelated wellbeing or symptom conversation.

If symptom sharing is added later, specify and review it separately.


## 14. Sharing approval

Approval means the user selected Send after inspecting the
current recipient and content.

Rules:
- Approval applies to the exact draft revision.
- Recipient or content changes increment revision and clear approval.
- Cancellation creates no submission.
- A corrected label triggers a new comparison.
- If the discrepancy disappears, invalidate the conflict draft.
- The user may still request help, but the reason must be updated
  and reviewed again.
- Editing cannot overwrite the record itself.
- Family sharing uses a separate recipient/payload/approval flow.


## 15. Sharing-review copy

| Key | English |
|---|---|
| reviewHeading | Check before sharing |
| recipientLabel | To |
| concernLabel | What you want checked |
| medicineLabel | Medicine |
| callbackLabel | Call me on |
| changeDetails | Change something |
| sendCallback | Send callback request |
| cancelSharing | Don’t send |
| readSummary | Read this to me |
| sharingBoundary | Only the details shown here are included. Your label photo and full conversation are not included. |
| simulationNotice | Demo only — no real callback request is sent. |

Introduction:

“I’ve prepared a short summary. Please check it before sending.”

Default discrepancy concern:

“My medicine label and current record show different instructions.
I would like a pharmacist to check the difference.”

Do not claim an error by the doctor, pharmacy, or user.
Do not presume which source is outdated.


## 16. Submission result

```ts
type CallbackSubmissionResult =
  | {
      ok: true;
      simulated: true;
      requestId: string;
      status: "submitted";
    }
  | {
      ok: false;
      simulated: true;
      requestId: string;
      status: "failed";
      reasonCode: "service-unavailable" | "request-rejected";
      retryable: boolean;
    };
```

Do not include a callback-time promise or recipient acknowledgement.

A submission reference is a demo identifier, not a pharmacy booking.

Detailed idempotency, retries, and asynchronous handling belong
in site-contract.md.


## 17. Outcome copy

### Submitting

“Submitting your demo callback request…”

### Submitted

Heading:
“Demo: callback request submitted”

Body:
“The difference in your medication instructions still needs checking.”

Statuses:
- Request: submitted — simulated.
- Medication instruction: unresolved.

Actions:
- Review request.
- Return to call.
- End call.

### Failed

Heading:
“Demo: request not submitted”

Body:
“The request could not be delivered. No one has been notified.
Your summary is still available.”

Actions:
- Try again.
- View fictional pharmacy contact.
- Review summary.
- End call.

### Cancelled

“Nothing was shared. You can return to the comparison or end the call.”

Prohibited:
- Your pharmacist will call soon.
- Everything is sorted.
- Your medication is safe.
- Follow the new dose.
- Family alerted, unless explicitly qualified as simulation.
- Any implication that submission resolves the medication question.


## 18. Conversation and tone

Use:
- Short, respectful statements.
- One decision at a time.
- Clear operational status.
- No blame.
- Questions when a decision or clarification is needed.

Do not require every response to:
- Begin with reassurance.
- End with a question.
- Avoid every word associated with failure.

Clear failure disclosure is necessary.

Examples:
- “Thank you. I’ve corrected the label wording.”
- “These instructions differ.”
- “I cannot resolve this difference.”
- “The request could not be delivered.”
- “No one has been notified.”

Record quotations are not altered to satisfy conversational tone rules.

Do not explain the conflict with unsupported speculation such as:
“The record is taking a while to update.”


## 19. Language requirements

Supported:
- English.
- Simplified Chinese, subject to review of new content.

All critical content must have:
- A stable copy key.
- An approved language value.
- A review status.
- A deterministic fallback.

Do not silently fall back to English for a critical confirmation
or limitation while implying complete Chinese support.

Language changes must preserve:
- Medicine confirmation.
- Label revision.
- Comparison status.
- Sharing draft.
- Unresolved medication status.

Changing the language alone must not change the submitted meaning.
If the payload content itself changes, require a new review.

Medication translations require appropriate bilingual review.
Do not reuse ambiguous dose translations without checking them.

Future languages are unavailable, not automatically generated.


## 20. Symptom interruption

Symptom reporting is an interruption of the main journey,
not evidence that the dose change caused the symptom.

Rules:
- Preserve confirmed context.
- Pause routine instruction explanation.
- Use the existing bounded support route.
- Do not introduce new clinical classification through this file.
- Do not add an interaction score as clinical confidence.
- Do not silently remove existing safety information.

Detailed urgent-language handling and approved guidance require
a separate reviewed contract.


## 21. Audit events

```ts
type AuditEventType =
  | "call-started"
  | "medicine-confirmed"
  | "medicine-rejected"
  | "label-confirmed"
  | "label-corrected"
  | "comparison-completed"
  | "callback-draft-created"
  | "callback-draft-edited"
  | "callback-approved"
  | "callback-cancelled"
  | "callback-submitted"
  | "callback-failed"
  | "callback-retried"
  | "support-interruption"
  | "call-ended";

type AuditEvent = {
  id: string;
  sessionId: string;
  timestamp: string;
  eventType: AuditEventType;
  simulated: boolean;
  requirementIds: string[];
  details: Record<string, string | number | boolean | null>;
};
```

Allowed details:
- Scenario ID.
- Record version.
- Label revision.
- Draft revision.
- Outcome category.
- Simulated request ID.

Excluded:
- Raw transcript.
- Callback number.
- Label image.
- Audio.
- Full payload.
- Unnecessary health detail.

Do not log “submitted” when the user only approved.
Do not log “resolved” when a request was submitted.

Caregiver-view access is a fictional demo capability,
not a production authorisation system.


## 22. Deterministic scenarios

| ID | Setup | Expected result |
|---|---|---|
| DEMO-01 | Confirmed record/label discrepancy | Callback preview → simulated submission |
| DEMO-02 | Same discrepancy; service failure enabled | Failure → preserved summary → recovery |
| DEMO-03 | Misread label corrected | Revised comparison without restart |
| DEMO-04 | Confirmed label matches record | No false conflict |
| DEMO-05 | Current record unavailable | Limitation → support request with truthful missing-data context |

Scenario values belong in typed fixture files.

Use existing fictional medicine identity where suitable.
Numerical instructions must be conspicuously fictional and must
not be presented as clinically reviewed unless that review occurred.

Do not mix deliberately wrong A3 study output with ordinary
dose-change fixtures.

Study-mode injection must remain gated and labelled separately.


## 23. Content acceptance checklist

- [ ] Prototype disclosure is visible.
- [ ] Medicine identity and label wording are confirmed separately.
- [ ] Extracted text is not presented as verified.
- [ ] Corrections invalidate relevant prior confirmations.
- [ ] Comparison uses current confirmed revisions.
- [ ] Missing data does not produce false agreement.
- [ ] Source display is distinct from dose guidance.
- [ ] No conflicting instruction is selected as correct.
- [ ] Callback preview matches the allowlisted payload.
- [ ] Payload edits invalidate approval.
- [ ] Cancellation submits nothing.
- [ ] Images and full transcripts are excluded from sharing.
- [ ] Submission and medication resolution remain separate.
- [ ] Failure clearly states no one was notified.
- [ ] English and Chinese critical copy is reviewed and tracked.
- [ ] Audit events describe actual prototype events.
- [ ] Historical superseded strings are not active alternatives.