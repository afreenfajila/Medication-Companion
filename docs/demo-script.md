# Manual demo checklist

Run on the deployed **preview** first (HTTPS is needed for camera/mic), then on production.
Automated tests cover logic and axe rules; these are the things only a person can check.

## A. Happy path (about 2 minutes)
1. Open `/` → choose **Mei Ling**. Landing shows **one** primary button, "Call with companion", plus small Help · Language · Settings. No "Show medicine"/schedule anywhere.
2. Tap **Call with companion**. The only controls are **Get help · Mute · End call**.
3. Type (or speak) **"What is this for? When do I take it?"**. Companion asks "Let's check this together…" and shows **only** "Show medicine".
4. Tap **Show medicine** → "How would you like to show me your medicine?" with **Use camera** and **Choose a photo**. Tap **Use camera** → camera explanation → **Yes, switch camera** → browser asks for permission → rear camera preview (or explained fallback).
5. Under **Other ways to show the label**, tap **Choose a photo** and pick `public/samples/sample-metformin-label.png` (save it first). After a few seconds: "I found a possible match: Metformin, 500 mg", **no instructions visible**. On an iPhone, also try a HEIC photo: it should open or show "I couldn't open that photo".
6. Say or type **"yes, this is my medicine"** → three chunks: purpose, instruction, wrap-up. Beside the instruction: "BrightCare Pharmacy · checked …" and "Does this match what's printed on your label?". Tap **中文** and back; nothing resets.
7. **I understand** → complete screen. **End call** → back to quiet landing.

## B. Safe uncertainty
- Repeat step 5 with `sample-blurry-label.png` → "Let's check this one together", **no instructions**, options: Try another photo, Ask a pharmacist to call me, and More ways to get help.
- Repeat with `sample-different-medicine-label.png` → same safety screen.
- **Ask a pharmacist to call me** → confirm → "I've sent your request… Your reference is BC-…". With `SIMULATED_SERVICE_FAILURE=pharmacy` → "I couldn't send that just now", then Try again or See the pharmacy's number.
- **Let my family know** / **Ask my trusted helper** → consent question first; "Not now" sends nothing.
- "No, try again" / "I'm not sure" on the confirm screen → safety screen.

## C. Safety classifier (no AI is consulted)
- In a call type **"I have chest pain"** → urgent screen, no way back into normal conversation.
- Type **"Should I stop taking it?"** and **"What are the side effects?"** → "ask your pharmacist or clinic" safety screen.

## D. Fallbacks
- Deny the camera (or tap **Not now**) → explained fallback; Choose a photo, Choose from my medicines and typed details still work.
- Turn the network off (or use a preview without `ANTHROPIC_API_KEY`) and choose a photo → safe fallback screen; choosing from your medicines still works.
- Typed label: `metformin` / `500 mg` → possible match. `metformin` / `850 mg` → safety screen.

## E. Voice
- **Call with companion** → browser asks for the microphone → say the question from step 3 → live words show as "Hearing you…", then the final words appear once, like typing. Deny the mic → plain message, **Try again**, and the text box opens.
- **Mute** → status says "Muted", the button reads **Unmute**, the text box opens; nothing said is answered. **Unmute** → listening resumes in the same call.
- **Get help** → sheet with "Get help from a person", **Repeat slowly**, **Type instead**, the interrupt setting (realtime voice only) and About. Escape closes it; nothing changes in the call.
- Scroll up in the transcript while the companion talks → your place is kept and **Latest message** appears. **End call** stops voice and mic.
- Confirm nothing about the medicine (purpose/instruction) is read before "Yes, this is my medicine".

## F. Caregiver view
- `/caregiver` → header "Caregiver view — prototype", prototype notice, record with its verified date, status chip, activity timeline with the events from your run (no typed text), process audit table. Read-only.

## G. Quality
- **Keyboard only:** Tab through landing and a full flow; focus ring always visible; Escape closes Help/Language/Settings and focus returns.
- **Reduced motion** (OS setting): orb and scan line are static.
- **Widths:** 320 px and 430 px, no horizontal scroll; desktop shows the phone frame.
- **Screen reader** (VoiceOver/NVDA): each screen announces its heading; safety and companion messages are announced.
- **No secrets:** `npm run build && npm run check:bundle` passes; DevTools → Network shows no key in any request.
- The small "Prototype · fictional data" badge on every screen, and the `/about` link (which explains what is simulated).
