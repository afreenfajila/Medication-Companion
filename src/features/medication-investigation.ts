// A4: Medication Interaction Awareness
// Investigation flow: questions → severity assessment → confidence scoring → escalation

export interface MedicationReport {
  symptom: string;
  medicationsTakenToday: string[];
  timingOfDoses: string;
  otherMedicationsIn3Days: string[];
}

export interface SeverityAssessment {
  tier: "A" | "B" | "C"; // A: mild, B: medium, C: emergency
  onset: string;
  type: string;
  functionalImpact: string;
  associatedSymptoms: string[];
  duration: string;
}

export interface ConfidenceFactors {
  dataQuality: "Level1" | "Level2" | "Level3"; // 1: pharmacy, 2: user, 3: unverified
  evidenceStrength: "A" | "B" | "C"; // A: documented, B: database, C: theoretical
  severity: "A" | "B" | "C";
}

export interface EscalationDecision {
  confidence: number; // 0-100
  action: "alert_family" | "user_decides" | "mention_only";
  reasoning: string;
}

// Five diagnostic questions for severity assessment
export const SEVERITY_QUESTIONS = [
  "When did the symptom start?",
  "What type of symptom is it? (e.g., dizziness, confusion, nausea)",
  "How is it affecting your daily activities?",
  "Are there any other symptoms alongside this?",
  "How long has it been happening?",
];

// Score severity tier based on responses
export function assessSeverity(responses: {
  onset: string;
  type: string;
  impact: string;
  associated: string;
  duration: string;
}): "A" | "B" | "C" {
  // ponytail: simplified heuristic for demo
  // In production, this would use more sophisticated medical decision logic
  const type = responses.type.toLowerCase();
  const impact = responses.impact.toLowerCase();

  // Tier C: emergency signs
  if (
    type.includes("breathing") ||
    type.includes("arrhythmia") ||
    type.includes("severe hypotension") ||
    impact.includes("cannot")
  ) {
    return "C";
  }

  // Tier B: moderate signs
  if (
    type.includes("confusion") ||
    type.includes("dizziness") ||
    type.includes("call pharmacist") ||
    impact.includes("difficult") ||
    responses.duration.includes("long")
  ) {
    return "B";
  }

  // Tier A: mild
  return "A";
}

// Calculate confidence score from three factors
// Additive points model (max 90). Severity carries the most weight, so only
// Tier C harm can reach the ≥80% family-alert threshold (Guardrail 5: no cry-wolf).
// ponytail: fixed point table; calibrate against pharmacist review before real use.
const SEVERITY_POINTS = { A: 10, B: 25, C: 40 } as const; // mild / medium / emergency
const DATA_QUALITY_POINTS = { Level1: 30, Level2: 20, Level3: 10 } as const; // pharmacy / user / unverified
const EVIDENCE_POINTS = { A: 20, B: 15, C: 10 } as const; // documented / database / theoretical

export function calculateConfidence(factors: ConfidenceFactors): number {
  return (
    SEVERITY_POINTS[factors.severity] +
    DATA_QUALITY_POINTS[factors.dataQuality] +
    EVIDENCE_POINTS[factors.evidenceStrength]
  );
}

// Determine escalation action based on confidence and severity
export function determineEscalation(
  confidence: number,
  severity: "A" | "B" | "C"
): EscalationDecision {
  let action: "alert_family" | "user_decides" | "mention_only";
  let reasoning: string;

  if (severity === "C") {
    // Pause condition: red-flag symptoms bypass the score — weak data must never silence an emergency.
    action = "alert_family";
    reasoning =
      "Red-flag symptom: questions stop and family is alerted now, whatever the score. Family decides whether to call 995.";
  } else if (confidence >= 80) {
    action = "alert_family";
    reasoning =
      "High confidence: potential serious interaction detected. Family contacted for immediate attention.";
  } else if (confidence >= 50 && confidence < 80) {
    action = "user_decides";
    reasoning =
      "Moderate confidence: possible interaction. User decides whether to alert family or pharmacist.";
  } else {
    action = "mention_only";
    reasoning =
      "Low confidence: mention to the user only, no family alert. Watch the symptom and call if it gets worse.";
  }

  return { confidence, action, reasoning };
}

// Demo scenario scoring
export const DEMO_SCENARIOS = {
  scenario1: {
    // "How many should I take?"
    description: "Dosage confusion",
    factors: {
      dataQuality: "Level1",
      evidenceStrength: "A",
      severity: "B",
    },
    expectedConfidence: 75,
  },
  scenario2: {
    // "My dose changed?"
    description: "Dose change awareness",
    factors: {
      dataQuality: "Level1",
      evidenceStrength: "A",
      severity: "B",
    },
    expectedConfidence: 75,
  },
  scenario5: {
    // "I forgot if I took it today?"
    description: "Adherence recall",
    factors: {
      dataQuality: "Level2",
      evidenceStrength: "B",
      severity: "A",
    },
    expectedConfidence: 45,
  },
} satisfies Record<string, { description: string; factors: ConfidenceFactors; expectedConfidence: number }>;
