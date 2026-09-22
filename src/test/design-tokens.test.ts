import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/utils/contrast";

// Reads the REAL tokens from globals.css so a palette change that breaks contrast fails here.
const css = readFileSync("src/styles/globals.css", "utf8");
const token = (name: string): string => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} not found`);
  return m[1];
};

describe("colour contrast (WCAG AA 4.5:1 for the text pairs actually used)", () => {
  const pairs: Array<[string, string, string]> = [
    ["body text on canvas", "navy-900", "canvas"],
    ["supporting text on canvas", "navy-700", "canvas"],
    ["supporting text on white", "navy-700", "surface"],
    ["supporting text on light teal", "navy-700", "teal-100"],
    ["body text on light teal (transcript, secondary buttons)", "navy-900", "teal-100"],
    ["teal text/links on white", "teal-800", "surface"],
    ["teal text/links on canvas", "teal-800", "canvas"],
    ["teal state label on light teal", "teal-800", "teal-100"],
    ["primary button label", "surface", "navy-900"],
    ["'1 medicine only' badge", "surface", "teal-800"],
    ["safety label on warning surface", "danger-800", "danger-100"],
    ["error message on canvas", "danger-800", "canvas"],
    ["error message on white", "danger-800", "surface"],
    ["body text on warning surface", "navy-900", "danger-100"],
  ];
  it.each(pairs)("%s", (_name, fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("documents the known-insufficient originals so nobody reuses them for small text", () => {
    expect(contrastRatio(token("teal-600"), token("surface"))).toBeLessThan(4.5);
    expect(contrastRatio(token("danger-700"), token("danger-100"))).toBeLessThan(4.5);
  });
});

describe("motion and focus", () => {
  it("static orb/scan line under prefers-reduced-motion", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/\.orb \*/);
    expect(block).toMatch(/animation: none !important/);
    expect(block).toMatch(/\.scan-line/);
  });

  it("only transform and opacity are animated in the orb keyframes", () => {
    const keyframes = css.match(/@keyframes orb-[\s\S]*?\n}\n/g) ?? [];
    expect(keyframes.length).toBeGreaterThanOrEqual(4);
    for (const kf of keyframes) {
      const props = [...kf.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
      for (const p of props) expect(["transform", "opacity"]).toContain(p);
    }
  });

  it("keyboard focus ring is defined and not removed", () => {
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline:\s*3px solid var\(--color-focus\)/);
  });
});
