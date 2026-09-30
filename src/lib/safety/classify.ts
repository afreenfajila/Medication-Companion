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
  // Stopping the medicine, however it's reported ("my doctor said I can stop it").
  // Tied to an object so "stop the call" is not caught.
  /\b(stop|skip|quit)\s+(taking\s+)?(it|them|this|that|my (medicine|medication|tablets?|pills?)|metformin)\b/i,
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
  // Health signals in casual talk (CLAUDE.md § Assignment 3, E2). A redirect to
  // "show me a label" would brush off something that may matter, so these get the
  // limitation + pharmacist/clinic path. Not urgent: urgent wording is above.
  /\b(feel|feeling|been) (so |very |really )?(tired|dizzy|weak|unwell|sick|confused)\b/i,
  /\bkeep forgetting\b|\bso forgetful\b/i,
  /\bcan'?t sleep\b|\bnot sleeping\b/i,
  /头晕|很累|没力气|不舒服|睡不着|老是忘/,
  ...adverseEffectPatterns,
];

/** Self-harm wording (a subset of `urgentPatterns`): the urgent screen also lists crisis lines. */
export const selfHarmPatterns: readonly RegExp[] = [/want to (die|hurt myself)/i, /suicid/i, /想死|自杀|伤害自己/];

export function mentionsSelfHarm(text: string | null): boolean {
  return text !== null && selfHarmPatterns.some((p) => p.test(text));
}

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
