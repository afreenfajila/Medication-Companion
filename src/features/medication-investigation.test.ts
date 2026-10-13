import { describe, expect, it } from "vitest";
import { calculateConfidence, determineEscalation, DEMO_SCENARIOS } from "./medication-investigation";

describe("A4 confidence scoring", () => {
  it("demo scenarios score as documented", () => {
    for (const s of Object.values(DEMO_SCENARIOS)) {
      expect(calculateConfidence(s.factors)).toBe(s.expectedConfidence);
    }
  });
  it("only Tier C harm can trigger a family alert", () => {
    const best = { dataQuality: "Level1", evidenceStrength: "A" } as const;
    expect(determineEscalation(calculateConfidence({ ...best, severity: "B" }), "B").action).not.toBe("alert_family");
    expect(determineEscalation(calculateConfidence({ ...best, severity: "C" }), "C").action).toBe("alert_family");
  });
});

describe("A4 pause condition", () => {
  it("Tier C alerts family even with weak data and evidence", () => {
    const weak = { dataQuality: "Level3", evidenceStrength: "C", severity: "C" } as const;
    expect(calculateConfidence(weak)).toBe(60);
    expect(determineEscalation(calculateConfidence(weak), "C").action).toBe("alert_family");
  });
});
