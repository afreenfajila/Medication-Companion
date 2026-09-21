/** Lowercase, drop punctuation, collapse whitespace. */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ") // keep decimal points only between digits
    .replace(/\s+/g, " ")
    .trim();
}

/** "500MG", "500 mg", "500 Mg." → "500mg". Unparseable input → normalized text. */
export function normalizeStrength(value: string | null | undefined): string {
  const text = normalizeText(value);
  const m = text.match(/^(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml)\.?$/);
  return m ? `${m[1]}${m[2]}` : text.replace(/\s+/g, "");
}

const FORM_ALIASES: Record<string, string> = {
  tablet: "tablet",
  tablets: "tablet",
  tab: "tablet",
  tabs: "tablet",
  capsule: "capsule",
  capsules: "capsule",
  cap: "capsule",
  caps: "capsule",
};

export function normalizeForm(value: string | null | undefined): string {
  const text = normalizeText(value);
  return FORM_ALIASES[text] ?? text;
}

export function nameTokens(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean);
}
