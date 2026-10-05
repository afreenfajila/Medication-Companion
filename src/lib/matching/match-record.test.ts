import { describe, expect, it } from "vitest";
import { demoFixtures, extractionForDemoAsset } from "@/lib/content/fixtures";
import { matchLabel, matchLabelInput } from "./match-record";
import { normalizeForm, normalizeStrength, normalizeText } from "./normalize";

const readable = (extracted: Parameters<typeof matchLabel>[0]["extracted"]) =>
  matchLabel({ status: "readable", extracted });

describe("normalisation", () => {
  it("normalises text, strength and form", () => {
    expect(normalizeText("  METFORMIN, HCl. ")).toBe("metformin hcl");
    expect(normalizeStrength("500MG")).toBe("500mg");
    expect(normalizeStrength("500 Mg.")).toBe("500mg");
    expect(normalizeStrength("0.5 g")).toBe("0.5g");
    expect(normalizeForm("Tablets")).toBe("tablet");
  });
});

describe("deterministic matching", () => {
  it("matchingLabel fixture → candidate", () => {
    const result = matchLabel(extractionForDemoAsset("sample_metformin_label"));
    expect(result.outcome).toBe(demoFixtures.matchingLabel.expectedOutcome);
    if (result.outcome !== "candidate") throw new Error("expected candidate");
    expect(result.score).toBe(1);
    expect(result.candidateRecordId).toBe("med_metformin_500_demo");
    expect(result.mismatchedFields).toEqual([]);
  });

  it("only ever returns a `possible` candidate, never a confirmed one", () => {
    const result = matchLabelInput({ mode: "demo", demoAssetId: "sample_metformin_label" });
    if (result.outcome !== "candidate") throw new Error("expected candidate");
    expect(result.display.status).toBe("possible");
    expect(result.display.recordSource).toBe("BrightCare Pharmacy");
  });

  it("unreadableLabel fixture → unreadable", () => {
    expect(matchLabel(extractionForDemoAsset("sample_unreadable_label")).outcome).toBe(
      demoFixtures.unreadableLabel.expectedOutcome,
    );
  });

  it("mismatchLabel fixture (Amoxicillin) → no-match", () => {
    expect(matchLabel(extractionForDemoAsset("sample_mismatch_label")).outcome).toBe(
      demoFixtures.mismatchLabel.expectedOutcome,
    );
  });

  it("requires BOTH medicine name and strength", () => {
    expect(readable({ medicineName: "Metformin" }).outcome).toBe("unreadable");
    expect(readable({ strength: "500 mg" }).outcome).toBe("unreadable");
    expect(readable({ patientName: "Mei Ling Tan", dosageForm: "tablet" }).outcome).toBe("unreadable");
    expect(readable({}).outcome).toBe("unreadable");
  });

  it("a conflicting strength is a no-match, not a lower-scored candidate", () => {
    const r = readable({ medicineName: "Metformin", strength: "250 mg" });
    expect(r.outcome).toBe("no-match");
    expect(r).toMatchObject({ mismatchedFields: ["strength"] });
  });

  it("a conflicting medicine name is a no-match", () => {
    expect(readable({ medicineName: "Glipizide", strength: "500 mg" }).outcome).toBe("no-match");
  });

  it("treats a conflicting patient name or dosage form as no-match (never rounds up)", () => {
    expect(
      readable({ patientName: "John Lim", medicineName: "Metformin", strength: "500 mg" }).outcome,
    ).toBe("no-match");
    expect(
      readable({ medicineName: "Metformin", strength: "500 mg", dosageForm: "capsule" }).outcome,
    ).toBe("no-match");
  });

  it("accepts label aliases, case and punctuation differences", () => {
    for (const medicineName of ["METFORMIN", "Metformin HCL", "metformin 500mg", "Metformin."]) {
      expect(readable({ medicineName, strength: "500MG" }).outcome).toBe("candidate");
    }
    expect(
      readable({ patientName: "TAN, MEI LING", medicineName: "Metformin", strength: "500 mg" }).outcome,
    ).toBe("candidate");
  });

  it("scores required fields at the 0.80 threshold and optional fields on top", () => {
    const base = readable({ medicineName: "Metformin", strength: "500 mg" });
    if (base.outcome !== "candidate") throw new Error("expected candidate");
    expect(base.score).toBe(0.8);
    const full = readable({
      patientName: "Mei Ling Tan",
      medicineName: "Metformin",
      strength: "500 mg",
      dosageForm: "Tablets",
    });
    if (full.outcome !== "candidate") throw new Error("expected candidate");
    expect(full.score).toBe(1);
  });

  it("routes extractor uncertainty to unreadable/ambiguous — never rounds up", () => {
    const good = { medicineName: "Metformin", strength: "500 mg" };
    expect(matchLabel({ status: "ambiguous", extracted: good }).outcome).toBe("ambiguous");
    expect(matchLabel({ status: "unreadable", extracted: good }).outcome).toBe("unreadable");
  });

  it("supports the typed-label input mode through the same matcher", () => {
    expect(
      matchLabelInput({ mode: "typed", medicineName: "metformin", strength: "500mg" }).outcome,
    ).toBe("candidate");
    expect(
      matchLabelInput({ mode: "typed", medicineName: "metformin", strength: "850mg" }).outcome,
    ).toBe("no-match");
  });
});
