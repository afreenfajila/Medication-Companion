import { sampleAuditSeeds } from "@/lib/content/fixtures";
import type { AuditEvent, AuditEventType } from "@/types/content";

export type StatusChip = "Confirmed" | "Needs help" | "Pending";

export type DisplayEvent = {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  summary: string;
  route: AuditEvent["route"];
  validationStatus: AuditEvent["validationStatus"];
  origin: "sample" | "session";
  /** Study mode only: the condition the event happened under. */
  studyCondition?: string;
};

const CHIP_BY_EVENT: Partial<Record<AuditEventType, StatusChip>> = {
  "candidate-confirmed": "Confirmed",
  "candidate-denied": "Needs help",
  "help-requested": "Needs help",
  "urgent-safety-triggered": "Needs help",
  "caregiver-help-requested": "Needs help",
  "label-submitted": "Pending",
  "candidate-presented": "Pending",
};

export function chipForEvent(type: AuditEventType): StatusChip | null {
  return CHIP_BY_EVENT[type] ?? null;
}

/** Merges this session's events with clearly-labelled seeded samples, newest first. */
export function buildTimeline(sessionEvents: readonly AuditEvent[]): DisplayEvent[] {
  const live: DisplayEvent[] = sessionEvents.map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    eventType: e.eventType,
    summary: e.summary,
    route: e.route,
    validationStatus: e.validationStatus,
    origin: "session",
    ...(typeof e.details.studyCondition === "string" ? { studyCondition: e.details.studyCondition } : {}),
  }));
  const samples: DisplayEvent[] = sampleAuditSeeds.map((e) => ({ ...e, origin: "sample" }));
  const merged = live.length > 0 ? live : samples;
  // Stable newest-first; ties keep the later-recorded event on top.
  return merged
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.timestamp.localeCompare(a.e.timestamp) || b.i - a.i)
    .map(({ e }) => e);
}

/** The most recent status-bearing event decides the record's current status. */
export function deriveRecordStatus(timelineNewestFirst: readonly DisplayEvent[]): StatusChip {
  for (const e of timelineNewestFirst) {
    const chip = chipForEvent(e.eventType);
    if (chip) return chip;
  }
  return "Pending";
}
