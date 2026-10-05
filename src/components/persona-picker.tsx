"use client";

import { ArrowRight, HeartHandshake } from "lucide-react";
import Link from "next/link";
import { CompanionOrb } from "@/components/ui/companion-orb";
import { DemoNotice } from "@/components/ui/notices";
import { PhoneShell, ScreenBody } from "@/components/ui/shell";
import { dispatch } from "@/lib/session/session-store";

/**
 * Sign-in stand-in (CLAUDE.md § H1). The real product would sign Mei Ling in
 * with Singpass; the prototype simply continues as her. The caregiver view is
 * a quieter second door.
 */
export function PersonaPicker() {
  return (
    <PhoneShell>
      <ScreenBody className="pt-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <CompanionOrb size="sm" state="idle" />
          <div>
            <h1 className="text-[28px] font-bold leading-tight">Medication Companion</h1>
            <p className="mx-auto mt-2 max-w-[21rem] text-lg leading-snug text-navy-700">
              A prototype AI companion that explains a fictional pharmacy record — and hands over
              to a person when it is not sure.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2">
          <Link
            href="/companion"
            onClick={() => dispatch({ type: "SELECT_PERSONA", persona: "mei-ling" })}
            data-variant="primary"
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-pill bg-navy-900 px-6 py-3 text-lg font-bold text-white hover:bg-[#1f4368]"
          >
            <span>Continue as Mei Ling</span>
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
          <p className="text-center text-sm text-navy-700">
            The real product signs you in with Singpass. This prototype skips that step.
          </p>
        </div>

        <Link
          href="/caregiver"
          onClick={() => dispatch({ type: "SELECT_PERSONA", persona: "caregiver" })}
          className="mt-8 flex min-h-[4.5rem] items-center gap-4 rounded-lg border border-line bg-surface p-4 shadow-card transition-colors hover:border-teal-600"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-teal-100 text-navy-900">
            <HeartHandshake className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-bold">Caregiver view</span>
            <span className="mt-0.5 block text-[15px] leading-snug text-navy-700">
              Read-only: Mei Ling’s record and recent activity.
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
        </Link>

        <DemoNotice className="mt-6">
          Prototype information — not connected to a real pharmacy. This is an AI guide, not a
          pharmacist or doctor.
        </DemoNotice>
        <p className="mt-4 pb-2 text-center text-sm">
          <Link href="/about" className="-my-3 inline-block py-3 font-medium text-teal-800 underline underline-offset-2">
            About this prototype
          </Link>
        </p>
      </ScreenBody>
    </PhoneShell>
  );
}
