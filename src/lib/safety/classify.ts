import type { SafetyReason } from "@/types/content";

// Deterministic prototype safety net (content-model.md §14). Not clinical triage.
// Runs before any model is ever consulted; a hit means "do not ask a model".

export const urgentPatterns: readonly RegExp[] = [
  /chest pain/i,
  /trouble breathing/i,
  /cannot breathe|can'?t breathe/i,
  /faint(ed|ing)?/i,
  /overdose/i,
  /poison/i,
  /severe allergic/i,
  /swelling.*(face|tongue|throat)/i,
  /want to (die|hurt myself)/i,
  /suicid/i,
  // Simplified Chinese equivalents (the app offers a 中文 mode)
  /胸痛|胸口痛/,
  /呼吸困难|喘不过气|无法呼吸/,
  /晕倒|昏倒|昏厥/,
  /过量|服毒|中毒/,
  /严重过敏/,
  /(脸|舌头|喉咙).*肿|肿.*(脸|舌头|喉咙)/,
  /想死|自杀|伤害自己/,
];

export const adverseEffectPatterns: readonly RegExp[] = [/side effect/i, /副作用/];

export const unsupportedMedicalPatterns: readonly RegExp[] = [
  /should i (stop|start|change|double)/i,
  // Dose changes phrased any other way: tied to a dose/medicine word so that
  // e.g. "can I change the language" is not caught.
  /\b(can|could|may) i (double|skip|halve)\b/i,
  /\b(double|increase|decrease|reduce|skip|halve|cut)\b.*\b(dose|dosage|tablets?|pills?|medicine|medication)\b/i,
  /\b(extra|more|less|another|half)\b.*\b(dose|tablets?|pills?)\b/i,
  /forg[oe]t (to take|my (dose|medicine|tablet|pill))/i,
  /interact/i,
  /alcohol/i,
  /symptom/i,
  /missed (a )?dose/i,
  /can i take.*with/i,
  /pregnan/i,
  /is this dangerous/i,
  /diagnos/i,
  /漏服|忘记吃药|忘了吃药/,
  /停药|加倍|换药|双倍|多吃|少吃|减量|加量/,
  /喝酒|饮酒|症状/,
  /怀孕/,
  /有危险吗|危险吗/,
  /诊断/,
  /可以和.*一起/,
  ...adverseEffectPatterns,
];

export type SafetyClassification =
  | { level: "urgent"; reason: "urgent-risk" }
  | {
      level: "unsupported";
      reason: "unsupported-medical-question" | "adverse-effect-question";
    }
  | { level: "none" };

/** Urgent language always wins over an unsupported-question match. */
export function classifySafety(text: string): SafetyClassification {
  const input = text.trim();
  if (urgentPatterns.some((p) => p.test(input))) {
    return { level: "urgent", reason: "urgent-risk" };
  }
  if (adverseEffectPatterns.some((p) => p.test(input))) {
    return { level: "unsupported", reason: "adverse-effect-question" };
  }
  if (unsupportedMedicalPatterns.some((p) => p.test(input))) {
    return { level: "unsupported", reason: "unsupported-medical-question" };
  }
  return { level: "none" };
}

export function isUrgentReason(reason: SafetyReason): boolean {
  return reason === "urgent-risk";
}
