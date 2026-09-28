"use client";

import { ArrowRight, HeartHandshake, UserRound } from "lucide-react";
import Link from "next/link";
import { CompanionOrb } from "@/components/ui/companion-orb";
import { DemoNotice, TrustBadge } from "@/components/ui/notices";
import { PhoneShell, ScreenBody } from "@/components/ui/shell";
import { dispatch } from "@/lib/session/session-store";
import type { Persona } from "@/types/content";

const PERSONAS: Array<{
  persona: Persona;
  href: string;
  name: string;
  role: string;
  blurb: string;
  icon: React.ReactNode;
}> = [
  {
    persona: "mei-ling",
    href: "/companion",
    name: "Mei Ling",
    role: "Older adult",
    blurb: "Call the companion and understand a medicine from a demo record.",
    icon: <UserRound className="h-6 w-6" aria-hidden="true" />,
  },
  {
    persona: "caregiver",
    href: "/caregiver",
    name: "Caregiver",
    role: "Trusted helper — read-only",
    blurb: "Review the demo record and prototype activity timeline.",
    icon: <HeartHandshake className="h-6 w-6" aria-hidden="true" />,
  },
];

/** Persona picker + prototype introduction. No production authentication. */
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
          <TrustBadge label="Demo record — fictional data" />
        </div>

        <h2 className="mt-8 text-[22px] font-bold leading-tight">Who is using the prototype?</h2>
        <ul className="mt-4 flex flex-col gap-3">
          {PERSONAS.map((p) => (
            <li key={p.persona}>
              <Link
                href={p.href}
                onClick={() => dispatch({ type: "SELECT_PERSONA", persona: p.persona })}
                className="flex min-h-[4.5rem] items-center gap-4 rounded-lg border border-line bg-surface p-4 shadow-card transition-colors hover:border-teal-600"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-teal-100 text-navy-900">
                  {p.icon}
                </span>
                <span className="flex-1">
                  <span className="block text-lg font-bold">{p.name}</span>
                  <span className="block text-sm font-medium text-teal-800">{p.role}</span>
                  <span className="mt-0.5 block text-[15px] leading-snug text-navy-700">
                    {p.blurb}
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

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
