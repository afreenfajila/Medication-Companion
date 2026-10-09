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
export function calculateConfidence(factors: ConfidenceFactors): number {
  // ponytail: simple weighted average for demo
  // In production, multiply factors: (DataQuality × EvidenceStrength × Severity)
  const dataQualityScore =
    {
      Level1: 1.0, // pharmacy record highest confidence
      Level2: 0.6, // user reported
      Level3: 0.3, // unverified
    }[factors.dataQuality] || 0.3;

  const evidenceScore =
    {
      A: 1.0, // documented
      B: 0.7, // database
      C: 0.4, // theoretical
    }[factors.evidenceStrength] || 0.4;

  const severityScore =
    {
      A: 0.5, // mild: lower escalation pressure
      B: 0.8, // medium: moderate escalation
      C: 1.0, // emergency: immediate escalation
    }[factors.severity] || 0.5;

  // Combined confidence
  const combined = dataQualityScore * evidenceScore * severityScore;
  return Math.round(combined * 100);
}

// Determine escalation action based on confidence and severity
export function determineEscalation(
  confidence: number,
  severity: "A" | "B" | "C"
): EscalationDecision {
  let action: "alert_family" | "user_decides" | "mention_only";
  let reasoning: string;

  if (confidence >= 80) {
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
      "Low confidence: insufficient data. Mentioning to family for awareness only, no urgent alert.";
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
    expectedConfidence: 90,
  },
  scenario2: {
    // "My dose changed?"
    description: "Dose change awareness",
    factors: {
      dataQuality: "Level1",
      evidenceStrength: "A",
      severity: "B",
    },
    expectedConfidence: 90,
  },
  scenario5: {
    // "I forgot if I took it today?"
    description: "Adherence recall with escalation",
    factors: {
      dataQuality: "Level2",
      evidenceStrength: "B",
      severity: "A",
    },
    expectedConfidence: 35,
  },
};
