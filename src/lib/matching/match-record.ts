import { extractionForDemoAsset } from "@/lib/content/fixtures";
import { metforminRecord, patient, recordSource } from "@/lib/content/demo-record";
import type {
  CandidateDisplay,
  ExtractedIdentity,
  LabelExtraction,
  LabelInput,
  MatchResult,
  MedicationRecord,
} from "@/types/content";
import {
  nameTokens,
  normalizeForm,
  normalizeStrength,
  normalizeText,
} from "./normalize";

// Points (not floats) so the 0.80 threshold is exact.
const POINTS = { medicineName: 55, strength: 25, patientName: 10, dosageForm: 10 } as const;
const THRESHOLD_POINTS = 80;

export function candidateIdFor(record: MedicationRecord): string {
  return `cand_${record.id}`;
}

/** The only source of candidate display text: the local record, never model or server output. */
export function candidateDisplayFor(record: MedicationRecord = metforminRecord): CandidateDisplay {
  return {
    candidateId: candidateIdFor(record),
    status: "possible",
    patientName: patient.displayName,
    medicineName: record.identity.displayName,
    strength: record.identity.strength,
    dosageForm: record.identity.dosageForm,
    recordSource: recordSource.displayLabel,
  };
}

function isPresent(v: string | null | undefined): v is string {
  return normalizeText(v).length > 0;
}

function medicineNameMatches(value: string, record: MedicationRecord): boolean {
  const n = normalizeText(value);
  const aliases = record.identity.labelAliases.map(normalizeText);
  const generic = normalizeText(record.identity.genericName);
  return aliases.includes(n) || n.split(" ")[0] === generic;
}

function patientNameMatches(value: string): boolean {
  const label = nameTokens(value);
  const record = nameTokens(patient.displayName);
  return label.length >= 2 && label.every((tok) => record.includes(tok));
}

/**
 * Deterministic matcher (content-model.md §10). The model never decides this.
 *
 * - Medicine name AND strength are both required to produce a candidate.
 * - Any *provided* field that conflicts (including optional patient name and
 *   dosage form) is a no-match — we never round a conflict up to a candidate.
 * - Only a `possible` candidate is ever returned; confirmation is a separate gate.
 */
export function matchLabel(
  extraction: LabelExtraction,
  record: MedicationRecord = metforminRecord,
): MatchResult {
  if (extraction.status === "unreadable") {
    return { outcome: "unreadable", reason: "extractor-unreadable" };
  }
  if (extraction.status === "ambiguous") {
    return { outcome: "ambiguous", reason: "extractor-ambiguous" };
  }

  const x: ExtractedIdentity = extraction.extracted;
  const hasName = isPresent(x.medicineName);
  const hasStrength = isPresent(x.strength);

  if (!hasName && !hasStrength) {
    return { outcome: "unreadable", reason: "no-identity-fields" };
  }
  if (!hasName || !hasStrength) {
    return { outcome: "unreadable", reason: "missing-required-fields" };
  }

  const matched: string[] = [];
  const mismatched: string[] = [];
  let points = 0;

  if (medicineNameMatches(x.medicineName as string, record)) {
    matched.push("medicineName");
    points += POINTS.medicineName;
  } else {
    mismatched.push("medicineName");
  }

  if (normalizeStrength(x.strength) === normalizeStrength(record.identity.strength)) {
    matched.push("strength");
    points += POINTS.strength;
  } else {
    mismatched.push("strength");
  }

  if (isPresent(x.patientName)) {
    if (patientNameMatches(x.patientName as string)) {
      matched.push("patientName");
      points += POINTS.patientName;
    } else {
      mismatched.push("patientName");
    }
  }

  if (isPresent(x.dosageForm)) {
    if (normalizeForm(x.dosageForm) === normalizeForm(record.identity.dosageForm)) {
      matched.push("dosageForm");
      points += POINTS.dosageForm;
    } else {
      mismatched.push("dosageForm");
    }
  }

  if (mismatched.length > 0) {
    return { outcome: "no-match", reason: "field-conflict", mismatchedFields: mismatched };
  }
  if (points < THRESHOLD_POINTS) {
    return { outcome: "no-match", reason: "below-threshold" };
  }

  return {
    outcome: "candidate",
    score: points / 100,
    candidateRecordId: record.id,
    matchedFields: matched,
    mismatchedFields: mismatched,
    display: candidateDisplayFor(record),
  };
}

/** Turns any label input mode into an extraction the matcher understands. */
export function extractionFromInput(input: LabelInput): LabelExtraction {
  if (input.mode === "demo") return extractionForDemoAsset(input.demoAssetId);
  // Images are read server-side (/api/label/analyze); there is no local extraction for them.
  if (input.mode === "image") return { status: "unreadable", extracted: {} };
  return {
    status: "readable",
    extracted: {
      patientName: input.patientName,
      medicineName: input.medicineName,
      strength: input.strength,
      dosageForm: input.dosageForm,
    },
  };
}

export function matchLabelInput(input: LabelInput): MatchResult {
  return matchLabel(extractionFromInput(input));
}
