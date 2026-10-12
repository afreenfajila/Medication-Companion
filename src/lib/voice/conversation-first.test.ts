import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@/lib/session/state-machine";
import { interpretUtterance, spokenActions, type CommandContext } from "./commands";
import { sentencePieces, splitSentences } from "./sentences";

const base: CommandContext = {
  state: "listening",
  contextualActions: [],
  candidateId: "cand_med_metformin_500_demo",
  explainStep: 0,
  cameraLive: false,
  pendingSpokenMedicineName: null,
};
const safety: CommandContext = { ...base, state: "safety", safetyReason: "label-differs", labelRouteSelected: true, canRetryLabel: false };
const eventOf = (text: string, ctx: CommandContext) => {
  const r = interpretUtterance(text, ctx);
  return r.kind === "event" ? r.event : r.kind;
};

describe("the help screen understands its own options in words", () => {
  it("'ask the pharmacist to call me back' opens the pharmacist callback (its consent step)", () => {
    expect(eventOf("can you ask the pharmacist to call me back", safety)).toEqual({ type: "HELP_START", kind: "pharmacist-callback" });
    expect(eventOf("I want to talk to a pharmacist", safety)).toEqual({ type: "HELP_START", kind: "pharmacist-callback" });
    expect(eventOf("let my family know", safety)).toEqual({ type: "HELP_START", kind: "family" });
    expect(eventOf("call my clinic", safety)).toEqual({ type: "HELP_START", kind: "clinic" });
  });
});

describe("gate answers in natural sentences — but a question is never a yes", () => {
  const consent = { ...safety, helpStage: "confirm" as const };
  it("consent", () => {
    expect(eventOf("yes please ask them to call me back", consent)).toEqual({ type: "HELP_CONFIRM", granted: true });
    expect(eventOf("is that okay?", consent)).toBe("unclear");
    expect(eventOf("not now thanks", consent)).toEqual({ type: "HELP_CONFIRM", granted: false });
    // "please" alone reads as yes — "please don't" must not.
    expect(eventOf("please don't", consent)).toEqual({ type: "HELP_CONFIRM", granted: false });
    expect(eventOf("yes, actually do not send it", consent)).toEqual({ type: "HELP_CONFIRM", granted: false });
  });
});

describe("the reviewed callback summary: cancelled or sent in words, only by an explicit 'send'", () => {
  const review = (status: "reviewing" | "failed" | "unknown"): CommandContext => ({
    ...base,
    state: "explain",
    doseCheck: { step: "compared", callback: { status, revision: 3 } } as unknown as CommandContext["doseCheck"],
  });
  it("'don't send' cancels; a question does nothing", () => {
    expect(eventOf("don't send it", review("reviewing"))).toEqual({ type: "DOSE", action: { kind: "dont-send" } });
    expect(eventOf("should I send it?", review("reviewing"))).toBe("unclear");
    // After an unknown outcome the request can't be cancelled in words either.
    expect(eventOf("don't send it", review("unknown"))).toBe("unclear");
  });
  it("an explicit 'send' (said or typed) sends exactly the reviewed revision (owner decision, 12 October 2026)", () => {
    for (const status of ["reviewing", "failed", "unknown"] as const) {
      for (const words of ["send", "send it", "yes, send it", "submit it", "send the request", "send it again", "发送", "提交"]) {
        expect(eventOf(words, review(status)), `${words} / ${status}`).toEqual({ type: "DOSE", action: { kind: "send", revision: 3 } });
      }
    }
    // "Try again" after a failure re-sends the same request.
    expect(eventOf("try again", review("failed"))).toEqual({ type: "DOSE", action: { kind: "send", revision: 3 } });
  });

  it("nothing else sends: a plain yes asks for 'send'; questions, hedges, negatives and long sentences don't send", () => {
    expect(interpretUtterance("yes", review("reviewing"))).toEqual({ kind: "reply", key: "helpSayToSend" });
    for (const words of [
      "should I send it?",
      "can you send it",
      "maybe send it",
      "don't send it yet",
      "I was going to send my daughter a message about the weather later today",
    ]) {
      const r = eventOf(words, review("reviewing"));
      expect(typeof r === "object" && r.type === "DOSE" && r.action.kind === "send", words).toBe(false);
    }
  });

  it("the AI meaning-match is never offered 'send'", () => {
    for (const status of ["reviewing", "failed", "unknown"] as const) {
      expect(spokenActions(review(status)).some((a) => a.event.type === "DOSE" && a.event.action.kind === "send")).toBe(false);
    }
  });
});

describe("what the AI meaning-match may choose: never a yes to a gate", () => {
  const isGateYes = (e: SessionEvent) =>
    (e.type === "HELP_CONFIRM" && e.granted) ||
    (e.type === "CONFIRM_MATCH" && e.decision === "confirmed") ||
    (e.type === "CAMERA_CONSENT" && e.granted) ||
    (e.type === "LABEL_CHECK" && e.matches) ||
    (e.type === "DOSE" && (e.action.kind === "confirm-label" || e.action.kind === "send" || e.action.kind === "enter-label"));
  const dose = (d: object): CommandContext => ({ ...base, state: "explain", doseCheck: d as CommandContext["doseCheck"] });
  const contexts: CommandContext[] = [
    safety,
    { ...safety, helpStage: "confirm" },
    { ...safety, helpStage: "failed" },
    { ...base, state: "confirm-match" },
    { ...base, state: "camera-permission", showMethod: "camera" },
    { ...base, state: "camera-permission", showMethod: "choose" },
    { ...base, state: "explain", explainStep: 1 },
    { ...base, state: "explain", explainStep: 2 },
    { ...base, state: "explain", recordConflict: true },
    dose({ step: "label", reading: "x", callback: null, offer: false }),
    dose({ step: "compared", comparison: { outcome: "conflict", differing: ["amount"] }, callback: null, offer: false }),
    dose({ step: "compared", callback: null, offer: true }),
    dose({ step: "compared", callback: { status: "reviewing", revision: 1 } }),
    dose({ step: "compared", callback: { status: "failed", revision: 1 } }),
    dose({ step: "compared", callback: { status: "unknown", revision: 1 } }),
    { ...base, state: "complete" },
  ];
  it.each(contexts.map((c, i) => [i, c] as const))("context %i", (_i, ctx) => {
    const actions = spokenActions(ctx);
    for (const a of actions) expect(isGateYes(a.event), a.id).toBe(false);
    expect(new Set(actions.map((a) => a.id)).size).toBe(actions.length); // ids are unique
  });
  it("the help screen offers its own options, and urgent guidance offers none", () => {
    expect(spokenActions(safety).map((a) => a.id)).toEqual(expect.arrayContaining(["pharmacist-callback", "clinic", "family", "back"]));
    expect(spokenActions({ ...safety, safetyReason: "urgent-risk" })).toEqual([]);
  });
});

describe("sentence splitting for the voice", () => {
  it("splits after sentence ends, keeps decimals and closing quotes, merges tiny pieces", () => {
    expect(sentencePieces("Your record says: “Take 1.5 tablets.” What does the label say? OK.")).toEqual([
      "Your record says: “Take 1.5 tablets.”",
      "What does the label say?",
      "OK.",
    ]);
    // Pieces under 25 characters ride along with a neighbour (fewer voice requests).
    expect(splitSentences("These instructions differ from each other. I cannot confirm which one to follow. OK?")).toEqual([
      "These instructions differ from each other.",
      "I cannot confirm which one to follow. OK?",
    ]);
    expect(sentencePieces("您好。这个药是做什么用的？")).toEqual(["您好。", "这个药是做什么用的？"]);
  });
});
