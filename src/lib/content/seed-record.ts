import type {
  LocalizedMedicationExplanation,
  MedicationRecord,
  Patient,
  RecordSource,
} from "@/types/content";

export const patient: Patient = {
  id: "patient_mei_ling_tan",
  displayName: "Mei Ling Tan",
  preferredLanguage: "zh-Hans",
  supportedLanguages: ["en", "zh-Hans"],
  recordSourceId: "source_brightcare_demo",
  demoNotice: true,
};

export const recordSource: RecordSource = {
  id: "source_brightcare_demo",
  name: "BrightCare Pharmacy",
  displayLabel: "BrightCare Pharmacy",
  recordStatus: "current-demo",
  verifiedAt: "2026-09-21T00:00:00.000Z",
  disclaimer: "Prototype information — not connected to a real pharmacy.",
};

const metforminExplanation: LocalizedMedicationExplanation = {
  title: {
    en: "Here is what your record says.",
    "zh-Hans": "这是您的药房记录所显示的信息。",
  },
  purpose: {
    en: "Metformin helps manage blood sugar.",
    "zh-Hans": "二甲双胍用于帮助控制血糖。",
  },
  instructionIntro: {
    en: "Your current pharmacy record says:",
    "zh-Hans": "您目前的药房记录显示：",
  },
  instruction: {
    en: "Take 1 tablet twice daily with meals.",
    "zh-Hans": "随餐每日服用一片，每日两次。",
  },
  sourceLine: {
    en: "Source: BrightCare Pharmacy.",
    "zh-Hans": "来源：BrightCare Pharmacy。",
  },
  caution: {
    en: "I can explain this record, but I cannot change your medicine instructions.",
    "zh-Hans": "我可以解释这份记录，但不能更改您的用药指示。",
  },
  confirmationPrompt: {
    en: "Would you like me to repeat that or help you contact a pharmacist?",
    "zh-Hans": "您想让我重复一次，还是协助您联系药剂师？",
  },
};

/** The one seeded record. Every displayed medicine fact resolves from here. */
export const metforminRecord: MedicationRecord = {
  id: "med_metformin_500_demo",
  patientId: "patient_mei_ling_tan",
  sourceId: "source_brightcare_demo",
  status: "current",
  identity: {
    genericName: "Metformin",
    displayName: "Metformin 500 mg",
    strength: "500 mg",
    dosageForm: "tablet",
    labelAliases: ["METFORMIN", "METFORMIN HCL", "METFORMIN 500MG"],
  },
  verifiedInstruction: {
    frequency: "twice daily",
    timing: "with meals",
    doseText: "Take 1 tablet",
    canonicalText: "Take 1 tablet twice daily with meals",
  },
  explanation: metforminExplanation,
  matching: {
    requiredFields: ["medicineName", "strength"],
    optionalFields: ["patientName", "dosageForm"],
    minimumDeterministicScore: 0.8,
  },
  safety: {
    noDoseChanges: true,
    noMissedDoseAdvice: true,
    humanHelpForSymptoms: true,
  },
};

/** Every medicine on her record — what "Choose from my medicines" lists (name and strength only). */
export const recordMedicines: readonly MedicationRecord[] = [metforminRecord];

/**
 * Mei Ling's fictional care circle and contacts — the simulated services'
 * data source (CLAUDE.md § H4). The numbers use the 555-01xx pattern that is
 * reserved for fiction elsewhere; replace them with numbers you are allowed to
 * show before any external testing.
 */
export const careContacts = {
  pharmacy: { name: "BrightCare Pharmacy", phone: "6555 0123" },
  clinic: { name: "Greenhill Family Clinic", phone: "6555 0100" },
  family: { name: "Daniel" }, // her son
  trustedHelper: { name: "Mrs Lim" }, // her neighbour
} as const;

/** Purpose line for the caregiver record view (from the verified record brief). */
export const metforminPurposeEn = "Helps manage blood sugar";
