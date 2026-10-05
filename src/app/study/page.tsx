import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/ui/shell";
import { metforminRecord } from "@/lib/content/seed-record";
import { studyWrongInstruction } from "@/lib/content/fixtures";
import { getStudyCondition } from "@/lib/study/study-cookie";
import { isStudyModeEnabled, parseStudyCondition, STUDY_COOKIE, STUDY_CONDITIONS } from "@/lib/study/study-mode";

export const metadata: Metadata = { title: "Study setup — researcher only", robots: { index: false, follow: false } };

/** Sets the condition in an httpOnly session cookie. POST only: a query parameter can never set it. */
async function setCondition(formData: FormData) {
  "use server";
  if (!isStudyModeEnabled()) notFound();
  const jar = await cookies();
  const condition = parseStudyCondition(formData.get("condition"));
  if (condition) {
    jar.set(STUDY_COOKIE, condition, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    }); // no maxAge: a session cookie, gone when the browser closes
  } else {
    jar.delete(STUDY_COOKIE);
  }
  redirect("/study");
}

const CONDITION_LABEL: Record<(typeof STUDY_CONDITIONS)[number], string> = {
  control: "Control — the real record explanation",
  "wrong-explanation": "Wrong explanation — a fixed wrong instruction after every gate",
};

/** Researcher page for failure-injection testing. Not linked anywhere; 404 unless study mode is on. */
export default async function StudyPage() {
  if (!isStudyModeEnabled()) notFound();
  const current = await getStudyCondition();

  return (
    <AppShell wide>
      <div className="mx-auto w-full max-w-[720px] px-6 py-8">
        <p className="text-[13px] font-bold uppercase tracking-wide text-teal-800">Researcher only · not for participants</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight">Study setup</h1>
        <p className="mt-3 text-lg">
          Current condition: <strong>{current ? CONDITION_LABEL[current] : "none (normal demo)"}</strong>
        </p>

        <form action={setCondition} className="mt-6 flex flex-col gap-3">
          {STUDY_CONDITIONS.map((c) => (
            <button
              key={c}
              name="condition"
              value={c}
              className="min-h-11 rounded-pill border border-teal-600/30 bg-teal-100 px-4 py-2 text-left text-base font-bold"
            >
              {CONDITION_LABEL[c]}
            </button>
          ))}
          <button name="condition" value="" className="min-h-11 rounded-pill border border-line px-4 py-2 text-left text-base">
            End study session (clear the condition)
          </button>
        </form>

        <section aria-labelledby="debrief" className="mt-8 rounded-lg border border-line bg-surface p-5">
          <h2 id="debrief" className="text-[22px] font-bold">Debrief after every session</h2>
          <p className="mt-2">
            Tell the participant which explanation they saw. In the wrong-explanation condition the companion said:
          </p>
          <p className="mt-2 font-bold">“{studyWrongInstruction.en}”</p>
          <p className="mt-2">The demo record actually says:</p>
          <p className="mt-2 font-bold">“{metforminRecord.verifiedInstruction.canonicalText}.”</p>
          <p className="mt-4 text-sm text-navy-700">
            Every audit event in the caregiver view is tagged with the condition, so detection, verification,
            challenge, blind acceptance, recovery and decision quality can be read off the timeline.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
