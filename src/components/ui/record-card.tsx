import { Pill, ShieldCheck } from "lucide-react";
import type { CandidateDisplay } from "@/types/content";

export type RecordCardLabels = {
  possibleMatch: string;
  patient: string;
  medicine: string;
  strength: string;
  form: string;
  formValue: string;
};

/**
 * Where the explained record comes from and when it was checked
 * ("BrightCare Pharmacy — demo record · checked 21 September 2026"), shown
 * beside the instruction so it can be compared with the physical label.
 */
export function RecordSourceLine({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-2 text-[14px] font-medium text-navy-700">
      <ShieldCheck className="h-4 w-4 shrink-0 text-teal-800" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Candidate identity only: patient, medicine, strength, form. It is labelled
 * "Possible match" and, by construction, has no field that can hold an
 * instruction — instructions are unreachable until confirmation.
 */
export function RecordCard({
  candidate,
  labels,
}: {
  candidate: CandidateDisplay;
  labels: RecordCardLabels;
}) {
  const rows: Array<[string, string]> = [
    [labels.patient, candidate.patientName],
    [labels.medicine, candidate.medicineName],
    [labels.strength, candidate.strength],
    [labels.form, labels.formValue],
  ];
  return (
    <section
      aria-label={labels.possibleMatch}
      className="rounded-lg border border-teal-600/30 bg-surface p-5 shadow-card"
    >
      <div className="flex items-center gap-2 text-[13px] font-bold text-teal-800">
        <Pill className="h-4 w-4" aria-hidden="true" />
        <span>{labels.possibleMatch}</span>
      </div>
      <dl className="mt-3 divide-y divide-line">
        {rows.map(([term, value]) => (
          <div key={term} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-sm text-navy-700">{term}</dt>
            <dd className="text-right text-lg font-bold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
