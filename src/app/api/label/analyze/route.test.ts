// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const extract = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/claude", () => ({
  extractLabelWithClaude: extract,
  AiUnavailableError: class AiUnavailableError extends Error {
    constructor(
      message: string,
      readonly reason: string,
    ) {
      super(message);
    }
  },
}));

import { AiUnavailableError } from "@/lib/ai/claude";
import { apiFailureSchema, labelAnalyzeResponseSchema } from "@/lib/api/schemas";
import { resetRateLimit } from "@/lib/api/rate-limit";
import { POST } from "./route";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const goodExtraction = {
  status: "readable",
  extracted: { patientName: "MEI LING TAN", medicineName: "METFORMIN", strength: "500 mg", dosageForm: "tablet" },
  imageQuality: "good",
  ambiguityReason: null,
  notesForUser: "ok",
};

function req(opts: { bytes?: Uint8Array; type?: string; fields?: Record<string, string>; headers?: Record<string, string>; noImage?: boolean } = {}) {
  const form = new FormData();
  const fields = { sessionId: "demo-call-1", inputMode: "image", ...opts.fields };
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (!opts.noImage) {
    form.set("image", new File([(opts.bytes ?? PNG) as BlobPart], "label.png", { type: opts.type ?? "image/png" }));
  }
  return new Request("http://localhost/api/label/analyze", { method: "POST", body: form, headers: opts.headers });
}

beforeEach(() => {
  extract.mockReset();
  resetRateLimit();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/label/analyze", () => {
  it("returns a validated success envelope with a possible candidate (extractor mocked)", async () => {
    extract.mockResolvedValue(goodExtraction);
    const res = await POST(req());
    const body = labelAnalyzeResponseSchema.parse(await res.json());
    expect(res.status).toBe(200);
    expect(body.ok && body.data.outcome).toBe("candidate");
    expect(body.requestId).toMatch(/^req_/);
    // The extractor got the image bytes and the sniffed (not merely declared) type.
    expect(extract).toHaveBeenCalledWith({ bytes: PNG, mimeType: "image/png" });
  });

  it("routes a conflicting label to no-match with safety as next state", async () => {
    extract.mockResolvedValue({ ...goodExtraction, extracted: { ...goodExtraction.extracted, medicineName: "AMOXICILLIN" } });
    const body = labelAnalyzeResponseSchema.parse(await (await POST(req())).json());
    expect(body.ok && body.data).toMatchObject({ outcome: "no-match", nextState: "safety" });
  });

  it.each([
    ["missing image", { noImage: true }, 400, "missing_image"],
    ["wrong MIME type", { type: "image/gif" }, 400, "image_type"],
    ["MIME spoofing (declared PNG, actually text)", { bytes: new TextEncoder().encode("<svg onload=x>") }, 400, "image_type"],
    ["empty file", { bytes: new Uint8Array() }, 400, "image_empty"],
    ["bad inputMode", { fields: { inputMode: "typed" } }, 400, "invalid_request"],
    ["missing session id", { fields: { sessionId: "" } }, 400, "invalid_request"],
  ] as const)("rejects %s without calling Claude", async (_name, opts, status, code) => {
    const res = await POST(req(opts));
    const body = apiFailureSchema.parse(await res.json());
    expect(res.status).toBe(status);
    expect(body.error.code).toBe(code);
    expect(extract).not.toHaveBeenCalled();
  });

  it("rejects an oversized upload (> 5 MB) with a plain-language message", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    const res = await POST(req({ bytes: big }));
    const body = apiFailureSchema.parse(await res.json());
    expect(res.status).toBe(413);
    expect(body.error.message).toMatch(/5 MB/);
    expect(extract).not.toHaveBeenCalled();
  });

  it("refuses cross-origin browser requests", async () => {
    const res = await POST(req({ headers: { origin: "https://evil.example", host: "localhost" } }));
    expect(res.status).toBe(403);
    expect(extract).not.toHaveBeenCalled();
  });

  it("rate-limits repeated calls", async () => {
    extract.mockResolvedValue(goodExtraction);
    let last = 200;
    for (let i = 0; i < 12; i++) last = (await POST(req())).status;
    expect(last).toBe(429);
  });

  it.each(["not-configured", "service-error", "invalid-output", "refused"] as const)(
    "AI failure (%s) → 503 envelope with a safe next action and no leaked detail",
    async (reason) => {
      extract.mockRejectedValue(new AiUnavailableError("secret internal detail sk-ant-123", reason));
      const res = await POST(req());
      const text = await res.text();
      const body = apiFailureSchema.parse(JSON.parse(text));
      expect(res.status).toBe(503);
      expect(body.error).toMatchObject({ code: "ai_unavailable", safeNextAction: "type_label" });
      expect(text).not.toMatch(/sk-ant|secret internal/);
    },
  );

  it("an unexpected extractor crash is also a safe 503", async () => {
    extract.mockRejectedValue(new Error("boom"));
    expect((await POST(req())).status).toBe(503);
  });
});
