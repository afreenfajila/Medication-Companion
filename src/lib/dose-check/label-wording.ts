/**
 * The label wording someone read aloud or typed, as people actually say it: "It says… two? I
 * think two.", "um, it says take 1 tablet, uh, twice daily", "two… no, one tablet". Filler,
 * lead-ins ("it says"), hedges ("I think"), repeats and the part she corrected are dropped.
 *
 * Words are only ever REMOVED, never added, changed, expanded or corrected (CLAUDE.md §7): no
 * unit she didn't say, no number she didn't say. `isVerbatimSubset` enforces that for this
 * function and for the optional AI extraction alike. The result is still only a reading: it is
 * read back and needs her own "yes" before it is compared with the record.
 */

const FILLER = /(?:^|\s)(?:um+|uh+|erm*|hmm+|ah+|嗯+|呃+|那个)(?=[\s,.，。…]|$)[,，]?/gi;
const HEDGES = /\b(?:i think|i guess|i believe|maybe|probably|i'm not sure|not sure|let me see|let me check|hold on)\b[,，]?|我觉得|我想|好像|可能|大概|应该是/gi;
/** Said before the wording: "No,", "So", "It says", "The label reads", "上面写着". Stripped from the start only. */
const LEAD_INS: readonly RegExp[] = [
  /^(?:no|nope|sorry|wait)[,.!:]+\s*/i,
  /^(?:oh|so|okay|ok|well|right|yes|yeah|and)\b[\s,.:!]*/i,
  /^(?:it|this|that|the (?:label|box|packet|bottle|pack|label on the box))\s+(?:says|said|reads|read)\b[\s,.:]*/i,
  /^(?:it's|it is|that's|that is)\b[\s,.:]*/i,
  /^(?:标签上|盒子上|上面|这里)?(?:写着|写的是|说)[\s:：，,]*/,
  /^(?:不是|不对|是|就是)[\s,，]*/,
];
/** "two… no, one tablet": the wording after the last correction. Needs a comma after the marker,
 *  so label wording like "no more than 2 a day" is never cut. */
const CORRECTION = /(?:\.{2,}|…|[,;?!，；？！]|\s)\s*(?:no|sorry|i mean|actually|wait|不对|不是)[,，.]\s*/gi;
/** Said in the middle or at the end, not printed: ", it says,", ", yeah", "…but my doctor said two". */
const ASIDES: readonly RegExp[] = [
  /[,，]\s*(?:it|the label|the box|this)\s+(?:says|reads)\s*[,，]/gi,
  /[\s,，]+(?:yeah|yes|okay|ok|right|i think|i guess|that's it|that's all|i believe)[\s.!?？]*$/i,
  /[\s,，]+(?:but|and)\s+(?:my|the)\s+(?:doctor|gp|pharmacist|nurse|daughter|son)\b.*$/i,
  /[，,]?\s*但是?(?:医生|药剂师).*$/,
];
const HAS_WORDING = /\d|\b(?:one|two|three|four|five|half|once|twice|tablets?|capsules?|daily|day|times?|take)\b|[一二两三四五半片粒次天日]/i;
const UNSURE = /[?？]|\b(?:i think|i guess|i believe|maybe|probably|not sure)\b|我觉得|好像|可能|大概|不太确定/i;

export type LabelWording = { wording: string; unsure: boolean };

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .match(/\d+(?:\.\d+)?|[\p{L}']+|\p{Script=Han}/gu)
    ?.flatMap((tok) => (/\p{Script=Han}/u.test(tok) ? [...tok] : [tok])) ?? [];

/** True when every word of `wording` was said in `said`, in the same order (nothing added or changed). */
export function isVerbatimSubset(wording: string, said: string): boolean {
  const want = tokens(wording);
  const have = tokens(said);
  if (want.length === 0) return false;
  let i = 0;
  for (const tok of have) if (tok === want[i]) i += 1;
  return i === want.length;
}

export function cleanLabelWording(text: string): LabelWording {
  const original = text.trim();
  const unsure = UNSURE.test(original);
  let s = original;

  // The part after the last correction, when it holds wording of its own.
  const marks = [...s.matchAll(CORRECTION)];
  const lastMark = marks.at(-1);
  if (lastMark?.index !== undefined) {
    const after = s.slice(lastMark.index + lastMark[0].length);
    if (HAS_WORDING.test(after)) s = after;
  }

  s = s.replace(FILLER, " ").replace(HEDGES, " ");
  s = ASIDES.reduce((acc, re) => acc.replace(re, (m) => (/^[,，]/.test(m) && /[,，]$/.test(m) ? "," : "")), s);
  for (let changed = true; changed; ) {
    const before = s.replace(/^[\s,，.:：…。]+/, "").trim();
    s = LEAD_INS.reduce((acc, re) => acc.replace(re, ""), before).trim();
    changed = s !== before;
  }

  // Said twice ("two? two."): once. Only rebuilt when there really was a repeat.
  const pieces = s
    .split(/(?:\.{2,}|[…?!;？！；。]|\.(?!\d))+/)
    .map((p) => p.replace(/^[\s,，]+|[\s,，]+$/g, ""))
    .filter((p) => p.length > 0);
  const unique = pieces.filter((p, i) => {
    const next = pieces[i + 1]?.toLowerCase();
    const here = p.toLowerCase();
    if (next !== undefined && next !== here && next.startsWith(here)) return false; // restarted and said more
    return i === 0 || here !== pieces[i - 1].toLowerCase();
  });
  s = unique.length < pieces.length ? unique.join(", ") : s;

  s = s
    .replace(/\.{2,}|…/g, " ")
    .replace(/\s+([,，])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[\s,，.:：]+|[\s,，?？!！.。…:：]+$/g, "")
    .trim();

  // Never worse than what she said: empty, or anything that isn't her own words, keeps the original.
  if (!/[\p{L}\p{N}]/u.test(s) || !isVerbatimSubset(s, original)) return { wording: original.replace(/[\s?？]+$/, "") || original, unsure };
  return { wording: s, unsure };
}
