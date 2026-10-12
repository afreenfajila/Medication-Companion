// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const chooseIntent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/intent", () => ({ chooseIntent }));

import { intentResponseSchema } from "@/lib/api/schemas";
import { resetRateLimit } from "@/lib/api/rate-limit";
import { POST } from "./route";

const actions = [{ id: "pharmacist-callback", description: "ask a pharmacist to call them back" }];
const req = (body: unknown, headers?: Record<string, string>) =>
  new Request("http://localhost/api/companion/intent", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });

beforeEach(() => {
  chooseIntent.mockReset();
  resetRateLimit();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/companion/intent", () => {
  it("returns the chosen action id", async () => {
    chooseIntent.mockResolvedValue({ outcome: "action", action: "pharmacist-callback" });
    const res = await POST(req({ utterance: "could the chemist ring me", language: "en", actions, context: "on the help screen" }));
    expect(intentResponseSchema.parse(await res.json())).toMatchObject({ ok: true, data: { action: "pharmacist-callback", outcome: "action" } });
    expect(chooseIntent.mock.calls[0][0].context).toBe("on the help screen");
  });

  it("'unclear' is passed on, so the companion asks them to say it again", async () => {
    chooseIntent.mockResolvedValue({ outcome: "unclear" });
    const data = (await (await POST(req({ utterance: "asdkjh blorp", language: "en", actions }))).json()).data;
    expect(data).toEqual({ action: null, outcome: "unclear" });
  });

  it("a natural reply is returned only if it passes the reply guard", async () => {
    const safe = "That sounds like a long day. Would you like a pharmacist to call you?";
    chooseIntent.mockResolvedValueOnce({ outcome: "reply", reply: safe });
    expect((await (await POST(req({ utterance: "I had a long day", language: "en", actions }))).json()).data).toEqual({ action: null, outcome: "reply", reply: safe });
    for (const unsafe of [
      "You should take 2 tablets tonight. Would you like anything else?",
      "That sounds fine. You can stop taking it if you feel better?",
      "那听起来很辛苦。您想请药剂师给您回电吗？",
      "That sounds like a long day.",
    ]) {
      chooseIntent.mockResolvedValueOnce({ outcome: "reply", reply: unsafe });
      expect((await (await POST(req({ utterance: "hello there", language: "en", actions }))).json()).data, unsafe).toEqual({ action: null, outcome: "none" });
    }
  });

  it("safety wording is never sent to a model, and any AI failure is simply no action", async () => {
    const urgent = await POST(req({ utterance: "I have chest pain", language: "en", actions }));
    expect((await urgent.json()).data).toEqual({ action: null, outcome: "none" });
    expect(chooseIntent).not.toHaveBeenCalled();
    chooseIntent.mockRejectedValue(new Error("down"));
    expect((await (await POST(req({ utterance: "hello", language: "en", actions }))).json()).data).toEqual({ action: null, outcome: "none" });
  });

  it("validates the request and refuses cross-origin calls", async () => {
    expect((await POST(req({ utterance: "", language: "en", actions }))).status).toBe(400);
    expect((await POST(req({ utterance: "x", language: "en", actions: [{ id: "BAD ID", description: "x" }] }))).status).toBe(400);
    expect((await POST(req({ utterance: "x", language: "en", actions }, { origin: "https://evil.example", host: "localhost" }))).status).toBe(403);
  });
});
