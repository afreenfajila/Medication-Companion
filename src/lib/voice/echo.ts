/**
 * Self-echo suppression for hands-free calls.
 *
 * The speaker and the microphone are in the same room, so the companion can
 * hear itself: its greeting comes back as a "Mei Ling says: hello" transcript
 * nobody spoke. The primary defence is closing the mic while the companion
 * talks (see use-conversation.ts); this is the second net, for the tail of an
 * utterance that recognition was still processing as the mic closed.
 *
 * Deliberately conservative in one direction only: suppressing a real answer
 * costs a re-prompt (the mic reopens and the step asks again), while accepting
 * an echo can fabricate a turn the person never took. On a confirmation screen
 * that asymmetry matters — an echoed "yes" must never confirm a medicine — so
 * when in doubt this drops the input.
 */

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:"“”()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** How long after the companion stops talking its own words can still arrive. */
export const ECHO_WINDOW_MS = 1200;

/**
 * True when `heard` looks like a fragment of what the companion just said,
 * within the echo window. Requires an exact word-sequence match: a person
 * answering in their own words is never a contiguous slice of the question.
 */
export function isLikelySelfEcho(
  heard: string,
  spoken: string | null,
  msSinceSpeechEnded: number,
): boolean {
  if (!spoken) return false;
  if (msSinceSpeechEnded > ECHO_WINDOW_MS) return false;
  const h = normalise(heard);
  const s = normalise(spoken);
  if (!h || !s) return false;
  // Word-boundary containment, so "yes" doesn't match "eyes" and a one-word
  // echo of a greeting is still caught.
  return ` ${s} `.includes(` ${h} `);
}
