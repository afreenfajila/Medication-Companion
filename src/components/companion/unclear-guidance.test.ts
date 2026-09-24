import { describe, expect, it } from "vitest";
import { t } from "@/lib/content/translations";
import type { CompanionState } from "@/types/content";
import { unclearGuidanceKey } from "./use-conversation";

const at = (state: CompanionState, explainStep: 0 | 1 | 2 = 0) =>
  unclearGuidanceKey({ state, explainStep });

describe("unclearGuidanceKey", () => {
  it("names the step's own choices wherever a specific answer is expected", () => {
    expect(at("camera-permission")).toBe("unclearCameraPermission");
    expect(at("camera-guidance")).toBe("unclearCameraGuidance");
    expect(at("confirm-match")).toBe("unclearConfirmMatch");
    expect(at("safety")).toBe("unclearSafety");
    expect(at("complete")).toBe("unclearComplete");
  });

  it("distinguishes mid-explanation from the final chunk", () => {
    expect(at("explain", 0)).toBe("unclearExplain");
    expect(at("explain", 1)).toBe("unclearExplain");
    // On the last chunk "next" no longer exists, so offering it would misdirect.
    expect(at("explain", 2)).toBe("unclearExplainLast");
  });

  it("keeps the generic line where anything may be said", () => {
    // In the open conversation there is no specific step to name — and free
    // speech there routes through the normal NLU rather than reaching this at all.
    expect(at("listening")).toBe("voiceDidntCatch");
    expect(at("start")).toBe("voiceDidntCatch");
    expect(at("analyzing")).toBe("voiceDidntCatch");
  });

  it("every guidance line acknowledges first and offers a way out, in both languages", () => {
    const states: [CompanionState, 0 | 1 | 2][] = [
      ["camera-permission", 0],
      ["camera-guidance", 0],
      ["confirm-match", 0],
      ["explain", 0],
      ["explain", 2],
      ["safety", 0],
      ["complete", 0],
    ];
    for (const [state, step] of states) {
      const key = at(state, step);
      expect(t("en", key), key).toMatch(/didn’t quite catch that/i);
      expect(t("zh-Hans", key), key).toMatch(/没太听清楚/);
    }
  });

  it("the confirm re-prompt stays neutral — it never nudges toward confirming", () => {
    const line = t("en", at("confirm-match"));
    expect(line).toMatch(/“yes”/);
    expect(line).toMatch(/“no”/);
    expect(line).toMatch(/not sure/i);
  });

  it("no guidance line contains medicine instructions", () => {
    for (const state of [
      "camera-permission",
      "camera-guidance",
      "confirm-match",
      "explain",
      "safety",
      "complete",
    ] as CompanionState[]) {
      for (const lang of ["en", "zh-Hans"] as const) {
        expect(t(lang, at(state))).not.toMatch(/tablet|twice daily|blood sugar|500|片|血糖/i);
      }
    }
  });
});
