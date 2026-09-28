import { Camera, Check, LifeBuoy, Mic } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CompanionLogo } from "./companion-logo";

export type OrbState = "idle" | "listening" | "speaking" | "camera" | "matched" | "safety";

// The companion's own mark when it is simply present or talking; a semantic
// icon when the state means something specific (hearing you, camera, match, help).
const ICONS = {
  idle: CompanionLogo,
  listening: Mic,
  speaking: CompanionLogo,
  camera: Camera,
  matched: Check,
  safety: LifeBuoy,
} as const;

/**
 * Non-human companion presence: halo + three layered circles + a semantic icon.
 * Decorative (aria-hidden); the state is always also communicated in text.
 * Animation lives in globals.css and is transform/opacity only, static under
 * prefers-reduced-motion.
 */
export function CompanionOrb({
  state = "idle",
  size = "lg",
  className,
}: {
  state?: OrbState;
  size?: "lg" | "sm";
  className?: string;
}) {
  const Icon = ICONS[state];
  return (
    <div
      className={cn("orb", size === "sm" && "orb--sm", className)}
      data-state={state}
      aria-hidden="true"
    >
      <span className="orb-halo" />
      <span className="orb-ring orb-ring--1" />
      <span className="orb-ring orb-ring--2" />
      <span className="orb-layer--outer" />
      <span className="orb-layer--mid" />
      {state === "camera" && <span className="orb-focus" />}
      <span className="orb-layer--core">
        <Icon key={state} className="orb-icon h-1/2 w-1/2" strokeWidth={2.25} />
      </span>
    </div>
  );
}
