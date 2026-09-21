import { describe, expect, it } from "vitest";
import { buildTimeline, deriveRecordStatus } from "@/lib/session/audit-view";
import { toExplain } from "@/test/helpers";
import { metforminRecord } from "./demo-record";
import { resolveExplanation } from "./explanation";
import { copy, t } from "./translations";

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

  it("labels every unimplemented human action as a demo", () => {
    for (const lang of ["en", "zh-Hans"] as const) {
      for (const key of ["checkPharmacy", "contactClinic", "askHelper", "emergencyDemo"] as const) {
        expect(copy[lang][key]).toMatch(/demo|示范/i);
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
