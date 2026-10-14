import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { t } from "@/lib/content/translations";
import { dispatch, sessionStore } from "@/lib/session/session-store";
import { interpretUtterance, spokenActions, type CommandContext } from "@/lib/voice/commands";
import { chooseShowMedicine, grantCamera, run, startCall } from "./helpers";

const preparePhoto = vi.hoisted(() => vi.fn(async (f: Blob) => f));
vi.mock("@/lib/label/prepare-photo", () => ({ preparePhoto }));

/**
 * Showing the label (owner decision, 14 October 2026): one consent question, said and shown —
 * camera or photo, and the photo isn't kept. Only after a clear yes do two buttons appear inside
 * the companion's message: Take photo (the in-app camera) and Upload (the phone's picker). They
 * go once a photo is sent or the conversation moves on; "show the label" brings them back.
 */
const base: CommandContext = {
  state: "camera-permission",
  contextualActions: [],
  candidateId: null,
  explainStep: 0,
  cameraLive: false,
  pendingSpokenMedicineName: null,
};
const guidance = (cameraMode: "ready" | "preview" | "fallback", cameraIssue: "denied" | null = null): CommandContext => ({
  ...base,
  state: "camera-guidance",
  cameraMode,
  cameraIssue,
});
const said = (text: string, ctx: CommandContext) => {
  const r = interpretUtterance(text, ctx);
  return r.kind === "event" ? r.event : r.kind === "reply" ? r.key : r.kind === "ui" ? r.action : r.kind;
};
const GRANT = { type: "CAMERA_CONSENT", granted: true };
const DECLINE = { type: "CAMERA_CONSENT", granted: false };

describe("the consent question (camera or photo)", () => {
  it.each(["yes", "yes please", "okay, go ahead", "yes, take a photo", "I want to choose a photo", "from my gallery please", "我想选一张照片", "可以"])(
    "%j is a yes: it only brings up Take photo and Upload",
    (text) => expect(said(text, base)).toEqual(GRANT),
  );

  it.each(["no", "no thanks", "I'd rather not", "don't use the camera", "不用"])("%j is a no", (text) => expect(said(text, base)).toEqual(DECLINE));

  it.each(["maybe", "I'm not sure", "hmm", "is the photo kept?"])("%j is neither: the companion asks again", (text) => {
    expect(said(text, base)).toBe("unclear");
  });

  it.each(["ok", "okay", "sounds good", "no problem", "sure, go for it"])("%j answers “Is that okay?” with a yes", (text) => {
    expect(said(text, base)).toEqual(GRANT);
  });

  it("'ok?' asks rather than agrees", () => expect(said("ok?", base)).toBe("unclear"));

  it("the name and strength can simply be said instead", () => {
    expect(said("It's Metformin, 500 mg", base)).toMatchObject({ type: "SUBMIT_LABEL", input: { mode: "typed" } });
  });

  it("the question says what is kept and what to say", () => {
    expect(t("en", "cameraPermissionBody")).toMatch(/only look at the medicine name, and the photo won’t be kept/);
    expect(t("en", "cameraPurpose")).toMatch(/Is that okay with you\?.*rather not.*name and strength/);
  });

  it("the AI meaning-match may only decline here, never consent", () => {
    const actions = spokenActions(base);
    expect(actions.map((a) => a.event)).toEqual([DECLINE]);
  });
});

describe("after the yes, the camera and photos", () => {
  it("ready: 'take a photo' opens the camera; asking to upload says where to tap", () => {
    expect(said("take a photo", guidance("ready"))).toEqual({ type: "OPEN_CAMERA" });
    expect(said("use the camera", guidance("ready"))).toEqual({ type: "OPEN_CAMERA" });
    expect(said("I'll upload one", guidance("ready"))).toBe("photoNeedsTap");
    expect(t("en", "photoNeedsTap")).toContain(`“${t("en", "uploadPhoto")}”`);
    expect(t("zh-Hans", "photoNeedsTap")).toContain(`“${t("zh-Hans", "uploadPhoto")}”`);
  });

  it("the camera open: 'take the photo' captures (when live), 'cancel' closes it", () => {
    expect(said("take the photo", { ...guidance("preview"), cameraLive: true })).toBe("capture");
    expect(said("cancel", guidance("preview"))).toEqual({ type: "CLOSE_CAMERA" });
    expect(said("upload one instead", guidance("preview"))).toEqual({ type: "CLOSE_CAMERA" });
  });

  it("after a no, 'show the label' asks again; with the camera off, it says where Upload is", () => {
    expect(said("show the label", guidance("fallback"))).toEqual({ type: "SHOW_LABEL_AGAIN" });
    expect(said("actually, let me show you the box", guidance("fallback"))).toEqual({ type: "SHOW_LABEL_AGAIN" });
    expect(said("show the label", guidance("fallback", "denied"))).toBe("photoNeedsTap");
  });
});

describe("in the call", () => {
  beforeEach(() => {
    sessionStore.reset();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  });
  afterEach(() => vi.unstubAllGlobals());

  const type = (text: string) => {
    fireEvent.change(screen.getByLabelText(/type a message/i), { target: { value: text } });
    fireEvent.submit(screen.getByLabelText(/type a message/i).closest("form")!);
  };
  const actions = () => document.querySelector<HTMLElement>("[data-label-actions]");

  it("no buttons on the question; a typed yes puts Take photo and Upload inside the companion's message", () => {
    sessionStore.setForTest(run([startCall, { type: "USER_MESSAGE", text: "What is this for?", via: "typed" }, chooseShowMedicine]));
    render(<CompanionExperience />);
    expect(screen.getByText(t("en", "cameraPermissionBody")).closest("[data-transcript]")).not.toBeNull();
    expect(actions()).toBeNull();
    expect(screen.queryByRole("button", { name: /take photo|upload/i })).toBeNull();

    type("ok?"); // a question is not a yes
    expect(sessionStore.getSnapshot().state).toBe("camera-permission");
    expect(actions()).toBeNull();

    type("yes");
    expect(sessionStore.getSnapshot().cameraMode).toBe("ready"); // no camera started by the yes
    expect(document.querySelector("[data-pinned]")).toBeNull();
    const box = actions()!;
    expect(box.closest('[data-speaker="companion"]')).toHaveTextContent(t("en", "cameraReady"));
    expect(within(box).getAllByRole("button").map((b) => b.textContent)).toEqual(["Take photo", "Upload"]);
    expect(document.querySelector<HTMLInputElement>("[data-photo-input]")).not.toHaveAttribute("capture");
  });

  it("Take photo opens the in-app camera (capture, flip, close); Close brings the two buttons back", () => {
    // A camera that is still starting (never fails in the test).
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(() => new Promise(() => {})) } });
    sessionStore.setForTest(run([startCall, { type: "USER_MESSAGE", text: "What is this for?", via: "typed" }, chooseShowMedicine, grantCamera]));
    render(<CompanionExperience />);
    fireEvent.click(within(actions()!).getByRole("button", { name: "Take photo" }));
    expect(sessionStore.getSnapshot().cameraMode).toBe("preview");
    expect(actions()).toBeNull(); // hidden while the camera is open
    const panel = document.querySelector<HTMLElement>("[data-pinned]")!;
    expect(within(panel).getByRole("button", { name: /take photo of label/i })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Close camera" }));
    expect(sessionStore.getSnapshot().cameraMode).toBe("ready");
    expect(within(actions()!).getAllByRole("button")).toHaveLength(2);
  });

  it("Upload goes through the existing photo handler; the buttons go once the photo is sent", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // the label check is still running
    sessionStore.setForTest(run([startCall, { type: "USER_MESSAGE", text: "What is this for?", via: "typed" }, chooseShowMedicine, grantCamera]));
    render(<CompanionExperience />);
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], "label.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(document.querySelector<HTMLInputElement>("[data-photo-input]")!, { target: { files: [file] } });
    });
    expect(preparePhoto).toHaveBeenCalled();
    expect(sessionStore.getSnapshot().state).toBe("analyzing");
    expect(sessionStore.getSnapshot().pendingLabel).toMatchObject({ mode: "image", source: "upload" });
    expect(actions()).toBeNull();
  });

  it("a no: no buttons, the name still works; 'show the label' asks again", () => {
    sessionStore.setForTest(run([startCall, { type: "USER_MESSAGE", text: "What is this for?", via: "typed" }, chooseShowMedicine]));
    render(<CompanionExperience />);
    type("no thanks");
    expect(sessionStore.getSnapshot().cameraMode).toBe("fallback");
    expect(actions()).toBeNull();
    expect(screen.getByText(t("en", "fallbackBody"))).toBeInTheDocument();
    type("show the label");
    expect(sessionStore.getSnapshot().state).toBe("camera-permission");
    act(() => dispatch({ type: "CAMERA_CONSENT", granted: true }));
    expect(actions()).not.toBeNull();
  });
});
