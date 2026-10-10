// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { helpResponseSchema } from "@/lib/api/schemas";
import { resetRateLimit } from "@/lib/api/rate-limit";
import { POST } from "./route";

function req(body: unknown, headers?: Record<string, string>) {
  return new Request("http://localhost/api/help/request", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(() => resetRateLimit());
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/help/request", () => {
  it("a pharmacist callback returns a reference and the expected window", async () => {
    const res = await POST(req({ sessionId: "s", kind: "pharmacist-callback", reason: "medical-question" }));
    const body = helpResponseSchema.parse(await res.json());
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.data.reference).toMatch(/^BC-\d{6}$/);
      expect(body.data).not.toHaveProperty("expectedWindow"); // never a callback-time promise
    }
  });

  it("a care-circle notification names who was told", async () => {
    const res = await POST(req({ sessionId: "s", kind: "trusted-helper", reason: "label-trouble" }));
    const body = helpResponseSchema.parse(await res.json());
    expect(body.ok && body.data.contactName).toBe("Mrs Lim");
  });

  it("a failing service returns a 503 envelope, never a success", async () => {
    vi.stubEnv("SIMULATED_SERVICE_FAILURE", "pharmacy");
    const res = await POST(req({ sessionId: "s", kind: "pharmacist-callback", reason: "help-requested" }));
    expect(res.status).toBe(503);
    expect(helpResponseSchema.parse(await res.json()).ok).toBe(false);
  });

  it("rejects an unknown kind (no emergency routing here) and a cross-origin request", async () => {
    expect((await POST(req({ sessionId: "s", kind: "emergency", reason: "help-requested" }))).status).toBe(400);
    const cross = await POST(
      req({ sessionId: "s", kind: "family", reason: "wellbeing" }, { origin: "https://evil.example", host: "localhost" }),
    );
    expect(cross.status).toBe(403);
  });
});
