# Product Requirements Document — Medication Companion

## 1. Document status

- **Product:** Medication Companion
- **Repository:** `medication-companion-prototype`
- **Deployment:** `medication-companion-demo` on Vercel
- **Version:** 0.2 — assignment prototype MVP
- **Primary platform:** Mobile-first web app, usable on desktop as a phone-shaped demo
- **Audience:** ELVTR AI Product Design Assignment 02 reviewers and moderated prototype-test participants

## 2. Product proposition

Medication Companion helps older adults in Singapore understand a **verified current pharmacy record** in plain language, including Simplified Chinese, through a calm voice-led interaction.

It does **not** diagnose, prescribe, change a dose, decide whether to take a medicine, or infer medication instructions from an uncertain label. It explains record-backed information, asks users to confirm possible label matches, and routes uncertainty to a pharmacist, clinic, trusted helper, or emergency help as appropriate.

### One-sentence promise

> “Call your companion, and it will help you understand the information in your current pharmacy record — or help you reach a person when it is not sure.”

## 3. Problem and opportunity

Older adults may manage prescription medicines at home after appointments or hospital discharge. English-heavy labels, small text, changing regimens, abbreviations, and lack of immediate support can make it difficult to answer: “Is this the right medicine, and how should I take it today?”

The product opportunity is not a generic medical chatbot. It is an AI-supported interpretation layer between a verified medication record and the person who needs to understand it. The person remains in control at every high-stakes step.

The interaction begins with one familiar action—a call—not a menu of clinical categories. The companion listens, asks one focused follow-up where needed, requests camera permission before using the camera, and surfaces human help rather than guessing.

## 4. Target users

### Primary user — Mei Ling

- Older adult in Singapore.
- May prefer Simplified Chinese for understanding medicine information.
- Uses a phone independently but benefits from large text, simple choices, spoken guidance, and reassurance.
- Wants to understand a medicine without waiting for a family member.

### Secondary user — authorised caregiver

- Adult child, trusted helper, or care coordinator.
- Reviews the demo pharmacy record and a limited activity/audit timeline.
- Reviews the single-user demo record in the caregiver view.
- Is not a clinician and cannot change clinical instructions through the app.

## 5. MVP outcome

A reviewer can complete this journey successfully:

1. Enter as Mei Ling from the persona picker.
2. Open the quiet home state and tap the only prominent action: **Call with companion**.
3. Ask: “What is this for? When do I take it?” by typing or voice.
4. The companion identifies that it needs the medicine label and asks: “Would you like to show me the medicine label?”
5. Choose `Show medicine`, then receive a clear camera-permission explanation.
6. Switch the local camera preview to show a medicine label, or use the deterministic demo label / image upload / typed fallback.
7. Receive a **possible match** only.
8. Confirm that the medicine is being held.
9. Receive a record-grounded plain-English explanation with a Chinese language option.
10. Choose an understanding confirmation, repeat, language change, or human-help escalation.
11. Enter the caregiver view and inspect the demo record and activity/audit timeline.

A second journey must demonstrate safe failure:

1. Start the companion call and submit an unreadable label, a non-matching label, or indicate uncertainty.
2. The app refuses to give medication instructions.
3. The app explains the limitation in plain language.
4. The app offers pharmacist, clinic, and trusted-helper escalation actions.

## 6. Scope

### In scope

- Mobile-first responsive application.
- Persona picker: Mei Ling and caregiver.
- Quiet landing state with exactly one prominent entry CTA: `Call with companion`.
- Voice-led companion UI with animated non-human orb.
- Typed interaction fallback.
- Browser speech-to-text and speech synthesis fallback.
- Gemini Live integration architecture for real-time audio only; application remains usable without it.
- Intent-led conversation: companion introduces label and schedule routes only after the call begins.
- Local front/back camera preview and capture flow.
- Camera switch affordance and a picture-in-picture visual treatment.
- Deterministic sample label pathway.
- Image upload and optional capture pathway.
- Claude image interpretation pathway, constrained and validated against local mock record data.
- A required user confirmation before any medicine explanation.
- English and Simplified Chinese content; language selector supports future languages.
- Safe, structured explanation from the verified mock record.
- Safety escalation for unreadable, missing, conflicting, uncertain, adverse-effect, emergency, or out-of-record questions.
- Caregiver demo dashboard for one patient, read-only record/audit review.
- Vercel-ready deployment with secure server-side secrets.

### Explicitly out of scope

- Landing-page shortcuts/cards for `Show medicine` or `My schedule`.
- Real pharmacy, clinic, EHR, insurer, or prescription-system integration.
- Real diagnosis, triage, prescription, treatment recommendation, or dose adjustment.
- Autonomous medication reminders or adherence claims.
- Multiple-patient clinical workflow.
- Real caregiver invitation and production permission system.
- Storage of real health data.
- Full two-way video calling or continuous video streamed to an AI.
- Emergency dispatch or claims that human support is immediately available.

## 7. Primary flow

### Home-to-call rule

The landing page has exactly one prominent primary CTA:

```text
Call with companion
```

The home screen must not show `Show medicine`, `My schedule`, `Repeat`, `Get help`, or `End call` as landing-page navigation. It may show small utilities only: `Help`, `Language`, and `Settings`.

Label and schedule routes are introduced only during an active call, after the companion understands a typed/spoken need or asks a focused clarification question. This avoids forcing the user to categorise a medication question before receiving help.

### Screen and state sequence

1. `01-start-call` — quiet landing state; one primary CTA
2. `02-companion-listening` — voice-led prompt, transcript, and contextual route selection
3. `03-label-camera-permission` — informed permission for camera use
4. `04-label-camera-guidance` — local camera preview, label frame, optional self-view visual
5. `05-confirm-medicine` — possible record match and user confirmation
6. `06-explain-and-confirm` — bilingual, record-grounded explanation
7. `07-safety-escalation` — uncertainty and human-help path
8. `08-caregiver-dashboard` — record provenance and activity review

### Conversation routing

| User need | Companion response | Contextual next action |
|---|---|---|
| “What is this for?” / unknown medicine | “Let’s check this together. Would you like to show me the medicine label?” | `Show medicine` |
| “What do I take now?” / schedule question | If no medicine is already confirmed: “Would you like to show me a medicine label, or ask about your medicine schedule?” | `Show medicine` and `Ask about my schedule` |
| Broad or unclear request | Same clarification question | `Show medicine` and `Ask about my schedule` |
| Request for human help | Explain help options | `Get help` |
| Unsafe or unsupported medical question | Explain safety limit | Safety actions only |

The contextual `Show medicine` and `Ask about my schedule` actions are temporary decision controls inside the call, not permanent app navigation.

### Required decision gates

- User must intentionally start the call before the companion offers label or schedule routing.
- User must intentionally choose `Show medicine` before any camera-consent screen appears.
- User must choose `Yes, switch camera` before camera activation.
- User must confirm `Yes, this is my medicine` before the record explanation appears.
- If user chooses `No`, `I’m not sure`, or label confidence is insufficient, the app enters safety escalation.

## 8. Demo record

All medication data is fictional and clearly labeled as demo data.

- **Patient:** Mei Ling Tan
- **Source:** BrightCare Pharmacy — demo record
- **Medicine:** Metformin 500 mg
- **Purpose:** Helps manage blood sugar
- **Verified instruction:** Take 1 tablet twice daily with meals
- **Chinese explanation:** 用于帮助控制血糖。请按照药房记录：随餐每日服用一片，每日两次。
- **Match fields:** patient name, medicine name, strength, dosage form

The user-facing experience must say `possible match` until confirmed. It must never say that an image is a verified clinical record.

## 9. AI roles

### Gemini Live — conversational layer

Use Gemini Live only for optional real-time voice interaction. It may transcribe user speech and provide a natural spoken companion experience. It is not the medication authority.

If the Live session fails, is unavailable, or permission is denied, the experience falls back to typed input and browser speech synthesis.

### Claude — constrained reasoning and visual interpretation

Claude may receive an image or typed label text and return structured extraction candidates. It may generate an explanation only from server-provided, verified mock-record fields.

Claude must not provide instructions from its general medical knowledge. The server must validate the structured result before displaying medication information.

## 10. Safety requirements

### Non-negotiable rules

1. Never diagnose, prescribe, adjust, stop, start, or substitute a medicine.
2. Never infer dose, timing, purpose, or safety instructions from an unreadable or unmatched label.
3. Never show an explanation before user confirmation of a possible match.
4. Never describe demo data as a live pharmacy record.
5. Never claim to contact a pharmacist, clinic, caregiver, or emergency service unless that action is actually implemented.
6. Always identify the source of displayed medicine information as the current demo pharmacy record.
7. Always offer human help for uncertainty, conflict, symptoms, adverse effects, or urgent situations.
8. Keep language plain, short, respectful, and non-alarming.

### Mandatory escalation triggers

- No readable label information.
- Confidence below the product threshold.
- Extracted details conflict with the demo record.
- More than one possible medicine match.
- User selects `No, try again` or `I’m not sure`.
- User asks for diagnosis, dose changes, missed-dose advice, medication combination advice, symptoms, side effects, pregnancy advice, or emergency advice.
- User uses urgent-risk language such as severe chest pain, trouble breathing, fainting, suicidal intent, severe allergic reaction, overdose, or poisoning.

### Escalation response

The app should state:

> “I’m not sure enough to explain this medicine safely. Please check the label with your pharmacist, clinic, or a trusted helper.”

For urgent-risk language:

> “This may need urgent help. Please contact local emergency services or urgent medical care now. If you can, ask someone near you to help.”

The prototype should display localised placeholder actions, not fake functional emergency calling:

- `Call pharmacy — demo`
- `Contact clinic — demo`
- `Ask trusted helper — demo`

## 11. Functional requirements

### FR-1: Persona entry

- A user can choose Mei Ling or caregiver.
- The active persona is visible in app settings or header context.
- No production authentication is required for the assignment MVP.

### FR-2: Home and conversation

- Mei Ling can start a voice-led session with one landing-page CTA: `Call with companion`.
- The landing page has no shortcut cards for label or schedule tasks.
- The UI shows an animated orb, concise spoken/text transcript, and large action buttons once the call is active.
- Typed fallback remains visible.
- The companion reveals label/schedule choices contextually after user intent or an approved clarification prompt.
- `Repeat`, `Get help`, and `End call` appear only while a call is active.

### FR-3: Camera consent and guidance

- Camera activation requires explicit user consent.
- The UI explains why camera access is requested.
- The user can decline without losing access to typed, schedule, or human-help pathways.
- Local preview supports front/back switching when device/browser permits it.
- Camera guidance never claims recognition before analysis and confirmation.

### FR-4: Label input

- A user can use a seeded deterministic demo label.
- A user can upload a label image.
- A user can type visible label details as fallback.
- Image and text inputs are handled as temporary session data by default.

### FR-5: Possible match and confirmation

- The system returns zero, one, or multiple candidate matches.
- Only one high-confidence candidate can be presented as a `possible match`.
- User confirmation is required before record explanation.
- User denial or uncertainty routes to escalation.

### FR-6: Explanation

- Explanation content is assembled only from fields in the verified mock record.
- English is default.
- Simplified Chinese is accessible through a language control.
- Future language options may be displayed as unavailable or `coming soon`.
- Content is chunked: medicine name, what the record says it is for, how the record says to take it, and a clear `what would you like to do?` prompt.

### FR-7: Human-help state

- The product provides a clear explanation of why it cannot safely proceed.
- It offers non-deceptive demo actions.
- It logs a safety event for caregiver review.

### FR-8: Caregiver dashboard

- Shows Mei Ling’s single mock pharmacy record.
- Shows recent activity events: call started, camera consent, candidate result, confirmation/denial, explanation viewed, help requested.
- Shows an AI/process audit summary: model route, result status, validation decision, and timestamp.
- Uses labels such as `demo record` and `prototype activity`.
- Is read-only for the MVP.

## 12. Non-functional requirements

### Accessibility

- Minimum 16 px body text; 18 px preferred for core medicine content.
- Minimum 44 × 44 px interactive targets.
- Keyboard-accessible on desktop.
- Visible focus styles.
- Semantic headings, buttons, labels, status messages, and live regions.
- Reduced-motion support for the orb and scanning animation.
- Do not rely on colour alone for safety states.

### Reliability

- Every AI-dependent interaction has a deterministic local fallback.
- API errors show plain-language retry or alternate-path actions.
- Camera and microphone permission failures show instructions and a non-device fallback.
- The demo sample route must work without camera, microphone, Claude, Gemini, or Supabase availability.

### Privacy and security

- API keys are server-side only.
- No real medical data is used.
- Uploaded images are not persisted by default.
- Session logs are redacted/minimised.
- Supabase uses least-privilege rules if persistence is enabled.

## 13. Success criteria

### Product test criteria

A participant should be able to:

- Identify `Call with companion` as the single starting action without being coached.
- Understand why the camera is requested after the conversation makes label help relevant.
- Recognise that a possible match needs confirmation.
- Understand the English explanation and locate the language control.
- Identify what happens if the system is not sure.
- State that the app is explaining record-backed information, not giving a medical diagnosis.

### Assignment evidence criteria

The deployed prototype demonstrates:

- A clear AI product proposition.
- Visible input → AI/system processing → output flow.
- A concrete and bounded role for AI.
- Explicit uncertainty handling.
- Human control and safety boundaries.
- A focused, coherent primary flow rather than an unbounded health app.
- Testable design decisions and a credible caregiver/provenance view.

## 14. Acceptance checklist

- [ ] Home screen has exactly one prominent CTA: `Call with companion`.
- [ ] Home screen contains no Show medicine or My schedule card/button.
- [ ] Label and schedule choices appear only after the companion call begins.
- [ ] User can run happy path with seeded demo label without external API success.
- [ ] User sees consent before camera use.
- [ ] App does not show medicine instructions before match confirmation.
- [ ] App explains only the supplied Metformin demo record.
- [ ] User can switch to Simplified Chinese.
- [ ] Unclear/no-match path blocks advice and opens help state.
- [ ] Caregiver view displays record provenance and activity/audit events.
- [ ] Camera/mic/API failures provide usable fallbacks.
- [ ] No secret is exposed to browser bundles or committed to source control.
- [ ] App deploys successfully to Vercel.
