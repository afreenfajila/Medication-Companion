import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { t } from "@/lib/content/translations";
import { sessionStore } from "@/lib/session/session-store";
import { run, startCall } from "./helpers";

/** Fake server: AI available; the intent route answers with `action`; everything else fails. */
function stubServer(action: string | null) {
  const intentCalls: Array<{ utterance: string; actions: Array<{ id: string }> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/companion/understand" && (!init || init.method === "GET")) {
        return new Response(JSON.stringify({ ok: true, data: { enabled: true }, requestId: "r" }));
      }
      if (url === "/api/companion/intent") {
        intentCalls.push(JSON.parse(init!.body as string));
        return new Response(JSON.stringify({ ok: true, data: { action }, requestId: "r" }));
      }
      throw new Error("offline");
    }),
  );
  return intentCalls;
}

const type = (text: string) => {
  const box = screen.getByLabelText(/type a message/i);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest("form")!);
};

beforeEach(() => sessionStore.reset());
afterEach(() => vi.unstubAllGlobals());

describe("conversation first", () => {
  it("one compact text box (no speech input here); getting a person is asked in the chat, with no panel", () => {
    stubServer(null);
    sessionStore.setForTest(run([startCall, { type: "GET_HELP" }]));
    render(<CompanionExperience />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(document.querySelector("[data-pinned]")).toBeNull();
    expect(screen.getByText("Would you like a pharmacist to call you, or shall I let your family know? Or we can just carry on talking.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show choices|hide choices/i })).toBeNull();
  });

  it("on the help screen, 'could the chemist give me a ring' is understood by meaning and opens the pharmacist step", async () => {
    const calls = stubServer("pharmacist-callback");
    sessionStore.setForTest(run([startCall, { type: "GET_HELP" }]));
    render(<CompanionExperience />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/companion/understand", expect.anything()));

    type("could the chemist give me a ring");
    await waitFor(() => expect(screen.getByText(t("en", "callbackConfirm"))).toBeInTheDocument());
    // Only "where to go" actions were offered to the AI — never a yes.
    expect(calls[0].actions.map((a) => a.id)).toEqual(expect.arrayContaining(["pharmacist-callback", "back"]));
    // The request itself still needs her own yes: nothing has been sent.
    expect(sessionStore.getSnapshot().helpFlow).toMatchObject({ kind: "pharmacist-callback", stage: "confirm" });
  });

  it("the consent step itself is never answered by the AI: only a clear yes, typed or said, sends", async () => {
    const calls = stubServer("decline");
    sessionStore.setForTest(run([startCall, { type: "GET_HELP" }, { type: "HELP_START", kind: "pharmacist-callback" }]));
    render(<CompanionExperience />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/companion/understand", expect.anything()));
    type("yes please ask them to call me back");
    // Her yes opens "check before sending"; only an explicit "send" sends (never a plain yes, never a model).
    expect(sessionStore.getSnapshot().helpFlow?.stage).toBe("review");
    expect(calls).toHaveLength(0); // decided by the person's words, not a model
    type("yes please");
    expect(sessionStore.getSnapshot().helpFlow?.stage).toBe("review"); // a plain yes doesn't send
    type("send it");
    expect(sessionStore.getSnapshot().helpFlow?.stage).toBe("sending"); // an explicit "send" does
  });
});
