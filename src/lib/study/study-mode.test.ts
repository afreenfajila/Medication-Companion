import { describe, expect, it } from "vitest";
import { resolveExplanation } from "@/lib/content/explanation";
import { toConfirmMatch, toExplain, run, startCall } from "@/test/helpers";
import { isStudyModeEnabled, parseStudyCondition } from "./study-mode";

describe("study mode switch", () => {
  it("is off in production even when STUDY_MODE=true", () => {
    expect(isStudyModeEnabled({ STUDY_MODE: "true", VERCEL_ENV: "production" })).toBe(false);
  });

  it("is on only when explicitly enabled, locally or on preview", () => {
    expect(isStudyModeEnabled({ STUDY_MODE: "true" })).toBe(true);
    expect(isStudyModeEnabled({ STUDY_MODE: "true", VERCEL_ENV: "preview" })).toBe(true);
    expect(isStudyModeEnabled({})).toBe(false);
    expect(isStudyModeEnabled({ STUDY_MODE: "1", VERCEL_ENV: "preview" })).toBe(false);
  });

  it("accepts only the two known conditions", () => {
    expect(parseStudyCondition("control")).toBe("control");
    expect(parseStudyCondition("wrong-explanation")).toBe("wrong-explanation");
    expect(parseStudyCondition("explain")).toBeNull();
    expect(parseStudyCondition(undefined)).toBeNull();
  });
});

describe("wrong-explanation condition", () => {
  it("swaps only the instruction, and only after the same confirmation gate", () => {
    const view = resolveExplanation(toExplain(), "en", "wrong-explanation")!;
    expect(view.explanation.instruction).toBe("Take 1 tablet once daily at bedtime.");
    expect(view.explanation.purpose).toBe("Metformin helps manage blood sugar.");
    expect(resolveExplanation(toConfirmMatch(), "en", "wrong-explanation")).toBeNull();
    expect(resolveExplanation(toExplain(), "en", "control")!.explanation.instruction).toBe(
      "Take 1 tablet twice daily with meals.",
    );
  });

  it("every audit event is tagged with the condition, and the tag survives ending the call", () => {
    const s = run([{ type: "SET_STUDY_CONDITION", condition: "wrong-explanation" }, startCall, { type: "END_CALL" }]);
    expect(s.studyCondition).toBe("wrong-explanation");
    expect(s.audit.length).toBeGreaterThan(0);
    expect(s.audit.every((e) => e.details.studyCondition === "wrong-explanation")).toBe(true);
    expect(run([startCall]).audit.every((e) => !("studyCondition" in e.details))).toBe(true);
  });
});
