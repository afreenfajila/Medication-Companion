"use client";

import { Camera, ImageUp, ListChecks, Pill, SwitchCamera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton, TextAction } from "@/components/ui/buttons";
import { CameraPreview } from "@/components/ui/camera-preview";
import { recordMedicines } from "@/lib/content/seed-record";
import { validateImage } from "@/lib/label/image-validation";
import { setPendingImage } from "@/lib/label/pending-image";
import { preparePhoto } from "@/lib/label/prepare-photo";
import type { CameraIssue, CameraMode } from "@/lib/session/state-machine";
import { registerCapture } from "@/lib/voice/actions";
import type { LabelInput } from "@/types/content";
import { CameraLive, type CameraFacing } from "./camera-live";
import { StateLabel, type T } from "./screen-chrome";
import { TypedLabelForm } from "./typed-label-form";

/**
 * "Choose a photo" (CLAUDE.md § H2). A plain file input WITHOUT `capture`, so
 * phones offer the photo library and files and computers open the file dialog;
 * the system picker hands over only the chosen file, so no permission prompt.
 * The photo is shrunk and re-encoded here (dropping EXIF), then goes through the
 * same analysis → possible match → confirmation as a camera photo.
 */
export function PhotoPicker({
  t,
  onSubmit,
  primary = false,
  compact = false,
}: {
  t: T;
  onSubmit: (input: LabelInput) => void;
  primary?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(false);
  const Button = primary ? PrimaryButton : SecondaryButton;

  const onPicked = async (file: File | undefined) => {
    if (!file) return;
    setError(false);
    const photo = await preparePhoto(file);
    const check = photo ? validateImage(photo) : null;
    if (!photo || !check?.ok) {
      setError(true); // e.g. HEIC the browser can't open: offer another photo or the camera
      return;
    }
    setPendingImage(photo);
    onSubmit({ mode: "image", source: "upload", mimeType: check.mimeType, byteSize: photo.size });
  };

  return (
    <>
      <Button
        compact={compact}
        icon={<ImageUp className="h-5 w-5" aria-hidden="true" />}
        onClick={() => inputRef.current?.click()}
      >
        {t("choosePhoto")}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        data-photo-input
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void onPicked(e.target.files?.[0]);
          e.target.value = ""; // choosing the same photo again still fires
        }}
      />
      {error && (
        <p role="alert" className="text-center text-base font-medium text-danger-800">
          {t("photoFormat")}
        </p>
      )}
    </>
  );
}

/**
 * After "Show medicine": camera or photo, equally (CLAUDE.md § H2), or typing.
 * Nothing touches the camera here — "Use camera" leads to the consent question.
 */
export function ShowMedicineChoice({
  t,
  onCamera,
  onSubmit,
}: {
  t: T;
  onCamera: () => void;
  onSubmit: (input: LabelInput) => void;
}) {
  const [typing, setTyping] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="text-[22px] font-bold leading-tight">{t("showMedicineHeading")}</h2>
        <p className="mx-auto mt-2 max-w-[21rem] text-lg leading-normal">{t("photoIntro")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton compact onClick={onCamera} icon={<Camera className="h-5 w-5" aria-hidden="true" />}>
          {t("useCamera")}
        </PrimaryButton>
        <div className="flex flex-col gap-2">
          <PhotoPicker t={t} onSubmit={onSubmit} primary compact />
        </div>
      </div>
      <TextAction className="self-center" aria-expanded={typing} onClick={() => setTyping(!typing)}>
        {t("typeName")}
      </TextAction>
      {typing && <TypedLabelForm t={t} onSubmit={onSubmit} />}
    </div>
  );
}

/** 03-label-camera-permission, after "Use camera". Approve and refuse are equally tappable. */
export function CameraPermissionScreen({
  t,
  onGrant,
  onDecline,
}: {
  t: T;
  onGrant: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <StateLabel>{t("cameraPermissionLabel")}</StateLabel>
        <h2 className="mt-1 text-[22px] font-bold leading-tight">{t("cameraPermissionHeading")}</h2>
        <p className="mx-auto mt-2 max-w-[21rem] text-lg leading-normal">{t("cameraPermissionBody")}</p>
        <p className="mx-auto mt-2 max-w-[21rem] text-[15px] text-navy-700">{t("cameraPurpose")}</p>
      </div>
      <div className="flex flex-col gap-3">
        <PrimaryButton onClick={onGrant} icon={<SwitchCamera className="h-5 w-5" aria-hidden="true" />}>
          {t("switchCamera")}
        </PrimaryButton>
        <SecondaryButton onClick={onDecline}>{t("notNow")}</SecondaryButton>
      </div>
    </div>
  );
}

/**
 * 04-label-camera-guidance, as the pinned card for that step — a smaller inline
 * panel on the SAME call screen, not a separate full-screen camera view. With
 * consent, shows a LOCAL camera preview (rear camera by default, flip where
 * supported). A still is captured only when the user taps the button. If the
 * camera is declined/blocked/absent — or simply not wanted — choosing a photo,
 * choosing from the record, or typing all work, so nothing depends on hardware.
 */
export function CameraGuidanceScreen({
  t,
  mode,
  issue,
  onSubmit,
  onChooseMedicine,
  onCameraFailed,
}: {
  t: T;
  mode: CameraMode;
  issue: CameraIssue | null;
  onSubmit: (input: LabelInput) => void;
  onChooseMedicine: (medicineId: string) => void;
  onCameraFailed: (issue: CameraIssue) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [live, setLive] = useState(false);
  const [canFlip, setCanFlip] = useState(false);
  const [panel, setPanel] = useState<"typed" | "medicines" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = mode === "preview";

  const capture = () => {
    const video = videoRef.current;
    if (!live || !video || video.videoWidth === 0) return;
    setError(null);
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError(t("captureError"));
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        const check = blob ? validateImage(blob) : null;
        if (!blob || !check?.ok) return setError(t("captureError"));
        setPendingImage(blob);
        onSubmit({ mode: "image", source: "camera", mimeType: check.mimeType, byteSize: blob.size });
      },
      "image/jpeg",
      0.85,
    );
  };

  // A spoken "take a photo" runs exactly the button's handler (only while the camera is live).
  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  });
  useEffect(() => {
    if (!preview || !live) return;
    registerCapture(() => captureRef.current());
    return () => registerCapture(null);
  }, [preview, live]);

  const flip = () => {
    setLive(false);
    setCanFlip(false);
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  };

  const heading =
    issue === "denied"
      ? t("cameraDeniedHeading")
      : issue === "unavailable"
        ? t("cameraUnavailableHeading")
        : t("fallbackHeading");
  const body =
    issue === "denied"
      ? t("cameraDeniedBody")
      : issue === "unavailable"
        ? t("cameraUnavailableBody")
        : t("fallbackBody");

  // Every way to show the label without the camera. Always open when the camera
  // is off; behind one "Other ways" link when the live camera is the main action.
  const otherWays = (
    <div className="flex flex-col gap-4">
      <p className="mx-auto max-w-[21rem] text-center text-[15px] text-navy-700">{t("spokenLabelHint")}</p>

      <div role="group" aria-label={t("moreWays")} className="flex flex-col gap-3">
        <PhotoPicker t={t} onSubmit={onSubmit} primary={!preview} />
        <SecondaryButton
          aria-expanded={panel === "medicines"}
          onClick={() => setPanel(panel === "medicines" ? null : "medicines")}
          icon={<ListChecks className="h-5 w-5" aria-hidden="true" />}
        >
          {t("chooseFromMedicines")}
        </SecondaryButton>
        {panel === "medicines" && (
          <section
            aria-label={t("medicineListHeading")}
            className="fade-in flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
          >
            <h3 className="text-[18px] font-bold leading-tight">{t("medicineListHeading")}</h3>
            <p className="text-sm leading-snug text-navy-700">{t("medicineListNote")}</p>
            {/* Name and strength only — never instructions. Picking one is a possible match to confirm. */}
            <ul className="flex flex-col gap-2">
              {recordMedicines.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onChooseMedicine(m.id)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-md border border-line bg-canvas px-4 py-2 text-left text-lg font-medium hover:border-teal-600"
                  >
                    <Pill className="h-5 w-5 shrink-0 text-teal-800" aria-hidden="true" />
                    <span>{m.identity.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <TextAction
          className="self-center"
          aria-expanded={panel === "typed"}
          onClick={() => setPanel(panel === "typed" ? null : "typed")}
        >
          {t("typeLabelToggle")}
        </TextAction>
        {panel === "typed" && <TypedLabelForm t={t} onSubmit={onSubmit} />}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {preview ? (
        <>
          <div className="text-center">
            <StateLabel>{t("cameraGuidanceLabel")}</StateLabel>
            <h2 className="mt-1 text-[20px] font-bold leading-tight">{t("cameraGuidanceHeading")}</h2>
          </div>
          {/* A smaller inline panel — part of this same call screen, not a full takeover. */}
          <CameraPreview
            live={live}
            statusLabel={t("cameraPermissionLabel")}
            badgeLabel={t("oneMedicineOnly")}
            youLabel={t("you")}
            summary={t("cameraLiveSummary")}
            className="max-h-64"
            feed={
              <CameraLive
                key={facing}
                facing={facing}
                videoRef={videoRef}
                onLive={(flipOk) => {
                  setLive(true);
                  setCanFlip(flipOk);
                }}
                onError={onCameraFailed}
              />
            }
          />
          <p role="status" className="text-center text-base text-navy-700">
            {live ? `${t("cameraGuidanceBody")} ${t("cameraPrivacy")}` : t("cameraStarting")}
          </p>
          {canFlip && (
            <TextAction
              className="self-center"
              onClick={flip}
              icon={<SwitchCamera className="h-4 w-4" aria-hidden="true" />}
            >
              {facing === "environment" ? t("flipToFace") : t("flipToMedicine")}
            </TextAction>
          )}
          <PrimaryButton
            onClick={capture}
            disabled={!live}
            icon={<Camera className="h-5 w-5" aria-hidden="true" />}
          >
            {t("captureLabel")}
          </PrimaryButton>
        </>
      ) : (
        <div className="text-center">
          <h2 className="text-[20px] font-bold leading-tight">{heading}</h2>
          <p className="mx-auto mt-1 max-w-[21rem] text-lg leading-normal">{body}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-center text-base font-medium text-danger-800">
          {error}
        </p>
      )}

      {preview ? (
        // With the camera on, capture is THE action: the fallbacks wait one tap away.
        <details className="text-center">
          <summary className="inline-flex min-h-11 cursor-pointer items-center px-3 text-base font-medium text-teal-800 underline underline-offset-4">
            {t("moreWays")}
          </summary>
          <div className="mt-2 text-left">{otherWays}</div>
        </details>
      ) : (
        otherWays
      )}
    </div>
  );
}

/** Brief "checking" beat between label submission and the result — an inline note, not a full screen. */
export function AnalyzingScreen({ t }: { t: T }) {
  return (
    <div role="status" className="flex flex-col items-center gap-1 py-2 text-center">
      <StateLabel>{t("analyzingLabel")}</StateLabel>
      <h2 className="text-[20px] font-bold leading-tight">{t("analyzingHeading")}</h2>
      <p className="mx-auto max-w-[21rem] text-base leading-normal text-navy-700">{t("analyzingBody")}</p>
    </div>
  );
}
