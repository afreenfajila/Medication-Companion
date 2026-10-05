import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About — Medication Companion prototype" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[22px] font-bold leading-tight">{title}</h2>
      {children}
    </section>
  );
}

const list = "mt-2 list-disc space-y-1.5 pl-6 text-lg leading-normal";

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-[40rem] px-6 py-10">
      <p className="text-[13px] font-bold uppercase tracking-wide text-teal-800">Prototype</p>
      <h1 className="mt-1 text-[28px] font-bold leading-tight">About Medication Companion</h1>
      <p className="mt-4 text-lg leading-normal">
        Medication Companion is a design prototype for an AI product design assignment. It works the
        way the real product would, but with <strong>fictional data</strong> and{" "}
        <strong>simulated services</strong>. It is <strong>not connected to a real pharmacy, clinic,
        or prescription system</strong>, and it is not a medical device.
      </p>

      <Section title="What is simulated">
        <ul className={list}>
          <li>
            <strong>The pharmacy record.</strong> Mei Ling Tan and her BrightCare Pharmacy record are
            fictional seed data.
          </li>
          <li>
            <strong>Pharmacist callbacks.</strong> “Ask a pharmacist to call me” goes to a simulated
            pharmacy service. The reference number it returns is made up, and no one will call.
          </li>
          <li>
            <strong>Family and trusted-helper messages.</strong> “Let my family know” and “Ask my
            trusted helper” always ask for consent first, then go to a simulated service. No message
            is sent to anyone.
          </li>
          <li>
            <strong>Sign-in.</strong> The real product would sign you in with Singpass. The prototype
            simply continues as Mei Ling.
          </li>
          <li>The clinic and pharmacy phone numbers are fictional.</li>
        </ul>
      </Section>

      <Section title="What it does not do">
        <ul className={list}>
          <li>It does not diagnose, prescribe, or recommend treatment.</li>
          <li>It does not change doses or give missed-dose advice.</li>
          <li>It does not decide whether you should take a medicine.</li>
          <li>It never places a real call or sends a real message.</li>
          <li>
            It does not route anyone to emergency services. Urgent wording shows a fixed safety
            message; how to recognise and route emergencies is still being researched.
          </li>
        </ul>
      </Section>

      <Section title="How it stays safe">
        <ul className={list}>
          <li>A call must be started before any medicine route is offered.</li>
          <li>The camera is explained first and only starts after you agree.</li>
          <li>A label is only ever a “possible match” until you confirm it.</li>
          <li>No explanation is shown before you confirm.</li>
          <li>If a label is unreadable or does not match, no instructions are shown.</li>
          <li>You can try the label once more. After that, only the human-help options remain.</li>
          <li>
            Urgent-risk wording and medical questions (doses, side effects, symptoms, pregnancy) are
            caught by fixed rules before any AI is involved, and lead to a “please ask a person”
            screen.
          </li>
        </ul>
      </Section>

      <Section title="Where AI is used">
        <ul className={list}>
          <li>
            <strong>Claude (Anthropic)</strong> reads the visible text on a label photo — patient
            name, medicine name, strength and form — on the server. It does not decide whether the
            label matches the record, and it never writes medicine information.
          </li>
          <li>
            When it is configured, <strong>Claude</strong> also works out what you meant during the
            call, for example a medicine name the speech recognition misheard, and replies in its own
            words. It knows only the medicine&apos;s name, is checked for any dose, timing or advice
            before you see it, and cannot open the camera or confirm a medicine. Without it, fixed
            replies are used.
          </li>
          <li>
            A <strong>fixed, non-AI matcher</strong> compares that text with the record and makes
            the match decision.
          </li>
          <li>
            Everything the app says about the medicine comes from the fictional record, in English or
            Simplified Chinese. It is never generated.
          </li>
          <li>
            When it is configured, <strong>Gemini</strong> only reads approved on-screen wording
            aloud. The server refuses any other text, so the voice cannot give medical advice.
          </li>
          <li>Typing the name and choosing from your medicines work without any AI.</li>
        </ul>
      </Section>

      <Section title="Camera, microphone and your data">
        <ul className={list}>
          <li>The camera preview stays on your device. A still photo is taken only when you tap.</li>
          <li>
            A photo you choose is shrunk and re-saved on your device first, which also removes
            details such as location.
          </li>
          <li>
            Label photos are sent to the server only to be read, are held in memory for that one
            request, and are not saved by default.
          </li>
          <li>
            Voice input uses your browser’s speech recognition, which may send your voice to the
            browser vendor’s speech service. Typing always works. The companion only listens and
            speaks after you tap “Call with companion”, and stops when you end the call.
          </li>
          <li>
            The activity list in the caregiver view is kept in your browser session only. It records
            what happened, not what you typed or said.
          </li>
          <li>All names and records are fictional. Do not enter real health information.</li>
        </ul>
      </Section>

      <p className="mt-8 text-base">
        <Link href="/" className="inline-flex min-h-11 items-center font-medium text-teal-800 underline underline-offset-4">
          Back to the prototype
        </Link>
      </p>
    </main>
  );
}
