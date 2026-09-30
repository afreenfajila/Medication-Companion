"use client";

import { CircleCheck, Clock, LifeBuoy, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { DemoNotice } from "@/components/ui/notices";
import { metforminPurposeEn, metforminRecord, patient, recordSource } from "@/lib/content/demo-record";
import {
  buildTimeline,
  chipForEvent,
  deriveRecordStatus,
  type DisplayEvent,
  type StatusChip,
} from "@/lib/session/audit-view";
import { useSession } from "@/lib/session/session-store";
import { cn } from "@/lib/utils/cn";

const CHIP_STYLE: Record<StatusChip, { icon: React.ReactNode; className: string }> = {
  Confirmed: {
    icon: <CircleCheck className="h-4 w-4" aria-hidden="true" />,
    className: "bg-teal-100 text-navy-900",
  },
  "Needs help": {
    icon: <LifeBuoy className="h-4 w-4" aria-hidden="true" />,
    className: "bg-danger-100 text-danger-800",
  },
  Pending: {
    icon: <Clock className="h-4 w-4" aria-hidden="true" />,
    className: "bg-line text-navy-700",
  },
};

/** Status is always icon + word, never colour alone. */
function StatusChipView({ chip }: { chip: StatusChip }) {
  const s = CHIP_STYLE[chip];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[13px] font-bold",
        s.className,
      )}
    >
      {s.icon}
      {chip}
    </span>
  );
}

const timeFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const formatTime = (iso: string) => `${timeFormat.format(new Date(iso))} SGT`;

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-navy-700">{term}</dt>
      <dd className="text-lg">{children}</dd>
    </div>
  );
}

/** 08-caregiver-dashboard. One patient, read-only, no editing workflow. */
export function CaregiverDashboard() {
  const session = useSession();
  const timeline = buildTimeline(session.audit);
  const hasLive = timeline.some((e) => e.origin === "session");
  const status = deriveRecordStatus(timeline);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-8">
      <header>
        <p className="text-[13px] font-bold uppercase tracking-wide text-teal-800">
          Prototype · read-only
        </p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight">Caregiver view — prototype</h1>
        <DemoNotice className="mt-4" role="note">
          <strong>Demo only — not a clinical system.</strong> {recordSource.disclaimer} This view
          is read-only: nothing here can change a medicine or its instructions.
        </DemoNotice>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section aria-labelledby="record-heading">
          <h2 id="record-heading" className="text-[22px] font-bold leading-tight">
            Demo record
          </h2>
          <div className="mt-3 rounded-lg border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 rounded-pill bg-teal-100 px-3 py-1.5 text-[13px] font-medium">
                <ShieldCheck className="h-4 w-4 text-teal-800" aria-hidden="true" />
                {recordSource.displayLabel}
              </p>
              <StatusChipView chip={status} />
            </div>
            {!hasLive && (
              <p className="mt-2 text-sm text-navy-700">
                Status shown from sample activity. Start a call as Mei Ling to see live prototype
                activity here.
              </p>
            )}
            <dl className="mt-3 divide-y divide-line">
              <Row term="Patient">{patient.displayName}</Row>
              <Row term="Medicine">
                {metforminRecord.identity.displayName} {metforminRecord.identity.dosageForm}
              </Row>
              <Row term="Purpose">{metforminPurposeEn}</Row>
              <Row term="Verified instruction">
                {metforminRecord.verifiedInstruction.canonicalText}
              </Row>
              <Row term="Record status">Current — demo</Row>
              <Row term="Source">{recordSource.displayLabel}</Row>
            </dl>
          </div>
        </section>

        <section aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="text-[22px] font-bold leading-tight">
            Recent prototype activity
          </h2>
          <ol className="mt-3 flex flex-col gap-2">
            {timeline.map((e) => (
              <TimelineItem key={`${e.origin}-${e.id}`} event={e} />
            ))}
          </ol>
        </section>
      </div>

      <section aria-labelledby="audit-heading" className="mt-8">
        <h2 id="audit-heading" className="text-[22px] font-bold leading-tight">
          Process audit summary
        </h2>
        <p className="mt-1 text-sm text-navy-700">
          Which route ran, the result, and the validation decision. No images, audio, or typed text
          are stored.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[34rem] border-collapse text-left text-[15px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-sm text-navy-700">
                <th scope="col" className="px-4 py-3 font-bold">Time</th>
                <th scope="col" className="px-4 py-3 font-bold">Route</th>
                <th scope="col" className="px-4 py-3 font-bold">Result</th>
                <th scope="col" className="px-4 py-3 font-bold">Validation</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((e) => (
                <tr key={`${e.origin}-${e.id}`} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-4 py-3">{formatTime(e.timestamp)}</td>
                  <td className="px-4 py-3">{e.route}</td>
                  <td className="px-4 py-3">{e.summary}</td>
                  <td className="px-4 py-3">{e.validationStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <nav className="mt-8 flex flex-wrap gap-x-6 gap-y-1 text-base" aria-label="Prototype links">
        <Link href="/companion" className="inline-flex min-h-11 items-center font-medium text-teal-800 underline underline-offset-4">
          Open the companion
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center font-medium text-teal-800 underline underline-offset-4">
          Switch persona
        </Link>
        <Link href="/about" className="inline-flex min-h-11 items-center font-medium text-teal-800 underline underline-offset-4">
          About this prototype
        </Link>
      </nav>
      <p className="mt-2 text-sm text-navy-700">AI guide · Not a pharmacist or doctor</p>
    </div>
  );
}

function TimelineItem({ event }: { event: DisplayEvent }) {
  const chip = chipForEvent(event.eventType);
  return (
    <li className="flex flex-col gap-1 rounded-md border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <time dateTime={event.timestamp} className="text-sm font-medium text-navy-700">
          {formatTime(event.timestamp)}
        </time>
        <span className="flex items-center gap-2">
          {event.studyCondition && (
            <span className="rounded-pill border border-line px-2 py-0.5 text-xs font-medium text-navy-700">
              Study: {event.studyCondition}
            </span>
          )}
          {event.origin === "sample" && (
            <span className="rounded-pill border border-line px-2 py-0.5 text-xs font-medium text-navy-700">
              Sample
            </span>
          )}
          {chip && <StatusChipView chip={chip} />}
        </span>
      </div>
      <p className="text-base leading-snug">{event.summary}</p>
    </li>
  );
}
