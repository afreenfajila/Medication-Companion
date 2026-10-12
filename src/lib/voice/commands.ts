import {
  extractSpokenMedicineNameOnly,
  extractSpokenStrength,
  parseSpokenLabel,
} from "@/lib/label/spoken-label";
import type { CopyKey } from "@/lib/content/translations";
import { parseTypedLabel } from "@/lib/label/typed-label";
import { classifySafety } from "@/lib/safety/classify";
import { isDoseChange, isRecordConflict } from "@/lib/session/intent";
import { buildEscalation } from "@/lib/safety/escalation";
import type { DoseCheck, HelpKind, SessionEvent } from "@/lib/session/state-machine";
import type { CompanionState, ContextualActionId, SafetyReason } from "@/types/content";

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
  /** Answer with this fixed line (record facts filled in); nothing in the session changes. */
  | { kind: "reply"; key: CopyKey }
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
  helpStage?: "confirm" | "review" | "sending" | "sent" | "failed" | "info" | null;
  /** The dose-change check, when one is running (Assignment 4). */
  doseCheck?: DoseCheck | null;
  /** Set once a spoken name has been heard and we're waiting on its strength. */
  pendingSpokenMedicineName: string | null;
  /** On the safety screen: why, and whether another label try is still open (decides which help options exist). */
  safetyReason?: SafetyReason | null;
  labelRouteSelected?: boolean;
  canRetryLabel?: boolean;
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
// "don't" matters most: "please don't" contains "please", which alone reads as a yes.
const NEGATIVE = /\b(no|nope|nah|don't|dont|do not|cancel|not now|not really|wrong|incorrect|try again|that's not|it's not|isn't|not my|not the|later)\b|不是|不要|不对|不行|不好|没有|现在不|再试/;
const AFFIRM = /\b(yes|yeah|yep|yup|sure|ok|okay|please|correct|right|absolutely|of course|go ahead|alright|that's it|that is it|that's right|this is my medicine)\b|是的|没错|好的|可以|对|好|行/;

const END_CALL = /\b(end (the |this )?call|hang up|goodbye|bye( bye)?)\b|结束通话|挂断|再见/;
const GET_HELP = /\b(get help|i need help|talk to (a |the |my )?(person|human|pharmacist|doctor)|speak to (a |the |my )?(person|human|pharmacist|doctor))\b|寻求帮助|找药剂师|需要帮助/;
const REPEAT = /\b(repeat|say (that |it )?again|pardon|come again|one more time)\b|重复|再说一遍/;
const TO_CHINESE = /\b(chinese|mandarin)\b|中文|华语|普通话/;
const TO_ENGLISH = /\benglish\b|英文|英语/;

const TAKE_PHOTO = /\b(take (a |the )?(photo|picture|pic)|capture|snap( it)?|scan( it)?)\b|拍照|拍下/;
/** Wanting a photo they already have ("choose a photo", "upload", "from my gallery") — not taking one now. */
const PHOTO_INSTEAD = /\b(photos?|pictures?|pics?|images?|gallery|upload|album|camera roll|from my phone)\b|照片|相册|图片|上传/;
const NEXT = /\b(next|continue|go on|keep going|carry on|go ahead|tell me more|what else|read on|keep reading)\b|下一步|继续|接着说/;
const BACK = /\b(back|previous|go back)\b|上一步|返回/;
const UNDERSTOOD =
  /\b(i understand|understood|got it|thank(s| you)|that's all|makes sense|all clear|all good|i'?m (done|fine|good)|nothing else|no need)\b|明白|谢谢|懂了|不用了|没有了/;
/** Asking for a pharmacist, or for someone to get in touch. */
const PHARMACIST_REQUEST =
  /\b(pharmacist|pharmacy|chemist|contact (them|someone|a person)|call me( back)?|ring me|call ?back)\b|药剂师|药房|联系|回电/;
const TRY_AGAIN = /\b((try|another|new).*(photo|picture|again|label)|again)\b|再拍|再试/;
const BACK_TO_CALL = /\b(back to (the )?(conversation|call)|carry on|continue (the )?(call|conversation)|talk (to you )?more)\b|回到对话/;
const DIFFERENT = /\b(different|differs|doesn't match|does not match|don't match)\b|不一样|不同|不符/;
const MATCHES = /\b(it matches|matches|same|the same)\b|一样|相同/;
const PHARMACIST =/\b(pharmacist|pharmacy|check with)\b|药剂师|药房/;
const ANOTHER_MEDICINE = /\b(another|other|new|different|next)( medicine| one)?\b|另一种|另一个/;
// The safety screen's own help options, by name.
const CLINIC = /\b(clinic|doctor|gp)\b|诊所|医生/;
const FAMILY = /\b(family|son|daughter|daniel)\b|家人|儿子|女儿/;
const HELPER = /\b(helper|neighbou?r|mrs\.? lim|someone i trust)\b|邻居|信任的人/;
// Sending the reviewed callback summary, said outright.
const SEND = /\b(send|submit)( it| the request| this| that)?\b|发送|提交/;
// Holding back: any of these means do NOT send ("don't send it", "wait", "取消").
const HOLD = /\b(don't|dont|do not|never|cancel|stop|wait|hold on)\b|不要|别|取消|先不|等一下/;

/**
 * An explicit instruction to send what was just reviewed: "send", "send it", "yes, send it",
 * "please submit the request", "发送". Short, not a question, no hedge or negative — so a
 * misheard sentence that happens to contain "send" doesn't count.
 */
function isSendCommand(n: string, raw: string): boolean {
  if (!SEND.test(n) || HOLD.test(n) || NEGATIVE.test(n) || HEDGE.test(n)) return false;
  if (QUESTION.test(n) || raw.includes("?") || raw.includes("？")) return false;
  return n.split(/\s+/).filter(Boolean).length <= 6 || n.length <= 8;
}

const CJK_CHARS = /[一-鿿]/g;
/**
 * A bare yes/no is only trusted in a short utterance ("ok what is this for" is a question).
 * Chinese has no spaces, so it is measured in characters ("对，标签上就是这样写的" is short; a long reading is not).
 */
const isShort = (n: string) => {
  const cjk = n.match(CJK_CHARS)?.length ?? 0;
  return cjk > 0 ? cjk <= 10 && wordCount(n.replace(CJK_CHARS, "").trim()) <= 2 : wordCount(n) <= 5;
};
/**
 * A gate's "yes" may be a natural sentence ("yes please ask them to call me back"),
 * but never a question, a hedge or a contradiction — those are checked separately.
 */
const isSentence = (n: string) => {
  const cjk = n.match(CJK_CHARS)?.length ?? 0;
  return cjk > 0 ? cjk <= 16 && wordCount(n.replace(CJK_CHARS, "").trim()) <= 3 : wordCount(n) <= 10;
};
/** "What is this for please" is a question, not a yes — even though it contains "please". */
const QUESTION = /^(what|when|how|why|where|which|who|whose|is|are|can|could|do|does|should|will|would)\b|什么|怎么|为什么|吗|呢/;
/**
 * Asking what dose to take ("what should the next dosage be?", "how many should I take?").
 * Answered with the fixed boundary line and the record's own instruction — never a dose.
 * Tied to a dose word or "should I take", so "how much does it cost" is not caught.
 */
const DOSE_QUESTION =
  /\b(dose|doses|dosage|dosing)\b|\bhow (many|much)\b.*\b(take|tablets?|pills?|mg|milligrams?)\b|\bshould i (take|have)\b|剂量|用量|吃几|吃多少|服用多少|该吃多少/;

/** A question, as opposed to a command or an answer (used to choose honest wording). */
export function isQuestion(text: string): boolean {
  const raw = text.trim();
  return QUESTION.test(normalise(raw)) || raw.includes("?") || raw.includes("？");
}
/** Words that only appear when someone is reading an instruction, not answering yes or no. */
const INSTRUCTION_WORDS =
  /\d|\b(take|tablets?|tabs?|capsules?|pills?|one|two|three|four|half|once|twice|daily|day|times?|meals?|food|morning|night|bedtime|mg)\b|片|粒|次|服|餐|饭|睡前|早上|每日|每天/;

export function interpretUtterance(text: string, ctx: CommandContext): VoiceIntent {
  const raw = text.trim();
  const n = normalise(raw);
  if (!n) return { kind: "unclear" };

  // 1. Safety always comes first, in every state. The reducer routes these to the safety screen.
  if (classifySafety(raw).level !== "none") return { kind: "message", text: raw };

  // 2. Global call controls.
  if (END_CALL.test(n)) return { kind: "event", event: { type: "END_CALL" } };
  // On the help screen itself, "talk to a pharmacist" picks that option (below), not "Get help" again.
  if (GET_HELP.test(n) && ctx.state !== "safety") return { kind: "event", event: { type: "GET_HELP" } };
  if (REPEAT.test(n)) return { kind: "event", event: { type: "REPEAT" } };
  if (TO_CHINESE.test(n)) return { kind: "event", event: { type: "SET_LANGUAGE", language: "zh-Hans" } };
  if (TO_ENGLISH.test(n)) return { kind: "event", event: { type: "SET_LANGUAGE", language: "en" } };

  // 3. The current screen's decision.
  const hedge = HEDGE.test(n);
  const negative = NEGATIVE.test(n);
  // "Is that right?" / "对吗？" asks; it never confirms or consents to anything.
  const asked = QUESTION.test(n) || raw.includes("?") || raw.includes("？");
  const affirm = AFFIRM.test(n) && !asked;

  // A help request on screen. Consent/confirmation must be a clear, short yes.
  switch (ctx.helpStage) {
    case "review":
      // Checked, then sent only on an explicit, short "send" (said or typed) — never a plain yes,
      // a question, a hedge, a negative or the AI. "Don't send" cancels with nothing sent.
      if (negative || hedge || HOLD.test(n)) return { kind: "event", event: { type: "HELP_CONFIRM", granted: false } };
      if (isSendCommand(n, raw)) return { kind: "event", event: { type: "HELP_SEND" } };
      if (affirm) return { kind: "reply", key: "helpSayToSend" };
      return { kind: "unclear" };
    case "confirm":
      if (negative || hedge) return { kind: "event", event: { type: "HELP_CONFIRM", granted: false } };
      if (affirm && isSentence(n)) return { kind: "event", event: { type: "HELP_CONFIRM", granted: true } };
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
        // The phone's photo picker only opens from a tap, so say where to tap.
        if (PHOTO_INSTEAD.test(n) && !TAKE_PHOTO.test(n)) return { kind: "reply", key: "photoNeedsTap" };
        if (/\bcamera\b|相机|摄像头/.test(n)) return { kind: "event", event: { type: "CHOOSE_CAMERA" } };
        const said = parseSpokenLabel(raw);
        const parsed = said ? parseTypedLabel({ ...said, patientName: "" }) : null;
        if (parsed?.ok) return { kind: "event", event: { type: "SUBMIT_LABEL", input: parsed.input } };
        return { kind: "unclear" };
      }
      // "I'd rather choose a photo": not the camera. Declining opens the photo, medicine-list and typing choices.
      if (PHOTO_INSTEAD.test(n) && !TAKE_PHOTO.test(n)) return { kind: "event", event: { type: "CAMERA_CONSENT", granted: false } };
      if (hedge) return { kind: "unclear" };
      if (negative && !affirm) return { kind: "event", event: { type: "CAMERA_CONSENT", granted: false } };
      if (affirm && !negative && isSentence(n)) return { kind: "event", event: { type: "CAMERA_CONSENT", granted: true } };
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
      if (affirm && isSentence(n)) return { kind: "event", event: { type: "CONFIRM_MATCH", candidateId: id, decision: "confirmed" } };
      return { kind: "unclear" };
    }

    case "explain": {
      // Dose check: only the plain decisions can be spoken. Sending a callback
      // request always needs a tap, because Send authorises exactly what is on screen
      // (enforced below: no spoken phrase ever maps to `send`).
      if (ctx.doseCheck) {
        const d = ctx.doseCheck;
        const question = QUESTION.test(n) || raw.includes("?") || raw.includes("？");
        const yes = affirm && !negative && !hedge && isShort(n) && !question;
        const no = (negative || hedge) && !affirm && isShort(n);
        const cb = d.callback;
        if (cb && cb.status !== "cancelled") {
          // "Don't send" cancels in words. Sending is an explicit, short "send" (said or typed)
          // for exactly the revision on screen — never a plain yes, a question, a hedge or the AI.
          const open = cb.status === "reviewing" || cb.status === "failed" || cb.status === "unknown";
          const hold = negative || HOLD.test(n);
          if (open && hold && SEND.test(n) && cb.status !== "unknown") {
            return { kind: "event", event: { type: "DOSE", action: { kind: "dont-send" } } };
          }
          // "Try again" / "send again" after a failure re-sends the same reviewed request.
          const retry = (cb.status === "failed" || cb.status === "unknown") && TRY_AGAIN.test(n) && !HOLD.test(n) && !question;
          if (open && (isSendCommand(n, raw) || retry)) {
            return { kind: "event", event: { type: "DOSE", action: { kind: "send", revision: cb.revision } } };
          }
          if (cb.status === "reviewing" && yes) return { kind: "reply", key: "helpSayToSend" };
          return { kind: "unclear" };
        }
        if (d.offer) {
          if (no) return { kind: "event", event: { type: "DOSE", action: { kind: "decline-offer" } } };
          if (affirm && !negative && !hedge && !question && isSentence(n)) {
            return { kind: "event", event: { type: "DOSE", action: { kind: "accept-offer" } } };
          }
          return { kind: "unclear" };
        }
        if (d.step === "label") {
          // "OK, one tablet twice daily" is new wording, not a yes to the reading on screen.
          if (INSTRUCTION_WORDS.test(n)) return { kind: "message", text: raw };
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
      // "What should my dose be?" is answered, not ignored — and before "next" is looked
      // for, so "what should the next dosage be" never just skips ahead.
      if (DOSE_QUESTION.test(n)) return { kind: "reply", key: "explainDoseQuestion" };
      // "Can a pharmacist call me?" at any step: the pharmacist step, which asks before anything is sent.
      if (PHARMACIST_REQUEST.test(n) && !negative) {
        return { kind: "event", event: { type: "HELP_START", kind: "pharmacist-callback" } };
      }
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
        // The last step asks "repeat that, or help you contact a pharmacist?". A bare "yes" doesn't
        // say which, so it is asked back; "no thanks", "that's all", "got it" finish.
        if (UNDERSTOOD.test(n) || (negative && !affirm && isShort(n))) return { kind: "event", event: { type: "UNDERSTOOD" } };
        if (affirm && !negative && isShort(n)) return { kind: "reply", key: "explainWhichOne" };
        return { kind: "unclear" };
      }
      if (NEXT.test(n) || UNDERSTOOD.test(n) || (affirm && !negative && isShort(n))) {
        return { kind: "event", event: { type: "EXPLAIN_STEP", direction: "next" } };
      }
      return { kind: "unclear" };
    }

    case "safety": {
      // The help options on screen, by name. Each only opens its own step (consent, or a number).
      const help = (kind: HelpKind): VoiceIntent => ({ kind: "event", event: { type: "HELP_START", kind } });
      if (PHARMACIST.test(n)) return help("pharmacist-callback");
      if (FAMILY.test(n)) return help("family");
      if (HELPER.test(n)) return help("trusted-helper");
      if (CLINIC.test(n)) return help("clinic");
      if (TRY_AGAIN.test(n)) return { kind: "event", event: { type: "TRY_ANOTHER_LABEL" } };
      if (BACK_TO_CALL.test(n)) return { kind: "event", event: { type: "RETURN_TO_CALL" } };
      return { kind: "unclear" };
    }

    case "complete":
      if (ANOTHER_MEDICINE.test(n) || (affirm && !negative && isShort(n))) {
        return { kind: "event", event: { type: "NEW_MEDICINE" } };
      }
      return { kind: "unclear" };

    default:
      return { kind: "unclear" };
  }
}

// --- understood by meaning ----------------------------------------------------

/** Something the person may ask for on this screen in their own words, and the event it means. */
export type SpokenAction = { id: string; description: string; event: SessionEvent };

const HELP_DESCRIPTION: Record<HelpKind, string> = {
  "pharmacist-callback": "ask a pharmacist to call them back",
  clinic: "get their clinic's phone number",
  family: "let their family know they would like help",
  "trusted-helper": "ask their trusted helper for help",
};

/**
 * What the person may ask for on the current screen when the fixed phrases above
 * don't match — the choices an AI pass may pick from by meaning ("could the
 * pharmacist ring me back" → the pharmacist callback). By design it never holds a
 * "yes" to a gate (confirming a medicine or label wording, consent to contact
 * someone, sending a request): those need the person's own clear yes, matched
 * above. Every event still goes through the reducer's guards.
 */
export function spokenActions(ctx: CommandContext): SpokenAction[] {
  const a = (id: string, description: string, event: SessionEvent): SpokenAction => ({ id, description, event });
  const dose = (id: string, description: string, action: Extract<SessionEvent, { type: "DOSE" }>["action"]) =>
    a(id, description, { type: "DOSE", action });

  switch (ctx.helpStage) {
    case "confirm":
      return [a("decline", "not send this request now", { type: "HELP_CONFIRM", granted: false })];
    case "review":
      return [a("dont-send", "not send this callback request", { type: "HELP_CONFIRM", granted: false })];
    case "failed":
      return [
        a("retry", "try sending the request again", { type: "HELP_RETRY" }),
        a("show-number", "see the pharmacy's phone number to call themselves", { type: "HELP_SHOW_NUMBER" }),
        a("dismiss", "leave it and carry on with the call", { type: "HELP_DISMISS" }),
      ];
    case "sent":
    case "info":
      return [a("dismiss", "carry on with the call", { type: "HELP_DISMISS" })];
    case "sending":
      return [];
  }

  switch (ctx.state) {
    case "safety": {
      const view = buildEscalation(ctx.safetyReason ?? "help-requested", ctx.labelRouteSelected ?? false, ctx.canRetryLabel ?? false);
      if (view.urgent) return [];
      return [
        ...view.actions.map((h) =>
          h.id === "try-again"
            ? a("try-again", "try showing the label again", { type: "TRY_ANOTHER_LABEL" })
            : a(h.id, HELP_DESCRIPTION[h.id], { type: "HELP_START", kind: h.id }),
        ),
        a("back", "go back to the conversation", { type: "RETURN_TO_CALL" }),
      ];
    }
    case "camera-permission":
      return ctx.showMethod === "choose"
        ? [a("camera", "use the camera to show the label", { type: "CHOOSE_CAMERA" })]
        : [
            a("no-camera", "not use the camera: for example choose a photo from their phone instead, pick from their medicines, or type the name", {
              type: "CAMERA_CONSENT",
              granted: false,
            }),
          ];
    case "confirm-match":
      return ctx.candidateId
        ? [
            a("not-it", "say this is not their medicine", { type: "CONFIRM_MATCH", candidateId: ctx.candidateId, decision: "denied" }),
            a("unsure", "say they are not sure it is their medicine", { type: "CONFIRM_MATCH", candidateId: ctx.candidateId, decision: "unsure" }),
          ]
        : [];
    case "complete":
      return [a("another", "ask about another medicine", { type: "NEW_MEDICINE" })];
    case "explain": {
      const d = ctx.doseCheck;
      if (d) {
        const cb = d.callback;
        if (cb && cb.status !== "cancelled") {
          if (cb.status === "reviewing") return [dose("dont-send", "not send the summary", { kind: "dont-send" })];
          if (cb.status === "failed") return [dose("review", "look at the summary again", { kind: "review-summary" })];
          if (cb.status === "submitted" || cb.status === "unknown") {
            return [dose("back", "go back to the conversation", { kind: "return-to-call" })];
          }
          return [];
        }
        if (d.offer) {
          return [
            dose("prepare", "have a summary prepared for the pharmacist", { kind: "accept-offer" }),
            dose("decline", "not prepare a summary now", { kind: "decline-offer" }),
          ];
        }
        if (d.step === "label") return [dose("cannot-confirm", "say they can't tell what the label says", { kind: "cannot-confirm" })];
        const out: SpokenAction[] = [];
        const reason = d.step === "record-unavailable" || (d.comparison && d.comparison.outcome !== "match");
        if (reason) out.push(dose("callback", "ask for a pharmacist to call them back", { kind: "offer-callback" }));
        if (d.step === "compared") out.push(dose("correct", "correct or change the label wording", { kind: "review-details" }));
        out.push(dose("back", "go back to the conversation", { kind: "return-to-call" }));
        return out;
      }
      if (ctx.recordConflict) {
        return [
          a("pharmacist", "ask a pharmacist to help check", { type: "RECORD_CONFLICT_CHOICE", choice: "pharmacist" }),
          a("carry-on", "carry on with the explanation", { type: "RECORD_CONFLICT_CHOICE", choice: "carry-on" }),
        ];
      }
      const out: SpokenAction[] = [];
      if (ctx.explainStep < 2) out.push(a("next", "hear the next part", { type: "EXPLAIN_STEP", direction: "next" }));
      if (ctx.explainStep > 0) out.push(a("back", "hear the previous part again", { type: "EXPLAIN_STEP", direction: "back" }));
      if (ctx.explainStep === 1) out.push(a("label-differs", "say their label looks different", { type: "LABEL_CHECK", matches: false }));
      if (ctx.explainStep === 2) out.push(a("understood", "say they understand, are finished, or need nothing more", { type: "UNDERSTOOD" }));
      out.push(a("pharmacist", "ask for a pharmacist to contact or call them (they are asked to confirm first)", { type: "HELP_START", kind: "pharmacist-callback" }));
      out.push(a("another", "ask about a different medicine", { type: "NEW_MEDICINE" }));
      return out;
    }
    default:
      return [];
  }
}
