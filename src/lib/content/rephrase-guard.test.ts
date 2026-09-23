import { describe, expect, it } from "vitest";
import {
  applyValidatedRephrase,
  introducesNewNumbers,
  introducesUnsafeLanguage,
  isSafeRephrase,
  preservesKeyTerms,
  REPHRASE_FIELDS,
  type RephraseFieldSet,
} from "./rephrase-guard";

const canonical: RephraseFieldSet = {
  title: "Here is what your record says.",
  purpose: "Metformin helps manage blood sugar.",
  instructionIntro: "Your current demo pharmacy record says:",
  caution: "I can explain this record, but I cannot change your medicine instructions.",
  confirmationPrompt: "Would you like me to repeat that or help you contact a pharmacist?",
};

describe("preservesKeyTerms", () => {
  it("accepts a natural paraphrase that keeps the key topic words", () => {
    expect(
      preservesKeyTerms(
        "Metformin helps manage blood sugar.",
        "Your medicine, Metformin, helps keep your blood sugar steady.",
      ),
    ).toBe(true);
  });

  it("rejects a rephrase that drops the topic entirely", () => {
    expect(preservesKeyTerms("Metformin helps manage blood sugar.", "This is a nice day.")).toBe(false);
  });

  it("tolerates simple stemming differences (helps/help, medicine/medicines)", () => {
    expect(preservesKeyTerms("Metformin helps manage blood sugar.", "Metformin can help manage your blood sugars.")).toBe(true);
  });
});

describe("introducesNewNumbers", () => {
  it("passes when no numbers are introduced", () => {
    expect(introducesNewNumbers("Take 1 tablet twice daily.", "Please take 1 tablet, twice each day.")).toBe(false);
  });
  it("rejects a hallucinated dose count", () => {
    expect(introducesNewNumbers("Take 1 tablet twice daily.", "Take 2 tablets twice daily.")).toBe(true);
  });
  it("rejects any new number even in an otherwise number-free sentence", () => {
    expect(introducesNewNumbers("Metformin helps manage blood sugar.", "Take this 3 times a day.")).toBe(true);
  });
});

describe("introducesUnsafeLanguage", () => {
  it("flags phrasing that resembles unsupported medical advice", () => {
    expect(introducesUnsafeLanguage("You should stop taking this if you feel unwell.")).toBe(true);
    expect(introducesUnsafeLanguage("This may cause a side effect.")).toBe(true);
  });
  it("does not flag the ordinary approved wording", () => {
    expect(introducesUnsafeLanguage("Metformin helps manage blood sugar.")).toBe(false);
    expect(introducesUnsafeLanguage("I can explain this record, but I cannot change your medicine instructions.")).toBe(false);
  });
});

describe("isSafeRephrase — the combined gate", () => {
  it("accepts a good-faith natural rephrase", () => {
    expect(isSafeRephrase(canonical.purpose, "Your record says Metformin helps manage your blood sugar.")).toBe(
      true,
    );
  });

  it.each([
    ["empty string", ""],
    ["whitespace only", "   "],
    ["wildly truncated", "Metformin."],
    ["wildly longer (likely rambling/off-topic)", "Metformin ".repeat(40)],
    ["off-topic (no shared terms)", "The weather today is lovely and sunny."],
    ["invented side-effect claim", "Metformin helps manage blood sugar, but it may cause dizziness."],
    ["invented dosing number", "Metformin 500 helps manage blood sugar."],
  ])("rejects: %s", (_name, candidate) => {
    expect(isSafeRephrase(canonical.purpose, candidate)).toBe(false);
  });
});

describe("applyValidatedRephrase — per-field fallback", () => {
  it("returns the canonical set unchanged when there is no candidate", () => {
    expect(applyValidatedRephrase(canonical, null)).toEqual(canonical);
  });

  it("applies only the fields that pass validation, keeping the rest exact", () => {
    const candidate = {
      title: "Here's what your pharmacy record shows.",
      purpose: "Metformin helps manage blood sugar, but it may cause dizziness.", // unsafe → rejected
      // instructionIntro omitted entirely → falls back
      caution: "I'm glad to explain this record, but I am not able to change your medicine instructions.",
      confirmationPrompt: "The weather is nice today.", // off-topic → rejected
    };
    const result = applyValidatedRephrase(canonical, candidate);
    expect(result.title).toBe(candidate.title);
    expect(result.purpose).toBe(canonical.purpose); // rejected: kept exact
    expect(result.instructionIntro).toBe(canonical.instructionIntro); // missing: kept exact
    expect(result.caution).toBe(candidate.caution);
    expect(result.confirmationPrompt).toBe(canonical.confirmationPrompt); // rejected: kept exact
  });

  it("never introduces a field outside REPHRASE_FIELDS", () => {
    const result = applyValidatedRephrase(canonical, { title: "Fine." } as never);
    expect(Object.keys(result).sort()).toEqual([...REPHRASE_FIELDS].sort());
  });

  it("ignores a non-string value for a field", () => {
    const result = applyValidatedRephrase(canonical, { title: 12345 } as never);
    expect(result.title).toBe(canonical.title);
  });
});
