import { TranscriptCard } from "@/components/ui/transcript-card";
import type { ConfidenceFactors, EscalationDecision } from "@/features/medication-investigation";
import {
  calculateConfidence,
  determineEscalation,
  SEVERITY_QUESTIONS,
} from "@/features/medication-investigation";

export interface InvestigationStep {
  id: string;
  type: "investigation" | "severity" | "escalation";
  content: string;
  responses?: Record<string, string>;
}

export function MedicationInvestigationFeed({
  steps,
  currentQuestion?: number,
  confidenceFactors?: ConfidenceFactors,
}: {
  steps: InvestigationStep[];
  currentQuestion?: number;
  confidenceFactors?: ConfidenceFactors;
}) {
  // Calculate confidence and escalation if factors provided
  let escalation: EscalationDecision | null = null;
  if (confidenceFactors) {
    const confidence = calculateConfidence(confidenceFactors);
    escalation = determineEscalation(confidence, confidenceFactors.severity);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Investigation questions */}
      <TranscriptCard speaker="companion" label="Companion">
        <p>I'm going to ask you a few questions to check for possible medication interactions.</p>
      </TranscriptCard>

      {/* Question 1: Medications today */}
      <TranscriptCard speaker="companion" label="Companion">
        <p className="font-semibold">1. Which medications did you take today?</p>
      </TranscriptCard>
      {steps.find((s) => s.id === "q1") && (
        <TranscriptCard speaker="user" label="You">
          <p>{steps.find((s) => s.id === "q1")?.content}</p>
        </TranscriptCard>
      )}

      {/* Question 2: Timing */}
      {steps.find((s) => s.id === "q1") && (
        <>
          <TranscriptCard speaker="companion" label="Companion">
            <p className="font-semibold">2. When did you take them?</p>
          </TranscriptCard>
          {steps.find((s) => s.id === "q2") && (
            <TranscriptCard speaker="user" label="You">
              <p>{steps.find((s) => s.id === "q2")?.content}</p>
            </TranscriptCard>
          )}
        </>
      )}

      {/* Question 3: Other meds */}
      {steps.find((s) => s.id === "q2") && (
        <>
          <TranscriptCard speaker="companion" label="Companion">
            <p className="font-semibold">3. Any other medications in the past 3 days?</p>
          </TranscriptCard>
          {steps.find((s) => s.id === "q3") && (
            <TranscriptCard speaker="user" label="You">
              <p>{steps.find((s) => s.id === "q3")?.content}</p>
            </TranscriptCard>
          )}
        </>
      )}

      {/* Severity assessment questions (5 diagnostic) */}
      {steps.find((s) => s.id === "q3") && (
        <>
          <TranscriptCard speaker="companion" label="Companion">
            <p>Now I need to understand how you're feeling. I'll ask about the symptom.</p>
          </TranscriptCard>

          {SEVERITY_QUESTIONS.map((question, idx) => {
            const stepId = `severity_${idx + 1}`;
            const step = steps.find((s) => s.id === stepId);
            return (
              <div key={stepId}>
                <TranscriptCard speaker="companion" label="Companion">
                  <p className="font-semibold">{question}</p>
                </TranscriptCard>
                {step && (
                  <TranscriptCard speaker="user" label="You">
                    <p>{step.content}</p>
                  </TranscriptCard>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Escalation decision */}
      {escalation && (
        <>
          <TranscriptCard speaker="companion" label="Companion">
            <div className="space-y-3">
              <p className="font-semibold">
                Confidence Assessment: {escalation.confidence}%
              </p>
              <p className="text-sm text-navy-700">{escalation.reasoning}</p>

              {escalation.action === "alert_family" && (
                <div className="rounded-lg border-l-4 border-red-600 bg-red-50 p-3">
                  <p className="font-semibold text-red-900">Alert Sent to Family</p>
                  <p className="text-sm text-red-800">
                    Family contact has been alerted to check on you or call the pharmacist.
                  </p>
                </div>
              )}

              {escalation.action === "user_decides" && (
                <div className="rounded-lg border-l-4 border-yellow-600 bg-yellow-50 p-3">
                  <p className="font-semibold text-yellow-900">You Decide</p>
                  <p className="text-sm text-yellow-800">
                    Would you like me to alert your family or call your pharmacist?
                  </p>
                </div>
              )}

              {escalation.action === "mention_only" && (
                <div className="rounded-lg border-l-4 border-blue-600 bg-blue-50 p-3">
                  <p className="font-semibold text-blue-900">Mentioned to Family</p>
                  <p className="text-sm text-blue-800">
                    I'll let your family know about this for awareness. Call if you feel worse.
                  </p>
                </div>
              )}
            </div>
          </TranscriptCard>
        </>
      )}
    </div>
  );
}
