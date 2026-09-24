// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rephraseConversationalLine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/rephrase", () => ({ rephraseConversationalLine }));

import { AiUnavailableError } from "@/lib/ai/claude";
import { apiFailureSchema, replyRephraseResponseSchema } from "@/lib/api/schemas";
import { resetRateLimit } from "@/lib/api/rate-limit";
import { t } from "@/lib/content/translations";
import { POST } from "./route";

const CANONICAL = t("en", "prescriptionsListed");

function req(body: unknown = { key: "prescriptionsListed" }, headers?: Record<string, string>) {
  return new Request("http://localhost/api/companion/reply-rephrase", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(() => {
  rephraseConversationalLine.mockReset();
  resetRateLimit();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/companion/reply-rephrase", () => {
  it("looks up the canonical text itself — the client only names the key", async () => {
    rephraseConversationalLine.mockResolvedValue("Your pharmacy record on file lists one medicine: Metformin 500 mg. Want to show me the label so I can explain it?");
    const body = replyRephraseResponseSchema.parse(await (await POST(req())).json());
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected ok");
    expect(body.data.source).toBe("claude");
    expect(rephraseConversationalLine).toHaveBeenCalledWith(CANONICAL);
  });

  it("falls back to the exact approved line when the candidate fails the safety guard", async () => {
    // Introduces a claim/number not in the canonical text — must be rejected.
    rephraseConversationalLine.mockResolvedValue("You have three medicines and should stop one of them.");
    const body = replyRephraseResponseSchema.parse(await (await POST(req())).json());
    if (!body.ok) throw new Error("expected ok");
    expect(body.data.source).toBe("fallback");
    expect(body.data.text).toBe(CANONICAL);
  });

  it.each(["not-configured", "service-error", "invalid-output", "refused"] as const)(
    "AI failure (%s) still returns 200 with the exact approved line (source: fallback)",
    async (reason) => {
      rephraseConversationalLine.mockRejectedValue(new AiUnavailableError("secret sk-ant-123", reason));
      const res = await POST(req());
      const body = replyRephraseResponseSchema.parse(await res.json());
      expect(res.status).toBe(200);
      if (!body.ok) throw new Error("expected ok");
      expect(body.data.source).toBe("fallback");
      expect(body.data.text).toBe(CANONICAL);
    },
  );

  it("an unexpected crash also falls back to 200 with the approved line", async () => {
    rephraseConversationalLine.mockRejectedValue(new Error("boom"));
    const res = await POST(req());
    const body = replyRephraseResponseSchema.parse(await res.json());
    expect(res.status).toBe(200);
    expect(body.ok && body.data.source).toBe("fallback");
  });

  it("rejects a key outside the eligible allow-list — the pinned routing sentences are never sent to Claude", async () => {
    const res = await POST(req({ key: "showLabelQuestion" }));
    const body = apiFailureSchema.parse(await res.json());
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
    expect(rephraseConversationalLine).not.toHaveBeenCalled();
  });

  it("rejects a malformed request body", async () => {
    const res = await POST(req({}));
    apiFailureSchema.parse(await res.json());
    expect(res.status).toBe(400);
    expect(rephraseConversationalLine).not.toHaveBeenCalled();
  });

  it("refuses cross-origin requests", async () => {
    const res = await POST(req(undefined, { origin: "https://evil.example", host: "localhost" }));
    expect(res.status).toBe(403);
    expect(rephraseConversationalLine).not.toHaveBeenCalled();
  });

  it("rate-limits repeated calls", async () => {
    rephraseConversationalLine.mockResolvedValue(CANONICAL);
    let last = 200;
    for (let i = 0; i < 42; i++) last = (await POST(req())).status;
    expect(last).toBe(429);
  });
});
