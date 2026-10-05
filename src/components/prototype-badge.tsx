"use client";

import { t } from "@/lib/content/translations";
import { useSession } from "@/lib/session/session-store";

/**
 * The one prototype marker (CLAUDE.md § H1): small, always visible on every
 * screen, in the person's language. It replaces the old per-button "— demo"
 * labels. Sits in the top padding band so it never covers a heading.
 */
export function PrototypeBadge() {
  const { language } = useSession();
  return (
    <p
      role="note"
      data-prototype-badge
      className="pointer-events-none fixed right-2 top-1 z-50 rounded-pill border border-line bg-surface/95 px-2 py-0.5 text-[11px] font-bold text-navy-700"
    >
      {t(language, "prototypeBadge")}
    </p>
  );
}
