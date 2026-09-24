# Design Standard — Medication Companion

## 1. Design intent

Medication Companion should feel calm, respectful, and comprehensible for an older adult who needs help with one medicine at a time. It is a companion call, not a dense clinical dashboard, generic chatbot, or automated prescriber.

The design must visibly communicate three things:

1. **Trust:** information comes from a labelled demo pharmacy record.
2. **Control:** the person starts a call, gives permission, confirms a match, and can decline or ask for human help.
3. **Caution:** the app does not guess when it is uncertain.

The product begins with one simple familiar action: calling the companion. It does not ask the person to decide whether their need is “label help” or “schedule help” before the conversation begins.

## 2. Experience principles

### One calm entry point

The home state has one prominent CTA: `Call with companion`. Keep the screen deliberately quiet. Label and schedule pathways emerge from the active conversation only after the user explains a need or the companion asks one focused clarification question.

### One task at a time

Ask for one decision per screen. Avoid presenting medication lists, schedules, jargon, and multiple unrelated controls in the primary user flow.

### Spoken first, readable always

Every spoken response has a visible textual equivalent. Every voice action has a touch/typed fallback.

### Permission before sensing

Explain why camera access is requested before activating it. Make `Not now` as easy to tap as the approval path.

### Possible, not certain

Use `possible match`, `please check`, and `I’m not sure enough` when a label is being interpreted. Never overstate confidence.

### Gentle escalation

Safety interruptions should be calm and direct. They should say what is uncertain, what the app will not do, and the next human option.

### Familiar visual metaphors

A camera panel may resemble a simple video-call preview, with the medicine in the main view and an optional small self-view tile. Do not reproduce a dense video-conferencing interface.

## 3. Visual tokens

### Colour

| Token | Value | Use |
|---|---:|---|
| `--bg-canvas` | `#FAF9F6` | Primary warm off-white page background |
| `--surface` | `#FFFFFF` | Elevated cards where needed |
| `--navy-900` | `#17324D` | Primary headings, primary buttons, camera panel |
| `--navy-700` | `#425B70` | Supporting dark text |
| `--teal-600` | `#5B9B98` | Interactive accent, orb, links, status |
| `--teal-100` | `#E7F3F2` | Secondary surfaces and neutral positive cards |
| `--slate-600` | `#667789` | Supporting copy and disclosure |
| `--line` | `#EBEAE4` | Dividers and subtle borders |
| `--danger-700` | `#B75B55` | End-call / urgent safety emphasis only |
| `--danger-100` | `#FBEAE8` | Warning surface |
| `--focus` | `#0D6EFD` | Keyboard focus ring; must remain visible |

Never rely on colour alone. Pair safety colours with plain-language labels and icons.

### Typography

Use `DM Sans` through `next/font/google` where available; use `system-ui, sans-serif` as fallback.

| Style | Size / line height | Weight | Use |
|---|---:|---:|---|
| Display | 30–32 px / 1.18 | 700 | Single central page question |
| H1 | 26–28 px / 1.25 | 700 | Main state heading |
| H2 | 22–24 px / 1.3 | 700 | Section heading / caregiver page |
| Body large | 18 px / 1.5 | 400–500 | Medicine instructions and main guidance |
| Body | 16 px / 1.5 | 400–500 | Supporting information |
| Label | 13–14 px / 1.3 | 700 | Uppercase contextual label |
| Meta | 12–14 px / 1.4 | 500 | Disclosure, record source, timestamps |

Rules:

- Core medication explanation must use **18 px or larger**.
- Do not use long all-caps blocks. Uppercase is limited to short state labels.
- Keep line length near 35–55 characters in the phone shell.
- Simplified Chinese must not be reduced below 16 px for core content.

### Spacing and shape

| Token | Value |
|---|---:|
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

Use generous vertical breathing room. A screen may intentionally have whitespace.

## 4. Layout rules

### Phone shell

- Target canvas: 393 × 852 px.
- Minimum horizontal page padding: 24 px.
- On desktop, centre the app in a max-width phone shell around 430 px.
- Never make the phone shell so narrow that language labels wrap unpredictably.
- Use a sticky/safe footer only when it does not obscure active content.

### Persistent elements

Every primary-user state includes:

1. App name: **Medication Companion**.
2. Trust badge: **Plan checked by BrightCare Pharmacy — demo record** or shortened visual form when space requires.
3. Current interaction state label when appropriate.
4. Footer disclosure: **AI guide · Not a pharmacist or doctor**.

During an active call, show:

- `Repeat`
- `Get help`
- `End call`

On the home state, show small utilities only:

- `Help`
- `Language`
- `Settings`

Do not show `Repeat`, `Get help`, `End call`, `Show medicine`, or `Ask about my schedule` on the home state.

## 5. Components

### CompanionOrb

**Purpose:** show the companion’s non-human presence and current state.

Structure:

- Three layered teal circles.
- Soft low-opacity outer halo.
- Semantic icon in the centre: microphone, camera, check, or help.
- Never use a human face as the AI avatar.

States:

| State | Visual |
|---|---|
| Idle | Slow soft breathing scale, 3.2–4.8 s loop |
| Listening | Gentle expanding outer rings; microphone icon |
| Speaking | Subtle waveform or alternating ring opacity |
| Camera focus | Camera icon; focus ring; no rapid flashing |
| Match found | Check icon; restrained teal glow |
| Safety | Stable orb; no alarm animation; accompanying warning card |

Animation rules:

- Use CSS transform and opacity, never layout-changing animation.
- Respect `prefers-reduced-motion: reduce`; show a static orb in that case.
- Keep transitions between 180–350 ms.
- Do not use endless fast pulsing, flashing, or motion that resembles an alarm.

### TrustBadge

- Light teal pill.
- Include a shield/check icon where useful.
- Short text, 12–14 px.
- Must indicate demo status in details or an accessible label.

### PrimaryButton

- Navy fill, white text, 56 px minimum height.
- Full width inside the phone layout unless part of a deliberate compact choice.
- **Compact variant — 48 px.** Only for the temporary in-call contextual choices
  (`Show medicine` / `Ask about my schedule`), which share the pinned control area with
  the typed fallback; at full size they pushed the conversation itself off screen. Still
  above the 44 px tap-target floor. Never for the landing CTA, and never for a consent or
  confirmation decision — there the full size is the point.
- Rounded pill or 16–28 px rounded rectangle.
- Icon before label when useful.
- Strong visible keyboard focus.
- Disabled state must explain why if the action is blocked.

### SecondaryButton

- Light teal surface; navy/teal text.
- Same minimum 56 px height as primary when it is an alternative decision.
- `Not now` and `No, try again` must not be visually hidden as small text.

### TextAction

- Teal text, optionally underlined.
- Minimum 44 px touch target with adequate padding.
- Use for lower-risk navigation like `Go back` or `I’m not sure.`

### TranscriptCard

- Light teal background, 16 px radius.
- Context label such as `Mei Ling says:` at 13 px.
- User words in 16–18 px readable text.
- Do not make it look like an endless chat log.

### ContextualChoiceGroup

- Appears only after the call begins and the companion needs route clarification.
- May contain one or two full-width large buttons.
- Typical actions: `Show medicine` and `Ask about my schedule`.
- Must appear immediately below the companion’s question that explains the choice.
- Must disappear once a route is selected; never act as permanent navigation.

### RecordCard

- Shows the candidate match only after analysis.
- Label it **Possible match**.
- Show patient name, medicine name, strength, and generic form/icon only.
- Never show an instruction before confirmation.

### CameraPreview

- Dark navy or desaturated dark teal background.
- Camera status and `1 medicine only` badge.
- Generic illustrated bottle/box for demo/design state; no real product branding.
- Muted-teal focus frame around expected label location.
- One slow scan guide line only; it is decorative guidance, not proof of recognition.
- Optional small `You` picture-in-picture tile to communicate a companion call.
- Use a clear control to flip camera when browser capability is available.

### SafetyCard

- Pale warning surface and clear title.
- Start with the limitation: `I’m not sure enough to explain this safely.`
- State what the user can do next.
- Include at least one large help action.
- Do not use red alone or severe language for normal uncertainty.

### LanguageControl

- Visible and easy to find in the explanation state.
- Default `English`; one-tap `中文` option.
- Future languages can appear in a menu marked `Coming soon`; do not imply availability.
- Changing language changes content only; it must not reset confirmation or safety state.

## 6. Screen standards

### 01 — Start call

- One central animated companion orb.
- Welcome heading: `Hello, Mei Ling`.
- Supporting copy: `I can help you understand your medicine information from your pharmacy record.`
- Exactly one full-width primary CTA: `Call with companion`.
- Small reassurance: `You can speak, type, or show a label.`
- Small utility actions only: `Help`, `Language`, `Settings`.
- Do not show `Show medicine`, `My schedule`, `Repeat`, `Get help`, or `End call` on this state.
- Keep the screen quiet, spacious, and free of shortcut cards.

### 02 — Companion listening

- Call controls appear only after the call begins: `Repeat · Get help · End call`.
- Show the listening orb and a visible spoken/typed transcript.
- The companion first interprets the person’s broad need.
- If the person asks to understand an unknown medicine, ask: `Let’s check this together. Would you like to show me the medicine label?` Then reveal one contextual action: `Show medicine`.
- If the person asks what they should take or asks about timing, ask a focused record-confirmation question if a medicine is already confirmed. If not, ask: `Would you like to show me a medicine label, or ask about your medicine schedule?`
- Only at this clarification moment may the UI show temporary large options: `Show medicine` and `Ask about my schedule`.
- Never make label and schedule cards permanent navigation on the landing page.
- If an identified medicine has not been confirmed in the session, do not reveal instructions. Guide the user to confirmation or human help.

### 03 — Label camera permission

- Explain purpose before any device request.
- Approval and refusal must be equally tappable.
- Reassurance: camera is used to help match with the current demo record.

### 04 — Label camera guidance

- Main view is the medicine/back camera.
- Optional small `You` PIP tile conveys continuity of conversation.
- State label: `SHOW ONE MEDICINE`.
- Instruction: `Hold the label inside the box.`
- Do not imply successful reading or matching.

### 05 — Confirm medicine

- State label: `I FOUND A POSSIBLE MATCH`.
- Heading: `Is this the medicine you are holding?`
- Candidate card includes only match identity fields.
- Primary confirmation and equally discoverable `No, try again` option.

### 06 — Explain and confirm

- Use one content chunk at a time.
- Heading example: `Here is what your record says.`
- Clearly label the information source: demo pharmacy record.
- English plus easy Chinese toggle.
- Include `Repeat`, `I understand`, `Get help`.
- Never imply the explanation replaces pharmacist/doctor advice.

### 07 — Safety escalation

- Explain what is uncertain.
- Do not show medication instructions.
- Provide `Try another photo`, `Check with pharmacy`, `Ask a trusted helper`.
- Include urgent-risk wording only when triggered.

### 08 — Caregiver dashboard

- Desktop-friendly but responsive.
- Show only one patient in MVP.
- Use clear status chips: `Confirmed`, `Needs help`, `Pending`.
- Make demo/prototype status persistent.
- Audit entries are factual: what input was received, which route ran, validation outcome, and user decision.

## 7. Accessibility requirements

### Interaction

- Every tap target: at least 44 × 44 px.
- Tabs, menus, toggles, file inputs, camera buttons, and modal controls operate by keyboard.
- Escape closes noncritical modal/sheet UI.
- Restore focus when a modal closes.
- Avoid auto-starting audio; require a user action to start a session.

### Screen-reader semantics

- Use native `<button>`, `<label>`, `<input>`, and headings before adding ARIA.
- Dynamic transcript/safety messages use an appropriate `aria-live` region.
- Camera preview has an accessible text summary.
- Decorative orb and scan line are `aria-hidden`.
- Icons require visible text or accessible labels.

### Motion and sensory safety

- Respect reduced motion.
- No rapid strobing or colour-only status.
- Audio output must have visible caption/transcript and a stop/mute control.

## 8. Content voice

Use:

- `Let’s check this together.`
- `Would you like to show me the medicine label?`
- `Would you like to show me a medicine label, or ask about your medicine schedule?`
- `I found a possible match. Please check the name on the label.`
- `I’m not sure enough to explain this safely.`
- `Here is what your current demo pharmacy record says.`

Avoid:

- `You should…` when the system is not quoting a verified record.
- `This is definitely…`
- `I verified your medicine.`
- `No problem` in response to uncertainty.
- Technical labels such as OCR, confidence score, recognition engine, or model output in the primary user flow.

## 9. Responsive standard

- Primary target: 320–430 px viewport width.
- Maintain readable layout at 320 px without horizontal scrolling.
- Desktop: centre phone experience; caregiver dashboard can use up to 1100 px container.
- Do not bury core controls below a desktop fold; phone scroll is acceptable when progress is clear.

## 10. Quality checklist

- [ ] Landing screen has exactly one prominent primary action.
- [ ] Landing screen contains no label or schedule shortcut card.
- [ ] Contextual choices appear only after an active-call companion prompt.
- [ ] One clear primary action per subsequent state.
- [ ] Medication content is large enough to read.
- [ ] Permission language appears before camera/microphone activation.
- [ ] Uncertainty state differs by words, icon, and surface treatment.
- [ ] Confirmation is required before explanation.
- [ ] UI remains usable with motion disabled.
- [ ] Typed and touch alternatives exist for voice/device actions.
- [ ] Every screen identifies the prototype/demo record context appropriately.
