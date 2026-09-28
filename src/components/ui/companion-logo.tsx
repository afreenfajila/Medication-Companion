import type { SVGProps } from "react";

/**
 * The companion's mark: a speech bubble (it talks with you) with a small
 * sparkle (it's an AI guide). Drawn on a 24px grid in the same style as the
 * Lucide icons it sits beside, and coloured by `currentColor`. Decorative by
 * default — the companion is always also named in text.
 */
export function CompanionLogo({ strokeWidth = 1.9, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M14.2 2.1A10.2 10.2 0 0 0 2.5 16.9L1.3 21.4 6.2 20.3A10.2 10.2 0 0 0 22.7 10.4" />
      <path d="M18.4 1.7Q19.3 5.5 23 6.4Q19.3 7.3 18.4 11.1Q17.5 7.3 13.8 6.4Q17.5 5.5 18.4 1.7Z" />
      <circle cx="6.4" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
