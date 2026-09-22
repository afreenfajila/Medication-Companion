# Medication Companion — prototype

A mobile-first, safety-bounded AI companion that explains a **fictional demo pharmacy record**
("BrightCare Pharmacy — demo record"). Built for an ELVTR AI Product Design assignment. It is not a
medical device and is not connected to any real pharmacy.

Source-of-truth documents: `prd.md`, `design-standard.md`, `site-contract.md`, `content-model.md`,
`CLAUDE.md`. Design decisions and judgement calls: `docs/decisions.md`.

## Run locally

```bash
npm install
cp .env.example .env.local   # then add your keys (see below); never commit .env.local
npm run dev                  # http://localhost:3000
```

The whole demo works **without any key**: use the demo label or the typed-label form. Only the
sample-photo "upload" and camera capture need `ANTHROPIC_API_KEY`.

| Variable | Needed for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Reading label photos (Claude vision) | Server-only. Never prefix with `NEXT_PUBLIC_`. |
| `ANTHROPIC_MODEL` | Optional model override | Defaults to `claude-opus-5`. |
| `GEMINI_API_KEY` | Not used yet (Gemini Live is not built) | Server-only. |
| `SUPABASE_*` | Not used yet (optional persistence) | Server-only except the `NEXT_PUBLIC_` anon values. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js |
| `npm run lint` · `npm run typecheck` · `npm test` | Quality gates |
| `npm run check:bundle` | After a build: fails if a key or the Anthropic SDK is in the client bundle |
| `npm run verify` | Everything above, in order |

## Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel (framework preset: Next.js, no config needed).
2. In **Project Settings → Environment Variables** add `ANTHROPIC_API_KEY` (and optionally
   `ANTHROPIC_MODEL`) for Preview and Production. Do not add them as `NEXT_PUBLIC_*`.
3. Deploy a **Preview** first. Then follow `docs/demo-script.md` on the preview URL.
4. Promote to Production when the checklist passes.

Notes for the deployed site:
- The camera and microphone need HTTPS (Vercel provides it). The `Permissions-Policy` header allows them for this origin only.
- The label route's rate limit is in memory per serverless instance (best effort). It is a cost guard, not a security boundary.
- Nothing is persisted: the activity list in the caregiver view lives in the browser session.

## Browser support for voice
Speech recognition needs a browser that ships it (Chrome, Edge, Safari). Firefox has none: the mic button
is hidden and typing works. The camera and microphone are only requested after a user action.
