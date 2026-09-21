import type {
  AuditEventType,
  DemoAssetId,
  LabelExtraction,
} from "@/types/content";

export const demoFixtures = {
  matchingLabel: {
    mode: "demo",
    extracted: {
      patientName: "Mei Ling Tan",
      medicineName: "Metformin",
      strength: "500 mg",
      dosageForm: "tablet",
    },
    expectedOutcome: "candidate",
  },
  unreadableLabel: {
    mode: "demo",
    expectedOutcome: "unreadable",
  },
  mismatchLabel: {
    mode: "demo",
    extracted: {
      patientName: "Mei Ling Tan",
      medicineName: "Amoxicillin",
      strength: "500 mg",
      dosageForm: "capsule",
    },
    expectedOutcome: "no-match",
  },
} as const;

/** Deterministic stand-in for vision extraction on the demo route. */
export function extractionForDemoAsset(id: DemoAssetId): LabelExtraction {
  switch (id) {
    case "sample_metformin_label":
      return { status: "readable", extracted: { ...demoFixtures.matchingLabel.extracted } };
    case "sample_mismatch_label":
      return { status: "readable", extracted: { ...demoFixtures.mismatchLabel.extracted } };
    case "sample_unreadable_label":
      return { status: "unreadable", extracted: {} };
  }
}

export type SampleAuditSeed = {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  summary: string;
  route: "deterministic-demo";
  validationStatus: "passed" | "blocked" | "not-applicable";
};

/** Seeded, clearly-labelled sample activity so the caregiver view is never empty. */
export const sampleAuditSeeds: readonly SampleAuditSeed[] = [
  {
    id: "sample_1",
    timestamp: "2026-09-20T08:02:00.000Z",
    eventType: "call-started",
    summary: "Call started",
    route: "deterministic-demo",
    validationStatus: "not-applicable",
  },
  {
    id: "sample_2",
    timestamp: "2026-09-20T08:03:10.000Z",
    eventType: "candidate-presented",
    summary: "Possible match presented: Metformin 500 mg",
    route: "deterministic-demo",
    validationStatus: "passed",
  },
  {
    id: "sample_3",
    timestamp: "2026-09-20T08:03:40.000Z",
    eventType: "candidate-confirmed",
    summary: "User confirmed the possible match",
    route: "deterministic-demo",
    validationStatus: "passed",
  },
  {
    id: "sample_4",
    timestamp: "2026-09-20T08:04:05.000Z",
    eventType: "explanation-viewed",
    summary: "Record-backed explanation viewed (English)",
    route: "deterministic-demo",
    validationStatus: "passed",
  },
];
