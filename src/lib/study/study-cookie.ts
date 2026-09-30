import "server-only";
import { cookies } from "next/headers";
import { isStudyModeEnabled, parseStudyCondition, STUDY_COOKIE, type StudyCondition } from "./study-mode";

/** The current study condition, or null when study mode is off or none was set. */
export async function getStudyCondition(): Promise<StudyCondition | null> {
  // Checked before touching cookies, so pages stay static when study mode is off.
  if (!isStudyModeEnabled()) return null;
  return parseStudyCondition((await cookies()).get(STUDY_COOKIE)?.value);
}
