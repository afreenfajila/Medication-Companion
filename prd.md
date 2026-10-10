# Product Requirements Document — Medication Companion

## 1. Document status

| Field | Value |
|---|---|
| Product | Medication Companion |
| Repository | afreenfajila/Medication-Companion |
| Target branch | assignment-4 |
| Document version | 0.4 — proposed Assignment 4 scope |
| Last updated | 10 October 2026 |
| Primary platform | Mobile-first web prototype |
| Assignment 4 submission | 14 October 2026 |
| Assignment 5 submission | 15 October 2026 |
| Primary audience | Design reviewers and designer-led evaluators |
| Data | Fictional only |
| Pharmacy and communication services | Simulated only |
| Implementation verification | Pending code review and test results |

This document defines intended behaviour. It does not establish that
the implementation satisfies every requirement.

The Assignment 5 brief must be checked separately before finalising
the case-study deliverables.

### Status language

Use these labels in documentation and presentation:

- Implemented: behaviour verified against a named build.
- Simulated: interactive behaviour representing an external service.
- Proposed: specified but not yet implemented.
- Unvalidated: requires further user, language, clinical, or regulatory review.

Do not present proposed behaviour as implemented or prototype tests
as evidence of clinical safety.


## 2. Product proposition

Medication Companion is a voice-first guide that helps older adults
in Singapore understand information from their current medication
record through a calm, accessible conversation.

When the user's medicine label and record show different instructions,
the companion makes the discrepancy visible and helps prepare a
pharmacist callback request. It does not decide which conflicting
instruction the user should follow.

All records and services in this prototype are fictional or simulated.

### One-sentence promise

“Call your companion to understand your medication record—or prepare
a request for human help when the information cannot be resolved.”

### Product boundary

The companion may:

- Explain approved record-backed information.
- Suggest a possible medicine match.
- Ask the user to confirm identity and label wording.
- Compare confirmed instructions using defined rules.
- Explain missing information and unresolved discrepancies.
- Prepare a user-reviewed support request.

The companion must not:

- Diagnose or establish the cause of a symptom.
- Prescribe or recommend treatment.
- Decide whether a person should take, stop, skip, or change a medicine.
- Resolve conflicting instructions by selecting a dose.
- Infer missing medication information.
- Treat an image or user confirmation as clinical verification.
- Claim that a real pharmacist has received or reviewed a demo request.

This is a fictional prototype for design evaluation, not for medical use.
Regulatory qualification of any future deployment has not been determined.


## 3. Problem and design opportunity

The project focuses on an older adult who is more comfortable
understanding medication information in a mother tongue than English
and needs help checking instructions at home.

The selected situation is a medication change after a clinic visit:
the current record and the label on a medicine box appear to disagree.

The design opportunity is not an open-ended medical chatbot.
It is a bounded conversation that makes information understandable,
preserves the user's ability to correct it, and carries unresolved
questions into a clear human handoff.

Research supporting the original problem belongs in the case-study
evidence. This PRD does not claim representative-user validation.


## 4. Continuity and response to feedback

### Assignment progression

| Stage | Focus |
|---|---|
| A1 | Define the medication-understanding problem and explanation boundary |
| A2 | Make the idea tangible through a voice-led, camera-assisted call |
| A3 | Define confirmation, uncertainty, correction, recovery, and human help |
| A4 | Develop the dose-change discrepancy and reviewed callback handoff |
| A5 | Explain the design journey, evidence, trade-offs, and remaining limitations |

### Instructor feedback translated into requirements

- Specific medication situations:
  Use dose-change confusion as the primary demonstration.

- Simpler mobile journey:
  Use one continuous call and one contextual panel at a time.

- Clear user roles:
  Distinguish the older adult, trusted caregiver, and pharmacist.

- Accurate medication information:
  Separate record facts, extracted text, user corrections, and uncertainty.

- Clear presentation:
  Demonstrate one coherent journey rather than adding unrelated features.


## 5. Target users and roles

### Primary user — Mei Ling

A fictional older adult in Singapore who:

- Manages medication at home.
- May prefer Simplified Chinese.
- Can use a phone but benefits from clear wording and large controls.
- Wants to check a changed instruction without guessing.
- Needs an easy way to correct what the companion heard or read.

These are design assumptions, not findings from participant research.

### Secondary user — trusted caregiver

May help the user complete the task or contact a healthcare professional.

The caregiver:

- Is not a substitute for clinical review.
- Receives information only through a defined sharing flow.
- Cannot change medication instructions.
- Uses a fictional, read-only view in the prototype.

### Tertiary role — pharmacist

The intended recipient of an unresolved medication question.

The handoff should communicate:

- Confirmed medicine identity.
- Current record instruction and provenance.
- User-confirmed label wording.
- The unresolved question.
- Callback details.

No real pharmacist service, acceptance, or review is implemented
by this prototype.


## 6. Primary scenario

### Starting situation

Mei Ling returns from a clinic visit remembering that a medication
instruction changed.

Her current fictional pharmacy record differs from the instruction
on the medicine box she is holding.

She says:

“My doctor changed my medicine, but this box still says the old amount.
How many should I take now?”

### Intended outcome

Mei Ling can:

1. Confirm the medicine.
2. Confirm or correct the label wording.
3. See the discrepancy and its sources.
4. Understand that the companion cannot resolve it.
5. Review a callback summary.
6. Approve or cancel simulated sharing.
7. Understand the submission outcome.

### What success does not mean

Success does not mean:

- The companion establishes the correct dose.
- The conflict is clinically resolved.
- A pharmacist has reviewed the case.
- A real callback has been arranged.
- The medication is safe to take.


## 7. Scope

### Required for Assignment 4

- Quiet home state with one prominent “Call with companion” action.
- Voice/text interaction using existing supported capabilities.
- Medicine identification and explicit confirmation.
- Label-instruction entry or bounded extraction with confirmation.
- Structured comparison with the current fictional record.
- Match, conflict, and insufficient-information outcomes.
- Correction without restarting the call.
- Pharmacist callback offer.
- Exact sharing preview with editing and cancellation.
- Simulated submission, failure, and retry.
- Clear distinction between request status and medication status.
- Persistent help and end-call controls.
- English and supported Simplified Chinese content.
- Deterministic reviewer scenarios.
- Automated checks and designer-led manual evaluation.
- Visible prototype and simulation disclosures.

### Retained secondary capabilities

Preserve working existing functionality where compatible:

- Record-backed medicine explanation.
- Camera/photo/name-selection fallbacks.
- Repeat and language change.
- Existing bounded safety/help behaviour.
- Read-only caregiver demo view.

Do not expand these features simply to increase prototype breadth.

### Outside the current build scope

- Real pharmacy, clinic, EHR, or prescription integration.
- Real callback booking or messaging.
- Real patient data.
- Clinical diagnosis, triage, or medication-interaction assessment.
- Confidence scores presented as clinical probabilities.
- Dose-change, missed-dose, or treatment recommendations.
- Production authentication and caregiver authorisation.
- New emergency dispatch or calling integration.
- Multiple-patient clinical workflows.
- Automatic learning or modification of safety rules.


## 8. End-to-end journey

### Main path

1. Start the call.
2. Receive AI disclosure and invitation to speak or type.
3. Express a dose-change question.
4. Identify the medicine only if needed.
5. Confirm the possible medicine match.
6. Retrieve the current fictional record.
7. Enter, extract, and confirm the label instruction.
8. Compare the confirmed label with the record.
9. Explain the unresolved discrepancy.
10. Offer a pharmacist callback.
11. Prepare and display the sharing preview.
12. Allow correction, approval, or cancellation.
13. Simulate submission.
14. Display submitted or failed status.
15. Preserve the unresolved medication question.

### Important branches

- Medicine rejected:
  Return to identification without unlocking guidance.

- Medicine uncertain:
  Offer support without assuming confirmation.

- Label misread:
  Correct, reconfirm, and recompute comparison.

- Record unavailable:
  Explain the limitation and offer support.

- Instructions match:
  Do not generate a conflict-specific callback automatically.

- Information incomplete:
  Do not classify missing data as agreement.

- Sharing cancelled:
  Nothing is submitted; context is retained.

- Submission failed:
  No one is notified; summary is retained for recovery.

- Symptom reported:
  Pause the dose-change flow and preserve confirmed context.
  Use existing bounded support behaviour; do not infer a medication cause.


## 9. Information and provenance requirements

The following must remain distinct:

| Information | Meaning |
|---|---|
| Record fact | Supplied by the fictional pharmacy fixture |
| Extracted label text | Machine-read candidate text, not yet confirmed |
| User-confirmed label text | The user's confirmation of what the label says |
| User recollection | Reported context, not verified instruction |
| Comparison result | Defined comparison of confirmed fields |
| Callback status | Outcome of the simulated request |
| Medication resolution | Remains unresolved after request submission |

A newer record date alone does not resolve a clinical conflict.

User confirmation does not prove that the label is current,
belongs to the correct patient, or is clinically authoritative.

Detailed schemas and approved wording belong in content-model.md.


## 10. Functional requirements

### EN — Entry and conversation

EN-01:
The primary home state has one prominent action:
“Call with companion.”

EN-02:
Label and schedule routes emerge from the active conversation,
not permanent home-screen task cards.

EN-03:
Typed input remains available when voice is unavailable.

EN-04:
Repeat, help, and end-call controls remain reachable during the call.

EN-05:
Each conversational turn has a visible textual equivalent.
Text must not be artificially delayed solely to wait for audio.


### ID — Medicine identification

ID-01:
A medicine candidate is labelled “Possible match.”

ID-02:
Identity confirmation is required before record instruction display.

ID-03:
Rejection or uncertainty does not unlock instruction guidance.

ID-04:
Camera permission is explained before activation.

ID-05:
Declining camera access provides a usable alternative.


### DC — Dose-change comparison

DC-01:
The system confirms label wording before establishing a discrepancy.

DC-02:
The system compares defined structured instruction fields.

DC-03:
Formatting differences alone must not create a conflict.

DC-04:
Missing or ambiguous fields produce insufficient information.

DC-05:
Corrections recompute the comparison without restarting the call.

DC-06:
Current record and confirmed label are visibly distinguished by source.

DC-07:
An unresolved conflict produces no recommendation about which dose to take.

DC-08:
Source instructions may be displayed for comparison after identity
confirmation, but neither is endorsed as the instruction to follow.

DC-09:
Continuing another task does not silently mark the conflict resolved.

DC-10:
A previous record, if available, is optional context—not necessary
for comparing the current record with the confirmed physical label.


### CB — Callback review and approval

CB-01:
The user explicitly chooses to prepare a callback request.

CB-02:
The review shows the recipient, reason, medicine, comparison,
and callback number.

CB-03:
The user can inspect, correct, approve, or cancel the summary.

CB-04:
User corrections cannot overwrite pharmacy-record facts.

CB-05:
The exact approved preview determines the submitted payload.

CB-06:
Any payload or recipient edit invalidates previous approval.

CB-07:
If a correction removes the discrepancy, invalidate the stale
conflict draft and reassess the request.

CB-08:
Raw label images and the full transcript are excluded from the payload.

CB-09:
Cancellation makes no submission call and preserves context.

CB-10:
The interface clearly states that no real request is sent.


### SR — Submission and recovery

SR-01:
Show a submitting state and prevent repeated submission.

SR-02:
One logical request must not generate duplicate submissions.

SR-03:
Submitted status appears only after simulated service success.

SR-04:
Submission success does not imply recipient acknowledgement,
callback scheduling, clinical review, or medication resolution.

SR-05:
Failure explicitly states that no request was delivered.

SR-06:
Failure preserves confirmed information and the reviewed summary.

SR-07:
Retry does not restart medicine identification.

SR-08:
Ending or resetting the call prevents stale asynchronous results
from updating the new or ended session.

SR-09:
No callback time or response commitment is promised.


## 11. AI and deterministic responsibilities

### AI may contribute

- Bounded extraction of visible text.
- Understanding ordinary conversational input.
- Approved non-clinical phrasing.
- Speech output of approved content.

### AI must not decide

- Clinical correctness of either conflicting instruction.
- Whether a medicine should be taken.
- Whether a callback request is approved.
- Whether a request was delivered.
- Whether a symptom was caused by medication.

### Deterministic application responsibilities

- State transitions and confirmation gates.
- Record retrieval.
- Defined instruction comparison.
- Draft versioning and approval binding.
- Submission status and duplicate prevention.
- Fallback and recovery.
- Minimal audit events.

Do not build a second competing conversation-state system.

Provider details and current runtime architecture belong in
site-contract.md and must be verified against the implementation.


## 12. UX and accessibility requirements

- One conversational decision at a time.
- One contextual panel visible at a time.
- Core medication content at least 18 px in supported languages.
- Important source, sharing, and outcome text remains readable.
- Product touch-target minimum: 44 × 44 CSS px.
- Major confirmation and consent actions use larger controls.
- Status is communicated through words, not colour alone.
- Keyboard operation and visible focus.
- Logical focus handling after panel changes.
- Responsive layout at 320–430 px widths.
- No fixed-height clipping of critical content.
- Sticky controls do not obscure content or focused controls.
- Text zoom and mobile-keyboard layouts are checked.
- Reduced-motion support.
- Audio has visible text and stop/mute control.
- Avoid competing audio and screen-reader announcements.

Using these design rules does not establish full accessibility compliance.
Actual checks and remaining limitations must be recorded.


## 13. Safety, privacy, and consent

### Safety

- No invented medication facts.
- No instruction guidance before required confirmation.
- No clinical resolution of conflicting instructions.
- No reassurance inferred from incomplete information.
- No symptom-cause claim.
- Existing urgent/help behaviour is not silently removed or weakened.
- New symptom-routing rules require separate research and review.

### Privacy

- Fictional data only.
- Server credentials remain server-side.
- No raw image/audio retention by default.
- Callback payload uses explicitly allowlisted fields.
- Conversation logs are not automatically included in sharing.
- Data retention and provider processing claims must match actual behaviour.
- No real communications integration in this prototype.

### Consent

- Named recipient and purpose are visible.
- Exact shared content is inspectable.
- Approval applies to the displayed draft revision.
- Edits require renewed review.
- Cancellation sends nothing.
- Caregiver sharing is separate from pharmacist callback sharing.

Regulatory claims, provider retention, and emergency exceptions
require separate assessment before any real-world deployment.


## 14. Reliability and fallback

The primary deterministic demo must work without external AI success.

Provide clear alternatives for:

- Microphone unavailable or denied.
- Camera unavailable or denied.
- Image unreadable.
- Record unavailable.
- Model timeout or invalid output.
- Callback submission failure.

Do not claim that a fallback is clinically safer merely because
it is deterministic.

Preserve the user's confirmed work across recoverable failures.


## 15. Reviewer scenarios

| ID | Scenario | Expected outcome |
|---|---|---|
| DEMO-01 | Record and label conflict | Reviewed callback; simulated success |
| DEMO-02 | Conflict with submission failure | Summary retained; retry or contact alternative |
| DEMO-03 | Misread label corrected | Updated comparison without restart |
| DEMO-04 | Label matches record | No false conflict |
| DEMO-05 | Record unavailable | Limitation and human-help route |

Reviewer controls must be separated from the patient-facing experience.

Scenario fixtures must remain explicitly fictional.
Their medication content is not presented as clinically validated.


## 16. Evaluation and learning plan

### Current evaluation

- Automated functional checks.
- Designer-led manual scenario testing.
- Cognitive walkthrough of the interaction.

Record expected and actual behaviour separately.

### Questions to evaluate

1. Is the discrepancy understandable?
2. Can the user correct a label reading?
3. Is the companion's limit explicit?
4. Is sharing understandable before approval?
5. Is submission distinguishable from medication resolution?
6. Can the user recover without repeating the conversation?

### Future validation

- Representative older-adult usability sessions.
- Supported-language review.
- Pharmacist review of medication content and handoff information.
- Clinical review before any expanded symptom-routing function.
- Regulatory assessment before real-world deployment.

### Iteration rules

- Record the observed issue and source of evidence.
- Describe the change and why it addresses the issue.
- Retest the affected requirement.
- Run core regression checks.
- Do not automatically change safety rules from conversation logs.

Prototype results do not establish clinical safety or real-world
user comprehension.


## 17. Acceptance criteria

The Assignment 4 prototype is ready for design review when:

- [ ] The main conflict journey is complete.
- [ ] Medicine and label confirmation gates work.
- [ ] Comparison distinguishes conflict, agreement, and insufficient information.
- [ ] Corrections update comparison and callback drafts.
- [ ] No conflicting dose is recommended.
- [ ] Sharing preview matches the simulated payload.
- [ ] Editing invalidates approval.
- [ ] Cancellation submits nothing.
- [ ] Repeated Send does not create duplicate requests.
- [ ] Failed submission preserves the summary.
- [ ] Submitted request and unresolved medication status are distinct.
- [ ] Simulation is visibly communicated.
- [ ] Core flow works without external AI success.
- [ ] Relevant automated and manual checks are recorded.
- [ ] No open critical or high-severity issue remains in the demonstrated path.
- [ ] Accessibility checks and limitations are documented.
- [ ] Evaluation claims accurately describe the work completed.

These are prototype acceptance criteria, not deployment clearance.


## 18. Assignment evidence and AI disclosure

Capture:

- End-to-end flow.
- Medicine and label confirmation.
- Correction.
- Source comparison.
- Sharing review.
- Submitted and failed outcomes.
- Actual test results.
- Before/after changes and reasons.

Generative AI disclosure must describe actual material uses, such as:

- Brainstorming.
- Drafting specifications or copy.
- Code implementation assistance.
- Test scaffolding.

Separate generated assumptions from external evidence and observed results.
State which decisions were reviewed and made by the designer.


## 19. Document ownership

| Document | Responsibility |
|---|---|
| README.md | Setup, reviewer instructions, current capability status |
| prd.md | User problem, scope, outcomes, requirement IDs |
| design-standard.md | Visual and interaction-presentation rules |
| content-model.md | Data schemas, provenance, approved copy |
| site-contract.md | State transitions, APIs, runtime and recovery |
| CLAUDE.md | Agent workflow, invariants, validation instructions |
| docs/decisions.md | Decision history, evidence, trade-offs |

Historical amendments belong in an archive or decision log.
Active documents should describe one current version of the product.

When current documents conflict, report and resolve the conflict
before implementation. Do not silently choose a rule.