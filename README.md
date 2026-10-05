# Medication Companion

**Call your companion, and it will help you understand the information in your pharmacy record — or
help you reach a person when it is not sure.**

Medication Companion is a mobile-first web prototype for older adults who manage their own
medicines at home. Instead of a menu of clinical options, it starts with one familiar action: a
call. You speak or type your question, show the companion a medicine label, confirm it is the
medicine you are holding, and hear what your pharmacy record says about it, in English or
Simplified Chinese.

It was built for the ELVTR AI Product Design course (Assignment 02). The persona, Mei Ling, and
her record from "BrightCare Pharmacy" are **fictional demo data**. This is not a medical device and
it is not connected to any real pharmacy.

---

## The experience

### Happy path

1. **Call.** The home screen is deliberately quiet: an animated companion orb, a short welcome, and
   one button, **Call with companion**.
2. **Ask.** Speak or type anything, such as "What is this for? When do I take it?" or "I've got my
   Metformin with me". The companion works out what you mean. If it isn't sure it heard a medicine
   name correctly, it checks with you ("Did you mean Metformin?") and suggests typing or spelling
   the name instead.
3. **Show medicine.** When a label is needed, the companion offers **Show medicine**. It explains
   how you'd like to show it: **Use camera** (it explains why before asking for permission) or
   **Choose a photo** from your gallery or files. You can also type the name, or choose from the
   medicines on your record.
4. **Confirm.** The companion shows a **possible match** and never claims certainty. Nothing about
   the medicine is explained until you say "Yes, this is my medicine".
5. **Understand.** The companion explains the record in three short steps: what the medicine is
   for, the verified instruction, and a closing check. You can switch to 中文, repeat, go back, or
   say "I understand".

### Safe uncertainty

If a label is blurry, unreadable, for a different medicine, or you aren't sure it's yours, the
companion **gives no medicine instructions at all**. It says plainly that it can't be sure and offers
human help instead: ask a pharmacist to call, contact the clinic, ask a trusted helper, or let family
know. Each one confirms first (family and helper need consent) and shows "sent" only when the
(simulated) service succeeds.

Questions it must not answer, such as "Should I stop taking it?" or "What are the side effects?",
and urgent wording such as "I have chest pain" are caught by fixed rules before any AI is involved.
They go straight to a safety screen.

### Caregiver view

`/caregiver` is a read-only, single-patient view for a family member or helper. It shows Mei Ling's
pharmacy record and a timeline of what happened in the call: call started, route chosen, match
confirmed, or help needed. The timeline records steps and outcomes, never what she said.

---

## What it will never do

These rules hold whatever the AI says and whichever path the conversation takes:

- Diagnose, prescribe, recommend treatment, change a dose, or tell anyone whether to take, stop or
  skip a medicine.
- Invent medication facts. Everything it says about a medicine comes word for word from the local
  fictional record.
- Explain a medicine before the person confirms the possible match.
- Treat a blurry, conflicting or unmatched label as good enough.
- Place a real call or send a real message: help requests go to simulated services, and "sent" is
  shown only after the service succeeds. It does not route anyone to emergency services.

Each of these is enforced in code by an explicit state machine
([`src/lib/session/state-machine.ts`](src/lib/session/state-machine.ts)), not by prompting. For
example, the explanation state cannot be reached without a confirmed match, and loading
`/companion?state=explain` directly just shows the safe start state.

---

## How AI is used

AI makes the companion easier to talk to, but every decision that matters is made by fixed code.

| Part | What it does | What it is never allowed to do |
|---|---|---|
| **Claude: label reading** | Reads the visible name, strength and form from a label photo into strict JSON. | Decide whether the label matches the record, or write medicine information. |
| **Claude: understanding** | Works out what the person meant, including a misheard medicine name, and replies in natural words using the recent conversation. It chooses which of the two in-call options to offer. | See the medicine's instructions, mention any dose, timing or advice, claim a medicine is confirmed, open the camera, or answer a safety question. |
| **Gemini: voice** | Reads the approved text aloud in a consistent voice. | Decide what is said. |
| **Fixed code** | Safety classification, conversation routing, label matching, confirmation, and every record explanation. | — |

All AI runs on the server, and keys never reach the browser (`npm run check:bundle` enforces this).
Every AI reply is validated with a schema and then a content guard, and it falls back to approved
wording if anything fails. **The whole prototype works with no API keys at all**: replies use
the approved wording, and typing the name or choosing from your medicines needs no AI.

Speech-to-text uses the browser's built-in speech recognition, and typing always works as well.

---

## Try it

**Route with no keys and no camera:** Call with companion → type "What is this for?" → Show
medicine → Type the name (`metformin` / `500 mg`) → Yes, this is my medicine.

**Safety route:** the same steps, but type the label as `metformin` / `850 mg` (the wrong strength),
or type "Should I stop taking it?" during the call.

A full manual checklist for reviewers is in [`docs/demo-script.md`](docs/demo-script.md).

---

## Run it locally

Requires Node.js 20 or later.

```bash
npm install
cp .env.example .env.local   # optional — add keys to turn on the AI features
npm run dev                  # http://localhost:3000
```

| Variable | Turns on | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Label photo reading and conversational understanding | Server-only. Never prefix with `NEXT_PUBLIC_`. |
| `ANTHROPIC_MODEL` | Optional model override | Defaults to `claude-opus-5`. |
| `GEMINI_API_KEY` | Consistent spoken voice (Gemini text-to-speech) | Server-only. Without it, the browser's own voice is used. |
| `GEMINI_TTS_MODEL` | Optional voice model override | Defaults to `gemini-3.1-flash-tts-preview`. |
| `SUPABASE_*` | Not used yet | Optional persistence was planned; everything runs in memory. |

Never commit `.env.local`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` · `npm run typecheck` · `npm test` | Quality gates (Vitest, Testing Library, axe accessibility checks) |
| `npm run check:bundle` | After a build: fails if a key or the Anthropic SDK is in the browser bundle |
| `npm run verify` | All of the above, in order |

### Deploy to Vercel

1. Import the repository in Vercel. It uses the Next.js preset with no extra config.
2. Under **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` (and
   the optional model overrides) for Preview and Production. Never add them as `NEXT_PUBLIC_*`.
3. Deploy a Preview, run through [`docs/demo-script.md`](docs/demo-script.md), then promote it to
   Production.

The camera and microphone need HTTPS, which Vercel provides. API rate limits are held in memory per
serverless instance, so they are a cost guard rather than a security boundary. Nothing is persisted.

### Browser support

Voice input needs a browser with built-in speech recognition (Chrome, Edge or Safari). In Firefox
the microphone control is hidden and typing works the same way. The camera and microphone are only
requested after the person taps something.

---

## How it's built

- **Next.js App Router, TypeScript, Tailwind CSS**, with DM Sans and Lucide icons
- **Zod** validates every API request, every response, and all AI output
- **Anthropic TypeScript SDK** (server-only) for Claude, and **@google/genai** for Gemini speech
- **Vitest + Testing Library + axe-core** for unit, interaction and accessibility tests

```text
src/
  app/                  pages (/, /companion, /caregiver, /about) and API routes
    api/label/analyze   label photo → Claude extraction → deterministic match
    api/companion/*     understand · speak
  components/           companion call UI, caregiver view, shared UI (orb, cards, buttons)
  lib/
    session/            state machine, intent routing, off-topic handling
    safety/             deterministic urgent / unsupported-question classifier
    matching/           name + strength matching against the record
    content/            seed record, English + Chinese copy, AI output guards
    ai/                 Claude and Gemini calls (server-only)
    voice/              browser speech recognition, voice commands, echo guard
```

### Project documents

| Document | What it covers |
|---|---|
| [`prd.md`](prd.md) | Product requirements: users, journey, scope |
| [`design-standard.md`](design-standard.md) | Visual system, components, accessibility rules |
| [`site-contract.md`](site-contract.md) | Routes, API contracts, states and transitions |
| [`content-model.md`](content-model.md) | The fictional record and approved copy |
| [`docs/decisions.md`](docs/decisions.md) | Design decisions and trade-offs made during the build |
| [`CLAUDE.md`](CLAUDE.md) | Rules for AI-assisted development of this repository |

---

## Limitations

- One fictional patient and one medicine: Mei Ling Tan, Metformin 500 mg.
- Help requests run through simulated services and don't contact anyone.
- There is no real-time streaming voice model. Voice is browser speech recognition plus spoken
  replies.
- Nothing is stored between sessions. The caregiver timeline lives in the browser session.
- This is a prototype for design review, not for clinical use.
