// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const synthesizeSpeechWav = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/speech", () => ({
  synthesizeSpeechWav,
  SpeechUnavailableError: class SpeechUnavailableError extends Error {
    constructor(
      message: string,
      readonly reason: string,
    ) {
      super(message);
    }
  },
}));

import { SpeechUnavailableError } from "@/lib/ai/speech";
import { apiFailureSchema } from "@/lib/api/schemas";
import { resetRateLimit } from "@/lib/api/rate-limit";
import { POST } from "./route";

function req(body: unknown = { text: "Hello, Mei Ling.", language: "en" }, headers?: Record<string, string>) {
  return new Request("http://localhost/api/companion/speak", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(() => {
  synthesizeSpeechWav.mockReset();
  resetRateLimit();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/companion/speak", () => {
  it("returns the WAV bytes directly on success", async () => {
    const fakeWav = Buffer.from("RIFF....WAVEfmt ", "ascii");
    synthesizeSpeechWav.mockResolvedValue(fakeWav);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes)).toEqual(fakeWav);
    expect(synthesizeSpeechWav).toHaveBeenCalledWith("Hello, Mei Ling.");
  });

  it("passes the Chinese text through unchanged (renders exactly what it's given)", async () => {
    synthesizeSpeechWav.mockResolvedValue(Buffer.from([0]));
    await POST(req({ text: "随餐每日服用一片，每日两次。", language: "zh-Hans" }));
    expect(synthesizeSpeechWav).toHaveBeenCalledWith("随餐每日服用一片，每日两次。");
  });

  it.each(["not-configured", "service-error", "invalid-output"] as const)(
    "AI failure (%s) → a JSON error, never fake audio",
    async (reason) => {
      synthesizeSpeechWav.mockRejectedValue(new SpeechUnavailableError("secret detail AIzaXYZ", reason));
      const res = await POST(req());
      const text = await res.text();
      expect(res.status).toBe(503);
      expect(res.headers.get("content-type")).not.toBe("audio/wav");
      const body = apiFailureSchema.parse(JSON.parse(text));
      expect(body.error.code).toBe("speech_unavailable");
      expect(text).not.toMatch(/AIzaXYZ|secret detail/);
    },
  );

  it("an unexpected crash is also a safe JSON error", async () => {
    synthesizeSpeechWav.mockRejectedValue(new Error("boom"));
    expect((await POST(req())).status).toBe(503);
  });

  it.each([
    ["missing text", { language: "en" }],
    ["empty text", { text: "", language: "en" }],
    ["text too long", { text: "x".repeat(601), language: "en" }],
    ["bad language", { text: "hi", language: "fr" }],
  ])("rejects %s without calling Gemini", async (_name, body) => {
    const res = await POST(req(body));
    const parsed = apiFailureSchema.parse(await res.json());
    expect(res.status).toBe(400);
    expect(parsed.error.code).toBe("invalid_request");
    expect(synthesizeSpeechWav).not.toHaveBeenCalled();
  });

  it("refuses cross-origin requests", async () => {
    const res = await POST(req(undefined, { origin: "https://evil.example", host: "localhost" }));
    expect(res.status).toBe(403);
    expect(synthesizeSpeechWav).not.toHaveBeenCalled();
  });

  it("rate-limits repeated calls", async () => {
    synthesizeSpeechWav.mockResolvedValue(Buffer.from([0]));
    let last = 200;
    for (let i = 0; i < 32; i++) last = (await POST(req())).status;
    expect(last).toBe(429);
  });
});

describe("the voice reads approved text only", () => {
  it("reads a full approved confirm/explanation line built from catalogue + record strings", async () => {
    synthesizeSpeechWav.mockResolvedValue(Buffer.from("RIFF", "ascii"));
    const { t } = await import("@/lib/content/translations");
    const { metforminRecord } = await import("@/lib/content/demo-record");
    const e = metforminRecord.explanation;
    const line = [e.instructionIntro["zh-Hans"], e.instruction["zh-Hans"], e.sourceLine["zh-Hans"]].join(" ");
    expect((await POST(req({ text: line, language: "zh-Hans" }))).status).toBe(200);
    const confirm = `${t("en", "possibleMatch")}. ${t("en", "confirmHeading").replace("{medicine}", "Metformin 500 mg")} ${t("en", "checkName")}`;
    expect((await POST(req({ text: confirm, language: "en" }))).status).toBe(200);
  });

  it("refuses to voice text that isn't approved — e.g. invented dosing advice", async () => {
    const res = await POST(req({ text: "You can take two tablets if you missed a dose.", language: "en" }));
    expect(res.status).toBe(422);
    expect(apiFailureSchema.safeParse(await res.json()).success).toBe(true);
    expect(synthesizeSpeechWav).not.toHaveBeenCalled();
  });
});
