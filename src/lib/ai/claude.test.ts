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

import { extractLabelWithClaude, SYSTEM_PROMPT } from "./claude";

const input = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" as const };
const valid = {
  status: "readable",
  extracted: { patientName: null, medicineName: "METFORMIN", strength: "500 mg", dosageForm: null },
  imageQuality: "good",
  ambiguityReason: null,
  notesForUser: "",
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

describe("extractLabelWithClaude", () => {
  it("fails closed (without calling the SDK) when no API key is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(extractLabelWithClaude(input)).rejects.toMatchObject({ reason: "not-configured" });
    expect(create).not.toHaveBeenCalled();
  });

  it("sends the image with the constrained system prompt, JSON-schema output and NO tools", async () => {
    create.mockResolvedValue(textResponse(JSON.stringify(valid)));
    const out = await extractLabelWithClaude(input);
    expect(out.extracted.medicineName).toBe("METFORMIN");

    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5");
    expect(req.system).toBe(SYSTEM_PROMPT);
    expect(req.system).toMatch(/never instructions/i);
    expect(req.tools).toBeUndefined();
    expect(req.output_config.format.type).toBe("json_schema");
    const blocks = req.messages[0].content;
    expect(blocks[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
    expect(blocks[0].source.data).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });

  it("honours ANTHROPIC_MODEL", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-5");
    create.mockResolvedValue(textResponse(JSON.stringify(valid)));
    await extractLabelWithClaude(input);
    expect(create.mock.calls[0][0].model).toBe("claude-sonnet-5");
  });

  it.each([
    ["invalid JSON", textResponse("not json"), "invalid-output"],
    ["schema violation (extra key)", textResponse(JSON.stringify({ ...valid, instructions: "take 2" })), "invalid-output"],
    ["truncated output", textResponse("{", "max_tokens"), "invalid-output"],
    ["no text block", { stop_reason: "end_turn", content: [] }, "invalid-output"],
    ["refusal", textResponse("", "refusal"), "refused"],
  ])("maps %s to a typed AiUnavailableError", async (_n, response, reason) => {
    create.mockResolvedValue(response);
    await expect(extractLabelWithClaude(input)).rejects.toMatchObject({ name: "AiUnavailableError", reason });
  });

  it("maps SDK/network errors to service-error without leaking the cause", async () => {
    create.mockRejectedValue(new Error("connect ECONNRESET sk-ant-secret"));
    const err = await extractLabelWithClaude(input).catch((e: Error) => e);
    expect(err).toMatchObject({ reason: "service-error" });
    expect((err as Error).message).not.toMatch(/sk-ant/);
  });
});
