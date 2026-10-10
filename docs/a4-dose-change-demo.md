# Assignment 4: dose-change demo

**Boundary:** AI explains a verified medication record. It does not prescribe. In this journey,
success does **not** mean resolving the dose. It means the person sees the difference, hears the
companion's limit, reviews and approves a callback request, and leaves with the medication
question still marked **unresolved**.

## Open it

```bash
npm install
npm run dev
# open http://localhost:3000/companion/dose-check-demo
```

Reviewer controls sit above the phone frame, outside the patient-facing call. Pick a scenario,
tap **Call with companion**, then say or type:

> My doctor changed my medicine, but this box still says the old amount. How many should I take now?

Then tap **Show medicine** → **Use camera** → **Yes** (or **Not now** → choose from my medicines /
type the name) → **Yes, this is my medicine**. With no camera, the existing camera-free routes
still work. **Reset call** restarts the scenario. Leaving the page clears it.

`/companion` runs the same journey without a scenario: the record is available, the box wording is
typed or read aloud by the person, and the callback succeeds.

| # | Scenario | What it shows |
|---|---|---|
| 1 | Record and label differ → callback submitted | Conflict → offer → *Check before sharing* → Send → "Demo: callback request submitted." with Request status *Submitted — simulated* and Medication status *Unresolved* |
| 2 | Record and label differ → submission fails | First Send fails: "Demo: request not submitted." Nothing is lost. **Try again** sends the same request ID and succeeds |
| 3 | Misread label → correction | The reading "Take 7 tablet…" is unconfirmed. **Change the wording** → type `Take 1 tablet twice daily with meals` → confirm it → *Matches for the details checked* |
| 4 | Label matches record | "TAKE ONE TABLET TWO TIMES A DAY WITH MEALS." → *Matches for the details checked* (no false conflict) |
| 5 | Record unavailable | Limitation line and **Get help**. Nothing is compared or invented |
| 6 | Record and label differ → outcome unknown | First Send: "Demo: submission could not be confirmed." with no claim either way. **Try again** finds it was delivered: one request, not two |

## What is implemented

- **Recognising the request:** a deterministic `dose-change` intent, read after the safety
  classifier. It asks which medicine, unless the name was said.
- **Confirming the medicine:** the existing possible-match → confirm gate. **No, try again** returns
  to identification (once). **Not sure** goes to the existing safety card and unlocks nothing.
- **The record step:** the record instruction with its source and date (BrightCare Pharmacy ·
  checked 21 September 2026).
- **The label step ("Please check what I read"):**
  - The wording is shown with its source: label photo (simulated), typed, or heard.
  - Three full-size choices: *Yes, that is what the label says*, *Change the wording*, *I can't
    confirm it*.
  - Every new wording is a new **label revision**. It clears the previous confirmation and
    comparison, and must be confirmed itself. A tap for an older revision does nothing.
  - *I can't confirm it* gives "insufficient information", never a match or a conflict.
  - Changing the label inside the review panel also goes through this check before the summary can
    be sent.
- **Record version:** the record has a version (`brightcare-metformin-v1`). Each comparison is
  stamped with the record version and label revision it used.
- **Comparison:** structured fields (amount, times a day, timing) give *match*, *conflict* or
  *insufficient*.
- **Conflict view:** record and label stacked, each labelled with its source, with the differing
  field named in text (not colour). The line is fixed: "These instructions differ. I can show you
  the difference, but I cannot confirm which instruction you should follow."
- **Callback offer → "Check before sharing":**
  - Offered for a conflict, an incomplete comparison or an unreachable record, each with its own
    truthful reason. Never offered for a match.
  - The panel shows the recipient, what she wants checked, medicine, record instruction with source
    and date (or "Not available"), confirmed label (or "Not confirmed"), and a masked callback
    number with **Change**.
  - Actions are Send, Change something, Don't send and **Read this to me**, then the sharing
    boundary and "Demo only — no real callback request is sent."
  - **Read this to me** (and Repeat) reads the summary aloud, but not the number.
- **After an outcome:** **Review request**, **Return to call** and **End call**. Returning says the
  difference is still unresolved and logs `dose-check-left-unresolved`, never "resolved".
- **Text never waits for audio** (EN-05): words and controls appear at once, and the voice follows.
- **Focus:** if the button just pressed disappears, keyboard focus moves to the new panel.
- **Reload:** the start screen says the previous call ended and doesn't guess about requests.
- **Activity log:** content-model §21 event names (`label-confirmed`, `comparison-completed`,
  `callback-draft-created`, `callback-approved`, `callback-submitted`, and so on). They carry
  versions and outcomes, never wording or numbers.
- **Submission states:** reviewing, editing, submitting, submitted, failed, unknown and cancelled.
  Send is disabled while sending. There is one logical request per reviewed version, and late
  results after End call are dropped.
  - **Failed** is a definite non-delivery: "No one has been notified. Your summary is still
    available."
  - **Unknown** (no answer within 15 s, or an error) claims neither delivery nor non-delivery.
    **Try again** reuses the same request ID, and the summary can't be edited or cancelled,
    because it may already have gone.
  - If she taps **Get help** while a request is sending, the answer still lands, and coming back
    shows it.
- **Voice:** spoken yes/no confirms a reading or answers the offer. Sending always needs a tap.
- **Language:** English and Simplified Chinese.

## What is simulated

- **The record, the label reading and the callback outcome** are fictional. Reviewer scenarios
  stand in for camera reading of the instruction line; real photos are still read for identity
  only.
- **The callback request** goes to `SimulatedDoseCallbackService`, which runs in the browser.
  Deduplication is an in-memory map in that browser tab: it is lost on reload and is not
  production-grade idempotency. The same request ID with different content is refused.
  There is no network call, no pharmacy and no phone call. The `SIM-` reference is never shown as
  a real one.
- **The callback number** (`0000 0188`) and the pharmacy number are fictional.

## Proposed or unvalidated

- The instruction parser covers this record's wording (EN and zh-Hans) only. It is not a label
  grammar and is not clinically validated.
- The zh-Hans copy for this journey needs native-speaker review.
- There's no new symptom triage. The existing classifier still interrupts, and carrying on
  returns to the comparison.
- The existing A4 investigation demo (`/companion/a4-investigation-demo`) and its scoring are
  untouched and unvalidated. This journey doesn't use them.

## Tests

```bash
npm run typecheck   # passes
npm run lint        # passes
npm run test        # 33 files, 631 tests pass
npm run build       # passes; /companion/dose-check-demo is a static route
npm run check:bundle  # passes
```

New tests are in `src/lib/dose-check/dose-check.test.ts` (logic and reducer, 45) and
`src/test/dose-check-journey.test.tsx` (UI, 13).

## Manual walkthrough checklist

- [ ] Scenario 1: the opening line gets the "which medicine?" reply. There is no dose answer
      anywhere.
- [ ] The reading shows *not confirmed yet* with two equal buttons.
- [ ] Conflict: both instructions are labelled with their source, "Different: amount" is shown,
      and the fixed limit sentence is spoken.
- [ ] Check before sharing: the number is masked, **Change** opens an edit, and saving returns to
      the review.
- [ ] Send: the button disables and says "Sending your request…", then *Submitted — simulated*
      and *Unresolved*.
- [ ] Scenario 2: failure, then **View fictional pharmacy contact**, then **Try again** succeeds.
- [ ] Scenario 6: "could not be confirmed" with no "No one has been notified", then **Try again**
      shows submitted.
- [ ] While "Sending…", tap **Get help**, then **Carry on**: the outcome is shown, not stuck.
- [ ] Scenario 3: correcting the misread label gives *Matches for the details checked*. Edit the label inside the
      review panel to match the record: the summary is set aside and "Nothing was shared."
- [ ] Don't send: "Nothing was shared." and the comparison is still on screen.
- [ ] Mid-check, say "I feel dizzy": the safety card appears. **Carry on** returns to the
      comparison.
- [ ] End call during "Sending…": nothing changes afterwards.
- [ ] Switch to 中文: the same journey works.
- [ ] Keyboard only: every control is reachable with a visible focus ring.
- [ ] A screen reader announces one line per step, with no competing announcements.

## Screens to capture

1. The opening line, with the "which medicine?" reply.
2. Confirm medicine (possible match).
3. Record and the unconfirmed box reading.
4. The conflict view (stacked, sources labelled) and the limit sentence.
5. The callback offer.
6. *Check before sharing* (masked number, prototype notice).
7. Editing the summary.
8. Submitting (button disabled).
9. Submitted: request *Submitted — simulated*, medication *Unresolved*.
10. Failed: actions and the fictional contact.
11. "Nothing was shared." after Don't send.
12. Misread → corrected → *Matches for the details checked*.
13. Record unavailable.
14. The same conflict view in 中文.
