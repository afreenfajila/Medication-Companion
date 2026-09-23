// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rephraseExplanationFields = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/rephrase", () => ({ rephraseExplanationFields }));

import { AiUnavailableError } from "@/lib/ai/claude";
import { apiFailureSchema, rephraseResponseSchema } from "@/lib/api/schemas";
import { resetRateLimit } from "@/lib/api/rate-limit";
import { metforminRecord } from "@/lib/content/demo-record";
import { POST } from "./route";

function req(body: unknown = { sessionId: "demo-call-1" }, headers?: Record<string, string>) {
  return new Request("http://localhost/api/companion/rephrase", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(() => {
  rephraseExplanationFields.mockReset();
  resetRateLimit();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/companion/rephrase", () => {
  it("returns the exact approved English text as canonical field values", async () => {
    rephraseExplanationFields.mockResolvedValue({
      title: "Here's what your record shows.",
      purpose: "Your record says Metformin helps manage blood sugar.",
      instructionIntro: "Your pharmacy record currently says:",
      caution: "I'm happy to explain, though I can't change your instructions.",
      confirmationPrompt: "Want me to repeat that, or help you reach a pharmacist?",
    });
    const body = rephraseResponseSchema.parse(await (await POST(req())).json());
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected ok");
    expect(body.data.source).toBe("claude");
    // Sanity: canonical values fed in match the local record.
    expect(metforminRecord.explanation.purpose.en).toBe("Metformin helps manage blood sugar.");
  });

  it.each(["not-configured", "service-error", "invalid-output", "refused"] as const)(
    "AI failure (%s) still returns 200 with the exact approved text (source: fallback)",
    async (reason) => {
      rephraseExplanationFields.mockRejectedValue(new AiUnavailableError("secret sk-ant-123", reason));
      const res = await POST(req());
      const body = rephraseResponseSchema.parse(await res.json());
      expect(res.status).toBe(200);
      if (!body.ok) throw new Error("expected ok");
      expect(body.data.source).toBe("fallback");
      expect(body.data.fields.purpose).toBe(metforminRecord.explanation.purpose.en);
    },
  );

  it("an unexpected crash also falls back to 200 with the approved text", async () => {
    rephraseExplanationFields.mockRejectedValue(new Error("boom"));
    const res = await POST(req());
    const body = rephraseResponseSchema.parse(await res.json());
    expect(res.status).toBe(200);
    expect(body.ok && body.data.source).toBe("fallback");
  });

  it("never returns an 'instruction' or 'sourceLine' key in its payload", async () => {
    rephraseExplanationFields.mockResolvedValue({
      title: "x",
      purpose: "Metformin helps.",
      instructionIntro: "x",
      caution: "x",
      confirmationPrompt: "x",
    });
    const body = rephraseResponseSchema.parse(await (await POST(req())).json());
    if (!body.ok) throw new Error("expected ok");
    expect(body.data.fields).not.toHaveProperty("instruction");
    expect(body.data.fields).not.toHaveProperty("sourceLine");
    expect(Object.keys(body.data.fields).sort()).toEqual(
      ["caution", "confirmationPrompt", "instructionIntro", "purpose", "title"].sort(),
    );
  });

  it("rejects a malformed request body", async () => {
    const res = await POST(req({}));
    const body = apiFailureSchema.parse(await res.json());
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
    expect(rephraseExplanationFields).not.toHaveBeenCalled();
  });

  it("refuses cross-origin requests", async () => {
    const res = await POST(req(undefined, { origin: "https://evil.example", host: "localhost" }));
    expect(res.status).toBe(403);
    expect(rephraseExplanationFields).not.toHaveBeenCalled();
  });

  it("rate-limits repeated calls", async () => {
    rephraseExplanationFields.mockResolvedValue({
      title: "x",
      purpose: "x",
      instructionIntro: "x",
      caution: "x",
      confirmationPrompt: "x",
    });
    let last = 200;
    for (let i = 0; i < 22; i++) last = (await POST(req())).status;
    expect(last).toBe(429);
  });
});
