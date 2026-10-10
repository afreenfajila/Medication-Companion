# Design Standard — Medication Companion

## 1. Document status

| Field | Value |
|---|---|
| Version | 0.4 — proposed Assignment 4 design standard |
| Last updated | 10 October 2026 |
| Primary journey | Dose-change discrepancy → reviewed pharmacist callback |
| Platform | Mobile-first web prototype |
| Data | Fictional only |
| External actions | Simulated only |
| Implementation verification | Pending UI review and testing |

This document defines intended presentation and interaction rules.
It does not establish implementation completeness or accessibility compliance.

Use:
- prd.md for scope and outcomes.
- content-model.md for facts, provenance, and approved copy.
- site-contract.md for transitions and runtime behaviour.

Do not change medication logic to satisfy a visual design preference.


## 2. Design intent

Medication Companion should feel calm, respectful, and understandable
for an older adult checking one medicine at a time.

It is a companion call, not:
- A clinical dashboard.
- An endless chatbot transcript.
- A form wizard.
- An automated prescriber.

The design must communicate:

1. Provenance:
   Where the information came from.

2. Control:
   What the user can confirm, correct, decline, or share.

3. Uncertainty:
   What the companion cannot establish.

4. Continuity:
   Corrections and recoverable failures do not restart the call.

5. Handoff:
   A support request carries the unresolved question forward.

The product must not visually imply that:
- A medicine match is clinical verification.
- A newer record is necessarily the instruction to follow.
- A submitted request resolves the medication conflict.


## 3. Experience principles

### One calm entry point

The primary home state has one prominent action:

“Call with companion”

Do not ask the user to choose a clinical category before speaking.

Small utilities may include:
- Help.
- Language.
- Settings.

### One conversational decision at a time

Use one continuous call with changing contextual panels.

Do not create separate pages or mandatory Next buttons for
routine conversational turns.

Explicit confirmation remains necessary for:
- Medicine identity.
- Label wording.
- Device permission.
- Sharing approval.

### Spoken guidance, readable always

Every spoken response has a visible textual equivalent.

Text need not wait for speech to finish.
Keep both aligned to the same turn.

Every voice-dependent action has an appropriate touch or typed alternative.

### Permission before sensing

Explain camera or microphone use before requesting access.

Declining permission must not end the task.

### Possible, not certain

Before confirmation:
- Say “Possible match.”
- Ask the user to check.
- Use neutral visual treatment.

Confirmation means a user decision, not clinical verification.

### Clear uncertainty without blame

State:
- What is known.
- What is missing or inconsistent.
- What the companion cannot decide.
- What the user can do next.

Avoid speculation about why a doctor, pharmacy, record, or label differs.

### Recovery preserves work

Corrections, retries, language changes, and support requests
preserve relevant confirmed context.

Do not make the user repeat the story unnecessarily.

### Honest outcomes

Request status and medication status are separate.

A success treatment may indicate simulated submission,
but never endorse a conflicting dose.


## 4. Visual identity

Retain:
- Warm off-white canvas.
- Navy text and primary actions.
- Restrained teal companion identity.
- Simple rounded surfaces.
- Generous spacing.
- Non-human companion presence.

Avoid:
- Glassmorphism.
- Decorative gradients.
- Heavy shadows.
- Excessive badges.
- Tiny metadata.
- Alarm-like animation.
- Large decorative illustrations that displace important content.
- Dashboard styling in the primary call.


## 5. Colour tokens

### Base palette

| Token | Value | Intended use |
|---|---|---|
| `--bg-canvas` | `#FAF9F6` | Page background |
| `--surface` | `#FFFFFF` | Cards and panels |
| `--navy-900` | `#17324D` | Primary text and primary buttons |
| `--navy-700` | `#425B70` | Supporting dark text |
| `--teal-decorative` | `#5B9B98` | Orb and nonessential decoration |
| `--teal-100` | `#E7F3F2` | Secondary surfaces |
| `--slate-600` | `#667789` | Supporting text, subject to contrast checks |
| `--line` | `#EBEAE4` | Nonessential dividers |
| `--danger-700` | `#B75B55` | Candidate danger token; verify actual use |
| `--danger-100` | `#FBEAE8` | Warning surface |
| `--focus` | `#0D6EFD` | Candidate focus ring; verify on adjacent surfaces |

These values are inherited design candidates.
Do not assume every pairing passes contrast requirements.

### Semantic tokens

Define central semantic mappings:

```css
--text-primary
--text-secondary
--text-action
--action-primary-bg
--action-primary-text
--action-secondary-bg
--action-secondary-text
--border-control
--surface-information
--surface-uncertainty
--surface-error
--surface-submission
--focus-ring
```

Use navy for action text until an alternative text colour is verified.

Decorative teal must not automatically become:
- Small link text.
- White-text button background.
- Required control outline.

### Contrast checks

Verify actual rendered foreground/background pairs:

- Ordinary text: at least 4.5:1.
- Qualifying large text: at least 3:1.
- Required non-text controls and status graphics: at least 3:1
  against relevant adjacent colours.

Do not rely on colour alone.

A subtle decorative divider need not serve as the only boundary
of an interactive control.

Record checked combinations and unresolved exceptions.


## 6. Typography

Use DM Sans through the existing font setup where available.
Use a suitable system fallback and verify Chinese rendering.

| Style | Proposed size / line height | Use |
|---|---|---|
| Display | 30–32 px / 1.2 | Short home question |
| H1 | 26–28 px / 1.25 | Current state heading |
| H2 | 22–24 px / 1.3 | Panel heading |
| Conversation | 20–22 px / 1.5 | Current main spoken message |
| Medication | At least 18 px / 1.5 | Instruction comparison |
| Body | 18 px / 1.5 where practical | Supporting guidance |
| Important label/meta | At least 16 px / 1.4 | Sources, sharing, status |
| Noncritical metadata | 14–16 px / 1.4 | Secondary technical/demo detail |

Rules:
- Apply the same core-content minimum to English and Chinese.
- Use scalable units in implementation.
- Do not shrink critical content to fit a fixed screen height.
- Allow natural wrapping.
- Use short sentence-case headings.
- Avoid long uppercase blocks.
- Keep source labels readable, not pale or tiny.
- Test text expansion and zoom.

Font size alone does not establish accessibility.


## 7. Spacing and shape

| Token | Value |
|---|---|
| `--space-1` | 4 px |
| `--space-2` | 8 px |
| `--space-3` | 12 px |
| `--space-4` | 16 px |
| `--space-5` | 20 px |
| `--space-6` | 24 px |
| `--space-8` | 32 px |
| `--space-10` | 40 px |
| `--radius-sm` | 12 px |
| `--radius-md` | 16 px |
| `--radius-lg` | 24 px |
| `--radius-pill` | 999 px |

Use:
- 16–24 px between meaningful content groups.
- Consistent internal card padding.
- Minimal shadow.
- Clear separation through headings, spacing, and borders.

Do not surround every sentence with its own card.


## 8. Responsive call layout

### Reference dimensions

393 × 852 px is a design reference, not a fixed clipping box.

Support:
- 320 px.
- 360 px.
- 393 px.
- 430 px.
- Desktop.
- 200% zoom.
- Mobile keyboard open.

### Phone shell

- Centre the call on desktop at approximately 430 px maximum width.
- Use flexible height.
- Allow content scrolling.
- Use approximately 24 px horizontal padding at typical widths.
- Reduce outer padding when necessary at 320 px rather than
  shrinking important text.
- Respect device safe areas.

### Persistent controls

Sticky controls must not obscure:
- Content.
- Focused elements.
- Form fields.
- Recovery actions.

When the mobile keyboard opens:
- Keep the active field and relevant action reachable.
- Allow the layout to scroll.
- Do not pin a large decorative orb above the keyboard.

### Content density

Show one contextual panel at a time.

Reduce or collapse decoration before:
- Reducing critical text.
- Hiding uncertainty.
- Hiding recovery.
- Removing user control.


## 9. Persistent framing

Every primary-user state must visibly communicate:
- Product identity.
- Prototype status.
- Relevant current interaction status.

Recommended compact disclosure:

“Prototype · Fictional data”

Show AI identity:
- At call start.
- In a compact persistent label or accessible header context.

Approved identity statement:

“AI guide · Not a pharmacist or doctor”

Near record content:
- Show source.
- Show record date when relevant.

Near sharing and outcomes:

“Demo only — no real callback request is sent.”

Do not depend only on an accessible label or About page
to disclose simulation.


## 10. Continuous call structure

An active call contains:

1. Compact identity and status.
2. Current companion message.
3. Latest user response with correction.
4. One contextual panel.
5. Voice/text input.
6. Repeat, help, and end controls.

The full transcript may be available as optional history,
but must not dominate the primary experience.

Reviewer scenario controls belong outside this structure.


## 11. CompanionOrb

### Purpose

Show the companion's non-human presence and current interaction state.

Use:
- Layered teal circles.
- Restrained halo.
- Companion logo.
- Semantic state icons where useful.

Do not use a human face as the AI avatar.

### States

| State | Treatment |
|---|---|
| Idle | Subtle breathing motion or static logo |
| Listening | Gentle rings and microphone icon |
| Speaking | Restrained waveform/ring change |
| Checking | Neutral checking icon with visible status text |
| Possible match | Neutral medicine/search icon |
| Identity confirmed | Check icon with explicit confirmed label |
| Uncertainty | Stable orb; explanatory panel |
| Submission | Stable or restrained progress treatment |

A checkmark must not imply clinical correctness.

### Size

- Larger on the quiet home screen.
- Smaller during comparison, sharing, and recovery.
- Never displace essential information.

### Motion

- Transform and opacity only.
- No layout-changing animation.
- No fast pulsing or flashing.
- Respect reduced motion.
- Use approximately 180–350 ms transitions.
- Decorative motion is hidden from assistive technology.


## 12. Button standards

### PrimaryButton

- Navy background with verified contrasting text.
- At least 56 px high for major decisions.
- Full width where appropriate.
- Clear visible label.
- Consistent rounded shape.
- Visible keyboard focus.

### SecondaryButton

- Same comfortable target size for alternative decisions.
- Distinct visual emphasis without hiding refusal.
- “Not now,” “No, try again,” and “Don’t send” remain easy to find.

### CompactButton

- Product minimum touch target: 44 × 44 CSS px.
- Only for temporary low-density contextual controls.
- Do not use compact controls to squeeze consent or medicine
  confirmation into crowded layouts.

### TextAction

- At least 44 × 44 CSS px effective target.
- Adequate separation.
- Clear text and verified contrast.
- Underline links when needed to distinguish them.

“I’m not sure” is a meaningful safety choice, not an obscure footer link.

### Disabled actions

- Explain why a required action is unavailable.
- Do not disable the only route without an alternative.
- Submission disables repeated Send, not the entire call.

The 44 px rule is this product's design standard,
not a statement that it is the universal WCAG AA minimum.


## 13. Medicine confirmation panel

Heading:

“Is this the medicine you mean?”

Show:
- Possible-match label.
- Medicine name.
- Strength.
- Form when useful.
- Fictional record provenance.

Actions:
- Yes, this is the medicine.
- No, try again.
- I’m not sure.

Do not show instructions before identity confirmation.

Do not:
- Say “Medicine verified.”
- Use a clinical approval seal.
- Treat a checkmark as proof of patient ownership or clinical validity.


## 14. Label-confirmation panel

Heading:

“Please check what I read”

Show:
- Actual extracted or entered instruction wording.
- Whether it came from a photo, typed input, or fixture.
- A correction route.

Actions:
- Yes, that is what the label says.
- Change the wording.
- I can’t confirm it.

After an edit:
- Show the revised wording.
- Require confirmation of the new revision.
- Preserve medicine identity and call context.

Do not establish the conflict before this confirmation.


## 15. DoseChangeComparison

### Purpose

Make a confirmed discrepancy inspectable without recommending a dose.

### Layout

Stack on mobile:

```text
These instructions differ

Current record · [date]
[Recorded instruction]
Source: [fictional pharmacy]

Label you confirmed
[Confirmed label wording]

I can show the difference, but I cannot confirm
which instruction you should follow.

[ Ask for a pharmacist callback ]

Correct label wording · Hear again
```

### Rules

- Use explicit source labels.
- Keep the two sources visually comparable.
- Do not give the newer record stronger approval styling.
- Do not label either source “correct.”
- Do not use arrows suggesting a recommended switch.
- Do not rely on colour to identify changed fields.
- Use text emphasis only for actual differing fields.
- Do not hide important qualifiers or timing details.

Optional previous-record detail:
- Place behind a labelled disclosure.
- Do not add a third competing instruction by default.

### Incomplete comparison

Show:
- What is missing.
- What cannot be established.
- How to correct it or request help.

Missing data must not look like successful agreement.


## 16. CallbackReview

### Purpose

Allow the user to inspect the recipient and exact sharing content.

Heading:

“Check before sharing”

### Order

1. Recipient.
2. Reason for the request.
3. Medicine.
4. Current record instruction, source, and date.
5. Confirmed label instruction.
6. Callback contact.
7. Sharing boundary.
8. Send, edit, and cancel.
9. Simulation notice.

### Actions

Primary:
“Send callback request”

Alternatives:
- Change something.
- Don’t send.
- Read this to me.

### Contact detail

- Mask by default.
- Provide a labelled reveal/edit mechanism.
- Let the user inspect the full fictional value.
- Do not send a value that cannot be reviewed.

### Sharing boundary

Only display this claim if the payload follows it:

“Only the details shown here are included.
Your label photo and full conversation are not included.”

### Editing

- Keep corrections conversational where possible.
- Do not expose an unnecessarily long form.
- Do not allow editing of record facts.
- Update the preview after changes.
- Require fresh approval.
- If the discrepancy disappears, explain the changed comparison.

Do not add a redundant second confirmation modal.


## 17. CallbackOutcome

### Submitted

Heading:

“Demo: callback request submitted”

Separate statuses:

```text
Request
Submitted — simulated

Medication instruction
Unresolved
```

Supporting copy:

“The difference in your medication instructions still needs checking.”

Actions:
- Review request.
- Return to call.
- End call.

A success checkmark may label submission only.
Do not put it beside the medication dose.

Do not promise callback timing or pharmacist acknowledgement.

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

### Unknown outcome

Heading:

“Submission could not be confirmed”

Do not claim definite success or non-delivery.
Offer the retry/recovery behaviour defined in site-contract.md.

### Cancelled

“Nothing was shared.”

Preserve the comparison and return path.

Important outcomes remain visible.
Do not rely on transient toasts.


## 18. Uncertainty and safety presentation

Use distinct treatment for:
- Routine uncertainty.
- Recoverable service failure.
- Existing urgent guidance.

### Routine uncertainty

- Neutral or restrained warning surface.
- State the limitation.
- Offer correction or human help.
- Avoid alarm imagery.

### Conflict

Source instructions may be displayed for comparison after
identity confirmation.

No actionable dose recommendation appears.

### Urgent guidance

- Clear, direct wording.
- No decorative delay.
- Preserve existing approved safety information.
- Do not invent new clinical rules during visual implementation.

“Gentle” must not mean vague or difficult to act on.


## 19. Input, interruption, and recovery

### Voice/text

- Typing remains reachable.
- Correcting a transcript does not restart the call.
- Uncertain speech is not automatically confirmed.
- Listening/speaking/checking are distinct visible states.

### Repeat

- Repeats the current approved content.
- Does not advance the journey.
- Can be interrupted.

### Language change

- Preserves confirmation, comparison, and unresolved status.
- Does not imply support for unavailable languages.
- Handles text expansion.

### End call

- Clearly labelled.
- Stops recognition/playback.
- Does not claim to cancel already-submitted service work.
- Does not silently resolve the medication conflict.

### Recovery

Always explain:
1. What happened.
2. What remains preserved.
3. What the user can do next.


## 20. Camera and photo presentation

- Explain purpose before camera activation.
- Offer refusal and fallback.
- Use a simple label frame.
- Show only necessary controls.
- Prefer medicine view over self-view.
- Optional self-view must not add unnecessary permission complexity.
- Do not imply successful reading through a scan animation.
- Capture requires explicit action.

Photo upload:
- Explain processing accurately.
- Do not claim provider-side deletion unless verified.
- Show a clear unreadable/unsupported-file recovery.


## 21. Accessibility behaviour

### Semantic structure

- Use native headings, buttons, labels, and inputs.
- Use ARIA only where necessary.
- Icons have visible labels or accessible names.
- Decorative visuals are aria-hidden.

### Keyboard and focus

- All controls operate by keyboard.
- Focus remains visible.
- Modal/sheet focus behaviour follows the component pattern.
- Escape closes noncritical overlays where appropriate.
- Restore focus after dismissal.
- Do not move focus on every transcript update.

### Dynamic announcements

- Use concise status announcements.
- Avoid reading the entire conversation repeatedly.
- Do not create competing assertive live regions.
- Coordinate announcements with speech output.
- Keep errors attached to the relevant control.

### Zoom and reflow

- No horizontal scrolling for the main call at 320 px.
- Check 200% zoom.
- Essential information and controls remain reachable.
- Do not use fixed heights that clip translated text.

### Motion and audio

- Reduced-motion support.
- No flashing.
- Visible speech text.
- Stop/mute control.
- User action starts the audio session.


## 22. Caregiver demo view

Preserve the existing read-only view where compatible.

- Clearly fictional.
- One patient only.
- No instruction editing.
- No production authorisation claim.
- Audit events describe actual prototype events.
- Request submission is not clinical resolution.
- Avoid ambiguous chips such as “Confirmed” without an object.

Prefer:
- Medicine identity confirmed.
- Callback request submitted — simulated.
- Medication question unresolved.

Do not expand this into a clinical administration dashboard.


## 23. Content voice

Use:
- “Let’s check the difference.”
- “Please check what I read.”
- “Thank you. I’ve corrected the label wording.”
- “These instructions differ.”
- “I cannot resolve this difference.”
- “No one has been notified.”

Avoid:
- “This is definitely your medicine.”
- “I verified the medicine.”
- “The new dose is correct.”
- “Everything is sorted.”
- “Your pharmacist will call soon.”
- Speculation about why the record differs.
- Technical scoring or model language in the main call.

Do not prohibit clear operational wording simply because it
describes failure.

Do not force every response to end with a question.


## 24. Design validation

Check these states:

- Home.
- Listening.
- Medicine confirmation.
- Label confirmation.
- Label correction.
- Conflict comparison.
- Incomplete comparison.
- Sharing review.
- Submitting.
- Submitted.
- Failed.
- Unknown outcome.
- Cancelled.

At:
- 320, 360, 393, and 430 px.
- Desktop.
- 200% zoom.
- Mobile keyboard open.
- Keyboard-only navigation.
- Reduced motion.
- Supported languages.

Record actual checks and unresolved issues.
Do not claim accessibility compliance from component choice alone.


## 25. Quality checklist

- [ ] Home has one prominent call action.
- [ ] No permanent clinical route cards.
- [ ] One contextual panel at a time.
- [ ] Core medication text is readable in both languages.
- [ ] Important sources and statuses are not tiny.
- [ ] Possible match is not visually presented as verified.
- [ ] Medicine and label confirmation are separate.
- [ ] Comparison shows provenance.
- [ ] Neither conflicting dose is endorsed.
- [ ] Sharing recipient and payload are inspectable.
- [ ] Correction and cancellation are easy to find.
- [ ] Submitted request is distinct from unresolved medication status.
- [ ] Failed and unknown outcomes use accurate wording.
- [ ] Recovery preserves work.
- [ ] Sticky controls do not obscure content.
- [ ] Contrast pairs have been checked.
- [ ] Keyboard focus and operation have been checked.
- [ ] Reduced motion and audio controls work.
- [ ] Simulation is visibly disclosed.
- [ ] Screens match the documented build.