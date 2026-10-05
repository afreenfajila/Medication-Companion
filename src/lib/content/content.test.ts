import { describe, expect, it } from "vitest";
import { buildTimeline, deriveRecordStatus } from "@/lib/session/audit-view";
import { toExplain } from "@/test/helpers";
import { metforminRecord } from "./seed-record";
import { resolveExplanation } from "./explanation";
import { helpLine } from "./help-lines";
import { copy, t } from "./translations";
import { usesBlameWords } from "./understand-guard";

describe("explanation data resolver", () => {
  const candidate = toExplain().candidate!;

  it("returns null unless the match is confirmed", () => {
    for (const matchStatus of ["possible", "denied", "unsure", "no-match", "ambiguous", "unreadable", null] as const) {
      expect(resolveExplanation({ matchStatus, candidate }, "en")).toBeNull();
    }
    expect(resolveExplanation({ matchStatus: "confirmed", candidate: null }, "en")).toBeNull();
  });

  it("rejects a confirmed status attached to a foreign candidate", () => {
    expect(
      resolveExplanation({ matchStatus: "confirmed", candidate: { ...candidate, candidateId: "cand_other" } }, "en"),
    ).toBeNull();
  });

  it("resolves English and Simplified Chinese strictly from the local record", () => {
    const en = resolveExplanation({ matchStatus: "confirmed", candidate }, "en")!;
    const zh = resolveExplanation({ matchStatus: "confirmed", candidate }, "zh-Hans")!;
    expect(en.explanation.purpose).toBe(metforminRecord.explanation.purpose.en);
    expect(en.medicine.whatItIsFor).toBe("Helps manage blood sugar");
    expect(en.explanation.caution).toBe("I can explain this record, but I cannot change your medicine instructions.");
    expect(zh.explanation.instruction).toBe(metforminRecord.explanation.instruction["zh-Hans"]);
    expect(zh.explanation.sourceLine).toContain("示范记录");
    expect(en.recordSource).toBe("BrightCare Pharmacy — demo record");
  });
});

describe("copy catalogue", () => {
  it("Chinese has every English key with non-empty text", () => {
    const enKeys = Object.keys(copy.en).sort();
    expect(Object.keys(copy["zh-Hans"]).sort()).toEqual(enKeys);
    for (const key of enKeys) {
      expect(copy["zh-Hans"][key as keyof typeof copy.en].trim().length).toBeGreaterThan(0);
    }
  });

  it("uses the approved wording from the content model", () => {
    expect(t("en", "showLabelQuestion")).toBe(
      "Let’s check this together. Would you like to show me the medicine label?",
    );
    expect(t("en", "clarificationPrompt")).toBe(
      "Would you like to show me a medicine label, or ask about your medicine schedule?",
    );
    expect(t("en", "safetyHeading")).toBe("I’m not sure enough to explain this safely.");
    expect(t("en", "urgentBody")).toBe(
      "Please contact local emergency services or urgent medical care now. If you can, ask someone near you to help.",
    );
    expect(t("zh-Hans", "callWithCompanion")).toBe("呼叫助手");
  });

  it("never uses a blaming or commanding word (tone contract rule 6)", () => {
    for (const lang of ["en", "zh-Hans"] as const) {
      for (const [key, line] of Object.entries(copy[lang])) {
        expect(usesBlameWords(line), `${lang}.${key}`).toBe(false);
      }
    }
    for (const field of Object.values(metforminRecord.explanation)) {
      for (const line of Object.values(field)) expect(usesBlameWords(line!)).toBe(false);
    }
  });

  it("help lines fill names, numbers and references from data, never leaving a placeholder", () => {
    const en = (k: Parameters<typeof t>[1]) => t("en", k);
    const lines = [
      helpLine(en, { kind: "pharmacist-callback", stage: "confirm", reason: "help-requested" }),
      helpLine(en, { kind: "pharmacist-callback", stage: "sent", reason: "help-requested", reference: "BC-123456" }),
      helpLine(en, { kind: "trusted-helper", stage: "confirm", reason: "help-requested" }),
      helpLine(en, { kind: "family", stage: "sent", reason: "wellbeing", contactName: "Daniel" }),
      helpLine(en, { kind: "clinic", stage: "info", reason: "help-requested" }),
      helpLine(en, { kind: "family", stage: "info", reason: "help-requested" }),
    ];
    for (const line of lines) expect(line).not.toMatch(/\{\w+\}/);
    expect(lines[1]).toContain("BC-123456");
    expect(lines[2]).toContain("Mrs Lim");
    expect(lines[3]).toContain("Daniel");
    expect(lines[4]).toContain("Greenhill Family Clinic");
    expect(lines[5]).toContain("BrightCare Pharmacy"); // a failed request offers the pharmacy's own number
  });

  it("no help line places a call: numbers are text, and there is no emergency number", () => {
    for (const lang of ["en", "zh-Hans"] as const) {
      for (const [key, line] of Object.entries(copy[lang])) {
        if (key === "crisisLines") continue; // the existing self-harm text, unchanged until amendment I
        expect(line, key).not.toMatch(/\b(995|999|911|1767)\b|tel:/);
      }
    }
  });
});

describe("caregiver audit view", () => {
  it("falls back to clearly-marked sample events, newest first", () => {
    const timeline = buildTimeline([]);
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline.every((e) => e.origin === "sample")).toBe(true);
    const times = timeline.map((e) => e.timestamp);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("derives Confirmed / Needs help / Pending from the latest status event", () => {
    expect(deriveRecordStatus(buildTimeline(toExplain().audit))).toBe("Confirmed");
    expect(deriveRecordStatus([])).toBe("Pending");
  });
});
