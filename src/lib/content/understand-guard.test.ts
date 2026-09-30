import { describe, expect, it } from "vitest";
import { t } from "@/lib/content/translations";
import { actionsForOffer, isSafeCompanionReply, isUnderstandKey } from "./understand-guard";

describe("isSafeCompanionReply — what a model-written reply may never carry", () => {
  it("accepts a natural, information-free reply", () => {
    for (const reply of [
      "I think you said Metformin — is that right? You can also type the name, or show me the label.",
      "Thanks, Mei Ling. So I can be sure it's the same medicine as your record, would you like to show me the label?",
      "我想确认一下，您是说二甲双胍吗？您也可以在下方输入药名。",
    ]) {
      expect(isSafeCompanionReply(reply)).toBe(true);
    }
  });

  it("rejects any number, strength, dose, timing or food instruction", () => {
    for (const reply of [
      "Metformin 500 mg is on your record.",
      "You take one tablet with each meal.",
      "That one is usually taken twice a day.",
      "It is taken daily, with food.",
      "二甲双胍每天两次。",
    ]) {
      expect(isSafeCompanionReply(reply)).toBe(false);
    }
  });

  it("rejects advice and invented clinical claims", () => {
    for (const reply of [
      "You should stop taking it if you feel unwell.",
      "It may cause stomach upset.",
      "Watch out for side effects.",
    ]) {
      expect(isSafeCompanionReply(reply)).toBe(false);
    }
  });

  it("rejects any claim that a medicine is confirmed — only the label check and the person can do that", () => {
    for (const reply of [
      "Great, that's confirmed as your Metformin.",
      "This is your medicine.",
      "I can see it's Metformin.",
    ]) {
      expect(isSafeCompanionReply(reply)).toBe(false);
    }
  });

  it("rejects blaming words and instructions (companion tone rules)", () => {
    for (const reply of [
      "Sorry, that was the wrong label. Shall we try again?",
      "You should show me the label, okay?",
      "You need to check with your doctor, alright?",
      "Let's skip the medicine today, shall we?",
      "我们必须再试一次，好吗？",
      "您今天可以不要吃，好吗？",
    ]) {
      expect(isSafeCompanionReply(reply)).toBe(false);
    }
    expect(isSafeCompanionReply("Let's take a look at the medicine label together, shall we?")).toBe(true);
  });

  it("with a language, requires that language and a closing question", () => {
    expect(isSafeCompanionReply("没关系，标签没看清楚。我们再试一次好吗？", "zh-Hans")).toBe(true);
    expect(isSafeCompanionReply("Thank you. Shall we try that again?", "en")).toBe(true);
    expect(isSafeCompanionReply("Thank you. Shall we try that again?", "zh-Hans")).toBe(false);
    expect(isSafeCompanionReply("我们再试一次好吗？", "en")).toBe(false);
    expect(isSafeCompanionReply("Thank you, let's try once more.", "en")).toBe(false);
  });

  it("rejects markup, links, empty and over-long replies", () => {
    expect(isSafeCompanionReply("**Hello** there")).toBe(false);
    expect(isSafeCompanionReply("See https://example.com")).toBe(false);
    expect(isSafeCompanionReply("   ")).toBe(false);
    expect(isSafeCompanionReply("Hello. ".repeat(60))).toBe(false);
  });
});

describe("understanding scope", () => {
  it("covers ordinary in-call replies, never safety, help, consent or limitation lines", () => {
    expect(isUnderstandKey("clarificationPrompt")).toBe(true);
    expect(isUnderstandKey("medicineNameCheck")).toBe(true);
    for (const key of ["urgentHeading", "safetyHeading", "reasonHelp", "cameraPermissionBody", "offTopicCapability", "callGreeting"] as const) {
      expect(isUnderstandKey(key)).toBe(false);
    }
  });

  it("offers only the two in-call doors", () => {
    expect(actionsForOffer("show-medicine")).toEqual(["show-medicine"]);
    expect(actionsForOffer("show-medicine-or-schedule")).toEqual(["show-medicine", "ask-schedule"]);
    expect(actionsForOffer("none")).toEqual([]);
  });

  it("the approved fallback lines exist in both languages", () => {
    for (const key of ["medicineNameCheck", "medicineNameRetry", "medicineMentioned"] as const) {
      expect(t("en", key).length).toBeGreaterThan(0);
      expect(t("zh-Hans", key).length).toBeGreaterThan(0);
    }
  });
});
