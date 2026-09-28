import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  /**
   * 44px instead of 56px, sized to sit side by side, for the temporary
   * in-call controls that share the pinned area with the typed fallback
   * (design-standard.md §PrimaryButton). Exactly at the 44px tap-target floor,
   * and never used for the landing CTA or for a consent/confirmation decision,
   * where full size is the point.
   */
  compact?: boolean;
};

const compactSize = (compact?: boolean) =>
  compact
    ? "w-full min-h-11 min-w-0 px-3 py-1.5 text-[15px] leading-tight"
    : "w-full min-h-14 px-6 py-3 text-lg";

/** Navy fill, 56px min height (44px compact). Landing must render exactly one of these. */
export function PrimaryButton({ icon, children, className, compact, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      data-variant="primary"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-pill bg-navy-900 font-bold text-white",
        compactSize(compact),
        "transition-colors duration-200 hover:bg-[#1f4368] active:bg-[#12283f]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...rest}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

/** Light-teal alternative decision — matches its primary's height, never visually buried. */
export function SecondaryButton({ icon, children, className, compact, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      data-variant="secondary"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-pill border border-teal-600/30 bg-teal-100 font-bold text-navy-900",
        compactSize(compact),
        "transition-colors duration-200 hover:bg-[#d7ebe9] active:bg-[#c8e2df]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...rest}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

/** Lower-risk navigation. 44px minimum target. */
export function TextAction({ icon, children, className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      data-variant="text"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm px-3 text-base font-medium text-teal-800 underline underline-offset-4",
        "hover:text-navy-900 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...rest}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
