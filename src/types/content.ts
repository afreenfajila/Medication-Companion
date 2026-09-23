// Core domain types. Mirrors content-model.md; additions are marked "extension".

export type LanguageCode = "en" | "zh-Hans" | "ms" | "ta";
/** Languages with complete copy in this build. */
export type UiLanguage = "en" | "zh-Hans";

export type Persona = "mei-ling" | "caregiver";

export type MatchStatus =
  | "possible"
  | "confirmed"
  | "denied"
  | "unsure"
  | "no-match"
  | "ambiguous"
  | "unreadable";

export type SafetyReason =
  | "unreadable-label"
  | "record-mismatch"
  | "multiple-candidates"
  | "user-unsure"
  | "unsupported-medical-question"
  | "adverse-effect-question"
  | "urgent-risk"
  | "service-failure"
  | "help-requested"; // extension: explicit "Get help" / human-help request

export type CompanionState =
  | "start"
  | "listening"
  | "camera-permission"
  | "camera-guidance"
  | "analyzing"
  | "confirm-match"
  | "explain"
  | "safety"
  | "complete";

export type UserIntent =
  | "start-call"
  | "unknown-medicine-question"
  | "schedule-question"
  | "list-prescriptions" // extension: "what are my prescriptions?" — distinct from identifying an unlabelled pill
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

export type ContextualActionId = "show-medicine" | "ask-schedule";

export type LocalizedText = Partial<Record<LanguageCode, string>>;

export type LocalizedMedicationExplanation = {
  title: LocalizedText;
  purpose: LocalizedText;
  instructionIntro: LocalizedText;
  instruction: LocalizedText;
  sourceLine: LocalizedText;
  caution: LocalizedText;
  confirmationPrompt: LocalizedText;
};

export type Patient = {
  id: "patient_mei_ling_tan";
  displayName: "Mei Ling Tan";
  preferredLanguage: "zh-Hans";
  supportedLanguages: LanguageCode[];
  recordSourceId: "source_brightcare_demo";
  demoNotice: true;
};

export type RecordSource = {
  id: "source_brightcare_demo";
  name: "BrightCare Pharmacy";
  displayLabel: "BrightCare Pharmacy — demo record";
  recordStatus: "current-demo";
  verifiedAt: string;
  disclaimer: "Prototype information — not connected to a real pharmacy.";
};

export type MedicationRecord = {
  id: "med_metformin_500_demo";
  patientId: "patient_mei_ling_tan";
  sourceId: "source_brightcare_demo";
  status: "current";
  identity: {
    genericName: "Metformin";
    displayName: "Metformin 500 mg";
    strength: "500 mg";
    dosageForm: "tablet";
    labelAliases: readonly string[];
  };
  verifiedInstruction: {
    frequency: "twice daily";
    timing: "with meals";
    doseText: "Take 1 tablet";
    canonicalText: "Take 1 tablet twice daily with meals";
  };
  explanation: LocalizedMedicationExplanation;
  matching: {
    requiredFields: readonly ["medicineName", "strength"];
    optionalFields: readonly ["patientName", "dosageForm"];
    minimumDeterministicScore: 0.8;
  };
  safety: {
    noDoseChanges: true;
    noMissedDoseAdvice: true;
    humanHelpForSymptoms: true;
  };
};

// ---- Label input & matching -------------------------------------------------

export type DemoAssetId =
  | "sample_metformin_label"
  | "sample_unreadable_label" // extension: deterministic safety-path demos
  | "sample_mismatch_label";

export type LabelInput =
  | { mode: "demo"; demoAssetId: DemoAssetId }
  | {
      // Metadata only: the pixels live in memory for one request and are never stored in session state.
      mode: "image";
      source: "sample" | "camera";
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      byteSize: number;
    }
  | {
      mode: "typed";
      patientName?: string;
      medicineName?: string;
      strength?: string;
      dosageForm?: string;
    };

export type ExtractedIdentity = {
  patientName?: string | null;
  medicineName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
};

/** What an extractor (fixture, typed form, or later Claude) hands to the matcher. */
export type LabelExtraction = {
  status: "readable" | "unreadable" | "ambiguous";
  extracted: ExtractedIdentity;
};

export type CandidateDisplay = {
  candidateId: string;
  status: "possible";
  patientName: "Mei Ling Tan";
  medicineName: "Metformin 500 mg";
  strength: "500 mg";
  dosageForm: "tablet";
  recordSource: "BrightCare Pharmacy — demo record";
};

export type MatchResult =
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
      mismatchedFields?: string[];
    };

// ---- Audit ------------------------------------------------------------------

export type AuditEventType =
  | "persona-selected"
  | "call-started"
  | "call-ended" // extension
  | "message-classified" // extension
  | "route-selected" // extension: Show medicine / Ask about my schedule
  | "camera-consent-granted"
  | "camera-consent-declined"
  | "label-submitted"
  | "label-analysis-complete"
  | "candidate-presented"
  | "candidate-confirmed"
  | "candidate-denied"
  | "explanation-viewed"
  | "understanding-confirmed" // extension
  | "language-changed"
  | "help-requested"
  | "urgent-safety-triggered"
  | "service-fallback-used";

export type AuditEvent = {
  id: string;
  sessionId: string;
  patientId: "patient_mei_ling_tan";
  timestamp: string;
  eventType: AuditEventType;
  actor: "primary-user" | "caregiver" | "system";
  summary: string;
  route:
    | "deterministic-demo"
    | "claude-vision"
    | "typed-input"
    | "local-fallback"
    | "gemini-live";
  validationStatus: "passed" | "blocked" | "not-applicable";
  details: Record<string, string | number | boolean | null>;
};
