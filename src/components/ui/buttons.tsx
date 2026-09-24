import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  /**
   * 48px instead of 56px, for the temporary in-call controls that share the
   * pinned area with the typed fallback (design-standard.md §PrimaryButton).
   * Still well clear of the 44px tap-target floor, and never used for the
   * landing CTA or for a consent/confirmation decision, where full size is the
   * point.
   */
  compact?: boolean;
};

const compactSize = (compact?: boolean) =>
  compact ? "min-h-12 py-2 text-base" : "min-h-14 py-3 text-lg";

/** Navy fill, 56px min height (48px compact). Landing must render exactly one of these. */
export function PrimaryButton({ icon, children, className, compact, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      data-variant="primary"
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-pill bg-navy-900 px-6 font-bold text-white",
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
        "inline-flex w-full items-center justify-center gap-2 rounded-pill border border-teal-600/30 bg-teal-100 px-6 font-bold text-navy-900",
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
