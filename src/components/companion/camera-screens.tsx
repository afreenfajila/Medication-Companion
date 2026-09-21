"use client";

import { Camera, FileImage, ScanLine, SwitchCamera } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { PrimaryButton, SecondaryButton, TextAction } from "@/components/ui/buttons";
import { CameraPreview } from "@/components/ui/camera-preview";
import { CompanionOrb } from "@/components/ui/companion-orb";
import { samplePhotos } from "@/lib/content/samples";
import { setPendingImage } from "@/lib/label/pending-image";
import { validateImage } from "@/lib/label/image-validation";
import type { CameraIssue, CameraMode } from "@/lib/session/state-machine";
import type { LabelInput } from "@/types/content";
import { CameraLive, type CameraFacing } from "./camera-live";
import { StateLabel, type T } from "./screen-chrome";
import { TypedLabelForm } from "./typed-label-form";

/** 03-label-camera-permission. Explain first; approve and refuse are equally tappable. */
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
    <div className="flex flex-1 flex-col items-center gap-6 py-4 text-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <CompanionOrb state="camera" />
        <div>
          <StateLabel>{t("cameraPermissionLabel")}</StateLabel>
          <h1 className="mt-2 text-[28px] font-bold leading-tight">
            {t("cameraPermissionHeading")}
          </h1>
          <p className="mx-auto mt-3 max-w-[21rem] text-lg leading-normal">
            {t("cameraPermissionBody")}
          </p>
          <p className="mx-auto mt-3 max-w-[21rem] text-[15px] text-navy-700">
            {t("cameraPurpose")}
          </p>
        </div>
      </div>
      <div className="flex w-full flex-col gap-3">
        <PrimaryButton onClick={onGrant} icon={<SwitchCamera className="h-5 w-5" aria-hidden="true" />}>
          {t("switchCamera")}
        </PrimaryButton>
        <SecondaryButton onClick={onDecline}>{t("notNow")}</SecondaryButton>
      </div>
    </div>
  );
}

/**
 * 04-label-camera-guidance. With consent, shows a LOCAL camera preview (rear
 * camera by default, flip where supported). A still is captured only when the
 * user taps the button. If the camera is declined/blocked/absent — or simply not
 * wanted — the sample-photo "upload", typed details and demo label all work, so
 * the demo never depends on hardware.
 */
export function CameraGuidanceScreen({
  t,
  mode,
  issue,
  onSubmit,
  onCameraFailed,
}: {
  t: T;
  mode: CameraMode;
  issue: CameraIssue | null;
  onSubmit: (input: LabelInput) => void;
  onCameraFailed: (issue: CameraIssue) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [live, setLive] = useState(false);
  const [canFlip, setCanFlip] = useState(false);
  const [panel, setPanel] = useState<"samples" | "typed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = mode === "preview";

  const submitImage = (blob: Blob, source: "sample" | "camera") => {
    const check = validateImage(blob);
    if (!check.ok) {
      setError(t("captureError"));
      return;
    }
    setPendingImage(blob);
    onSubmit({ mode: "image", source, mimeType: check.mimeType, byteSize: blob.size });
  };

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
      (blob) => (blob ? submitImage(blob, "camera") : setError(t("captureError"))),
      "image/jpeg",
      0.85,
    );
  };

  const chooseSample = async (src: string) => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("sample not found");
      submitImage(await res.blob(), "sample");
    } catch {
      setError(t("sampleLoadError"));
    } finally {
      setBusy(false);
    }
  };

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

  const demoButton = (Btn: typeof PrimaryButton) => (
    <Btn
      onClick={() => onSubmit({ mode: "demo", demoAssetId: "sample_metformin_label" })}
      icon={<ScanLine className="h-5 w-5" aria-hidden="true" />}
    >
      {t("useDemoLabel")}
    </Btn>
  );

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      {preview ? (
        <>
          <div className="text-center">
            <StateLabel>{t("cameraGuidanceLabel")}</StateLabel>
            <h1 className="mt-1 text-[26px] font-bold leading-tight">
              {t("cameraGuidanceHeading")}
            </h1>
          </div>
          <CameraPreview
            live={live}
            statusLabel={t("cameraPermissionLabel")}
            badgeLabel={t("oneMedicineOnly")}
            youLabel={t("you")}
            summary={t("cameraLiveSummary")}
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
        <div className="flex flex-col items-center gap-4 pt-4 text-center">
          <CompanionOrb size="sm" state="camera" />
          <h1 className="text-[26px] font-bold leading-tight">{heading}</h1>
          <p className="max-w-[21rem] text-lg leading-normal">{body}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-center text-base font-medium text-danger-700">
          {error}
        </p>
      )}

      <div role="group" aria-label={t("moreWays")} className="flex flex-col gap-3">
        {!preview && demoButton(PrimaryButton)}
        {preview && demoButton(SecondaryButton)}
        <SecondaryButton
          aria-expanded={panel === "samples"}
          onClick={() => setPanel(panel === "samples" ? null : "samples")}
          icon={<FileImage className="h-5 w-5" aria-hidden="true" />}
        >
          {t("uploadPhoto")}
        </SecondaryButton>

        {panel === "samples" && (
          <section
            aria-label={t("samplePickerHeading")}
            className="fade-in flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
          >
            <h2 className="text-[20px] font-bold leading-tight">{t("samplePickerHeading")}</h2>
            <p className="text-sm leading-snug text-navy-700">{t("samplePickerNote")}</p>
            <ul className="flex flex-col gap-2">
              {samplePhotos.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => chooseSample(p.src)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-md border border-line bg-canvas p-2 text-left text-lg font-medium hover:border-teal-600 disabled:opacity-60"
                  >
                    <Image
                      src={p.src}
                      alt=""
                      width={72}
                      height={51}
                      unoptimized
                      className="h-[51px] w-[72px] shrink-0 rounded-sm object-cover"
                    />
                    <span>{t(p.labelKey)}</span>
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
}

/** Brief "checking" beat between label submission and the result. */
export function AnalyzingScreen({ t }: { t: T }) {
  return (
    <div
      role="status"
      className="flex flex-1 flex-col items-center justify-center gap-6 py-4 text-center"
    >
      <CompanionOrb state="camera" />
      <div>
        <StateLabel>{t("analyzingLabel")}</StateLabel>
        <h1 className="mt-2 text-[28px] font-bold leading-tight">{t("analyzingHeading")}</h1>
        <p className="mx-auto mt-3 max-w-[21rem] text-lg leading-normal">{t("analyzingBody")}</p>
      </div>
    </div>
  );
}
