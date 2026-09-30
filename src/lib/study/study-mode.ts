// Study mode (CLAUDE.md § Assignment 3, G): controlled, repeatable AI errors for
// user testing. Live model output can't be compared across participants, so a
// study condition swaps in a fixed fixture instead. Never on production.

export const STUDY_CONDITIONS = ["control", "wrong-explanation"] as const;
export type StudyCondition = (typeof STUDY_CONDITIONS)[number];

/** httpOnly session cookie set only by the /study server action — never by a query parameter. */
export const STUDY_COOKIE = "mc_study";

type Env = Record<string, string | undefined>;

/** On only when explicitly enabled, and never on a production deployment. */
export function isStudyModeEnabled(env: Env = process.env): boolean {
  return env.STUDY_MODE === "true" && env.VERCEL_ENV !== "production";
}

export function parseStudyCondition(value: unknown): StudyCondition | null {
  return STUDY_CONDITIONS.find((c) => c === value) ?? null;
}
