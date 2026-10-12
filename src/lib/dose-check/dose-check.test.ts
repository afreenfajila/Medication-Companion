import { describe, expect, it } from "vitest";
import { t as translate } from "@/lib/content/translations";
import { resolveExplanation } from "@/lib/content/explanation";
import { metforminRecord } from "@/lib/content/seed-record";
import { buildTimeline, deriveRecordStatus } from "@/lib/session/audit-view";
import { routeMessage } from "@/lib/session/intent";
import { reduceSession, type DoseAction, type Session } from "@/lib/session/state-machine";
import { SimulatedDoseCallbackService } from "@/lib/services/dose-callback";
import { interpretUtterance } from "@/lib/voice/commands";
import { doseCheckLine } from "@/lib/voice/speakable";
import { CTX, chooseCamera, chooseShowMedicine, grantCamera, resolve, run, startCall, submitDemo } from "@/test/helpers";
import {
  buildCallbackPayload,
  callbackRequestId,
  compareInstructions,
  parseInstruction,
  type DoseScenario,
} from "./dose-check";

const OPENING =
  "My doctor changed my medicine, but this box still says the old amount. How many should I take now?";
const RECORD = "Take 1 tablet twice daily with meals";
const OLD_LABEL = "Take 2 tablets twice daily with meals";

const dose = (action: DoseAction) => ({ type: "DOSE", action }) as const;
const confirm = (s: Session) =>
  run([{ type: "CONFIRM_MATCH", candidateId: s.candidate!.candidateId, decision: "confirmed" }], s);
/** "Yes, that is what the label says" — for the revision on screen. */
const confirmShown = (s: Session) => run([dose({ kind: "confirm-label", revision: s.doseCheck!.labelRevision })], s);
/** Types label wording, then confirms exactly that revision. */
const labelAs = (text: string, s: Session) => confirmShown(run([dose({ kind: "enter-label", text })], s));

/** Opening line → Show medicine → camera → label → possible match (not yet confirmed). */
function toDoseConfirm(scenario: DoseScenario | null = null, from?: Session): Session {
  return run(
    [
      { type: "SET_DOSE_SCENARIO", scenario },
      startCall,
      { type: "USER_MESSAGE", text: OPENING, via: "typed" },
      chooseShowMedicine,
      chooseCamera,
      grantCamera,
      submitDemo(),
      resolve,
    ],
    from,
  );
}
const toLabelStep = (scenario: DoseScenario | null = null) => confirm(toDoseConfirm(scenario));
const toConflict = () => labelAs(OLD_LABEL, toLabelStep());
const toReview = () => run([dose({ kind: "offer-callback" }), dose({ kind: "accept-offer" })], toConflict());
const requestIdOf = (s: Session) => callbackRequestId(s.doseCheck!.callback!.draftId, s.doseCheck!.callback!.revision);
const line = (s: Session) => doseCheckLine(s, (k) => translate(s.language, k), resolveExplanation(s, s.language)!);
const editSave = (s: Session, changes: Partial<{ callbackContact: string; concernSummary: string; labelInstruction: string }>) => {
  const d = s.doseCheck!.callback!.draft;
  return run(
    [
      dose({ kind: "edit" }),
      dose({
        kind: "save",
        changes: {
          callbackContact: d.callbackContact,
          concernSummary: d.concernSummary,
          labelInstruction: d.confirmedLabel?.instructionText ?? "",
          ...changes,
        },
      }),
    ],
    s,
  );
};

describe("comparison (structured fields, not strings)", () => {
  it("equivalent wording and formatting is not a conflict", () => {
    const record = parseInstruction("Take 1 tablet twice daily with meals.");
    for (const label of [
      "TAKE ONE TABLET TWO TIMES A DAY WITH MEALS",
      "take 1 tablet, twice a day, with meals!!",
      "随餐每日服用一片，每日两次。",
    ]) {
      expect(compareInstructions(record, parseInstruction(label)), label).toEqual({ outcome: "match" });
    }
  });

  it("a different amount is a conflict, naming the field", () => {
    expect(compareInstructions(parseInstruction(RECORD), parseInstruction(OLD_LABEL))).toEqual({
      outcome: "conflict",
      differing: ["amount"],
    });
  });

  it("missing record fields give 'insufficient information', not a guessed result", () => {
    expect(compareInstructions(parseInstruction("Take with meals"), parseInstruction(OLD_LABEL))).toEqual({
      outcome: "insufficient",
      missing: ["amount", "perDay"],
    });
    expect(compareInstructions(parseInstruction(null), parseInstruction(RECORD)).outcome).toBe("insufficient");
    // Timing on one side only: can't say they match.
    expect(compareInstructions(parseInstruction(RECORD), parseInstruction("Take 1 tablet twice daily")).outcome).toBe(
      "insufficient",
    );
  });
});

describe("dose-change journey: identification and confirmation", () => {
  it("the opening line asks which medicine and offers the existing label routes — nothing about doses", () => {
    expect(routeMessage(OPENING, { matchConfirmed: false }).intent).toBe("dose-change");
    const s = run([startCall, { type: "USER_MESSAGE", text: OPENING }]);
    expect(s.state).toBe("listening");
    expect(s.assistantKey).toBe("doseChangeIntro");
    expect(s.contextualActions).toEqual(["show-medicine"]);
    expect(s.doseCheck?.step).toBe("identify");
  });

  it("a named medicine skips the 'which medicine?' question but still needs confirming", () => {
    const s = run([startCall, { type: "USER_MESSAGE", text: "My doctor changed my Metformin dose but the box says the old amount" }]);
    expect(s.state).toBe("confirm-match");
    expect(s.matchStatus).toBe("possible");
    expect(s.doseCheck?.step).toBe("identify");
  });

  it("safety still comes first: a stop/skip question escalates instead", () => {
    const s = run([startCall, { type: "USER_MESSAGE", text: "My doctor changed my dose, should I stop taking it?" }]);
    expect(s.state).toBe("safety");
  });

  it("rejecting the medicine returns to identification; nothing is unlocked", () => {
    const s0 = toDoseConfirm();
    const s = run([{ type: "CONFIRM_MATCH", candidateId: s0.candidate!.candidateId, decision: "denied" }], s0);
    expect(s.state).toBe("camera-permission");
    expect(s.matchStatus).toBeNull();
    expect(resolveExplanation(s, "en")).toBeNull();
    expect(run([dose({ kind: "enter-label", text: OLD_LABEL })], s)).toBe(s);
  });

  it("'not sure' does not unlock any instruction", () => {
    const s0 = toDoseConfirm();
    const s = run([{ type: "CONFIRM_MATCH", candidateId: s0.candidate!.candidateId, decision: "unsure" }], s0);
    expect(s.state).toBe("safety");
    expect(resolveExplanation(s, "en")).toBeNull();
    expect(run([dose({ kind: "enter-label", text: OLD_LABEL })], s)).toBe(s);
  });

  it("before confirmation, dose steps are ignored", () => {
    const s = toDoseConfirm();
    expect(run([dose({ kind: "enter-label", text: OLD_LABEL })], s)).toBe(s);
  });
});

describe("label wording: revisions and confirmation", () => {
  it("an unconfirmed (camera) reading cannot create a conflict", () => {
    const s = toLabelStep("conflict-sent");
    expect(s.state).toBe("explain");
    expect(s.doseCheck).toMatchObject({
      step: "label",
      reading: OLD_LABEL,
      labelSource: "fixture",
      labelRevision: 1,
      labelText: null,
      comparison: null,
    });
    expect(line(s)).toContain(OLD_LABEL);
    expect(line(s)).toContain("Is that what it says?");
  });

  it("typed wording is shown back as a new revision; only confirming it compares", () => {
    const entered = run([dose({ kind: "enter-label", text: OLD_LABEL })], toLabelStep());
    expect(entered.doseCheck).toMatchObject({ reading: OLD_LABEL, labelSource: "typed", labelRevision: 1, comparison: null });
    expect(line(entered)).toContain("Please check what I noted");
    const confirmed = confirmShown(entered);
    expect(confirmed.doseCheck).toMatchObject({ labelText: OLD_LABEL, confirmedLabelRevision: 1 });
    expect(confirmed.doseCheck?.comparison).toMatchObject({ outcome: "conflict", labelRevision: 1, recordVersion: "brightcare-metformin-v1" });
  });

  it("confirmation applies to the revision on screen only", () => {
    const first = run([dose({ kind: "enter-label", text: OLD_LABEL })], toLabelStep());
    const second = run([dose({ kind: "reject-reading" }), dose({ kind: "enter-label", text: RECORD })], first);
    expect(second.doseCheck?.labelRevision).toBe(2);
    // A stale tap for revision 1 does nothing.
    expect(run([dose({ kind: "confirm-label", revision: 1 })], second)).toBe(second);
  });

  it("words said on the label step are only a reading to confirm", () => {
    const s = run([{ type: "USER_MESSAGE", text: OLD_LABEL }], toLabelStep());
    expect(s.doseCheck).toMatchObject({ reading: OLD_LABEL, labelSource: "speech-transcript", labelText: null, comparison: null });
    // Spoken "yes" confirms exactly that revision.
    const intent = interpretUtterance("yes", {
      state: "explain",
      contextualActions: [],
      candidateId: s.candidate!.candidateId,
      explainStep: 0,
      cameraLive: false,
      doseCheck: s.doseCheck,
      pendingSpokenMedicineName: null,
    });
    expect(intent).toEqual({ kind: "event", event: dose({ kind: "confirm-label", revision: s.doseCheck!.labelRevision }) });
  });

  it("extracted, confirmed-label and record wording are kept apart", () => {
    const s = confirmShown(toLabelStep("misread-label"));
    expect(s.doseCheck?.labelText).toBe("Take 7 tablet twice daily with meals");
    expect(s.doseCheck?.reading).toBeNull();
    expect(metforminRecord.verifiedInstruction.canonicalText).toBe(RECORD);
  });

  it("a correction clears the old confirmation, then updates the comparison without restarting", () => {
    const misread = confirmShown(toLabelStep("misread-label"));
    expect(misread.doseCheck?.comparison?.outcome).toBe("conflict");
    const corrected = run([dose({ kind: "review-details" }), dose({ kind: "enter-label", text: RECORD })], misread);
    expect(corrected.doseCheck).toMatchObject({ labelText: null, confirmedLabelRevision: null, comparison: null, labelRevision: 2 });
    const fixed = confirmShown(corrected);
    expect(fixed.doseCheck?.comparison).toMatchObject({ outcome: "match", labelRevision: 2 });
    expect(fixed.state).toBe("explain");
    expect(fixed.callCount).toBe(misread.callCount);
    expect(fixed.matchStatus).toBe("confirmed");
  });

  it("'I can't confirm it' is insufficient information, never a conflict or a match", () => {
    const s = run([dose({ kind: "cannot-confirm" })], toLabelStep("conflict-sent"));
    expect(s.doseCheck?.comparison).toMatchObject({ outcome: "insufficient", missing: ["amount", "perDay", "timing"] });
    expect(s.doseCheck?.labelText).toBeNull();
  });

  it("matching instructions give no false conflict", () => {
    const s = confirmShown(toLabelStep("label-matches"));
    expect(s.doseCheck?.comparison).toMatchObject({ outcome: "match" });
    expect(run([dose({ kind: "offer-callback" })], s)).toBe(s);
  });

  it("a conflict states the limit and recommends no dose", () => {
    const s = toConflict();
    const said = line(s)!;
    expect(said).toBe(translate("en", "doseConflict"));
    expect(said).toContain("I cannot confirm which instruction you should follow");
    expect(said).not.toMatch(/\btake \d|\bfollow the (new|old|record|label)|newer|is correct|you can take/i);
    expect(said).not.toContain(RECORD);
    expect(said).not.toContain(OLD_LABEL);
  });

  it("record unavailable: limitation and help, nothing compared or invented", () => {
    const s = toLabelStep("record-unavailable");
    expect(s.doseCheck?.step).toBe("record-unavailable");
    expect(line(s)).toBe(translate("en", "doseRecordUnavailable"));
    expect(line(s)).not.toContain(RECORD);
    expect(run([dose({ kind: "enter-label", text: OLD_LABEL })], s)).toBe(s);
  });

  it("a symptom mid-check pauses it for safety; carrying on keeps the confirmed context", () => {
    const s = run([{ type: "USER_MESSAGE", text: "I feel dizzy" }], toConflict());
    expect(s.state).toBe("safety");
    const back = run([{ type: "RETURN_TO_CALL" }], s);
    expect(back.state).toBe("explain");
    expect(back.doseCheck?.comparison?.outcome).toBe("conflict");
    expect(back.doseCheck?.labelText).toBe(OLD_LABEL);
  });
});

describe("callback summary: review, edit, send", () => {
  it("declining the offer shares nothing and keeps the comparison", () => {
    const s = run([dose({ kind: "offer-callback" }), dose({ kind: "decline-offer" })], toConflict());
    expect(s.doseCheck).toMatchObject({ callback: null, notice: "nothing-shared", step: "compared" });
    expect(s.doseCheck?.comparison?.outcome).toBe("conflict");
  });

  it("the draft holds record facts from the record and the person's confirmed label (content-model §13)", () => {
    const d = toReview().doseCheck!.callback!.draft;
    expect(d).toEqual({
      recipientId: "brightcare-pharmacy-fictional",
      patientId: "patient_mei_ling_tan",
      medicine: { medicineId: "med_metformin_500_demo", displayName: "Metformin", strengthText: "500 mg" },
      reason: "instruction-discrepancy",
      concernSummary:
        "My medicine label and current record show different instructions. I would like a pharmacist to check the difference.",
      currentRecord: {
        instructionText: "Take 1 tablet twice daily with meals.",
        sourceName: "BrightCare Pharmacy",
        recordedAt: "2026-09-21T00:00:00.000Z",
        recordVersion: "brightcare-metformin-v1",
      },
      confirmedLabel: { instructionText: OLD_LABEL, labelRevision: 1 },
      callbackContact: "0000 0188",
      simulated: true,
    });
  });

  it("the payload is built from an allowlist — no label photo, transcript or session", () => {
    const s = toReview();
    const draft = s.doseCheck!.callback!.draft;
    const payload = buildCallbackPayload({ ...draft, extra: "smuggled", transcript: OPENING } as typeof draft, requestIdOf(s));
    expect(Object.keys(payload).sort()).toEqual(
      [
        "callbackContact",
        "concernSummary",
        "confirmedLabel",
        "currentRecord",
        "medicine",
        "patientId",
        "reason",
        "recipientId",
        "requestId",
        "simulated",
      ].sort(),
    );
    const json = JSON.stringify(payload);
    expect(json).not.toContain(OPENING);
    expect(json).not.toContain("smuggled");
    expect(json).not.toMatch(/image|photo|transcript|audio/i);
  });

  it("editing the draft invalidates the earlier approval and makes a new request", () => {
    // An answer for some other request ID is ignored.
    const sent = run([dose({ kind: "send", revision: 1 }), dose({ kind: "result", requestId: "other", outcome: "failed" })], toReview());
    expect(sent.doseCheck?.callback?.status).toBe("submitting");
    const failed = run([dose({ kind: "result", requestId: requestIdOf(sent), outcome: "failed" })], sent);
    expect(failed.doseCheck?.callback).toMatchObject({ status: "failed", approvedRevision: 1 });
    const edited = editSave(failed, { callbackContact: "0000 0199" });
    expect(edited.doseCheck?.callback).toMatchObject({ status: "reviewing", revision: 2, approvedRevision: null });
    expect(requestIdOf(edited)).not.toBe(requestIdOf(failed));
    // The old version can't be sent any more.
    expect(run([dose({ kind: "send", revision: 1 })], edited)).toBe(edited);
  });

  it("the record can't be overwritten from the edit form", () => {
    const s = editSave(toReview(), { concernSummary: "Please call me" });
    expect(s.doseCheck?.callback?.draft.currentRecord?.instructionText).toBe("Take 1 tablet twice daily with meals.");
    expect(s.doseCheck?.callback?.draft.concernSummary).toBe("Please call me");
  });

  it("a label edit in the summary must be reconfirmed before it counts, and can't be sent meanwhile", () => {
    const s = editSave(toReview(), { labelInstruction: "Take 3 tablets twice daily with meals" });
    expect(s.doseCheck).toMatchObject({ step: "label", reading: "Take 3 tablets twice daily with meals", labelRevision: 2, comparison: null });
    expect(s.doseCheck?.callback?.approvedRevision).toBeNull();
    expect(run([dose({ kind: "send", revision: s.doseCheck!.callback!.revision })], s)).toBe(s);
    const reconfirmed = confirmShown(s);
    expect(reconfirmed.doseCheck?.callback?.draft.confirmedLabel).toEqual({
      instructionText: "Take 3 tablets twice daily with meals",
      labelRevision: 2,
    });
    expect(reconfirmed.doseCheck?.callback?.status).toBe("reviewing");
  });

  it("a label edit that removes the conflict sets the stale draft aside", () => {
    const s = confirmShown(editSave(toReview(), { labelInstruction: RECORD }));
    expect(s.doseCheck).toMatchObject({ callback: null, notice: "conflict-cleared", comparison: { outcome: "match" } });
    expect(line(s)).toContain("set the callback summary aside");
  });

  it("Don't send: cancelled, nothing submitted, comparison kept", () => {
    const s = run([dose({ kind: "dont-send" })], toReview());
    expect(s.doseCheck?.callback?.status).toBe("cancelled");
    expect(s.doseCheck?.comparison?.outcome).toBe("conflict");
    expect(run([dose({ kind: "send", revision: 1 })], s)).toBe(s);
  });

  it("repeated Send is one logical request", async () => {
    const submitting = run([dose({ kind: "send", revision: 1 })], toReview());
    expect(run([dose({ kind: "send", revision: 1 })], submitting)).toBe(submitting);
    const service = new SimulatedDoseCallbackService(0);
    const payload = buildCallbackPayload(submitting.doseCheck!.callback!.draft, requestIdOf(submitting));
    const [a, b] = await Promise.all([service.submit(payload), service.submit(payload)]);
    const c = await service.submit(payload);
    expect(a).toEqual(b);
    expect(c).toEqual(a);
    expect(service.deliveredCount).toBe(1);
  });

  it("failure keeps everything; retry resends the same request without repeating the journey", async () => {
    const submitting = run([dose({ kind: "send", revision: 1 })], toReview());
    const failed = run([dose({ kind: "result", requestId: requestIdOf(submitting), outcome: "failed" })], submitting);
    expect(failed.state).toBe("explain");
    expect(failed.matchStatus).toBe("confirmed");
    expect(failed.doseCheck?.labelText).toBe(OLD_LABEL);
    expect(failed.doseCheck?.callback?.draft).toEqual(submitting.doseCheck?.callback?.draft);
    expect(line(failed)).toBe(
      "Demo: request not submitted. The request could not be delivered. No one has been notified. Your summary is still available.",
    );

    const retry = run([dose({ kind: "send", revision: 1 })], failed);
    expect(retry.doseCheck?.callback?.status).toBe("submitting");
    expect(requestIdOf(retry)).toBe(requestIdOf(submitting));

    // The simulated adapter: fails once, then the same request ID succeeds.
    const service = new SimulatedDoseCallbackService(0);
    const payload = buildCallbackPayload(retry.doseCheck!.callback!.draft, requestIdOf(retry));
    expect(await service.submit(payload, { outcome: "fail-once" })).toEqual({ status: "failed" });
    expect((await service.submit(payload, { outcome: "fail-once" })).status).toBe("submitted");
  });

  it("success stays simulated and the medication question stays unresolved", () => {
    const submitting = run([dose({ kind: "send", revision: 1 })], toReview());
    const done = run([dose({ kind: "result", requestId: requestIdOf(submitting), outcome: "submitted", reference: "SIM-0001" })], submitting);
    expect(done.doseCheck?.callback?.status).toBe("submitted");
    const said = line(done)!;
    expect(said).toBe("Demo: callback request submitted. The difference in your medication instructions still needs checking.");
    expect(said).not.toMatch(/sorted|will call|is safe|follow the new/i);
    // No second send of the same request, and no relabelling it as resolved.
    expect(run([dose({ kind: "send", revision: 1 })], done)).toBe(done);
    expect(run([dose({ kind: "review-details" })], done)).toBe(done);
    expect(done.audit.at(-1)?.eventType).toBe("callback-submitted");
  });

  it("ending the call drops a late result", () => {
    const submitting = run([dose({ kind: "send", revision: 1 })], toReview());
    const ended = run([{ type: "END_CALL" }], submitting);
    expect(ended.doseCheck).toBeNull();
    expect(reduceSession(ended, dose({ kind: "result", requestId: requestIdOf(submitting), outcome: "submitted" }), CTX)).toBe(ended);
    // The next call has its own session ID, so the old call's answer can never match it.
    expect(callbackRequestId(run([startCall], ended).sessionId, 1)).not.toBe(requestIdOf(submitting));
  });

  it("audit events carry versions, never the label wording", () => {
    const s = toReview();
    expect(JSON.stringify(s.audit)).not.toContain(OLD_LABEL);
    const compared = s.audit.find((e) => e.eventType === "comparison-completed");
    expect(compared?.details).toMatchObject({ outcome: "conflict", labelRevision: 1, recordVersion: "brightcare-metformin-v1" });
  });
});

describe("honest outcomes and interruptions (site-contract §17, §20)", () => {
  const submit = () => run([dose({ kind: "send", revision: 1 })], toReview());

  it("an unknown outcome claims neither delivery nor non-delivery; retry reuses the same request", () => {
    const s = submit();
    const unknown = run([dose({ kind: "result", requestId: requestIdOf(s), outcome: "unknown" })], s);
    expect(unknown.doseCheck?.callback?.status).toBe("unknown");
    const said = line(unknown)!;
    expect(said).toContain("could not be confirmed");
    expect(said).not.toMatch(/no one has been notified|was submitted|could not be delivered/i);
    expect(unknown.audit.at(-1)?.eventType).toBe("callback-outcome-unknown");
    // It may already have gone: no editing it into a new request, no "Don't send", no label change.
    expect(run([dose({ kind: "edit" })], unknown)).toBe(unknown);
    expect(run([dose({ kind: "dont-send" })], unknown)).toBe(unknown);
    expect(run([dose({ kind: "review-details" })], unknown)).toBe(unknown);
    const retry = run([dose({ kind: "send", revision: 1 })], unknown);
    expect(retry.doseCheck?.callback?.status).toBe("submitting");
    expect(requestIdOf(retry)).toBe(requestIdOf(s));
  });

  it("simulated 'unknown' was in fact delivered: the retry finds it, nothing is sent twice", async () => {
    const s = submit();
    const service = new SimulatedDoseCallbackService(0);
    const payload = buildCallbackPayload(s.doseCheck!.callback!.draft, requestIdOf(s));
    expect(await service.submit(payload, { outcome: "unknown-once" })).toEqual({ status: "unknown" });
    expect(await service.submit(payload, { outcome: "unknown-once" })).toEqual({ status: "submitted", reference: "SIM-0001" });
    expect(service.deliveredCount).toBe(1);
  });

  it("the same request ID with different content is refused", async () => {
    const s = submit();
    const service = new SimulatedDoseCallbackService(0);
    const payload = buildCallbackPayload(s.doseCheck!.callback!.draft, requestIdOf(s));
    await service.submit(payload);
    expect(await service.submit({ ...payload, callbackContact: "0000 0199" })).toEqual({ status: "failed" });
  });

  it("getting help while a request is sending doesn't leave it stuck", () => {
    const s = submit();
    const away = run([{ type: "GET_HELP" }], s);
    expect(away.state).toBe("safety");
    const answered = run([dose({ kind: "result", requestId: requestIdOf(s), outcome: "submitted", reference: "SIM-0001" })], away);
    expect(answered.doseCheck?.callback?.status).toBe("submitted");
    const back = run([{ type: "RETURN_TO_CALL" }], answered);
    expect(back.state).toBe("explain");
    expect(back.doseCheck?.callback?.status).toBe("submitted");
  });

  it("study mode's wrong explanation never reaches the dose check", () => {
    const study = run([{ type: "SET_STUDY_CONDITION", condition: "wrong-explanation" }]);
    const atLabel = confirm(toDoseConfirm(null, study));
    expect(atLabel.studyCondition).toBe("wrong-explanation");
    // The real record matches this label; the study's wrong instruction would not.
    expect(labelAs(RECORD, atLabel).doseCheck?.comparison).toMatchObject({ outcome: "match" });
    const review = run([dose({ kind: "offer-callback" }), dose({ kind: "accept-offer" })], labelAs(OLD_LABEL, atLabel));
    expect(review.doseCheck?.callback?.draft.currentRecord?.instructionText).toBe("Take 1 tablet twice daily with meals.");
  });
});

describe("callback reasons, return to call and audit events (content-model §13, §21)", () => {
  const offerAndAccept = (s: Session) => run([dose({ kind: "offer-callback" }), dose({ kind: "accept-offer" })], s);

  it("an incomplete comparison can still go to a pharmacist, with that reason and no label", () => {
    const s = offerAndAccept(run([dose({ kind: "cannot-confirm" })], toLabelStep("conflict-sent")));
    expect(s.doseCheck?.callback?.draft).toMatchObject({
      reason: "comparison-incomplete",
      confirmedLabel: null,
      concernSummary: expect.stringContaining("couldn’t complete a check"),
    });
    expect(s.doseCheck?.callback?.draft.currentRecord).not.toBeNull();
  });

  it("record unavailable: the summary says so and invents no record facts", () => {
    const s = offerAndAccept(toLabelStep("record-unavailable"));
    expect(s.doseCheck?.callback?.draft).toMatchObject({ reason: "record-unavailable", currentRecord: null, confirmedLabel: null });
    expect(JSON.stringify(s.doseCheck?.callback?.draft)).not.toContain("tablet");
  });

  it("a match offers no callback", () => {
    const s = confirmShown(toLabelStep("label-matches"));
    expect(run([dose({ kind: "offer-callback" })], s)).toBe(s);
  });

  it("a correction that changes the reason sets the summary aside", () => {
    // Incomplete → the person types a wording that conflicts: the "incomplete" summary no longer fits.
    const incomplete = offerAndAccept(run([dose({ kind: "cannot-confirm" })], toLabelStep()));
    expect(incomplete.doseCheck?.callback?.draft.reason).toBe("comparison-incomplete");
    const corrected = labelAs(OLD_LABEL, run([dose({ kind: "dont-send" }), dose({ kind: "review-details" })], incomplete));
    expect(corrected.doseCheck?.comparison?.outcome).toBe("conflict");
    expect(corrected.doseCheck?.callback).toBeNull();
  });

  it("Return to call says the question is still unresolved and never logs it as resolved", () => {
    const s = run([dose({ kind: "return-to-call" })], toConflict());
    expect(s.state).toBe("listening");
    expect(s.doseCheck).toBeNull();
    expect(translate("en", s.assistantKey)).toContain("still unresolved");
    expect(s.audit.at(-1)?.eventType).toBe("dose-check-left-unresolved");
    expect(JSON.stringify(s.audit)).not.toMatch(/(?<!un)resolved/); // only ever "unresolved"
    // Not while a request is out.
    const sending = run([dose({ kind: "send", revision: 1 })], toReview());
    expect(run([dose({ kind: "return-to-call" })], sending)).toBe(sending);
  });

  it("logs each step under its content-model name; approved is not submitted", () => {
    const sending = run([dose({ kind: "send", revision: 1 })], toReview());
    const types = sending.audit.map((e) => e.eventType);
    expect(types).toEqual(expect.arrayContaining(["label-confirmed", "comparison-completed", "callback-draft-created", "callback-approved"]));
    expect(types).not.toContain("callback-submitted");
    const failed = run([dose({ kind: "result", requestId: requestIdOf(sending), outcome: "failed" })], sending);
    const retried = run([dose({ kind: "send", revision: 1 })], failed);
    expect(retried.audit.slice(-2).map((e) => e.eventType)).toEqual(["callback-approved", "callback-retried"]);
    expect(retried.audit.at(-1)?.details).toMatchObject({ draftRevision: 1, simulated: true });
    // Never the number, the wording or the payload.
    const json = JSON.stringify(retried.audit);
    expect(json).not.toContain("0000 0188");
    expect(json).not.toContain(OLD_LABEL);
  });

  it("corrections and interruptions are logged", () => {
    const corrected = run([dose({ kind: "review-details" }), dose({ kind: "enter-label", text: RECORD })], toConflict());
    expect(corrected.audit.at(-1)).toMatchObject({ eventType: "label-corrected", details: { labelRevision: 2 } });
    const paused = run([{ type: "GET_HELP" }], toConflict());
    expect(paused.audit.map((e) => e.eventType)).toContain("support-interruption");
  });
});

describe("audit fixes (10 October 2026)", () => {
  const record = parseInstruction(RECORD);
  const ictx = (s: Session) => ({
    state: s.state,
    contextualActions: s.contextualActions,
    candidateId: s.candidate?.candidateId ?? null,
    explainStep: s.explainStep,
    cameraLive: false,
    helpStage: s.helpFlow?.stage ?? null,
    showMethod: s.showMethod,
    doseCheck: s.doseCheck,
    pendingSpokenMedicineName: null,
  });

  it("keeps decimals: 1.0 matches, 1.5 and .5 keep their real value", () => {
    expect(parseInstruction("Take 1.5 tablets twice daily with meals").amount).toBe(1.5);
    expect(parseInstruction("Take .5 tablet twice daily with meals").amount).toBe(0.5);
    expect(compareInstructions(record, parseInstruction("Take 1.0 tablet twice daily with meals."))).toEqual({ outcome: "match" });
  });

  it("negation, steps, extra doses, strengths and conditions are never a match (or a conflict)", () => {
    for (const label of [
      "Do not take 1 tablet twice daily with meals",
      "Take 1 tablet twice daily with meals for 3 days, then 2 tablets twice daily",
      "Take 1 tablet (1000 mg) twice daily with meals",
      "Take one tablet twice daily with meals. Take 1 extra tablet at bedtime",
      "Take 1 tablet twice daily with meals or as directed",
      "Take 2 tablets once daily, not twice daily, with meals",
      "随餐每日服用一片，每日两次，不要与酒同服",
    ]) {
      expect(compareInstructions(record, parseInstruction(label)).outcome, label).toBe("insufficient");
    }
  });

  it("a difference and a gap are both kept", () => {
    expect(compareInstructions(record, parseInstruction("Take 2 tablets twice daily"))).toEqual({
      outcome: "conflict",
      differing: ["amount"],
      missing: ["timing"],
    });
  });

  it("a question never confirms the medicine or consents to telling family", () => {
    const confirmStep = toDoseConfirm();
    for (const q of ["Is that right?", "is it ok?", "对吗？", "这个可以吗？"]) {
      expect(interpretUtterance(q, ictx(confirmStep)), q).not.toMatchObject({ event: { decision: "confirmed" } });
    }
    const consent = {
      ...confirmStep,
      state: "safety" as const,
      helpFlow: { kind: "family" as const, stage: "confirm" as const, reason: "help-requested" as const },
    };
    for (const q of ["Is that okay?", "Will it be ok?", "可以吗？"]) {
      expect(interpretUtterance(q, ictx(consent)), q).not.toMatchObject({ event: { granted: true } });
    }
    expect(interpretUtterance("yes", ictx(confirmStep))).toMatchObject({ event: { decision: "confirmed" } });
    expect(interpretUtterance("是的，这是我的药", ictx(confirmStep))).toMatchObject({ event: { decision: "confirmed" } });
  });

  it("on the label step, new wording that starts with 'OK' is a new reading, not a yes to the old one", () => {
    const shown = run([dose({ kind: "enter-label", text: "Take 7 tablet twice daily with meals" })], toLabelStep());
    for (const said of ["OK one tablet twice daily", "right, one tablet", "每日两次，每次一片，可以随餐服用", "不要与酒同服"]) {
      expect(interpretUtterance(said, ictx(shown)), said).toEqual({ kind: "message", text: said });
    }
    expect(interpretUtterance("Yes, that's it", ictx(shown))).toMatchObject({
      event: { action: { kind: "confirm-label" } },
    });
  });

  it("reading the box aloud is a reading, not a medical question; questions about herself still escalate", () => {
    const step = toLabelStep();
    const read = run([{ type: "USER_MESSAGE", text: "Take half a tablet twice daily with meals. Avoid alcohol" }], step);
    expect(read.state).toBe("explain");
    expect(read.doseCheck?.reading).toBe("Take half a tablet twice daily with meals. Avoid alcohol");
    expect(run([{ type: "USER_MESSAGE", text: "I took 2 tablets by mistake" }], step).state).toBe("safety");
    expect(run([{ type: "USER_MESSAGE", text: "Should I skip tonight's dose?" }], step).state).toBe("safety");
    expect(run([{ type: "USER_MESSAGE", text: "Take 1 tablet, I have chest pain" }], step).safetyReason).toBe("urgent-risk");
  });

  it("two callback requests in one call have different request IDs, and both go through", async () => {
    const service = new SimulatedDoseCallbackService(0);
    const submit = async (s: Session) => {
      const sending = run([dose({ kind: "send", revision: s.doseCheck!.callback!.revision })], s);
      const id = requestIdOf(sending);
      const r = await service.submit(buildCallbackPayload(sending.doseCheck!.callback!.draft, id));
      const reference = r.status === "submitted" ? r.reference : undefined;
      return { id, r, after: run([dose({ kind: "result", requestId: id, outcome: r.status, reference })], sending) };
    };
    const first = await submit(toReview());
    const back = run(
      [dose({ kind: "return-to-call" }), { type: "USER_MESSAGE", text: "My doctor changed it again, the label says the old dose" }],
      first.after,
    );
    const secondReview = run(
      [dose({ kind: "offer-callback" }), dose({ kind: "accept-offer" })],
      labelAs("Take 3 tablets twice daily with meals", back),
    );
    const second = await submit(secondReview);
    expect(second.id).not.toBe(first.id);
    expect([first.r.status, second.r.status]).toEqual(["submitted", "submitted"]);
  });

  it("after a failure, a new summary is a new request, not a refused duplicate", async () => {
    const service = new SimulatedDoseCallbackService(0);
    const sending = run([dose({ kind: "send", revision: 1 })], toReview());
    const failedId = requestIdOf(sending);
    await service.submit(buildCallbackPayload(sending.doseCheck!.callback!.draft, failedId), { outcome: "fail-once" });
    const failed = run([dose({ kind: "result", requestId: failedId, outcome: "failed" })], sending);
    const redo = run(
      [dose({ kind: "dont-send" }), dose({ kind: "review-details" }), dose({ kind: "enter-label", text: `${OLD_LABEL}.` })],
      failed,
    );
    const review = run([dose({ kind: "offer-callback" }), dose({ kind: "accept-offer" })], confirmShown(redo));
    const id = requestIdOf(review);
    expect(id).not.toBe(failedId);
    expect((await service.submit(buildCallbackPayload(review.doseCheck!.callback!.draft, id))).status).toBe("submitted");
  });

  it("returning to the call says only what is true for the outcome", () => {
    expect(run([dose({ kind: "return-to-call" })], labelAs(RECORD, toLabelStep())).assistantKey).toBe("doseBackToCallMatch");
    expect(run([dose({ kind: "return-to-call" })], toConflict()).assistantKey).toBe("doseBackToCall");
    expect(run([dose({ kind: "cannot-confirm" }), dose({ kind: "return-to-call" })], toLabelStep()).assistantKey).toBe(
      "doseBackToCallIncomplete",
    );
  });

  it("caregiver view: a conflict left open shows 'unresolved', not 'identity confirmed'", () => {
    expect(deriveRecordStatus(buildTimeline(run([{ type: "END_CALL" }], toConflict()).audit))).toBe("Unresolved");
    expect(deriveRecordStatus(buildTimeline(labelAs(RECORD, toLabelStep()).audit))).toBe("Confirmed");
  });

  it("an urgent interruption keeps a family request that is already sending, and its outcome still lands", () => {
    const sending = run([
      startCall,
      { type: "USER_MESSAGE", text: "I feel lonely and sad today" },
      { type: "SELECT_ROUTE", route: "ask-family" },
      { type: "HELP_CONFIRM", granted: true },
      { type: "HELP_SEND" },
    ]);
    expect(sending.helpFlow?.stage).toBe("sending");
    const urgent = run([{ type: "USER_MESSAGE", text: "I have chest pain" }], sending);
    expect(urgent.safetyReason).toBe("urgent-risk");
    expect(urgent.helpFlow).toBe(sending.helpFlow); // same object: the request in flight isn't cancelled
    const sent = run([{ type: "HELP_RESULT", ok: true, contactName: "Daniel" }], urgent);
    expect(sent.helpFlow?.stage).toBe("sent");
    expect(sent.safetyReason).toBe("urgent-risk"); // urgent guidance stays
  });

  it("a dose check still at 'which medicine?' ends when she returns from help", () => {
    const asked = run([startCall, { type: "USER_MESSAGE", text: "my doctor changed my dose" }]);
    expect(asked.doseCheck?.step).toBe("identify");
    expect(run([{ type: "GET_HELP" }, { type: "RETURN_TO_CALL" }], asked).doseCheck).toBeNull();
  });

  it("a reported dose change opens the comparison in Chinese too; a question alongside it still escalates", () => {
    for (const said of ["医生给我减量了，但是药盒上还是旧的", "医生给我换药了", "My doctor told me to take less", "The pharmacist changed my dose"]) {
      expect(routeMessage(said, { matchConfirmed: false }).intent, said).toBe("dose-change");
    }
    expect(routeMessage("My doctor reduced my dose, should I stop taking it?", { matchConfirmed: false }).intent).toBe(
      "unsupported-medical-question",
    );
  });
});
