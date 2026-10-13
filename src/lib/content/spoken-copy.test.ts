import { describe, expect, it } from "vitest";
import { copy, t, type CopyKey } from "./translations";

/**
 * Free-tier credits are spent per spoken character, so conversational lines are
 * kept short. Safety, dose and escalation wording is never shortened: these
 * tests pin what each of those lines must still say, in both languages.
 */

// What each safety-critical line must keep saying (English, then Simplified Chinese).
const SAFETY_ANCHORS: Partial<Record<CopyKey, [RegExp, RegExp]>> = {
  urgentHeading: [/urgent help/, /紧急帮助/],
  urgentBody: [/emergency services or urgent medical care now/, /./],
  crisisLines: [/1767.*Emergency: 995/, /1767.*995/],
  doseChangeIntro: [/I can’t tell you how many to take/, /./],
  doseConflict: [/I cannot confirm which instruction you should follow/, /无法确认您应该按哪一个服用/],
  doseInsufficient: [/do not have enough confirmed information/, /没有足够的已确认信息/],
  doseRecordUnavailable: [/I won’t guess/, /不会去猜/],
  recordConflict: [/“\{instruction\}”[\s\S]*a pharmacist can check it with you/, /\{instruction\}/],
  labelDiffers: [/a pharmacist is the best person to look/, /./],
  callbackSent: [/No real pharmacist is contacted/, /不会联系真实的药剂师/],
  doseFailedBody: [/could not be delivered\. No one has been notified/, /没有通知任何人/],
  doseUnknownBody: [/won’t be sent twice/, /不会重复发送/],
  wellbeing: [/you don’t have to manage things alone/, /./],
};

/** Long on purpose: safety or escalation wording that is never trimmed for credits. */
const LONG_BY_DESIGN: CopyKey[] = ["recordConflict", "doseChangeIntro", "wellbeing"];
const SPOKEN_BUDGET = 200;

describe("spoken copy for a free voice account", () => {
  it("safety, dose and escalation lines keep their full meaning in both languages", () => {
    for (const [key, [en, zh]] of Object.entries(SAFETY_ANCHORS) as Array<[CopyKey, [RegExp, RegExp]]>) {
      expect(t("en", key), key).toMatch(en);
      expect(t("zh-Hans", key), key).toMatch(zh);
    }
  });

  it("every other line fits the spoken budget; only safety wording may be longer", () => {
    const over = Object.entries(copy.en)
      .filter(([, text]) => text.length > SPOKEN_BUDGET)
      .map(([key]) => key);
    expect(over.sort()).toEqual([...LONG_BY_DESIGN].sort());
    for (const key of LONG_BY_DESIGN) expect(Object.keys(SAFETY_ANCHORS)).toContain(key);
  });

  it("the shortened lines kept their job: the record, the two next steps, and no medical content", () => {
    expect(t("en", "capabilityGuide")).toMatch(/check a medicine label with you, then explain what your pharmacy record says/);
    for (const key of ["capabilityGuide", "offTopicWorld", "offTopicSocial"] as const) {
      expect(t("en", key)).toMatch(/show me a medicine label, or ask about your schedule\?$/);
      expect(t("zh-Hans", key)).toMatch(/药物标签，还是询问您的服药时间？$/);
      expect(t("en", key)).not.toMatch(/\d|mg|tablet|take|dose/i); // no medication facts were added or cut
    }
    expect(t("en", "offTopicSocial")).toMatch(/AI companion/); // still says what it is
    expect(t("en", "medicineNameRetry")).toMatch(/medicine name again\?.*show me the label/);
  });
});
