"use client";

import { useEffect } from "react";
import { DOSE_SCENARIOS, type DoseScenario } from "@/lib/dose-check/dose-check";
import { dispatch, useSession } from "@/lib/session/session-store";

export const OPENING_LINE =
  "My doctor changed my medicine, but this box still says the old amount. How many should I take now?";

/**
 * Reviewer/demo controls for the dose-change check — deliberately outside the
 * phone frame and the patient-facing call. Picking a scenario (or Reset) ends
 * any call so each run starts clean. Leaving the page clears the scenario.
 */
export function DoseCheckReviewer() {
  const session = useSession();
  const scenario = session.doseScenario;
  const dose = session.doseCheck;

  useEffect(() => {
    dispatch({ type: "SET_DOSE_SCENARIO", scenario: "conflict-sent" });
    return () => dispatch({ type: "SET_DOSE_SCENARIO", scenario: null });
  }, []);

  return (
    <aside aria-labelledby="reviewer-heading" className="mx-auto w-full max-w-[430px] px-4 pt-4 md:max-w-xl">
      <details open className="rounded-lg border border-dashed border-navy-700/50 bg-surface p-4">
        <summary className="cursor-pointer">
          <h1 id="reviewer-heading" className="inline text-lg font-bold">
            Reviewer controls · dose-change demo
          </h1>
        </summary>
        <p className="mt-2 text-sm text-navy-700">
          Not part of the patient experience. Fictional record, label readings and callback outcomes, for interaction
          testing only — not clinically validated. No real request is ever sent.
        </p>
        <fieldset className="mt-3 flex flex-col gap-2">
          <legend className="text-sm font-bold">Scenario</legend>
          {(Object.keys(DOSE_SCENARIOS) as DoseScenario[]).map((key) => (
            <label key={key} className="flex cursor-pointer items-start gap-2 text-[15px]">
              <input
                type="radio"
                name="dose-scenario"
                className="mt-1 h-5 w-5"
                checked={scenario === key}
                onChange={() => dispatch({ type: "SET_DOSE_SCENARIO", scenario: key })}
              />
              <span>
                <span className="font-bold">{DOSE_SCENARIOS[key].title}</span>
                <span className="block text-navy-700">{DOSE_SCENARIOS[key].summary}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="mt-3 text-[15px]">
          Then tap <b>Call with companion</b> and say or type: <q>{OPENING_LINE}</q>
        </p>
        {/* Non-sensitive status only: states, outcomes and revisions — never wording or numbers. */}
        <dl aria-label="Scenario status" className="mt-3 grid grid-cols-2 gap-x-3 text-[15px]">
          {[
            ["Call", session.callActive ? `active (${session.state})` : "not started"],
            ["Dose check", dose?.step ?? "—"],
            ["Label revision", dose ? `${dose.labelRevision}${dose.confirmedLabelRevision ? " (confirmed)" : ""}` : "—"],
            ["Comparison", dose?.comparison?.outcome ?? "—"],
            ["Callback", dose?.callback ? `${dose.callback.status} · draft r${dose.callback.revision}` : "—"],
            // content-model §4 MedicationResolutionStatus: never "resolved".
            [
              "Medication",
              !dose ? "—" : dose.comparison?.outcome === "match" ? "not required for this comparison" : "unresolved",
            ],
          ].map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="font-bold">{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          className="mt-3 min-h-11 rounded-pill border border-navy-700/40 px-4 font-bold"
          onClick={() => dispatch({ type: "SET_DOSE_SCENARIO", scenario })}
        >
          Reset call
        </button>
      </details>
    </aside>
  );
}
