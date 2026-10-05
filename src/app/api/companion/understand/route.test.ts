// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const understandMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/understand", () => ({ understandMessage }));

import { AiUnavailableError } from "@/lib/ai/claude";
import { apiFailureSchema, understandCapabilityResponseSchema, understandResponseSchema } from "@/lib/api/schemas";
import { resetRateLimit } from "@/lib/api/rate-limit";
import { t } from "@/lib/content/translations";
import { GET, POST } from "./route";

const APPROVED = t("en", "medicineNameCheck");

const BODY = {
  message: "I do have met for pain with me",
  key: "medicineNameCheck",
  language: "en",
  offered: ["show-medicine"],
  checkingMedicineName: true,
  history: [{ speaker: "companion", text: "Hello, I’m an AI guide. What would you like to know today?" }],
};

function req(body: unknown = BODY, headers?: Record<string, string>) {
  return new Request("http://localhost/api/companion/understand", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function data(res: Response) {
  const body = understandResponseSchema.parse(await res.json());
  if (!body.ok) throw new Error("expected ok");
  return body.data;
}

beforeEach(() => {
  understandMessage.mockReset();
  resetRateLimit();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/companion/understand", () => {
  it("returns Claude's reply and its offer when the reply passes the guard", async () => {
    understandMessage.mockResolvedValue({
      reply: "I think you said Metformin — is that right? Would you like to type it, or show me the label?",
      offer: "show-medicine",
      checkingMedicineName: true,
    });
    const d = await data(await POST(req()));
    expect(d.source).toBe("claude");
    expect(d.text).toMatch(/Metformin — is that right/);
    expect(d.contextualActions).toEqual(["show-medicine"]);
    expect(d.checkingMedicineName).toBe(true);
    // The model sees the message, the context and the router's approved line.
    expect(understandMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: BODY.message, language: "en", routerReply: APPROVED }),
    );
  });

  it("falls back to the approved reply and the router's own actions when the reply fails the guard", async () => {
    understandMessage.mockResolvedValue({
      reply: "That's Metformin 500 mg — take one tablet twice a day.",
      offer: "none",
      checkingMedicineName: false,
    });
    const d = await data(await POST(req()));
    expect(d).toEqual({
      text: APPROVED,
      contextualActions: ["show-medicine"],
      checkingMedicineName: true,
      source: "fallback",
    });
  });

  it("a typed message can't have been misheard: a 'didn't come through' reply falls back", async () => {
    const misheard =
      "Thank you for asking, that's a good habit. That part didn't come through clearly to me. Would you like to show me the medicine label, or tell me the name again?";
    understandMessage.mockResolvedValue({ reply: misheard, offer: "show-medicine", checkingMedicineName: false });

    const typed = await data(await POST(req({ ...BODY, key: "showLabelQuestion", message: "What is this medicine for?", via: "typed" })));
    expect(typed.source).toBe("fallback");
    expect(typed.text).toBe(t("en", "showLabelQuestion"));
    expect(understandMessage).toHaveBeenLastCalledWith(expect.objectContaining({ via: "typed" }));

    // Spoken, a mishearing is possible, so the same reply is allowed.
    const spoken = await data(await POST(req({ ...BODY, key: "showLabelQuestion", message: "What is this medicine for?", via: "voice" })));
    expect(spoken.source).toBe("claude");
  });

  it("never assumes the medicine: naming Metformin when nobody did falls back to asking which one", async () => {
    const assumed =
      "Thank you for telling me. It sounds like you may have your Metformin with you. Would you like to show me the label?";
    understandMessage.mockResolvedValue({ reply: assumed, offer: "show-medicine", checkingMedicineName: false });
    const vague = { ...BODY, key: "whichMedicine", message: "I take it twice a day", via: "typed", history: [] };

    const r = await data(await POST(req(vague)));
    expect(r.source).toBe("fallback");
    expect(r.text).toBe(t("en", "whichMedicine"));

    // Once she has named it earlier in the call, referring to it by name is fine.
    const earlier = await data(
      await POST(req({ ...vague, history: [{ speaker: "user", text: "I have my metformin here" }] })),
    );
    expect(earlier.source).toBe("claude");
  });

  it("never asks the model about a safety-classified message", async () => {
    const d = await data(await POST(req({ ...BODY, message: "I have chest pain" })));
    expect(d.source).toBe("fallback");
    expect(understandMessage).not.toHaveBeenCalled();
  });

  it.each(["not-configured", "service-error", "invalid-output", "refused"] as const)(
    "AI failure (%s) still returns 200 with the approved reply",
    async (reason) => {
      understandMessage.mockRejectedValue(new AiUnavailableError("secret sk-ant-123", reason));
      const res = await POST(req());
      expect(res.status).toBe(200);
      const d = await data(res);
      expect(d.source).toBe("fallback");
      expect(d.text).toBe(APPROVED);
    },
  );

  it("rejects a reply key outside the understanding scope", async () => {
    const res = await POST(req({ ...BODY, key: "urgentHeading" }));
    expect(res.status).toBe(400);
    expect(apiFailureSchema.safeParse(await res.json()).success).toBe(true);
    expect(understandMessage).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin request", async () => {
    const res = await POST(req(BODY, { origin: "https://evil.example", host: "localhost" }));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/companion/understand", () => {
  it("reports whether the pass is configured, without revealing the key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-secret");
    const on = await (await GET()).text();
    expect(on).not.toContain("sk-ant");
    const parsed = understandCapabilityResponseSchema.parse(JSON.parse(on));
    expect(parsed.ok && parsed.data.enabled).toBe(true);

    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const off = understandCapabilityResponseSchema.parse(await (await GET()).json());
    expect(off.ok && off.data.enabled).toBe(false);
  });
});
