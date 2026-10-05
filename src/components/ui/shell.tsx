import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Page-level wrapper: warm canvas on phones, a soft desk tone behind the phone on desktop. */
export function AppShell({
  children,
  wide = false,
  className,
}: {
  children: ReactNode;
  /** Caregiver dashboard uses a wider (≤1100px) container instead of the phone shell. */
  wide?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-dvh bg-canvas",
        wide ? "" : "md:flex md:items-center md:justify-center md:bg-desk md:px-4 md:py-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Phone-shaped shell on desktop (≈430px, 852px tall), a native full-height
 * layout on small screens. Horizontal padding is ≥24px, applied by `ScreenBody`.
 * Exactly the screen's height on phones too (not min-height), so a long call
 * scrolls inside `ScreenBody` and the call controls never scroll away.
 */
export function PhoneShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto flex h-dvh w-full max-w-[430px] flex-col bg-canvas",
        "md:h-[852px] md:min-h-0 md:max-h-[calc(100dvh-3rem)] md:overflow-hidden md:rounded-[44px] md:border-[10px] md:border-navy-900 md:shadow-[0_24px_60px_rgb(23_50_77/0.25)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Scrolling region inside the phone shell. */
export function ScreenBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-4", className)}>
      {children}
    </div>
  );
}
