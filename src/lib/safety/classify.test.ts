import { describe, expect, it } from "vitest";
import { classifySafety } from "./classify";
import { buildEscalation } from "./escalation";

describe("safety classifier", () => {
  it.each([
    "I have severe chest pain",
    "I am having trouble breathing",
    "I can't breathe",
    "I nearly fainted this morning",
    "I think I took an overdose",
    "my grandson swallowed poison",
    "I had a severe allergic reaction",
    "there is swelling in my face",
    "I want to die",
    "I feel suicidal",
    "我胸痛",
    "我呼吸困难",
    "我想自杀",
  ])("urgent-risk: %s", (text) => {
    expect(classifySafety(text)).toEqual({ level: "urgent", reason: "urgent-risk" });
  });

  it.each([
    "Should I stop taking it?",
    "should I double the dose",
    "I missed a dose, what now?",
    "Can I take this with paracetamol?",
    "Is this safe if I am pregnant?",
    "Is this dangerous?",
    "Can you diagnose me?",
    "我漏服了一次怎么办",
    "我可以停药吗",
  ])("unsupported medical question: %s", (text) => {
    expect(classifySafety(text).level).toBe("unsupported");
  });

  it("flags side-effect questions as adverse-effect", () => {
    expect(classifySafety("What are the side effects?")).toEqual({
      level: "unsupported",
      reason: "adverse-effect-question",
    });
  });

  it("urgent language always wins over an unsupported match", () => {
    expect(classifySafety("I missed a dose and now I have chest pain").level).toBe("urgent");
  });

  it.each(["What is this for?", "When do I take it?", "Hello", "", "show me the label"])(
    "ordinary message is not flagged: %j",
    (text) => {
      expect(classifySafety(text)).toEqual({ level: "none" });
    },
  );
});

describe("escalation view", () => {
  it("normal uncertainty offers only labelled demo human actions (plus try-again after a label route)", () => {
    const view = buildEscalation("record-mismatch", true);
    expect(view.urgent).toBe(false);
    expect(view.actions.map((a) => a.id)).toEqual([
      "try-again",
      "pharmacy-demo",
      "trusted-helper-demo",
      "clinic-demo",
    ]);
    // No action other than "try again" pretends to be implemented.
    expect(view.actions.filter((a) => a.implemented).map((a) => a.id)).toEqual(["try-again"]);
  });

  it("does not offer 'Try another photo' before the label route was chosen or for non-label reasons", () => {
    expect(buildEscalation("record-mismatch", false).actions.map((a) => a.id)).not.toContain("try-again");
    expect(buildEscalation("unsupported-medical-question", true).actions.map((a) => a.id)).not.toContain(
      "try-again",
    );
  });

  it.each(["unreadable-label", "record-mismatch", "multiple-candidates", "user-unsure"] as const)(
    "label outcome %s uses the gentler, no-fault copy",
    (reason) => {
      const view = buildEscalation(reason, true);
      expect(view.headingKey).toBe("labelSafetyHeading");
      expect(view.bodyKey).toBe("labelSafetyBody");
    },
  );

  it.each(["service-failure", "unsupported-medical-question", "help-requested"] as const)(
    "%s keeps its original copy",
    (reason) => {
      const view = buildEscalation(reason, true);
      expect(view.headingKey).toBe("safetyHeading");
      expect(view.bodyKey).toBe("safetyBody");
    },
  );

  it("urgent escalation is flagged, has no try-again, and no implemented (real) actions", () => {
    const view = buildEscalation("urgent-risk", true);
    expect(view.urgent).toBe(true);
    expect(view.headingKey).toBe("urgentHeading");
    expect(view.actions.some((a) => a.id === "try-again")).toBe(false);
    expect(view.actions.every((a) => !a.implemented)).toBe(true);
  });
});

describe("dose changes are caught however they're phrased", () => {
  it.each([
    "Can I double my dose?",
    "Can I skip my tablet today?",
    "Should I take an extra pill?",
    "I forgot to take my medicine",
    "Does it interact with my other pills?",
    "Can I drink alcohol with it?",
    "My doctor said I can stop it",
    "I want to stop taking my medicine",
    "我可以吃双倍吗？",
  ])("%s → unsupported (safety, no model)", (text) => {
    expect(classifySafety(text)).toEqual({ level: "unsupported", reason: "unsupported-medical-question" });
  });

  it.each([
    "What is this for? When do I take it?",
    "When do I take it?",
    "Can I change the language?",
    "Can you repeat that more slowly?",
    "Can we stop the call now?",
    "I want to show my medicine",
    "What is my medicine schedule?",
  ])("%s → not a safety trigger", (text) => {
    expect(classifySafety(text)).toEqual({ level: "none" });
  });
});
