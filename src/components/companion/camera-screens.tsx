"use client";

import { ScanLine, SwitchCamera } from "lucide-react";
import { CameraPreview } from "@/components/ui/camera-preview";
import { PrimaryButton, SecondaryButton, TextAction } from "@/components/ui/buttons";
import { CompanionOrb } from "@/components/ui/companion-orb";
import { DemoNotice } from "@/components/ui/notices";
import type { CameraMode } from "@/lib/session/state-machine";
import type { DemoAssetId } from "@/types/content";
import { StateLabel, type T } from "./screen-chrome";

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
 * 04-label-camera-guidance. In this build no camera is opened: the panel is an
 * illustration and the deterministic demo label is the way forward. If the user
 * declined the camera, the same demo-label route opens (never a dead end).
 */
export function CameraGuidanceScreen({
  t,
  mode,
  onSubmitDemo,
}: {
  t: T;
  mode: CameraMode;
  onSubmitDemo: (asset: DemoAssetId) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      {mode === "preview" ? (
        <>
          <div className="text-center">
            <StateLabel>{t("cameraGuidanceLabel")}</StateLabel>
            <h1 className="mt-1 text-[26px] font-bold leading-tight">
              {t("cameraGuidanceHeading")}
            </h1>
          </div>
          <CameraPreview
            statusLabel={t("cameraPermissionLabel")}
            badgeLabel={t("oneMedicineOnly")}
            youLabel={t("you")}
            summary={`${t("cameraGuidanceHeading")} ${t("demoCameraNote")}`}
          />
          <p className="text-center text-base text-navy-700">{t("cameraGuidanceBody")}</p>
          <DemoNotice role="note">{t("demoCameraNote")}</DemoNotice>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4 pt-4 text-center">
          <CompanionOrb size="sm" state="camera" />
          <h1 className="text-[26px] font-bold leading-tight">{t("fallbackHeading")}</h1>
          <p className="max-w-[21rem] text-lg leading-normal">{t("fallbackBody")}</p>
        </div>
      )}

      <PrimaryButton
        onClick={() => onSubmitDemo("sample_metformin_label")}
        icon={<ScanLine className="h-5 w-5" aria-hidden="true" />}
      >
        {t("useDemoLabel")}
      </PrimaryButton>

      <div
        role="group"
        aria-label={t("safetyExamples")}
        className="flex flex-col items-center gap-0.5 pb-2"
      >
        <p className="text-[13px] font-bold text-navy-700">{t("safetyExamples")}</p>
        <TextAction onClick={() => onSubmitDemo("sample_unreadable_label")}>
          {t("demoUnreadable")}
        </TextAction>
        <TextAction onClick={() => onSubmitDemo("sample_mismatch_label")}>
          {t("demoMismatch")}
        </TextAction>
      </div>
    </div>
  );
}

/** Brief deterministic "checking" beat between label submission and the result. */
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
