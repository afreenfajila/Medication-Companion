import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
};

/** Navy fill, 56px min height. Landing must render exactly one of these. */
export function PrimaryButton({ icon, children, className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      data-variant="primary"
      className={cn(
        "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-pill bg-navy-900 px-6 py-3 text-lg font-bold text-white",
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

/** Light-teal alternative decision — same 56px height, never visually buried. */
export function SecondaryButton({ icon, children, className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      data-variant="secondary"
      className={cn(
        "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-pill border border-teal-600/30 bg-teal-100 px-6 py-3 text-lg font-bold text-navy-900",
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
