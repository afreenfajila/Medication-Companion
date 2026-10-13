// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class Anthropic {
    static APIError = APIError;
    messages = { create };
  }
  return { default: Anthropic };
});

import { chooseIntent, INTENT_SYSTEM_PROMPT } from "./intent";

const actions = [
  { id: "pharmacist-callback", description: "ask a pharmacist to call them back" },
  { id: "back", description: "go back to the conversation" },
];
const answer = (out: { outcome: string; action?: string; reply?: string }, stop_reason = "end_turn") => ({
  stop_reason,
  content: [{ type: "text", text: JSON.stringify({ action: "none", reply: "", ...out }) }],
});
const reply = (action: string) => answer({ outcome: "action", action });

beforeEach(() => {
  create.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("ANTHROPIC_MODEL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("chooseIntent (meaning → on-screen action)", () => {
  it("fails closed without calling Claude when no key is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(chooseIntent({ utterance: "x", language: "en", actions })).rejects.toMatchObject({ reason: "not-configured" });
    expect(create).not.toHaveBeenCalled();
  });

  it("asks for one id from the offered list (or none), at low effort, with her words as data", async () => {
    create.mockResolvedValue(reply("pharmacist-callback"));
    expect(await chooseIntent({ utterance: "could the chemist ring me back", language: "en", actions, context: "hearing their pharmacy record explained, part 3 of 3" })).toEqual({
      outcome: "action",
      action: "pharmacist-callback",
    });
    const req = create.mock.calls[0][0];
    expect(req.system).toBe(INTENT_SYSTEM_PROMPT);
    expect(req.output_config.effort).toBe("low");
    expect(req.output_config.format.schema.properties.action.enum).toEqual(["pharmacist-callback", "back", "none"]);
    expect(req.output_config.format.schema.properties.outcome.enum).toEqual(["action", "unclear", "reply"]);
    const sent = JSON.parse(req.messages[0].content);
    expect(sent.theySaid).toBe("could the chemist ring me back");
    expect(sent.whereTheyAre).toBe("hearing their pharmacy record explained, part 3 of 3");
  });

  it("'none', an id that wasn't offered, or a refusal is no action", async () => {
    create.mockResolvedValueOnce(reply("none"));
    expect(await chooseIntent({ utterance: "hmm", language: "en", actions })).toEqual({ outcome: "none" });
    create.mockResolvedValueOnce(reply("send-request"));
    expect(await chooseIntent({ utterance: "send it", language: "en", actions })).toEqual({ outcome: "none" });
    create.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    expect(await chooseIntent({ utterance: "x", language: "en", actions })).toEqual({ outcome: "none" });
  });

  it("gibberish is 'unclear' (the app asks them to repeat); an understood non-action gets a reply to check", async () => {
    create.mockResolvedValueOnce(answer({ outcome: "unclear" }));
    expect(await chooseIntent({ utterance: "asdkjh blorp", language: "en", actions })).toEqual({ outcome: "unclear" });
    create.mockResolvedValueOnce(answer({ outcome: "reply", reply: "  That sounds like a busy day. Would you like to go back, or ask a pharmacist to call you?  " }));
    expect(await chooseIntent({ utterance: "I had a long day", language: "en", actions })).toEqual({
      outcome: "reply",
      reply: "That sounds like a busy day. Would you like to go back, or ask a pharmacist to call you?",
    });
    create.mockResolvedValueOnce(answer({ outcome: "reply", reply: "   " }));
    expect(await chooseIntent({ utterance: "x", language: "en", actions })).toEqual({ outcome: "none" });
  });

  it("tells Claude the actions are unordered: any of them, not just the next one", () => {
    expect(INTENT_SYSTEM_PROMPT).toMatch(/not in any order and are not a sequence/);
    expect(INTENT_SYSTEM_PROMPT).toMatch(/never assume they want the "next" one/);
    expect(INTENT_SYSTEM_PROMPT).toMatch(/never mention doses, amounts, numbers, times or schedules/);
  });
});
