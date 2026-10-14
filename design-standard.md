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

Use one continuous call. Each step is a message in that conversation
(amended 13 October 2026): the label check, the comparison, the callback
summary and its outcome are companion messages with short headings and
dividers, not panels, sheets or pop-ups. Getting a person (the safety
pathway) is a message too, ending with a question that names only the
options that exist here (another photo, a pharmacist, family), answered
in words. Showing the medicine is one consent question in the
conversation (camera or a photo; “I’ll only look at the medicine name,
and the photo won’t be kept”; “Is that okay with you?”), answered in
words — “okay”, “sure”, “no problem” are a yes here (amended 14 October 2026). Only after a clear yes do two small
buttons appear inside that companion message: “Take photo” (opens the
in-app camera) and “Upload” (the phone's picker, which can't open from
speech). With the camera off or missing, “Upload” alone. They go once a
photo is sent or the conversation moves on; “show the label” brings them
back. The open camera has its own capture, flip and close. The name and
strength can always be said or typed instead.

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

An active call contains (amended 12 October 2026 at the owner's direction,
docs/decisions.md "Active-call controls"):

1. Compact header: identity and the demo-record label
   (“ⓘ BrightCare Pharmacy record · fictional”, one line of plain muted text, amended 14 October 2026). The record's full
   source and date sit in the record's own messages, so the header
   never reads as a pharmacist having checked what is being said
   (amended 13 October 2026).
2. The companion orb (compact) and one short, accurate status line
   (“Listening…”, “Speaking…”). Interruption is advertised only
   while the mic really is open during playback.
   Under it, the safety progress (amended 14 October 2026, deck slide
   8): “Ask · Show · Check · Confirm · Explain”, the current step
   filled navy, “Explain” with a lock (and italic, not faded) until
   she confirms the medicine. Blocked or a pharmacist request under
   review shows that chip instead. Status chips (small, uppercase,
   text plus colour) sit under the message where a gate moved:
   label photo taken / checking (grey), possible match · not
   verified (coral), confirmed by you · unlocked and from your
   verified plan (teal), blocked · no instructions (coral),
   pharmacist request · review before sending (blue). The stage is
   derived from the reducer (`call-stage.ts`), never from a model.
   Messages fade up 12px over 400ms (none with reduced motion).
3. The conversation transcript, in order, every turn readable. A new
   message is always brought into view (there is no “Latest message”
   control); live words and status follow only while the person is at
   the bottom. Consecutive messages from one speaker share a label.
4. One panel, only while the in-app camera is open (capture, flip,
   close). Everything else, including showing the medicine, the dose
   check, the callback review, the outcome and getting a person, is a
   message in the transcript (amended 13–14 October 2026). The only
   buttons inside a message are “Take photo” / “Upload”, after consent.
5. One control row (amended 14 October 2026, owner brief “voice/text
   only”): the message pill (56px, fully rounded; “Type a message…”;
   a 48px send arrow inside, disabled until text; Enter sends), the mic
   (56px round, light fill; muted = slashed mic on a light teal tint,
   never solid navy; `aria-pressed`), and End call (56px round, solid
   red, hang-up icon) — 12px apart, one row at every width, no
   dividers. End call is the row's only solid control.
6. Help in the header, top right: an outline pill (“?” + “Help”, 40px
   tall in a 48px target), the same as saying “help”.

Every other action is said or typed, the same words either way:
“repeat”, “stop interrupting me” / “let me interrupt”, “listen again”
(a paused or muted mic, also the mic button), “show pharmacy contact”,
“try again”, “send the request”. The disclosure stays in small muted
text under the control row. About is on the start screen. The
transcript is not collapsed behind an "Earlier in this call" control.

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


## 13. Medicine confirmation (conversational)

Amended 12 October 2026 at the owner's direction: there is no
confirmation panel. The companion says, and the transcript shows,
one line (`confirmSpoken`) that carries:
- "A possible match" (never certain).
- Medicine name.
- Strength.
- Form.
- Fictional record provenance.
- The question, and that "not sure" is an answer.

Answers are said or typed: a clear yes confirms; no denies;
"not sure", a hedged yes or a question never confirm. The AI
meaning-match is never offered "yes".

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

Amended 13 October 2026: the review is one companion message in the
conversation, under the line “I’ve prepared a short summary. Please
check it, then say or type “send” if it’s right.” Its rows are short
headings separated by subtle dividers. It has no buttons and no
heading of its own; the message stays in the transcript afterwards,
above the outcome.

### Order

Row labels (amended 13 October 2026, shown in small uppercase):

1. TO — the fictional recipient.
2. REASON FOR CALLBACK — her own words or the default concern.
3. MEDICINE — name and strength.
4. PHARMACY RECORD — the record's exact instruction, quoted, with
   “BrightCare Pharmacy (fictional) · date” beside it.
5. LABEL WORDING YOU CONFIRMED — quoted, only when it was confirmed.
   Otherwise the row reads LABEL WORDING: “Not confirmed — not
   included in the request”.
6. CALLBACK NUMBER — masked.
7. Sharing boundary.
8. “Please check these details. You can tell me what to change, say
   “send the request,” or say “cancel.””
9. “Demo only — no real pharmacy is contacted.”

### Position

A new summary (and each updated version) is brought into view at its
first line, not its last. Live words, status changes and playback do
not move the view while it is being read. Her own scrolling always
wins; her next turn brings the conversation on.

### Actions (amended 13 October 2026)

None on screen. Everything is said or typed:
- “send the request” sends exactly the reviewed revision. A plain
  “yes”, or “send” inside a hedge or a condition (“if it’s right, send
  it”, “I would send it”), is told how to send. A question (“what
  happens if I say send?”) gets a fixed explanation. Quoted, negated,
  later, or to-someone-else uses never send. Interim words are never
  interpreted. A repeated approval sends nothing more.
- “cancel” or “don’t send” cancels with nothing sent.
- Corrections, checked before any “send” in the same sentence:
  “change the number to …” (or the number alone), “change the reason
  to …”, “the label says …”. Each makes a new version with approval
  cleared, shown again as “I’ve updated the summary. Nothing has been
  sent.” New label wording is first shown back to confirm, then
  compared again. “Change …” with nothing usable asks what to change.
  “Change the number, then send” changes nothing and sends nothing
  until the number is given; then a fresh “send the request” is needed.
- “What’s the number?” says the full callback number.
- “repeat” reads the summary again without advancing anything.

### Contact detail

- Masked (“•••• 0188”) in the written summary; its last four digits
  are spoken. The full number is said when she asks for it.
- Changed in words; the new number makes a new version to check.

### Sharing boundary

Only display this claim if the payload follows it. The payload also
carries the patient ID and reference numbers (record version, label
revision, request ID), which are not rows, so the claim names them
(amended 13 October 2026):

“Only the details shown here are included, with your patient ID and
reference numbers for the record and this request. Your label photo
and full conversation are not included.”

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

Ways on, in words (amended 13 October 2026): “back to the call” /
“carry on” returns to the conversation and says what is still open;
“that's all” / “nothing else” ends the call. The sent summary and the
outcome stay readable in the transcript.

A success checkmark may label submission only.
Do not put it beside the medication dose.

Do not promise callback timing or pharmacist acknowledgement.

### Failed

Heading:

“Demo: request not submitted”

Body:

“The request could not be delivered. No one has been notified.
Your summary is still available.”

In words (amended 13 October 2026): “try again” / “send again” sends
the same request once more; the fictional pharmacy contact is shown in
the outcome message; the summary stays above it; “end the call” ends.

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
- In the call (amended 13 October 2026): a companion message with the
  danger treatment (red border and tint, the only red in the call),
  announced at once (role="alert"), kept in the history. Crisis
  numbers stay as text. A plain yes or no does not move past it.

### Getting a person (amended 13 October 2026)

One companion message, as short paragraphs: what happened, that no
instructions will be shown until it is sure, and a question naming only
the real options (“Would you like to try another photo, have a pharmacist
call you, or let your family know? Or we can just carry on talking.”).
“Yes” or “not sure” is asked which, gently; “no thanks” carries on;
“a pharmacist”, “tell my son” start that request, which still asks and
is reviewed before anything is sent. Asking for a person is met as a
request (“Of course — let’s get you some help.”), not as “not sure
enough”.

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