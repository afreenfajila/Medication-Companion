# Content Model — Medication Companion

## 1. Purpose

This document defines the fictional demo data, content objects, AI input/output schemas, language structure, safety copy, and audit events used by Medication Companion.

The model exists to keep product content **traceable to a verified mock record**. It prevents the UI or LLM from inventing medication instructions.

## 2. Demo-data policy

All records in the prototype are fictional.

Every experience that shows medical information must expose one of these labels:

- `BrightCare Pharmacy — demo record`
- `Prototype information — not connected to a real pharmacy`
- `AI guide · Not a pharmacist or doctor`

Do not add realistic personal identifiers, medical record numbers, addresses, prescription numbers, or real clinician names.

## 3. Core entities

```ts
type LanguageCode = "en" | "zh-Hans" | "ms" | "ta";

type Persona = "mei-ling" | "caregiver";

type MatchStatus = "possible" | "confirmed" | "denied" | "unsure" | "no-match" | "ambiguous" | "unreadable";

type SafetyReason =
  | "unreadable-label"
  | "record-mismatch"
  | "multiple-candidates"
  | "user-unsure"
  | "unsupported-medical-question"
  | "adverse-effect-question"
  | "urgent-risk"
  | "service-failure";
```

## 4. Patient model

```ts
type Patient = {
  id: "patient_mei_ling_tan";
  displayName: "Mei Ling Tan";
  preferredLanguage: "zh-Hans";
  supportedLanguages: LanguageCode[];
  recordSourceId: "source_brightcare_demo";
  demoNotice: true;
};
```

## 5. Record source model

```ts
type RecordSource = {
  id: "source_brightcare_demo";
  name: "BrightCare Pharmacy";
  displayLabel: "BrightCare Pharmacy — demo record";
  recordStatus: "current-demo";
  verifiedAt: "2026-09-21T00:00:00.000Z";
  disclaimer: "Prototype information — not connected to a real pharmacy.";
};
```

## 6. Medication record model

```ts
type MedicationRecord = {
  id: "med_metformin_500_demo";
  patientId: "patient_mei_ling_tan";
  sourceId: "source_brightcare_demo";
  status: "current";
  identity: {
    genericName: "Metformin";
    displayName: "Metformin 500 mg";
    strength: "500 mg";
    dosageForm: "tablet";
    labelAliases: ["METFORMIN", "METFORMIN HCL", "METFORMIN 500MG"];
  };
  verifiedInstruction: {
    frequency: "twice daily";
    timing: "with meals";
    doseText: "Take 1 tablet";
    canonicalText: "Take 1 tablet twice daily with meals";
  };
  explanation: LocalizedMedicationExplanation;
  matching: {
    requiredFields: ["medicineName", "strength"];
    optionalFields: ["patientName", "dosageForm"];
    minimumDeterministicScore: 0.8;
  };
  safety: {
    noDoseChanges: true;
    noMissedDoseAdvice: true;
    humanHelpForSymptoms: true;
  };
};
```

## 7. Localised explanation model

```ts
type LocalizedText = Partial<Record<LanguageCode, string>>;

type LocalizedMedicationExplanation = {
  title: LocalizedText;
  purpose: LocalizedText;
  instructionIntro: LocalizedText;
  instruction: LocalizedText;
  sourceLine: LocalizedText;
  caution: LocalizedText;
  confirmationPrompt: LocalizedText;
};
```

Seed data:

```ts
const metforminExplanation: LocalizedMedicationExplanation = {
  title: {
    en: "Here is what your record says.",
    "zh-Hans": "这是您的药房记录所显示的信息。"
  },
  purpose: {
    en: "Metformin helps manage blood sugar.",
    "zh-Hans": "二甲双胍用于帮助控制血糖。"
  },
  instructionIntro: {
    en: "Your current demo pharmacy record says:",
    "zh-Hans": "您目前的药房示范记录显示："
  },
  instruction: {
    en: "Take 1 tablet twice daily with meals.",
    "zh-Hans": "随餐每日服用一片，每日两次。"
  },
  sourceLine: {
    en: "Source: BrightCare Pharmacy — demo record.",
    "zh-Hans": "来源：BrightCare Pharmacy — 示范记录。"
  },
  caution: {
    en: "I can explain this record, but I cannot change your medicine instructions.",
    "zh-Hans": "我可以解释这份记录，但不能更改您的用药指示。"
  },
  confirmationPrompt: {
    en: "Would you like me to repeat that or help you contact a pharmacist?",
    "zh-Hans": "您想让我重复一次，还是协助您联系药剂师？"
  }
};
```

## 8. Label input model

### Input modes

```ts
type LabelInput =
  | {
      mode: "demo";
      demoAssetId: "sample_metformin_label";
    }
  | {
      mode: "image";
      fileName: string;
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      byteSize: number;
      imageBase64?: string; // transient server processing only
    }
  | {
      mode: "typed";
      patientName?: string;
      medicineName?: string;
      strength?: string;
      dosageForm?: string;
    };
```

### Client-side constraints

- Image accepts JPEG, PNG, or WebP only.
- Maximum file size: 5 MB.
- Clear user explanation before upload: “Your image is used only for this demo session and is not saved by default.”
- Typed input is always available as fallback.

## 9. Claude extraction contract

Claude is used only for an extraction candidate and must return validated JSON. It does not decide whether to show a medication explanation.

```ts
type ClaudeLabelExtraction = {
  status: "readable" | "unreadable" | "ambiguous";
  extracted: {
    patientName: string | null;
    medicineName: string | null;
    strength: string | null;
    dosageForm: string | null;
  };
  imageQuality: "good" | "limited" | "poor";
  ambiguityReason: string | null;
  notesForUser: string;
};
```

### Required Claude system instruction

```text
You are a constrained label-text extraction component inside a prototype.

Return only JSON matching the supplied schema. Extract only visible label identity fields: patient name, medicine name, strength, and dosage form. Do not infer missing words. Do not provide medicine instructions, diagnosis, dosing changes, missed-dose guidance, side-effect advice, or medical recommendations. If text is not clearly visible, return status "unreadable". If more than one interpretation is plausible, return status "ambiguous". Do not claim a match to a pharmacy record.
```

### Image route prompts

The server may add:

```text
This is fictional prototype data. The final application will validate any extracted fields against a local demo record. Do not create facts that are not visible in the image.
```

## 10. Deterministic match model

The application, not the LLM, determines a possible match.

```ts
type ExtractedIdentity = {
  patientName?: string | null;
  medicineName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
};

type MatchResult =
  | {
      outcome: "candidate";
      score: number;
      candidateRecordId: "med_metformin_500_demo";
      matchedFields: string[];
      mismatchedFields: string[];
      display: CandidateDisplay;
    }
  | {
      outcome: "no-match" | "ambiguous" | "unreadable";
      reason: string;
    };

type CandidateDisplay = {
  candidateId: string;
  status: "possible";
  patientName: "Mei Ling Tan";
  medicineName: "Metformin 500 mg";
  dosageForm: "tablet";
  recordSource: "BrightCare Pharmacy — demo record";
};
```

### Proposed scoring rule

- Normalise upper/lowercase, punctuation, spaces, and selected aliases.
- Require medicine name plus strength to return candidate.
- Medicine name match: 0.55.
- Strength match: 0.25.
- Patient name match: 0.10.
- Dosage form match: 0.10.
- Candidate threshold: 0.80.
- A known conflict in medicine name or strength immediately routes to `no-match`.
- Any extractor uncertainty routes to `unreadable` or `ambiguous`; never round up.

The deterministic demo-label path bypasses vision extraction but still follows the same candidate and confirmation screens.

## 11. Conversation model

### Conversation state

```ts
type CompanionState =
  | "start"
  | "listening"
  | "camera-permission"
  | "camera-guidance"
  | "analyzing"
  | "confirm-match"
  | "explain"
  | "safety"
  | "complete";
```

### Entry-point rule

The `start` state has exactly one prominent user action: `call-with-companion`.

`show-medicine` and `ask-schedule` must not be home-screen routes. They are contextual actions that become available only after the companion call begins and the user’s spoken/typed request requires them, or the companion asks an approved clarification question.

### Supported user intents

```ts
type UserIntent =
  | "start-call"
  | "unknown-medicine-question"
  | "schedule-question"
  | "show-medicine"
  | "ask-schedule"
  | "repeat"
  | "change-language"
  | "get-help"
  | "confirm-match"
  | "deny-match"
  | "unsure-match"
  | "general"
  | "unsupported-medical-question"
  | "urgent-risk";
```

### Intent routing rules

| Intent | Allowed response | Next state / contextual action |
|---|---|---|
| `start-call` | Start session, greet user, invite a spoken or typed question | `listening` |
| `unknown-medicine-question` | “Let’s check this together. Would you like to show me the medicine label?” | Remain `listening`; reveal `Show medicine` |
| `schedule-question` | If a record is confirmed, use record-backed schedule content. Otherwise ask the approved clarification question. | Remain `listening`; optionally reveal `Show medicine` and `Ask about my schedule` |
| `show-medicine` | Explain camera purpose and transition to consent | `camera-permission` |
| `ask-schedule` | If record-confirmed, present record-backed schedule wording; otherwise request match confirmation or route to help | `listening`, `confirm-match`, or `safety` |
| `repeat` | Repeat the current approved UI content only | Current state |
| `change-language` | Switch localised content; preserve session state | Current state |
| `get-help` | Enter safety/help options | `safety` |
| `confirm-match` | Mark match confirmed and unlock explanation | `explain` |
| `deny-match` / `unsure-match` | Clear candidate and enter safety/help route | `safety` |
| `general` | Briefly guide toward a supported action; do not create health advice | `listening` |
| `unsupported-medical-question` | Explain limitation and offer pharmacist/clinic help | `safety` |
| `urgent-risk` | Urgent safety message and help action; no normal conversation continuation | `safety` |

### Approved clarification prompt

```text
Would you like to show me a medicine label, or ask about your medicine schedule?
```

This prompt is the only normal point where both route options are displayed together.

## 12. Gemini Live content contract

Gemini Live supplies interaction style, not clinical authority.

### Core real-time system instruction

```text
You are the voice interface for Medication Companion, a fictional demonstration prototype. Speak calmly in short, plain sentences suitable for an older adult. The first supported action is to start a call. During a call, listen to the person’s request and guide them through supported interface actions: show one medicine, ask about a medicine schedule, grant camera permission, hold a label in view, confirm a possible match, switch language, repeat information, or get human help.

Do not offer a menu of medicine tasks before the user begins the call. After the user expresses an unknown-medicine need, you may ask: “Let’s check this together. Would you like to show me the medicine label?” If the request is broad or about schedule and no medicine is confirmed, you may ask: “Would you like to show me a medicine label, or ask about your medicine schedule?”

You are not a clinician, pharmacist, or medication authority. Never diagnose, prescribe, recommend a dose change, advise on missed doses, interpret symptoms, or invent facts about a medicine. Medication information can be spoken only when the application has provided an approved record-backed response marked CONFIRMED_RECORD_CONTENT. If the user asks a medical question outside approved content, say you are not sure enough to answer safely and offer pharmacist or clinic help.

If the user describes urgent danger, severe symptoms, overdose, poisoning, breathing trouble, chest pain, fainting, severe allergic reaction, or self-harm, tell them to seek urgent local medical help now and ask someone nearby for help if possible. Do not continue normal task guidance.

Do not claim that you can see a label or identify a medicine unless the application provides a validated state. Do not claim to contact anyone.
```

### Approved record content injection

Only inject this after confirmed match:

```text
CONFIRMED_RECORD_CONTENT
Source: BrightCare Pharmacy — demo record
Medicine: Metformin 500 mg
Purpose: Helps manage blood sugar.
Instruction: Take 1 tablet twice daily with meals.
Limit: Explain only these facts in the selected language. Do not add medical advice.
```

## 13. UI copy catalogue

### Global disclosure

| Key | English | Simplified Chinese |
|---|---|---|
| `aiDisclosure` | AI guide · Not a pharmacist or doctor | AI 助手 · 不是药剂师或医生 |
| `demoRecord` | BrightCare Pharmacy — demo record | BrightCare Pharmacy — 示范记录 |
| `prototypeNotice` | Prototype information — not connected to a real pharmacy | 原型信息 — 未连接真实药房 |

### Landing and active call

| Key | English | Simplified Chinese |
|---|---|---|
| `welcome` | Hello, Mei Ling | 您好，Mei Ling |
| `startHeading` | How can I help? | 我可以怎样帮助您？ |
| `startSupport` | I can help you understand your medicine information from your pharmacy record. | 我可以帮助您了解药房记录中的用药信息。 |
| `callWithCompanion` | Call with companion | 呼叫助手 |
| `inputReassurance` | You can speak, type, or show a label. | 您可以说出来、输入文字，或展示药物标签。 |
| `listening` | I’m listening… | 我在听… |
| `showLabelQuestion` | Let’s check this together. Would you like to show me the medicine label? | 让我们一起查看。您想给我看药物标签吗？ |
| `clarificationPrompt` | Would you like to show me a medicine label, or ask about your medicine schedule? | 您想给我看药物标签，还是询问您的服药时间？ |
| `showMedicine` | Show medicine | 显示药物 |
| `askSchedule` | Ask about my schedule | 询问我的服药时间 |

### Camera permission and guidance

| Key | English | Simplified Chinese |
|---|---|---|
| `cameraPermissionHeading` | I need to see the writing clearly. | 我需要清楚地看见标签上的文字。 |
| `cameraPermissionBody` | To read the medicine label, may I use the camera on the other side of your phone? | 为了阅读药物标签，我可以使用您手机另一面的摄像头吗？ |
| `switchCamera` | Yes, switch camera | 好，切换摄像头 |
| `notNow` | Not now | 现在不要 |
| `cameraGuidanceHeading` | Hold the label inside the box. | 请把标签放在方框内。 |
| `cameraGuidanceBody` | Keep the writing flat and in good light. I will tell you when I can read it. | 请让文字平整并保持光线充足。我会在可以阅读时告诉您。 |
| `showFrontLabel` | Show the front label first | 请先显示正面标签 |
| `cameraPrivacy` | The camera is only being used to read this medicine label. | 摄像头只会用于阅读这个药物标签。 |

### Confirmation

| Key | English | Simplified Chinese |
|---|---|---|
| `possibleMatch` | I found a possible match | 我找到一个可能的匹配项 |
| `confirmHeading` | I found a possible match: {medicine}, {strength}. Is this the one you're holding? (see §19) | 我找到一个可能的匹配：{medicine}，{strength}。是您手上的这一种吗？ |
| `checkName` | Please check the name on the label before continuing. | 继续之前，请确认标签上的名称。 |
| `yesMedicine` | Yes, this is my medicine | 是的，这是我的药物 |
| `tryAgain` | No, try again | 不是，再试一次 |
| `unsure` | I’m not sure | 我不确定 |

### Safety

| Key | English | Simplified Chinese |
|---|---|---|
| `safetyHeading` | I’m not sure enough to explain this safely. | 我不够确定，不能安全地解释这个药物。 |
| `safetyBody` | Please check the label with your pharmacist, clinic, or a trusted helper. | 请让药剂师、诊所或您信任的人检查标签。 |
| `tryPhoto` | Try another photo | 再拍一张照片 |
| `checkPharmacy` | Check with pharmacy — demo | 向药房确认 — 示范 |
| `askHelper` | Ask a trusted helper — demo | 询问可信任的人 — 示范 |
| `urgentHeading` | This may need urgent help. | 这可能需要紧急帮助。 |
| `urgentBody` | Please contact local emergency services or urgent medical care now. If you can, ask someone near you to help. | 请立即联系当地紧急服务或紧急医疗机构。如果可以，请请身边的人协助您。 |

## 14. Safety classifier model

Implement deterministic keyword/pattern screening before and after model interaction. It is a prototype safety net, not clinical diagnosis.

```ts
const urgentPatterns = [
  /chest pain/i,
  /trouble breathing/i,
  /cannot breathe/i,
  /faint(ed|ing)?/i,
  /overdose/i,
  /poison/i,
  /severe allergic/i,
  /swelling.*(face|tongue|throat)/i,
  /want to (die|hurt myself)/i,
  /suicid/i
];

const unsupportedMedicalPatterns = [
  /should i (stop|start|change|double)/i,
  /missed (a )?dose/i,
  /side effect/i,
  /can i take.*with/i,
  /pregnan/i,
  /is this dangerous/i,
  /diagnos/i
];
```

If triggered, do not ask Claude to answer the medical question. Create a safety response and audit event.

## 15. Audit event model

```ts
type AuditEvent = {
  id: string;
  sessionId: string;
  patientId: "patient_mei_ling_tan";
  timestamp: string;
  eventType:
    | "persona-selected"
    | "call-started"
    | "camera-consent-granted"
    | "camera-consent-declined"
    | "label-submitted"
    | "label-analysis-complete"
    | "candidate-presented"
    | "candidate-confirmed"
    | "candidate-denied"
    | "explanation-viewed"
    | "language-changed"
    | "help-requested"
    | "urgent-safety-triggered"
    | "service-fallback-used";
  actor: "primary-user" | "caregiver" | "system";
  summary: string;
  route: "deterministic-demo" | "claude-vision" | "typed-input" | "local-fallback" | "gemini-live";
  validationStatus: "passed" | "blocked" | "not-applicable";
  details: Record<string, string | number | boolean | null>;
};
```

Audit events must avoid storing raw image data, raw audio, or unredacted free-text where possible.

## 16. Content guardrails

### Required

- Say `record says`, not `you should`, unless directly quoting the verified instruction.
- Say `possible match` before confirmation.
- Name the demo record source.
- Make it clear that the companion cannot change instructions.
- Provide a human-help route for uncertainty.
- Start with the single `Call with companion` entry point; offer label/schedule choices only after active-call conversation context exists.
- Follow the companion tone contract (§19.A) in every companion line, fixed or model-written.

### Prohibited

- `This is definitely your medicine.`
- `I verified your medicine.`
- `Take an extra tablet.`
- `Skip your next dose.`
- `It is safe to combine these.`
- `You do not need to contact a doctor.`
- Permanent landing-page cards or buttons for `Show medicine` or `My schedule`.
- Any invented side effect, contraindication, diagnosis, or patient history.

## 17. Seed fixtures

Create these deterministic fixtures for local development and demo mode:

```ts
const demoFixtures = {
  matchingLabel: {
    mode: "demo",
    extracted: {
      patientName: "Mei Ling Tan",
      medicineName: "Metformin",
      strength: "500 mg",
      dosageForm: "tablet"
    },
    expectedOutcome: "candidate"
  },
  unreadableLabel: {
    mode: "demo",
    expectedOutcome: "unreadable"
  },
  mismatchLabel: {
    mode: "demo",
    extracted: {
      patientName: "Mei Ling Tan",
      medicineName: "Amoxicillin",
      strength: "500 mg",
      dosageForm: "capsule"
    },
    expectedOutcome: "no-match"
  }
} as const;
```

## 18. Content quality checklist

- [ ] The home content includes one prominent `Call with companion` action only.
- [ ] English and Simplified Chinese strings are present for core happy/safety flow.
- [ ] Label and schedule route copy appears only during an active call.
- [ ] All displayed medicine content resolves from the local record.
- [ ] No explanation exists before confirmation.
- [ ] Every uncertain outcome has a clear next action.
- [ ] Gemini and Claude system instructions repeat the no-medical-advice boundary.
- [ ] Audit log records route and validation status without storing raw sensitive media.

## 19. Assignment 3 experience amendments

Approved changes from the Assignment 3 experience design (CLAUDE.md § Assignment 3 experience amendments). None relaxes a safety rule. All new copy keys are fixed approved copy, never model-written, and are not in `UNDERSTAND_KEYS`. zh-Hans lines need native-speaker review before external testing.

### A. Companion tone contract

Every companion line, fixed copy and model-written replies alike:

1. Thank or reassure first. A doubt, retry or question is a good habit.
2. Say what the record says, never what the person should do. Quoting the verified instruction verbatim is the only exception.
3. Nobody is at fault. Things "didn't come through clearly" or "take a little while to update".
4. Offer a choice and end with a gentle question, except when closing the call.
5. At most four short sentences, one idea each. Use "we" and "let's".
6. Never use: error, failed, invalid, wrong, incorrect, mistake, must, should (错误, 失败, 无效, 不对, 错了, 必须, 应该).

Rule 6 is enforced in code: `usesBlameWords` rejects a model reply in `isSafeCompanionReply`, and a test checks every fixed copy line and record field. A model reply for the current turn must also be in the requested language and end with a question.

### B. Gentler label-failure copy

For the non-urgent label reasons (`unreadable-label`, `record-mismatch`, `multiple-candidates`, `user-unsure`) the safety card uses these instead of `safetyHeading` / `safetyBody`. The reason line, the no-instructions line and the single retry are unchanged. `urgent-risk`, `service-failure`, medical questions and help requests keep their existing copy.

| Key | English | Simplified Chinese |
|---|---|---|
| `labelSafetyHeading` | Let's check this one together. | 我们一起再确认一下。 |
| `labelSafetyBody` | Thank you for checking. That happens sometimes, and I'd rather be careful than guess. Would you like to try another photo, or ask someone to check it with you? | 谢谢您的确认。这种情况很常见，我宁可小心一点也不想猜。您想再拍一张，还是请人和您一起核对？ |

### C. Record conflict

New intent `record-conflict`, valid only while a confirmed record is explained (`explain`). Deterministic, case-insensitive patterns: `doctor (said|told|says)`, `that'?s not (right|what)`, `i thought (it was|i take)`, `not the same as`, `医生(说|告诉)`, `不是这样`, `我以为`.

Order: `urgent-risk` → `unsupported-medical-question` → `record-conflict` → human help → off-topic. "My doctor said I can stop it" is therefore a dose question; a new unsupported pattern catches stopping the medicine however it's reported (`stop|skip|quit (taking) it|them|my medicine…`).

The reply is fixed copy. `{instruction}` and `{verifiedDate}` are filled by `fillRecordFacts` from the confirmed explanation and `recordSource.verifiedAt`; they are never typed into copy and never model-written. The record stays on screen, unchanged.

| Key | English | Simplified Chinese |
|---|---|---|
| `recordConflict` | Thank you for telling me — it's good to double-check. Your pharmacy record, checked on {verifiedDate}, says: "{instruction}" Sometimes a doctor changes things and the record takes a little while to catch up, so it's no trouble to ask. Would you like help checking with the pharmacist, or shall we carry on for now? | 谢谢您告诉我，多确认一下是很好的。您的药房记录（{verifiedDate}确认）写着：“{instruction}” 有时候医生会调整用药，记录可能还没来得及更新，所以问一问完全没关系。您想让我帮您联系药剂师确认一下，还是我们先继续？ |
| `checkWithPharmacist` | Check with pharmacist — demo | 向药剂师确认 — 示范 |
| `carryOn` | Carry on | 先继续 |
| `unclearRecordConflict` | I didn't quite catch that. You can say "pharmacist" for help checking, or "carry on". | 我没太听清楚。您可以说「药剂师」请人帮忙确认，或说「继续」。 |

Audit event `record-conflict-raised` (details: `{ intent: "record-conflict" }` only, never the words).

### D. Label check on the explanation

Beside the instruction (explanation step 1) the companion shows where the record comes from and when it was checked, and asks the person to compare it with the physical label. `{verifiedDate}` is filled from `recordSource.verifiedAt`.

| Key | English | Simplified Chinese |
|---|---|---|
| `recordCheckedOn` | BrightCare Pharmacy — demo record · checked {verifiedDate} | BrightCare Pharmacy — 示范记录 · {verifiedDate}核对 |
| `labelCheckPrompt` | Does this match what's printed on your label? | 这和您标签上印的一样吗？ |
| `labelMatches` | Yes, it matches | 是的，一样 |
| `labelLooksDifferent` | It looks different | 看起来不一样 |
| `labelDiffers` | Thank you for checking — that's really helpful. When the label and the record don't agree, a pharmacist is the best person to look. Would you like help contacting them? | 谢谢您仔细核对，这很有帮助。标签和记录不一样的时候，最好请药剂师看一看。需要我帮您联系他们吗？ |
| `unclearLabelCheck` | I didn't quite catch that. Does this match your label? You can say "yes, it matches" or "it looks different". | 我没太听清楚。这和您的标签一样吗？您可以说「一样」或「不一样」。 |

New safety reason `label-differs` (heading `labelSafetyHeading`, body `labelDiffers`, no reason line, no photo retry). New audit event `label-check-answered` (details: `{ matches }`).

### E. Off-topic, health signals and wellbeing

1. **Turn cap.** The second consecutive off-topic turn gets `offTopicWrapUp` with `Show medicine` and `End call`. Any other turn resets the count.
2. **Health signals.** Added to `unsupportedMedicalPatterns` (the limitation + pharmacist/clinic path, not urgent): `(feel|feeling|been) (so |very |really )?(tired|dizzy|weak|unwell|sick|confused)`, `keep forgetting|so forgetful`, `can'?t sleep|not sleeping`, `头晕|很累|没力气|不舒服|睡不着|老是忘`.
3. **Wellbeing.** `lonely|all alone|no one to talk|feel(ing)? sad`, `孤单|寂寞|没人陪|难过` → intent `wellbeing`, fixed `wellbeing` copy with `Carry on` (and the family option, F). Self-harm stays urgent, and that screen also shows `crisisLines` as text.
4. **Misheard speech.** A browser result with confidence above 0 and below `MIN_SPEECH_CONFIDENCE` (0.5) gets `didntCatch` before any classification. Exactly 0 means "not provided".
5. **Nothing personal is kept.** Off-topic and wellbeing audit events carry `{ intent, category, actionsOffered }` only (no text, no length).

| Key | English | Simplified Chinese |
|---|---|---|
| `offTopicWrapUp` | It's been lovely chatting with you. Shall we look at your medicine together, or would you like to end the call for now? | 和您聊天很开心。我们一起看看您的药，还是先结束通话？ |
| `wellbeing` | Thank you for telling me — that sounds hard. I'm only a medicine helper, but you don't have to manage things alone. Would you like me to let your family know you'd like some company, or shall we carry on together? | 谢谢您告诉我，这听起来不容易。我只是一个用药小帮手，但您不必一个人面对。需要我告诉您的家人您想有人陪陪您吗，还是我们一起继续？ |
| `didntCatch` | Sorry, I didn't quite catch that. Could you say it again? Typing it works well too. | 不好意思，我没听清楚。可以再说一次吗？也可以直接打字。 |
| `crisisLines` | Samaritans of Singapore (24 hours): 1767 · Emergency: 995 | 新加坡援人协会（24小时）：1767 · 紧急电话：995 |

### F. Asking family for help needs consent every time

`Ask family to help — demo` is on the non-urgent safety options and after the `wellbeing` reply. Tapping it shows `familyConsent` with `Yes, ask them — demo` and `Not now`. Only "Yes" writes `caregiver-help-requested` (details `{ consent: true, implemented: false }`), which the caregiver dashboard shows as `Needs help`. "Not now" writes nothing. Nothing is sent anywhere; the demo notice says so.

| Key | English | Simplified Chinese |
|---|---|---|
| `askFamily` | Ask family to help — demo | 请家人帮忙 — 示范 |
| `familyConsent` | Shall I let your family know you'd like some help? I'll only do this if you say yes. | 需要我告诉您的家人您想请他们帮忙吗？只有您同意，我才会联系。 |
| `familyConsentYes` | Yes, ask them — demo | 好，请告诉他们 — 示范 |
| `unclearFamilyConsent` | I didn't quite catch that. You can say "yes" to ask your family, or "not now". | 我没太听清楚。您可以说「好」请家人帮忙，或说「现在不用」。 |

### G. Study mode fixture

`studyWrongInstruction` (`src/lib/content/fixtures.ts`): en `Take 1 tablet once daily at bedtime.`, zh-Hans `每日一次，睡前服用一片。` (needs native-speaker review). Used only in the `wrong-explanation` study condition, in place of the record's `instruction` after every gate has passed. It is never shown outside study mode, and participants are debriefed afterwards. Every audit event in a study session carries `details.studyCondition`.

### Interaction-state wording (from the states diagram)

| Key | English | Simplified Chinese |
|---|---|---|
| `callGreeting` | Hello, I'm an AI guide. What would you like to know today? | 您好，我是AI向导。今天想了解什么呢？ |
| `analyzingHeading` / `analyzingBody` | Thank you, let me have a look. / This will just take a moment. | 谢谢，我来看一看。/ 请稍等一下。 |
| `confirmHeading` | I found a possible match: {medicine}, {strength}. Is this the one you're holding? | 我找到一个可能的匹配：{medicine}，{strength}。是您手上的这一种吗？ |
| `recordHidden` | Your record is tucked away while we get you some help. | 在我们为您寻求帮助时，记录内容先收起来了。 |

### H4. Help flows (simulated services)

The record module is now `seed-record.ts`, the simulated services' data source, with a fictional care circle (`careContacts`: BrightCare Pharmacy 6555 0123, Greenhill Family Clinic 6555 0100, family "Daniel", trusted helper "Mrs Lim"). The numbers follow the 555-01xx fiction pattern; replace them with numbers you're allowed to show before external testing.

| Key | English | Simplified Chinese |
|---|---|---|
| `askPharmacistCall` | Ask a pharmacist to call me | 请药剂师给我回电 |
| `contactClinic` | Contact my clinic | 联系我的诊所 |
| `askHelper` | Ask my trusted helper | 请我信任的人帮忙 |
| `letFamilyKnow` | Let my family know | 告诉我的家人 |
| `callbackConfirm` | I can ask BrightCare Pharmacy to call you on the number in your record. They usually call within one working day. Shall I send the request? | 我可以请BrightCare药房按您记录上的号码给您回电。他们通常会在一个工作日内联系您。要我发送请求吗？ |
| `callbackYes` | Yes, send the request | 好，发送请求 |
| `callbackSent` | Thank you. I've sent your request to BrightCare Pharmacy. Your reference is {reference}. Is there anything else I can help you with? | 谢谢，我已经把您的请求发给BrightCare药房了。您的参考编号是{reference}。还有什么我可以帮您的吗？ |
| `helperConsent` | Shall I let {name}, your trusted helper, know you'd like some help? I'll only do this if you say yes. | 需要我告诉您信任的{name}您想请他们帮忙吗？只有您同意，我才会联系。 |
| `familyConsentYes` | Yes, let them know | 好，告诉他们 |
| `familySent` | Thank you. I've let {caregiverName} know you'd like some help. Would you like to carry on while you wait? | 谢谢，我已经告诉{caregiverName}您需要帮忙了。等待的时候，要不要我们先继续？ |
| `helpSending` | Sending your request… | 正在发送您的请求… |
| `serviceTrouble` | I'm sorry, I couldn't send that just now. Would you like to try again, or see the pharmacy's phone number instead? | 不好意思，刚才没能发送成功。您想再试一次，还是看看药房的电话号码？ |
| `sendAgain` / `seePharmacyNumber` | Try again / See the pharmacy's number | 再试一次 / 查看药房电话 |
| `pharmacyNumber` / `clinicNumber` | You can call {name} on {phone}. Is there anything else I can help you with? | 您可以拨打{phone}联系{name}。还有什么我可以帮您的吗？ |
| `unclearHelpConfirm` | I didn't quite catch that. You can say "yes", or "not now". | 我没太听清楚。您可以说「好」，或说「现在不用」。 |

Removed: `checkPharmacy`, `checkWithPharmacist`, `askFamily`, `emergencyDemo`, `demoActionNotice`, `unclearFamilyConsent`. New audit event `pharmacist-callback-requested`; `caregiver-help-requested` is now written only after consent **and** the service's success.

### H3. Choose from my medicines

Offered in the camera step's other ways (reached after "Not now" and after another try). It lists `recordMedicines` by name and strength only. Choosing one creates a possible match (`candidate-presented`, route `record-list`), which still goes to the confirm step.

| Key | English | Simplified Chinese |
|---|---|---|
| `chooseFromMedicines` | Choose from my medicines | 从我的药物中选择 |
| `medicineListHeading` | Which medicine are you holding? | 您手上拿的是哪一种药？ |
| `medicineListNote` | These are the medicines on your BrightCare Pharmacy record. You'll still check it on the next step. | 这些是您在BrightCare药房记录中的药物。下一步您仍需要确认。 |

### H2. Showing the medicine: camera or photo

After "Show medicine": `showMedicineHeading` with `photoIntro`, two equal primary actions `Use camera` (→ the existing consent question) and `Choose a photo` (system picker, `accept="image/*"`, no `capture`), and the text action `Type the name`. The camera step's other ways are Choose a photo, Choose from my medicines, and Type the label details. "Use demo label" and the sample-photo picker are removed from the UI; their fixtures remain for reducer tests only. The bundled fictional label photos in `public/samples/` are kept so testers can save one and choose it as a photo.

| Key | English | Simplified Chinese |
|---|---|---|
| `showMedicineHeading` | How would you like to show me your medicine? | 您想怎样给我看您的药？ |
| `useCamera` / `choosePhoto` / `typeName` | Use camera / Choose a photo / Type the name | 使用相机 / 选择照片 / 输入药名 |
| `photoIntro` | You can choose a photo of your medicine label. I'll only look at the medicine name, and the photo won't be kept. | 您可以选择一张药品标签的照片。我只看药品名称，照片不会被保存。 |
| `photoFormat` | I couldn't open that photo. Would you like to try another one, or use the camera instead? | 这张照片我打不开。您想换一张，还是改用相机？ |
| `unclearShowMedicine` | I didn't quite catch that. You can say "camera", choose a photo, or tell me the medicine name and strength. | 我没太听清楚。您可以说「相机」、选择照片，或告诉我药物名称和剂量。 |

Removed: `useDemoLabel`, `uploadPhoto`, `samplePicker*`, `sample*`, `sampleLoadError`. Rewritten without demo-label wording: `cameraDeniedBody`, `cameraUnavailableBody`, `fallbackBody`, `reasonService`, `unclearCameraGuidance`.

### H1. Prototype framing

No user-facing copy or record wording says "demo" (a test checks both languages and the rendered sign-in, caregiver and About pages). One `PrototypeBadge`, `Prototype · fictional data` / `原型 · 虚构数据`, is mounted in the root layout so it shows on every screen, including About and 404 (pages that don't use `AppShell`).

- Record source: `displayLabel` is now `BrightCare Pharmacy`; the explanation says "Your current pharmacy record says:" and "Source: BrightCare Pharmacy."
- `trustBadge`: `Plan checked by BrightCare Pharmacy · {verifiedDate}`; `recordCheckedOn`: `BrightCare Pharmacy · checked {verifiedDate}`.
- `offTopicCapability`: "I can't do that myself. If you tap Get help, I can ask a pharmacist to call you or let your family know. I can also help you understand the medicine information in your record."
- The sign-in stand-in says "Continue as Mei Ling" and notes that the real product signs in with Singpass. The About page explains what is simulated.
- The audit route `deterministic-demo` is now `deterministic` (it is shown in the caregiver view).
