/** Every sentence on its own, unmerged (the speech guard approves each sentence of approved copy). */
export function sentencePieces(text: string): string[] {
  return text
    .split(/(?<=[.!?]["”’)]?)\s+|(?<=[。！？]["”’）]?)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pieces shorter than this ride along with a neighbour, so tiny fragments don't each cost a voice request. */
const MIN_PIECE = 25;

/**
 * Splits a line into sentences for voicing one at a time: after . ! ? followed by a
 * space (so "1.5 tablets" stays whole), and after Chinese 。！？. Closing quotes stay
 * with their sentence. Joining the pieces with spaces gives back the same words.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const p of sentencePieces(text)) {
    const last = out.length - 1;
    if (last >= 0 && (p.length < MIN_PIECE || out[last].length < MIN_PIECE)) out[last] += /[。！？]$/.test(out[last]) ? p : ` ${p}`;
    else out.push(p);
  }
  return out;
}
