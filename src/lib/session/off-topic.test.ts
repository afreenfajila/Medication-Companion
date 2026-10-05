import { describe, expect, it } from "vitest";
import { t } from "@/lib/content/translations";
import { classifyOffTopic } from "./off-topic";
import { routeMessage } from "./intent";

const none = { matchConfirmed: false };
const confirmed = { matchConfirmed: true };

describe("classifyOffTopic", () => {
  it("recognises world/general-knowledge chat", () => {
    for (const text of [
      "What's the weather today?",
      "Did you see the football last night?",
      "Tell me a joke",
      "今天天气怎么样？",
    ]) {
      expect(classifyOffTopic(text), text).toBe("world");
    }
  });

  it("recognises social talk and questions about the companion itself", () => {
    for (const text of [
      "Hello",
      "Good morning",
      "How are you today?",
      "Are you a robot?",
      "Thank you",
      "My granddaughter is visiting",
      "你好",
      "你是机器人吗？",
    ]) {
      expect(classifyOffTopic(text), text).toBe("social");
    }
  });

  it("recognises requests to act in the world that the companion cannot perform itself", () => {
    for (const text of [
      "Can you call my daughter?",
      "Book me an appointment",
      "Please order my refill",
      "帮我预约医生",
    ]) {
      expect(classifyOffTopic(text), text).toBe("capability");
    }
  });

  it("never fires on anything naming a medicine, label, or dose", () => {
    for (const text of [
      "Is this the pill I saw on TV?",
      "Hello, what is this medicine for?",
      "Can you call my daughter about my tablets?",
      "这是什么药？",
    ]) {
      expect(classifyOffTopic(text), text).toBeNull();
    }
  });

  it("never fires on feeling/symptom language — that must not get a chatty redirect", () => {
    for (const text of ["I feel tired", "I am dizzy today", "my stomach hurts"]) {
      expect(classifyOffTopic(text), text).toBeNull();
    }
  });
});

describe("spine redirection inside routeMessage", () => {
  it("acknowledges and redirects instead of answering", () => {
    const r = routeMessage("Are you a robot?", none);
    expect(r.intent).toBe("off-topic");
    expect(r.assistantKey).toBe("offTopicSocial");
    expect(r.contextualActions).toEqual(["show-medicine", "ask-schedule"]);
  });

  it("points a capability request at a real person rather than implying it can act", () => {
    const r = routeMessage("Can you call my daughter?", none);
    expect(r.assistantKey).toBe("offTopicCapability");
    const copy = t("en", "offTopicCapability");
    expect(copy).toMatch(/can’t do that myself/i);
    expect(copy).toMatch(/Get help/);
  });

  it("SAFETY ALWAYS WINS: safety-classified input never receives a friendly redirect", () => {
    // Each of these also contains off-spine bait (a greeting, a phone request).
    const urgent = routeMessage("Hello, I have chest pain", none);
    expect(urgent.intent).toBe("urgent-risk");
    expect(urgent.safetyReason).toBe("urgent-risk");

    const unsupported = routeMessage("Hi, should I stop taking it?", none);
    expect(unsupported.safetyReason).toBe("unsupported-medical-question");

    const help = routeMessage("Can you call my daughter, I want to speak to a pharmacist", none);
    expect(help.safetyReason).toBe("help-requested");

    for (const r of [urgent, unsupported, help]) {
      expect(r.intent).not.toBe("off-topic");
      expect(r.contextualActions).toEqual([]);
    }
  });

  it("redirection never unlocks record content, even with a confirmed match", () => {
    const r = routeMessage("What's the weather today?", confirmed);
    expect(r.intent).toBe("off-topic");
    expect(r.toExplain).toBeUndefined();
    expect(r.route).toBeUndefined();
  });

  it("every redirect line ends by offering the spine, in both languages", () => {
    for (const key of ["offTopicSocial", "offTopicWorld", "offTopicCapability"] as const) {
      expect(t("en", key)).toMatch(/medicine information in your (pharmacy )?record/i);
      expect(t("zh-Hans", key)).toMatch(/药物信息/);
      // No hard-refusal phrasing: the point of the pattern.
      expect(t("en", key)).not.toMatch(/I cannot help|I do not have access/i);
    }
  });
});
