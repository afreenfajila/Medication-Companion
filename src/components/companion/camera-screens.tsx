"use client";

import { Camera, ImageUp, SwitchCamera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PrimaryButton, TextAction } from "@/components/ui/buttons";
import { CameraPreview } from "@/components/ui/camera-preview";
import { validateImage } from "@/lib/label/image-validation";
import { setPendingImage } from "@/lib/label/pending-image";
import { preparePhoto } from "@/lib/label/prepare-photo";
import type { CameraIssue } from "@/lib/session/state-machine";
import { registerCapture } from "@/lib/voice/actions";
import type { LabelInput } from "@/types/content";
import { CameraLive, type CameraFacing } from "./camera-live";
import type { T } from "./screen-chrome";

/** The inline buttons inside a companion message: small, but a full 48px target. */
const inline =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-pill border border-navy-700/30 bg-surface px-4 text-[16px] font-bold text-navy-900 hover:bg-teal-100";

/**
 * "Upload" (CLAUDE.md § H2). A plain file input WITHOUT `capture`, so phones offer the photo
 * library and files and computers open the file dialog; the system picker hands over only the
 * chosen file, so no permission prompt. The photo is shrunk and re-encoded here (dropping EXIF),
 * then goes through the same analysis → possible match → confirmation as a camera photo.
 */
export function PhotoPicker({ t, onSubmit }: { t: T; onSubmit: (input: LabelInput) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(false);

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
      <button type="button" className={inline} onClick={() => inputRef.current?.click()}>
        <ImageUp className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{t("uploadPhoto")}</span>
      </button>
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
        <p role="alert" className="w-full text-base font-medium text-danger-800">
          {t("photoFormat")}
        </p>
      )}
    </>
  );
}

/**
 * Inside the companion's "Tap Take photo or Upload" message, only after her consent yes: Take
 * photo opens the in-app camera; Upload opens the phone's picker. With the camera off or missing,
 * Upload alone. Gone once a photo is sent or the conversation moves on.
 */
export function LabelActions({
  t,
  which,
  onTakePhoto,
  onSubmit,
}: {
  t: T;
  which: "both" | "upload";
  onTakePhoto: () => void;
  onSubmit: (input: LabelInput) => void;
}) {
  return (
    <div data-label-actions className="mt-2 flex flex-wrap gap-2">
      {which === "both" && (
        <button type="button" className={inline} onClick={onTakePhoto}>
          <Camera className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{t("takePhoto")}</span>
        </button>
      )}
      <PhotoPicker t={t} onSubmit={onSubmit} />
    </div>
  );
}

/**
 * 04-label-camera-guidance: the in-app camera, opened only from Take photo after consent — a
 * smaller inline panel on the SAME call screen, not a full-screen view. A LOCAL preview (rear
 * camera by default, flip where supported); a still is captured only on a tap or "take the
 * photo". Close goes back to Take photo / Upload. If the camera fails, the call falls back.
 */
export function CameraGuidanceScreen({
  t,
  onSubmit,
  onClose,
  onCameraFailed,
}: {
  t: T;
  onSubmit: (input: LabelInput) => void;
  onClose: () => void;
  onCameraFailed: (issue: CameraIssue) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [live, setLive] = useState(false);
  const [canFlip, setCanFlip] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!live) return;
    registerCapture(() => captureRef.current());
    return () => registerCapture(null);
  }, [live]);

  const flip = () => {
    setLive(false);
    setCanFlip(false);
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  };

  // What to do is said in the conversation; here are only the camera and its own controls.
  return (
    <div className="flex flex-col gap-3">
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
      {!live && (
        <p role="status" className="text-center text-base text-navy-700">
          {t("cameraStarting")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-center text-base font-medium text-danger-800">
          {error}
        </p>
      )}
      <PrimaryButton compact onClick={capture} disabled={!live} icon={<Camera className="h-5 w-5" aria-hidden="true" />}>
        {t("captureLabel")}
      </PrimaryButton>
      <div className="flex flex-wrap items-center justify-center gap-x-2">
        {canFlip && (
          <TextAction onClick={flip} icon={<SwitchCamera className="h-4 w-4" aria-hidden="true" />}>
            {facing === "environment" ? t("flipToFace") : t("flipToMedicine")}
          </TextAction>
        )}
        <TextAction onClick={onClose} icon={<X className="h-4 w-4" aria-hidden="true" />}>
          {t("closeCamera")}
        </TextAction>
      </div>
    </div>
  );
}
