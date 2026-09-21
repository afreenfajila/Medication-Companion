import { Pill } from "lucide-react";
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
