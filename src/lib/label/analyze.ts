import type { ClaudeLabelExtraction } from "@/lib/ai/schemas";
import type { LabelAnalysis } from "@/lib/api/schemas";
import { metforminRecord, recordSource } from "@/lib/content/seed-record";
import { candidateDisplayFor, matchLabel } from "@/lib/matching/match-record";

const MSG_CANDIDATE = "I found a possible match. Please check the name on the label.";
const MSG_UNCERTAIN = "I’m not sure enough to explain this safely.";

/**
 * Turns a (validated) model extraction into the API's LabelAnalysis. The
 * DETERMINISTIC matcher decides the outcome; model confidence/notes are never
 * used as proof and `notesForUser` is deliberately never forwarded (untrusted).
 * `userMessage` is fixed approved wording only.
 */
export function analyzeExtraction(extraction: ClaudeLabelExtraction): LabelAnalysis {
  // Extractor uncertainty never rounds up: a poor image is unreadable even if text was returned.
  if (extraction.imageQuality === "poor" && extraction.status === "readable") {
    return {
      outcome: "unreadable",
      userMessage: MSG_UNCERTAIN,
      nextState: "safety",
      reasonCode: "low-confidence",
    };
  }

  const result = matchLabel({ status: extraction.status, extracted: extraction.extracted });

  if (result.outcome === "candidate") {
    const d = candidateDisplayFor(metforminRecord);
    return {
      outcome: "candidate",
      userMessage: MSG_CANDIDATE,
      nextState: "confirm-match",
      candidate: {
        candidateId: d.candidateId,
        patientName: d.patientName,
        medicineName: d.medicineName,
        strength: d.strength,
        dosageForm: d.dosageForm,
        sourceLabel: recordSource.displayLabel,
        matchStatus: "possible",
      },
    };
  }

  const reasonCode: NonNullable<LabelAnalysis["reasonCode"]> =
    result.outcome === "no-match"
      ? "conflict"
      : result.outcome === "ambiguous"
        ? "multiple-candidates"
        : result.reason === "missing-required-fields" || result.reason === "no-identity-fields"
          ? "missing-fields"
          : "low-confidence";

  return { outcome: result.outcome, userMessage: MSG_UNCERTAIN, nextState: "safety", reasonCode };
}
