"use client";

import { MedicationInvestigationFeed } from "@/components/companion/medication-investigation-feed";
import type { InvestigationStep } from "@/components/companion/medication-investigation-feed";
import { DEMO_SCENARIOS } from "@/features/medication-investigation";
import { useState } from "react";

type ScenarioKey = keyof typeof DEMO_SCENARIOS;

// Demo data for each scenario
const SCENARIO_STEPS: Record<ScenarioKey, InvestigationStep[]> = {
  scenario1: [
    {
      id: "q1",
      type: "investigation",
      content: "Metoprolol 50mg and Lisinopril 10mg",
    },
    {
      id: "q2",
      type: "investigation",
      content: "This morning at 8am",
    },
    {
      id: "q3",
      type: "investigation",
      content: "No, just these two",
    },
    {
      id: "severity_1",
      type: "severity",
      content: "About 30 minutes ago, after I took the medications",
    },
    {
      id: "severity_2",
      type: "severity",
      content: "Mild dizziness and slight headache",
    },
    {
      id: "severity_3",
      type: "severity",
      content: "I can still do my activities, just feeling a bit lightheaded",
    },
    {
      id: "severity_4",
      type: "severity",
      content: "No other symptoms besides the dizziness and headache",
    },
    {
      id: "severity_5",
      type: "severity",
      content: "Just the last 30 minutes",
    },
  ],
  scenario2: [
    {
      id: "q1",
      type: "investigation",
      content: "Amlodipine — my doctor just increased it from 5mg to 10mg",
    },
    {
      id: "q2",
      type: "investigation",
      content: "First time at the new dose, this morning",
    },
    {
      id: "q3",
      type: "investigation",
      content: "Just the Amlodipine",
    },
    {
      id: "severity_1",
      type: "severity",
      content: "About 2 hours after taking the new dose",
    },
    {
      id: "severity_2",
      type: "severity",
      content: "Mild swelling in my ankles and feet",
    },
    {
      id: "severity_3",
      type: "severity",
      content: "Can walk, but it's uncomfortable",
    },
    {
      id: "severity_4",
      type: "severity",
      content: "Slight redness with the swelling",
    },
    {
      id: "severity_5",
      type: "severity",
      content: "Just started a couple hours ago",
    },
  ],
  scenario5: [
    {
      id: "q1",
      type: "investigation",
      content: "Atorvastatin and Omeprazole",
    },
    {
      id: "q2",
      type: "investigation",
      content: "This morning, but I'm not sure if I actually took them",
    },
    {
      id: "q3",
      type: "investigation",
      content: "No other medications recently",
    },
    {
      id: "severity_1",
      type: "severity",
      content: "No specific symptom, just checking if I took them",
    },
    {
      id: "severity_2",
      type: "severity",
      content: "Feeling fine overall",
    },
    {
      id: "severity_3",
      type: "severity",
      content: "I can do everything normally",
    },
    {
      id: "severity_4",
      type: "severity",
      content: "No other symptoms",
    },
    {
      id: "severity_5",
      type: "severity",
      content: "N/A",
    },
  ],
};

export default function A4InvestigationDemoPage() {
  const [activeScenario, setActiveScenario] = useState<ScenarioKey>("scenario1");

  const scenario = DEMO_SCENARIOS[activeScenario];
  const steps = SCENARIO_STEPS[activeScenario];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-navy-200 bg-gradient-to-r from-navy-900 to-navy-800 px-4 py-6 text-white">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold">A4: Medication Interaction Awareness</h1>
          <p className="mt-2 text-navy-100">
            Investigation flow with confidence scoring and escalation decision
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Scenario selector */}
        <div className="mb-8 flex gap-4">
          {(Object.keys(DEMO_SCENARIOS) as ScenarioKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setActiveScenario(key)}
              className={`rounded-lg px-4 py-2 font-semibold transition ${
                activeScenario === key
                  ? "bg-navy-900 text-white"
                  : "border-2 border-navy-200 text-navy-900 hover:border-navy-400"
              }`}
            >
              {key.replace("scenario", "Scenario ")}
            </button>
          ))}
        </div>

        {/* Scenario info */}
        <div className="mb-8 rounded-lg border-l-4 border-navy-600 bg-navy-50 p-4">
          <h2 className="text-lg font-bold text-navy-900">{scenario.description}</h2>
          <p className="mt-2 text-sm text-navy-700">
            <span className="font-semibold">Expected Confidence:</span> {scenario.expectedConfidence}%
          </p>
          <p className="mt-1 text-sm text-navy-700">
            <span className="font-semibold">Factors:</span> Data Quality:{" "}
            {scenario.factors.dataQuality} | Evidence: {scenario.factors.evidenceStrength} | Severity:{" "}
            {scenario.factors.severity}
          </p>
        </div>

        {/* Investigation flow */}
        <div className="rounded-lg border border-navy-200 bg-navy-50 p-6">
          <MedicationInvestigationFeed
            steps={steps}
            confidenceFactors={scenario.factors as any}
          />
        </div>

        {/* Key design decisions */}
        <div className="mt-8 space-y-4 rounded-lg border border-blue-200 bg-blue-50 p-6">
          <h3 className="text-lg font-bold text-blue-900">A4 Design Decisions</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>
              ✓ <span className="font-semibold">Investigation Flow:</span> Three core questions
              about medication context before severity assessment
            </li>
            <li>
              ✓ <span className="font-semibold">Severity Assessment:</span> Five diagnostic
              questions to determine Tier A/B/C
            </li>
            <li>
              ✓ <span className="font-semibold">Confidence Framework:</span> Three factors
              (Data Quality × Evidence Strength × Severity)
            </li>
            <li>
              ✓ <span className="font-semibold">Action Thresholds:</span> ≥80% alert family |
              50-79% user decides | &lt;50% mention only
            </li>
            <li>
              ✓ <span className="font-semibold">Guardrails:</span> System Reliability + Over-escalation
              Prevention
            </li>
            <li>
              ✓ <span className="font-semibold">Scope:</span> Scenarios 1, 2, 5 demonstrated;
              no NML integration yet
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
