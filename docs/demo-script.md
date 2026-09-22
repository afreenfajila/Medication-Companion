# Manual demo checklist

Run on the deployed **preview** first (HTTPS is needed for camera/mic), then on production.
Automated tests cover logic and axe rules; these are the things only a person can check.

## A. Happy path (about 2 minutes)
1. Open `/` → choose **Mei Ling**. Landing shows **one** primary button, "Call with companion", plus small Help · Language · Settings. No "Show medicine"/schedule anywhere.
2. Tap **Call with companion**. Footer shows Repeat · Get help · End call.
3. Type (or speak) **"What is this for? When do I take it?"**. Companion asks "Let's check this together…" and shows **only** "Show medicine".
4. Tap **Show medicine** → camera explanation appears first. Tap **Yes, switch camera** → browser asks for permission → rear camera preview (or explained fallback).
5. Tap **Upload a photo — demo** → **Clear label photo**. After a few seconds: "I found a possible match", Metformin 500 mg card, **no instructions visible**.
6. Tap **Yes, this is my medicine** → three chunks: purpose, instruction, wrap-up. Source line names the demo record. Tap **中文** and back; nothing resets.
7. **I understand** → complete screen. **End call** → back to quiet landing.

## B. Safe uncertainty
- Repeat step 5 with **Blurry label photo** → "I'm not sure enough to explain this safely", **no instructions**, options: Try another photo, Check with pharmacy — demo, Ask a trusted helper — demo.
- Repeat with **Different medicine photo** → same safety screen.
- Tap a "— demo" action → notice says nothing was sent.
- "No, try again" / "I'm not sure" on the confirm screen → safety screen.

## C. Safety classifier (no AI is consulted)
- In a call type **"I have chest pain"** → urgent screen, no way back into normal conversation.
- Type **"Should I stop taking it?"** and **"What are the side effects?"** → "ask your pharmacist or clinic" safety screen.

## D. Fallbacks
- Deny the camera (or tap **Not now**) → explained fallback; demo label, sample photos and typed details still work.
- Turn the network off (or use a preview without `ANTHROPIC_API_KEY`) and pick a sample photo → safe fallback screen, demo label still works.
- Typed label: `metformin` / `500 mg` → possible match. `metformin` / `850 mg` → safety screen.

## E. Voice
- **Tap to speak** → browser asks for the microphone → say the question from step 3 → it appears as a caption and behaves like typing. Deny the mic → plain message, typing still works.
- Turn **Sound on** → replies are read aloud; **Repeat** re-reads; **Sound off** silences; ending the call stops it.
- Confirm nothing about the medicine (purpose/instruction) is read before "Yes, this is my medicine".

## F. Caregiver view
- `/caregiver` → header "Caregiver view — prototype", demo notice, record, status chip, activity timeline with the events from your run (no typed text), process audit table. Read-only.

## G. Quality
- **Keyboard only:** Tab through landing and a full flow; focus ring always visible; Escape closes Help/Language/Settings and focus returns.
- **Reduced motion** (OS setting): orb and scan line are static.
- **Widths:** 320 px and 430 px, no horizontal scroll; desktop shows the phone frame.
- **Screen reader** (VoiceOver/NVDA): each screen announces its heading; safety and companion messages are announced.
- **No secrets:** `npm run build && npm run check:bundle` passes; DevTools → Network shows no key in any request.
- Visible prototype disclaimer and `/about` link on every screen.
