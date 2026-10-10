import {
  extractSpokenMedicineNameOnly,
  extractSpokenStrength,
  parseSpokenLabel,
} from "@/lib/label/spoken-label";
import { parseTypedLabel } from "@/lib/label/typed-label";
import { classifySafety } from "@/lib/safety/classify";
import { isDoseChange, isRecordConflict } from "@/lib/session/intent";
import type { DoseCheck, SessionEvent } from "@/lib/session/state-machine";
import type { CompanionState, ContextualActionId } from "@/types/content";

/**
 * Deterministic interpretation of a SPOKEN utterance for hands-free calls.
 * No model is involved. It only ever produces the same events the buttons
 * produce, so every reducer guard still applies. Anything ambiguous returns
 * `unclear` (the companion asks again) — it never guesses a gate decision.
 */
export type VoiceIntent =
  | { kind: "event"; event: SessionEvent }
  | { kind: "ui"; action: "capture" }
  | { kind: "message"; text: string }
  /** A medicine name was said with no strength yet — ask for the strength next. */
  | { kind: "need-strength"; medicineName: string }
  | { kind: "unclear" };

export type CommandContext = {
  state: CompanionState;
  contextualActions: readonly ContextualActionId[];
  candidateId: string | null;
  explainStep: 0 | 1 | 2;
  cameraLive: boolean;
  /** The companion just asked "did you mean <medicine>?" — "yes" answers that, not an offered button. */
  nameCheckPending?: boolean;
  /** The companion just answered "my doctor said…" and asked: pharmacist, or carry on? */
  recordConflict?: boolean;
  /** On the camera-permission step: choosing camera or photo, or the consent question. */
  showMethod?: "choose" | "camera";
  /** Stage of a help request on screen (confirm, sent, failed…), if any. */
  helpStage?: "confirm" | "sending" | "sent" | "failed" | "info" | null;
  /** The dose-change check, when one is running (Assignment 4). */
  doseCheck?: DoseCheck | null;
  /** Set once a spoken name has been heard and we're waiting on its strength. */
  pendingSpokenMedicineName: string | null;
};

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const wordCount = (n: string) => (n === "" ? 0 : n.split(" ").length);

// --- vocabulary (English + Simplified Chinese) -------------------------------
const HEDGE = /\b(not sure|unsure|don't know|do not know|maybe|i guess|perhaps|hmm|can't tell|cannot tell)\b|不确定|不知道|不太确定|也许|可能/;
const NEGATIVE = /\b(no|nope|nah|not now|not really|wrong|incorrect|try again|that's not|it's not|isn't|not my|not the|later)\b|不是|不要|不对|不行|不好|没有|现在不|再试/;
const AFFIRM = /\b(yes|yeah|yep|yup|sure|ok|okay|please|correct|right|absolutely|of course|go ahead|alright|that's it|that is it|that's right|this is my medicine)\b|是的|没错|好的|可以|对|好|行/;

const END_CALL = /\b(end (the |this )?call|hang up|goodbye|bye( bye)?)\b|结束通话|挂断|再见/;
const GET_HELP = /\b(get help|i need help|talk to (a |the |my )?(person|human|pharmacist|doctor)|speak to (a |the |my )?(person|human|pharmacist|doctor))\b|寻求帮助|找药剂师|需要帮助/;
const REPEAT = /\b(repeat|say (that |it )?again|pardon|come again|one more time)\b|重复|再说一遍/;
const TO_CHINESE = /\b(chinese|mandarin)\b|中文|华语|普通话/;
const TO_ENGLISH = /\benglish\b|英文|英语/;

const TAKE_PHOTO = /\b(take (a |the )?(photo|picture|pic)|capture|snap( it)?|scan( it)?)\b|拍照|拍下/;
const NEXT = /\b(next|continue|go on|keep going|carry on|go ahead)\b|下一步|继续/;
const BACK = /\b(back|previous|go back)\b|上一步|返回/;
const UNDERSTOOD = /\b(i understand|understood|got it|thank(s| you)|that's all|makes sense|all clear)\b|明白|谢谢|懂了/;
const TRY_AGAIN = /\b((try|another|new).*(photo|picture|again|label)|again)\b|再拍|再试/;
const BACK_TO_CALL = /\b(back to (the )?(conversation|call)|carry on|continue (the )?(call|conversation)|talk (to you )?more)\b|回到对话/;
const DIFFERENT = /\b(different|differs|doesn't match|does not match|don't match)\b|不一样|不同|不符/;
const MATCHES = /\b(it matches|matches|same|the same)\b|一样|相同/;
const PHARMACIST =/\b(pharmacist|pharmacy|check with)\b|药剂师|药房/;
const ANOTHER_MEDICINE = /\b(another|other|new|different|next)( medicine| one)?\b|另一种|另一个/;

/** A bare yes/no is only trusted in a short utterance ("ok what is this for" is a question). */
const isShort = (n: string) => wordCount(n) <= 5;
/** "What is this for please" is a question, not a yes — even though it contains "please". */
const QUESTION = /^(what|when|how|why|where|which|who|whose|is|are|can|could|do|does|should|will|would)\b|什么|怎么|为什么|吗|呢/;

export function interpretUtterance(text: string, ctx: CommandContext): VoiceIntent {
  const raw = text.trim();
  const n = normalise(raw);
  if (!n) return { kind: "unclear" };

  // 1. Safety always comes first, in every state. The reducer routes these to the safety screen.
  if (classifySafety(raw).level !== "none") return { kind: "message", text: raw };

  // 2. Global call controls.
  if (END_CALL.test(n)) return { kind: "event", event: { type: "END_CALL" } };
  if (GET_HELP.test(n)) return { kind: "event", event: { type: "GET_HELP" } };
  if (REPEAT.test(n)) return { kind: "event", event: { type: "REPEAT" } };
  if (TO_CHINESE.test(n)) return { kind: "event", event: { type: "SET_LANGUAGE", language: "zh-Hans" } };
  if (TO_ENGLISH.test(n)) return { kind: "event", event: { type: "SET_LANGUAGE", language: "en" } };

  // 3. The current screen's decision.
  const hedge = HEDGE.test(n);
  const negative = NEGATIVE.test(n);
  const affirm = AFFIRM.test(n);

  // A help request on screen. Consent/confirmation must be a clear, short yes.
  switch (ctx.helpStage) {
    case "confirm":
      if (negative || hedge) return { kind: "event", event: { type: "HELP_CONFIRM", granted: false } };
      if (affirm && isShort(n)) return { kind: "event", event: { type: "HELP_CONFIRM", granted: true } };
      return { kind: "unclear" };
    case "failed":
      if (TRY_AGAIN.test(n)) return { kind: "event", event: { type: "HELP_RETRY" } };
      if (/\b(number|phone)\b|电话|号码/.test(n)) return { kind: "event", event: { type: "HELP_SHOW_NUMBER" } };
      if (negative) return { kind: "event", event: { type: "HELP_DISMISS" } };
      return { kind: "unclear" };
    case "sent":
    case "info":
      if (NEXT.test(n) || BACK_TO_CALL.test(n) || negative || affirm) return { kind: "event", event: { type: "HELP_DISMISS" } };
      return { kind: "unclear" };
    case "sending":
      return { kind: "unclear" };
  }

  switch (ctx.state) {
    case "listening": {
      const offered = ctx.contextualActions;
      // Explicit requests ("I want to show the medicine", "my schedule") are routed by the
      // reducer itself, so typed and spoken input behave identically.
      // A bare "yes" answers a single offered question (unambiguous only when ONE action is offered).
      // Except after "Did you mean Metformin?": there "yes" answers the name
      // check and the label button is only an alternative, so the reducer decides.
      if (ctx.nameCheckPending) return { kind: "message", text: raw };
      const question = QUESTION.test(n) || raw.includes("?") || raw.includes("？");
      if (offered.length === 1 && offered[0] === "show-medicine" && affirm && !negative && !hedge && !question && isShort(n)) {
        return { kind: "event", event: { type: "SELECT_ROUTE", route: "show-medicine" } };
      }
      return { kind: "message", text: raw };
    }

    case "camera-permission":
      // First: camera or photo (H2). A photo needs a tap (the system picker can't
      // open from speech); the name and strength can simply be said.
      if (ctx.showMethod === "choose") {
        if (/\bcamera\b|相机|摄像头/.test(n)) return { kind: "event", event: { type: "CHOOSE_CAMERA" } };
        const said = parseSpokenLabel(raw);
        const parsed = said ? parseTypedLabel({ ...said, patientName: "" }) : null;
        if (parsed?.ok) return { kind: "event", event: { type: "SUBMIT_LABEL", input: parsed.input } };
        return { kind: "unclear" };
      }
      if (hedge) return { kind: "unclear" };
      if (negative && !affirm) return { kind: "event", event: { type: "CAMERA_CONSENT", granted: false } };
      if (affirm && !negative && isShort(n)) return { kind: "event", event: { type: "CAMERA_CONSENT", granted: true } };
      return { kind: "unclear" };

    case "camera-guidance": {
      if (TAKE_PHOTO.test(n) && ctx.cameraLive) return { kind: "ui", action: "capture" };
      // Saying the name and strength out loud ("It's Metformin, 500 milligrams")
      // is another way to fill the same typed-label form — for anyone who'd
      // rather not use the camera, or whose pronunciation speech recognition
      // might mishear. It goes through the identical validated typed input and
      // the same deterministic matcher; nothing here decides a match itself.
      const spoken = parseSpokenLabel(raw);
      if (spoken) {
        const parsed = parseTypedLabel({ ...spoken, patientName: "" });
        if (parsed.ok) return { kind: "event", event: { type: "SUBMIT_LABEL", input: parsed.input } };
      }

      // The name came in on an earlier turn ("It's Metformin") without a
      // strength — this turn only needs to supply that ("500 milligrams").
      // Re-ask (rather than falling to "unclear") for anything that isn't a
      // recognisable strength, so the two-turn exchange doesn't silently drop.
      if (ctx.pendingSpokenMedicineName) {
        const strength = extractSpokenStrength(raw);
        if (strength) {
          const parsed = parseTypedLabel({
            medicineName: ctx.pendingSpokenMedicineName,
            strength,
            patientName: "",
          });
          if (parsed.ok) return { kind: "event", event: { type: "SUBMIT_LABEL", input: parsed.input } };
        }
        return { kind: "need-strength", medicineName: ctx.pendingSpokenMedicineName };
      }

      // A bare medicine name with no strength yet: ask for the strength next,
      // same as a person reading the label off would naturally give both.
      if (!hedge && !negative && !(affirm && isShort(n))) {
        const name = extractSpokenMedicineNameOnly(raw);
        if (name) return { kind: "need-strength", medicineName: name };
      }

      return { kind: "unclear" };
    }

    case "confirm-match": {
      const id = ctx.candidateId;
      if (!id) return { kind: "unclear" };
      // Hedging beats everything: "yes, but I'm not sure" must NOT confirm a medicine.
      if (hedge) return { kind: "event", event: { type: "CONFIRM_MATCH", candidateId: id, decision: "unsure" } };
      if (negative && affirm) return { kind: "unclear" }; // contradictory
      if (negative) return { kind: "event", event: { type: "CONFIRM_MATCH", candidateId: id, decision: "denied" } };
      if (affirm && isShort(n)) return { kind: "event", event: { type: "CONFIRM_MATCH", candidateId: id, decision: "confirmed" } };
      return { kind: "unclear" };
    }

    case "explain": {
      // Dose check: only the plain decisions can be spoken. Sending a callback
      // request always needs a tap, because Send authorises exactly what is on screen.
      if (ctx.doseCheck) {
        const d = ctx.doseCheck;
        const question = QUESTION.test(n) || raw.includes("?") || raw.includes("？");
        const yes = affirm && !negative && !hedge && isShort(n) && !question;
        const no = (negative || hedge) && !affirm && isShort(n);
        if (d.callback && d.callback.status !== "cancelled") return { kind: "unclear" };
        if (d.offer) {
          if (no) return { kind: "event", event: { type: "DOSE", action: { kind: "decline-offer" } } };
          if (yes) return { kind: "event", event: { type: "DOSE", action: { kind: "accept-offer" } } };
          return { kind: "unclear" };
        }
        if (d.step === "label") {
          if (d.reading && no) return { kind: "event", event: { type: "DOSE", action: { kind: "reject-reading" } } };
          if (d.reading && yes) {
            return { kind: "event", event: { type: "DOSE", action: { kind: "confirm-label", revision: d.labelRevision } } };
          }
          // Anything longer is the person reading their box: shown back to confirm, never trusted as-is.
          return yes || no ? { kind: "unclear" } : { kind: "message", text: raw };
        }
        if (d.step === "compared" && d.comparison?.outcome === "conflict" && (PHARMACIST.test(n) || yes)) {
          return { kind: "event", event: { type: "DOSE", action: { kind: "offer-callback" } } };
        }
        return { kind: "unclear" };
      }
      // Answering "help checking with the pharmacist, or carry on?". A bare "yes"
      // doesn't say which, so it re-asks rather than guessing.
      if (ctx.recordConflict) {
        if (PHARMACIST.test(n)) return { kind: "event", event: { type: "RECORD_CONFLICT_CHOICE", choice: "pharmacist" } };
        if (NEXT.test(n)) return { kind: "event", event: { type: "RECORD_CONFLICT_CHOICE", choice: "carry-on" } };
        return { kind: "unclear" };
      }
      // "My doctor said…" goes to the reducer, which answers from the record.
      if (isRecordConflict(raw) || isDoseChange(raw)) return { kind: "message", text: raw };
      // Beside the instruction: "Does this match what's printed on your label?"
      if (ctx.explainStep === 1) {
        if (DIFFERENT.test(n) || (negative && !affirm && isShort(n))) {
          return { kind: "event", event: { type: "LABEL_CHECK", matches: false } };
        }
        if (MATCHES.test(n) || (affirm && !negative && !hedge && isShort(n))) {
          return { kind: "event", event: { type: "LABEL_CHECK", matches: true } };
        }
      }
      if (BACK.test(n) && ctx.explainStep > 0) return { kind: "event", event: { type: "EXPLAIN_STEP", direction: "back" } };
      if (ctx.explainStep === 2) {
        if (UNDERSTOOD.test(n) || (affirm && !negative && isShort(n))) return { kind: "event", event: { type: "UNDERSTOOD" } };
        return { kind: "unclear" };
      }
      if (NEXT.test(n) || UNDERSTOOD.test(n) || (affirm && !negative && isShort(n))) {
        return { kind: "event", event: { type: "EXPLAIN_STEP", direction: "next" } };
      }
      return { kind: "unclear" };
    }

    case "safety":
      if (TRY_AGAIN.test(n)) return { kind: "event", event: { type: "TRY_ANOTHER_LABEL" } };
      if (BACK_TO_CALL.test(n)) return { kind: "event", event: { type: "RETURN_TO_CALL" } };
      return { kind: "unclear" };

    case "complete":
      if (ANOTHER_MEDICINE.test(n) || (affirm && !negative && isShort(n))) {
        return { kind: "event", event: { type: "NEW_MEDICINE" } };
      }
      return { kind: "unclear" };

    default:
      return { kind: "unclear" };
  }
}
