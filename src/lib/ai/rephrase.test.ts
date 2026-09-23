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

import { rephraseExplanationFields, REPHRASE_SYSTEM_PROMPT } from "./rephrase";

const input = {
  title: "Here is what your record says.",
  purpose: "Metformin helps manage blood sugar.",
  instructionIntro: "Your current demo pharmacy record says:",
  caution: "I can explain this record, but I cannot change your medicine instructions.",
  confirmationPrompt: "Would you like me to repeat that or help you contact a pharmacist?",
};

const validOutput = {
  title: "Here's what your record shows.",
  purpose: "Your record says Metformin helps manage your blood sugar.",
  instructionIntro: "Your pharmacy record currently says:",
  caution: "I'm happy to explain this record, though I can't change your medicine instructions.",
  confirmationPrompt: "Would you like me to repeat that, or help you reach a pharmacist?",
};

const textResponse = (text: string, stop_reason = "end_turn") => ({
  stop_reason,
  content: [{ type: "text", text }],
});

beforeEach(() => {
  create.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("ANTHROPIC_MODEL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("rephraseExplanationFields", () => {
  it("fails closed without calling the SDK when no key is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(rephraseExplanationFields(input)).rejects.toMatchObject({ reason: "not-configured" });
    expect(create).not.toHaveBeenCalled();
  });

  it("sends only the five flavour fields — never instruction or sourceLine — with the constrained prompt", async () => {
    create.mockResolvedValue(textResponse(JSON.stringify(validOutput)));
    const out = await rephraseExplanationFields(input);
    expect(out).toEqual(validOutput);

    const req = create.mock.calls[0][0];
    expect(req.system).toBe(REPHRASE_SYSTEM_PROMPT);
    expect(req.system).toMatch(/do not add any new fact/i);
    expect(req.tools).toBeUndefined();
    expect(req.output_config.format.type).toBe("json_schema");
    const sent = JSON.parse(req.messages[0].content);
    expect(Object.keys(sent).sort()).toEqual(
      ["caution", "confirmationPrompt", "instructionIntro", "purpose", "title"].sort(),
    );
    expect(sent).not.toHaveProperty("instruction");
    expect(sent).not.toHaveProperty("sourceLine");
  });

  it.each([
    ["invalid JSON", textResponse("not json"), "invalid-output"],
    ["schema violation (extra key)", textResponse(JSON.stringify({ ...validOutput, instruction: "take 2" })), "invalid-output"],
    ["truncated output", textResponse("{", "max_tokens"), "invalid-output"],
    ["no text block", { stop_reason: "end_turn", content: [] }, "invalid-output"],
    ["refusal", textResponse("", "refusal"), "refused"],
  ])("maps %s to a typed AiUnavailableError", async (_n, response, reason) => {
    create.mockResolvedValue(response);
    await expect(rephraseExplanationFields(input)).rejects.toMatchObject({ name: "AiUnavailableError", reason });
  });

  it("maps SDK/network errors to service-error without leaking the cause", async () => {
    create.mockRejectedValue(new Error("connect ECONNRESET sk-ant-secret"));
    const err = await rephraseExplanationFields(input).catch((e: Error) => e);
    expect(err).toMatchObject({ reason: "service-error" });
    expect((err as Error).message).not.toMatch(/sk-ant/);
  });
});
