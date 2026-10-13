// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Gemini integration was removed completely (speech output, speech input,
 * SDK, routes, bootstraps, env). Nothing in the code, config or current
 * specifications may mention it again except docs/decisions.md, which is the
 * decision history and says so.
 */
const ROOT = join(__dirname, "..", "..");
const GEMINI = /gemini|@google\/genai|generativelanguage\.googleapis|GEMINI_/i;
// …and scripts/check-bundle.mjs, whose pattern keeps the removed SDK out of the browser bundle.
const ALLOWED = new Set(["docs/decisions.md", "src/test/google-voice-removed.test.ts", "scripts/check-bundle.mjs"]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git" || name === "public") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|mjs|js|json|md|css|example)$/.test(name) || name === ".env.example") yield p;
  }
}

describe("Gemini is gone", () => {
  it("no source, script, config or current specification mentions Gemini", () => {
    const hits: string[] = [];
    for (const dir of ["src", "scripts", "docs"]) for (const file of walk(join(ROOT, dir))) check(file, hits);
    for (const name of readdirSync(ROOT)) {
      const p = join(ROOT, name);
      if (statSync(p).isFile() && (/\.(md|json|mjs|ts)$/.test(name) || name === ".env.example") && name !== "package-lock.json") check(p, hits);
    }
    expect(hits).toEqual([]);
  });

  it("the SDK is not a dependency and no Gemini route, provider or player file exists", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain("@google/genai");
    expect(readFileSync(join(ROOT, "package-lock.json"), "utf8")).not.toContain("@google/genai");
    for (const gone of [
      "src/app/api/companion/speak",
      "src/app/api/companion/transcribe",
      "src/components/companion/gemini-voice-bootstrap.tsx",
      "src/lib/voice/gemini-speech-player.ts",
      "src/lib/voice/gemini-speech-client.ts",
      "src/lib/voice/google-voice.ts",
      "src/lib/ai/speech.ts",
      "src/lib/ai/transcribe.ts",
      "src/lib/ai/wav.ts",
    ]) {
      expect(() => statSync(join(ROOT, gone)), gone).toThrow();
    }
  });

  it("the env example names only the current providers, none of them public", () => {
    const env = readFileSync(join(ROOT, ".env.example"), "utf8");
    for (const name of ["OPENAI_API_KEY", "OPENAI_TRANSCRIBE_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_TTS_MODEL"]) {
      expect(env).toMatch(new RegExp(`^${name}=`, "m"));
    }
    expect(env).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(OPENAI|ANTHROPIC|ELEVENLABS)/);
  });
});

function check(file: string, hits: string[]) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (ALLOWED.has(rel)) return;
  const text = readFileSync(file, "utf8");
  const m = text.match(GEMINI);
  if (m) hits.push(`${rel}: …${text.slice(Math.max(0, m.index! - 30), m.index! + 40).replace(/\s+/g, " ")}…`);
}
