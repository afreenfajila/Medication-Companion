// Fails if anything secret-looking ended up in the browser bundle (site-contract §15 step 6).
// Run after `next build`:  node scripts/check-bundle.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".next/static";
const PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/, "Anthropic API key"],
  [/AIza[0-9A-Za-z_-]{20,}/, "Google/Gemini API key"],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, "JWT (e.g. Supabase key)"],
  [/ANTHROPIC_API_KEY|GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/, "secret variable name"],
  [/@anthropic-ai\/sdk|api\.anthropic\.com/, "server-only Anthropic SDK/endpoint"],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|css|html|json|map)$/.test(name)) yield p;
  }
}

let files = 0;
const hits = [];
try {
  for (const file of walk(ROOT)) {
    files += 1;
    const text = readFileSync(file, "utf8");
    for (const [re, label] of PATTERNS) if (re.test(text)) hits.push(`${label}: ${file}`);
  }
} catch {
  console.error(`No build output at ${ROOT}. Run "npm run build" first.`);
  process.exit(2);
}

if (hits.length) {
  console.error("Secret-looking content found in the client bundle:\n  " + hits.join("\n  "));
  process.exit(1);
}
console.log(`Bundle check passed: ${files} client files scanned, no secrets or server-only SDK found.`);
