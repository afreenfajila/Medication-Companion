"use client";

import Link from "next/link";
import { PrimaryButton } from "@/components/ui/buttons";
import { PhoneShell, ScreenBody } from "@/components/ui/shell";

/**
 * Route-level error boundary. Calm wording, no technical detail, and a way
 * forward. Nothing here shows medicine information.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-dvh bg-canvas md:flex md:items-center md:justify-center md:bg-desk md:px-4 md:py-6">
      <PhoneShell>
        <ScreenBody className="justify-center gap-5 pt-8 text-center">
          <h1 className="text-[28px] font-bold leading-tight">Something went wrong.</h1>
          <p className="text-lg leading-normal">
            Nothing was saved or sent. You can try again, or go back to the start.
          </p>
          <PrimaryButton onClick={reset}>Try again</PrimaryButton>
          <Link href="/" className="inline-flex min-h-11 items-center justify-center font-medium text-teal-800 underline underline-offset-4">
            Back to the start
          </Link>
          <p className="text-sm text-navy-700">
            Prototype information — not connected to a real pharmacy. AI guide · Not a pharmacist or
            doctor.
          </p>
        </ScreenBody>
      </PhoneShell>
    </div>
  );
}
