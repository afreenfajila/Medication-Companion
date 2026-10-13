import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionExperience } from "@/components/companion/companion-experience";
import { t } from "@/lib/content/translations";
import { sessionStore } from "@/lib/session/session-store";
import { interpretUtterance, spokenActions, type CommandContext } from "@/lib/voice/commands";
import { chooseCamera, chooseShowMedicine, run, startCall } from "./helpers";

/**
 * Owner report: on "may I use the camera?", saying "I want to choose a photo" was
 * taken as wanting the camera. A photo they already have is "not the camera":
 * declining opens the photo, medicine-list and typing choices. Taking a photo now
 * is still the camera.
 */
const base: CommandContext = {
  state: "camera-permission",
  contextualActions: [],
  candidateId: null,
  explainStep: 0,
  cameraLive: false,
  pendingSpokenMedicineName: null,
};
const permission: CommandContext = { ...base, showMethod: "camera" };
const choice: CommandContext = { ...base, showMethod: "choose" };
const said = (text: string, ctx: CommandContext) => {
  const r = interpretUtterance(text, ctx);
  return r.kind === "event" ? r.event : r.kind === "reply" ? r.key : r.kind;
};

describe("a photo they already have is not the camera", () => {
  it.each(["I want to choose a photo", "can I upload a picture instead", "from my gallery please", "I'd rather use a photo", "我想选一张照片", "从相册上传"])(
    "on 'may I use the camera?', %j declines the camera (photo choices open)",
    (text) => {
      expect(said(text, permission)).toEqual({ type: "CAMERA_CONSENT", granted: false });
    },
  );

  it("'yes, take a photo' is still the camera; 'yes' alone too", () => {
    expect(said("yes, take a photo", permission)).toEqual({ type: "CAMERA_CONSENT", granted: true });
    expect(said("yes please", permission)).toEqual({ type: "CAMERA_CONSENT", granted: true });
  });

  it("on the first 'camera or photo?' choice, asking for a photo says where to tap (the picker needs a tap)", () => {
    expect(said("I want to choose a photo", choice)).toBe("photoNeedsTap");
    expect(said("use the camera", choice)).toEqual({ type: "CHOOSE_CAMERA" });
    expect(t("en", "photoNeedsTap")).toContain(`“${t("en", "choosePhoto")}”`);
    expect(t("zh-Hans", "photoNeedsTap")).toContain(`“${t("zh-Hans", "choosePhoto")}”`);
  });

  it("the AI meaning-match is told that 'not the camera' includes choosing a photo", () => {
    const [action] = spokenActions(permission);
    expect(action.description).toMatch(/choose a photo/);
    expect(action.event).toEqual({ type: "CAMERA_CONSENT", granted: false });
  });
});

describe("in the call", () => {
  beforeEach(() => {
    sessionStore.reset();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("typing 'I want to choose a photo' on the camera question opens the photo choice, with no camera", () => {
    sessionStore.setForTest(run([startCall, { type: "USER_MESSAGE", text: "What is this for?", via: "typed" }, chooseShowMedicine, chooseCamera]));
    render(<CompanionExperience />);
    expect(screen.getByRole("button", { name: /yes, switch camera/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/type it here/i), { target: { value: "I want to choose a photo" } });
    fireEvent.submit(screen.getByLabelText(/type it here/i).closest("form")!);
    const s = sessionStore.getSnapshot();
    expect(s.state).toBe("camera-guidance");
    expect(s.cameraMode).toBe("fallback"); // no camera was started
    expect(screen.getByRole("button", { name: t("en", "choosePhoto") })).toBeInTheDocument();
  });
});
