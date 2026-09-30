"use client";

import { FlaskConical } from "lucide-react";
import { useEffect } from "react";
import { dispatch } from "@/lib/session/session-store";
import type { StudyCondition } from "@/lib/study/study-mode";

/**
 * Study mode only. Hands the server-read condition to the session (which
 * swaps the explanation and tags the audit log) and shows a small badge on
 * every screen. The badge never says which condition is running.
 */
export function StudyBadge({ condition }: { condition: StudyCondition | null }) {
  // Also runs with null, so ending a study session clears it without a reload.
  useEffect(() => {
    dispatch({ type: "SET_STUDY_CONDITION", condition });
  }, [condition]);

  if (!condition) return null;
  return (
    <p
      role="note"
      className="fixed left-2 top-2 z-50 inline-flex items-center gap-1 rounded-pill border border-line bg-surface px-2.5 py-1 text-xs font-bold text-navy-700 shadow-card"
    >
      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
      Study session
    </p>
  );
}
