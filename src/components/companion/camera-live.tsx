"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { CameraIssue } from "@/lib/session/state-machine";

export type CameraFacing = "environment" | "user";

/**
 * Local camera preview. Mounted only after the user consented, defaults to the
 * rear camera, never records or uploads video, and stops every track when it
 * unmounts (leaving the screen, flipping camera, analysing, ending the call).
 */
export function CameraLive({
  facing,
  videoRef,
  onLive,
  onError,
}: {
  facing: CameraFacing;
  videoRef: RefObject<HTMLVideoElement | null>;
  onLive: (canFlip: boolean) => void;
  onError: (issue: CameraIssue) => void;
}) {
  // Latest callbacks without re-running the stream effect.
  const callbacks = useRef({ onLive, onError });
  useEffect(() => {
    callbacks.current = { onLive, onError };
  });

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;

    if (!devices?.getUserMedia) {
      callbacks.current.onError("unavailable");
      return;
    }

    devices
      .getUserMedia({
        video: { facingMode: facing === "environment" ? { ideal: "environment" } : "user" },
        audio: false, // the microphone is never requested here
      })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          await Promise.resolve(video.play?.()).catch(() => undefined);
        }
        let canFlip = false;
        try {
          const all = await devices.enumerateDevices();
          canFlip = all.filter((d) => d.kind === "videoinput").length > 1;
        } catch {
          /* flip stays hidden */
        }
        if (!cancelled) callbacks.current.onLive(canFlip);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = (err as { name?: string } | null)?.name;
        callbacks.current.onError(
          name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable",
        );
      });

    const video = videoRef.current;
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [facing, videoRef]);

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      autoPlay
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
      style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}
