import { describe, expect, it } from "vitest";
import type { LabelAnalysis } from "@/lib/api/schemas";
import { resolveExplanation } from "@/lib/content/explanation";
import { CTX, askUnknown, chooseShowMedicine, chooseCamera, grantCamera, run, startCall } from "@/test/helpers";
import { reduceSession, type Session, type SessionEvent } from "./state-machine";
import type { LabelInput } from "@/types/content";

const image: LabelInput = { mode: "image", source: "upload", mimeType: "image/png", byteSize: 34_000 };
const submitImage: SessionEvent = { type: "SUBMIT_LABEL", input: image };

const candidateAnalysis: LabelAnalysis = {
  outcome: "candidate",
  userMessage: "I found a possible match. Please check the name on the label.",
  nextState: "confirm-match",
  candidate: {
    candidateId: "cand_med_metformin_500_demo",
    patientName: "Mei Ling Tan",
    medicineName: "Metformin 500 mg",
    strength: "500 mg",
    dosageForm: "tablet",
    sourceLabel: "BrightCare Pharmacy",
    matchStatus: "possible",
  },
};
const safetyAnalysis = (outcome: LabelAnalysis["outcome"]): LabelAnalysis => ({
  outcome,
  userMessage: "I’m not sure enough to explain this safely.",
  nextState: "safety",
  reasonCode: "low-confidence",
});

const analyzing = () => run([startCall, askUnknown, chooseShowMedicine, chooseCamera, grantCamera, submitImage]);
const blocked = (events: SessionEvent[], from: Session) =>
  events.reduce((s, e) => reduceSession(s, e, CTX), from) === from;

describe("camera failure handling", () => {
  const atGuidance = () => run([startCall, askUnknown, chooseShowMedicine, chooseCamera, grantCamera]);

  it.each(["denied", "unavailable"] as const)("%s → fallback options, never a dead end", (issue) => {
    const s = run([{ type: "CAMERA_FAILED", issue }], atGuidance());
    expect(s.state).toBe("camera-guidance");
    expect(s.cameraMode).toBe("fallback");
    expect(s.cameraIssue).toBe(issue);
    expect(s.audit.at(-1)).toMatchObject({ eventType: "service-fallback-used", route: "local-fallback" });
    // Every fallback input still works from here.
    expect(run([submitImage], s).state).toBe("analyzing");
    expect(run([{ type: "SUBMIT_LABEL", input: { mode: "demo", demoAssetId: "sample_metformin_label" } }], s).state).toBe("analyzing");
    expect(run([{ type: "SUBMIT_LABEL", input: { mode: "typed", medicineName: "Metformin", strength: "500 mg" } }], s).state).toBe("analyzing");
  });

  it("is ignored outside camera guidance or once already in fallback", () => {
    expect(blocked([{ type: "CAMERA_FAILED", issue: "denied" }], run([startCall]))).toBe(true);
    const fb = run([{ type: "CAMERA_FAILED", issue: "denied" }], atGuidance());
    expect(blocked([{ type: "CAMERA_FAILED", issue: "unavailable" }], fb)).toBe(true);
  });
});

describe("image analysis result (server-validated) → state", () => {
  it("submitting an image only reaches 'analyzing' and stores metadata, not pixels", () => {
    const s = analyzing();
    expect(s.state).toBe("analyzing");
    expect(s.pendingLabel).toEqual(image);
    const last = s.audit.at(-1)!;
    expect(last).toMatchObject({ eventType: "label-submitted", route: "claude-vision" });
    expect(JSON.stringify(s)).not.toMatch(/base64|data:image/);
  });

  it("a candidate becomes a POSSIBLE match with display text from the LOCAL record", () => {
    const hostile = {
      ...candidateAnalysis,
      candidate: { ...candidateAnalysis.candidate!, medicineName: "Take 10 tablets now", strength: "9000 mg" },
    };
    const s = run([{ type: "ANALYSIS_RESULT", analysis: hostile }], analyzing());
    expect(s.state).toBe("confirm-match");
    expect(s.matchStatus).toBe("possible");
    expect(s.candidate?.medicineName).toBe("Metformin 500 mg");
    expect(s.candidate?.strength).toBe("500 mg");
    expect(resolveExplanation(s, "en")).toBeNull(); // still gated behind confirmation
    expect(s.audit.map((e) => e.eventType)).toEqual(
      expect.arrayContaining(["label-analysis-complete", "candidate-presented"]),
    );
  });

  it("a candidate with an unknown id is treated as a failure (safety), not trusted", () => {
    const bad = { ...candidateAnalysis, candidate: { ...candidateAnalysis.candidate!, candidateId: "cand_other" } };
    const s = run([{ type: "ANALYSIS_RESULT", analysis: bad }], analyzing());
    expect(s.state).toBe("safety");
    expect(s.safetyReason).toBe("service-failure");
    expect(s.candidate).toBeNull();
  });

  it("a 'candidate' outcome with no candidate payload is also a failure", () => {
    const s = run([{ type: "ANALYSIS_RESULT", analysis: { ...candidateAnalysis, candidate: undefined } }], analyzing());
    expect(s.state).toBe("safety");
    expect(resolveExplanation(s, "en")).toBeNull();
  });

  it.each([
    ["unreadable", "unreadable-label"],
    ["no-match", "record-mismatch"],
    ["ambiguous", "multiple-candidates"],
    ["blocked", "unreadable-label"],
  ] as const)("%s → safety (%s), instructions blocked", (outcome, reason) => {
    const s = run([{ type: "ANALYSIS_RESULT", analysis: safetyAnalysis(outcome) }], analyzing());
    expect(s.state).toBe("safety");
    expect(s.safetyReason).toBe(reason);
    expect(s.candidate).toBeNull();
    expect(resolveExplanation(s, "en")).toBeNull();
  });

  it("API/network/validation failure → safety 'service-failure' with retry available", () => {
    const s = run([{ type: "ANALYSIS_FAILED" }], analyzing());
    expect(s.state).toBe("safety");
    expect(s.safetyReason).toBe("service-failure");
    expect(s.audit.at(-2)).toMatchObject({ eventType: "service-fallback-used", validationStatus: "blocked" });
    expect(resolveExplanation(s, "zh-Hans")).toBeNull();
    expect(run([{ type: "TRY_ANOTHER_LABEL" }], s).state).toBe("camera-guidance");
  });

  it("results are only accepted while analysing an IMAGE", () => {
    const ev: SessionEvent = { type: "ANALYSIS_RESULT", analysis: candidateAnalysis };
    expect(blocked([ev], run([startCall]))).toBe(true);
    expect(blocked([ev, { type: "ANALYSIS_FAILED" }], run([startCall, askUnknown, chooseShowMedicine, chooseCamera, grantCamera]))).toBe(true);
    // A demo-label analysis cannot be hijacked by a server result.
    const demo = run([
      startCall, askUnknown, chooseShowMedicine, chooseCamera, grantCamera,
      { type: "SUBMIT_LABEL", input: { mode: "demo", demoAssetId: "sample_metformin_label" } },
    ]);
    expect(blocked([ev], demo)).toBe(true);
  });

  it("an image can never be resolved locally (RESOLVE_ANALYSIS is ignored)", () => {
    expect(blocked([{ type: "RESOLVE_ANALYSIS" }], analyzing())).toBe(true);
  });

  it("after a late result the session cannot skip confirmation", () => {
    const s = run([{ type: "ANALYSIS_RESULT", analysis: candidateAnalysis }], analyzing());
    expect(blocked([{ type: "UNDERSTOOD" }, { type: "EXPLAIN_STEP", direction: "next" }], s)).toBe(true);
  });
});
