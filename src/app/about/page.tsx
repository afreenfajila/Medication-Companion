import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About — Medication Companion prototype" };

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-[40rem] px-6 py-10">
      <p className="text-[13px] font-bold uppercase tracking-wide text-teal-800">Prototype</p>
      <h1 className="mt-1 text-[28px] font-bold leading-tight">About Medication Companion</h1>
      <p className="mt-4 text-lg leading-normal">
        Medication Companion is a design prototype for an assignment. It explains information from a{" "}
        <strong>fictional demo pharmacy record</strong> and is not connected to a real pharmacy,
        clinic, or prescription system.
      </p>

      <h2 className="mt-8 text-[22px] font-bold">What it does not do</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-lg leading-normal">
        <li>It does not diagnose, prescribe, or recommend treatment.</li>
        <li>It does not change doses or give missed-dose advice.</li>
        <li>It does not decide whether you should take a medicine.</li>
        <li>It does not contact a pharmacist, clinic, helper, or emergency service.</li>
      </ul>

      <h2 className="mt-8 text-[22px] font-bold">How it stays safe</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-lg leading-normal">
        <li>A call must be started before any medicine route is offered.</li>
        <li>Camera use is explained first and needs your permission.</li>
        <li>A label is only ever a “possible match” until you confirm it.</li>
        <li>No explanation is shown before confirmation.</li>
        <li>If a label is unreadable or does not match, no instructions are shown.</li>
      </ul>

      <h2 className="mt-8 text-[22px] font-bold">AI use in this build</h2>
      <p className="mt-2 text-lg leading-normal">
        This build uses no AI model, camera, or microphone. Matching, safety checks, and all
        medicine wording are deterministic and come from a local demo record. Any later AI
        integration will be limited to extracting visible label text and will never decide a match.
      </p>

      <p className="mt-8 text-base">
        <Link href="/" className="font-medium text-teal-800 underline underline-offset-4">
          Back to the prototype
        </Link>
      </p>
    </main>
  );
}
