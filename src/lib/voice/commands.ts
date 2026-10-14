import {
  extractSpokenMedicineNameOnly,
  extractSpokenStrength,
  parseSpokenLabel,
} from "@/lib/label/spoken-label";
import type { IntentActionId } from "@/lib/api/schemas";
import type { CopyKey } from "@/lib/content/translations";
import { isPlausibleNumber } from "@/lib/dose-check/dose-check";
import { parseTypedLabel } from "@/lib/label/typed-label";
import { classifySafety } from "@/lib/safety/classify";
import { isDoseChange, isRecordConflict } from "@/lib/session/intent";
import { buildEscalation } from "@/lib/safety/escalation";
import type { CameraIssue, CameraMode, DoseCheck, HelpKind, SessionEvent } from "@/lib/session/state-machine";
import type { CompanionState, ContextualActionId, SafetyReason } from "@/types/content";

/**
 * Deterministic interpretation of a SPOKEN utterance for hands-free calls.
 * No model is involved. It only ever produces the same events the buttons
 * produce, so every reducer guard still applies. Anything ambiguous returns
 * `unclear` (the companion asks again) — it never guesses a gate decision.
 */
export type VoiceIntent =
  | { kind: "event"; event: SessionEvent }
  /** Things only the screen can do: take the still, the interrupt setting, the paused mic. */
  | { kind: "ui"; action: "capture" | "interrupt-on" | "interrupt-off" | "listen-again" }
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
  /** The companion just asked "What else can I help with?" in the open conversation. */
  anythingElse?: boolean;
  /** The companion just answered "my doctor said…" and asked: pharmacist, or carry on? */
  recordConflict?: boolean;
  /** After the camera question: Take photo / Upload offered, the camera open, or no camera (and why). */
  cameraMode?: CameraMode | null;
  cameraIssue?: CameraIssue | null;
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
/** Unsure, in any words. A hedged answer is never a yes (or a no) to anything: "I suppose so",
 *  "about right", "I don't really know". Checked after "uh-huh"/"mm-hmm" are taken out. */
const HEDGE =
  /\b(not sure|unsure|don't know|do not know|don't really know|not really sure|no idea|maybe|i guess|perhaps|hmm+|can't tell|cannot tell|i suppose|suppose so|sort of|kind of|about right|i reckon|i think|think so|probably|might be|could be|not certain|i believe)\b|不确定|不知道|不太确定|也许|可能|大概|好像|我觉得/;
const HEDGE_ALL = new RegExp(HEDGE.source, "g");
/** Conversational yes sounds. */
const BACKCHANNEL_YES = /\b(uh[- ]?huh|mm[- ]?hmm|mhm)\b/g;
/** "Not right", "不对", "不用": a yes-word inside a no. Taken out before looking for a yes. */
/** Yes, though it contains a "don't". */
const YES_DESPITE_NO = /\b(don't|do not|wouldn't|would not) mind\b|\bwhy not\b|\bno (problem|worries)\b|不介意/g;
const NEGATED_YES = /\bnot (right|correct|okay|ok|good)\b|不(对|好|行|可以|是的|用)/g;
// "don't" matters most: "please don't" contains "please", which alone reads as a yes.
const NEGATIVE =
  /\b(no+|nope|nah|don't|dont|do not|cancel|not now|not really|not right|not correct|wrong|incorrect|try again|that's not|it's not|isn't|not my|not the|later)\b|不是|不要|不对|不行|不好|没有|现在不|再试|不用/;
/** "ok" on its own: heard, but not a clear yes — it never confirms, consents or approves. */
const BARE_OK = /^(ok|okay|k|kk|okey|alright|all right|fine)[.!]*$/;
const AFFIRM =
  /\b(yes|y+e+s+|yse|ys|yeah|yea|yah|yep|yup|sure|ok|okay|please|correct|right|absolutely|of course|go ahead|go for it|sounds good|fine by me|alright|that's it|that is it|that's right|exactly|spot on|that's what it says|that's the one|that's mine|yes it is|this is my medicine)\b|是的|没错|好的|可以|对|好|行|就是这样|是这样/;
/** "I can't read it", "it's too small": the wording can't be confirmed — never a guess at it. */
const CANT_READ = /\b(can't|cannot|can not|unable to|hard to|couldn't)\b.{0,12}\b(read|see|tell|make out)\b|\b(too (small|faded|blurry)|smudged|worn off)\b|看不清|看不到|读不了|看不出/;

const END_CALL =
  /\b(end (the |this |our )?call|end it( here| now| there)?|let'?s end( (it|here|now|the call))?|finish (the |this )?call|hang up|we'?re done( here)?|good ?bye|bye( bye)?)\b|结束通话|挂断|再见|就到这里/;
/** "Nothing else": answering "Is there anything else I can help you with?" with no. */
const NOTHING_ELSE =
  /\b(that'?s (all|it|everything)|nothing (else|more)|no(pe)?,? thanks?( you)?|no more|i'?m (all )?(good|fine|done)|all (good|done))\b|没有了|不用了|没别的|就这样/;
const GET_HELP = /\b(get help|i need help|talk to (a |the |my )?(person|human|pharmacist|doctor)|speak to (a |the |my )?(person|human|pharmacist|doctor))\b|寻求帮助|找药剂师|需要帮助/;
const REPEAT = /\b(repeat|say (that |it )?again|pardon|come again|one more time)\b|重复|再说一遍/;
const TO_CHINESE = /\b(chinese|mandarin)\b|中文|华语|普通话/;
const TO_ENGLISH = /\benglish\b|英文|英语/;

const TAKE_PHOTO = /\b(take (a |the )?(photo|picture|pic)|capture|snap( it)?|scan( it)?)\b|拍照|拍下/;
/** Wanting a photo they already have ("choose a photo", "upload", "from my gallery") — not taking one now. */
// "Show the label" / "let me show you the box": asking to show it (again).
const SHOW_LABEL = /\b(show|see|look at)\b.{0,20}\b(label|medicine|box|bottle|packet|photo|picture)\b|给你看|看(一下)?标签/;
const CLOSE_CAMERA = /\b(cancel|close|stop|turn off|exit)\b.{0,12}\b(camera|it|this)?\b|\bnever ?mind\b|关闭相机|关掉相机|取消/;
// The pharmacy's own contact details (to call them herself), never her callback number.
const PHARMACY_CONTACT = /\b(pharmacy|pharmacist|brightcare)('s)?\b.*\b(contact|number|phone)\b|\b(contact|number|phone)\b.*\b(pharmacy|pharmacist|brightcare)\b|药房.*(电话|号码)/;
// The interrupt setting, and a paused mic, by words (they used to be buttons).
const INTERRUPT_OFF = /\b(stop|don't|do not|no more|turn off|switch off|disable)\b.{0,24}\binterrupt|关闭打断|不要打断/;
const INTERRUPT_ON = /\b(let me|allow|turn on|switch on|enable|i want to)\b.{0,24}\binterrupt|打开打断|让我打断/;
const LISTEN_AGAIN = /\b(listen (again|to me)|start listening|(turn|switch) (the )?mic(rophone)? (back )?on|unpause)\b|继续听|重新听/;
const PHOTO_INSTEAD = /\b(photos?|pictures?|pics?|images?|gallery|upload|album|camera roll|from my phone)\b|照片|相册|图片|上传/;
const NEXT = /\b(next|continue|go on|keep going|carry on|go ahead|tell me more|what else|read on|keep reading)\b|下一步|继续|接着说/;
const BACK = /\b(back|previous|go back)\b|上一步|返回/;
const UNDERSTOOD =
  /\b(i understand|understood|got it|thank(s| you)|that's all|makes sense|all clear|all good|i'?m (done|fine|good)|nothing else|no need)\b|明白|谢谢|懂了|不用了|没有了/;
/** Asking for a pharmacist, or for someone to get in touch. */
const PHARMACIST_REQUEST =
  /\b(pharmacist|pharmacy|chemist|contact (them|someone|a person)|call me( back)?|ring me|call ?back)\b|药剂师|药房|联系|回电/;
/**
 * Asking for a pharmacist to get in touch, outside the explanation ("can you help me draft a
 * message to the pharmacy for a callback?"). Needs a contact word, so "my pharmacy record" alone
 * isn't a request.
 */
const PHARMACIST_CONTACT =
  /\b(call|ring|callback|contact|message|reach|speak|talk|get in touch)\b.{0,40}\b(pharmacists?|pharmacy|pharmacies|chemist)\b|\b(pharmacists?|pharmacy|pharmacies|chemist)\b.{0,40}\b(call|ring|callback|call back|contact|message|reach|get in touch)\b|药剂师.{0,6}(回电|联系|打电话)|(联系|打电话给)(药剂师|药房)/;
const TRY_AGAIN = /\b((try|another|new).*(photo|picture|again|label)|again)\b|再拍|再试/;
/** "Change the wording" / "let me correct the label": back to reading the box (the comparison is redone). */
const CHANGE_WORDING = /\b(change|correct|fix|edit|redo)\b.{0,24}\b(wording|label|words|reading|what i said)\b|(改|更正|修改)(一下)?(标签|措辞|内容|用法)/;
/** Correcting the summary in words (owner brief, 13 October 2026). Checked before "send", so
 *  "change the number, then send" changes it and asks again; it never sends. */
const CHANGE_ANY = /\b(change|fix|edit|update|replace|wrong)\b|\bcorrect (it|that|this|the|my)\b|改|更正|修改|换/;
const NUMBER_WORDS = /\b(number|phone|contact)\b|号码|电话/;
const PHONE = /\+?\d[\d\s-]{6,}\d/;
const REASON_TO = /\breason\b.{0,12}?\b(to|is)\b\s*[:,]?\s*(.+)$/i;
const LABEL_SAYS = /\b(?:label|box|wording)\b.{0,12}?\b(?:says|reads|to|is)\b\s*[:,]?\s*(.+)$|(?:标签|盒子)上?(?:写着|写的是|改成)[:：，,]?\s*(.+)$/i;
const CANCEL = /\bcancel\b|取消/;
const SHOW_NUMBER = /\b(show|read|tell|say|what('s| is))\b/;
const BACK_TO_CALL = /\b(back to (the )?(conversation|call)|carry on|continue (the )?(call|conversation)|talk (to you )?more)\b|回到对话/;
const DIFFERENT = /\b(different|differs|doesn't match|does not match|don't match)\b|不一样|不同|不符/;
const MATCHES = /\b(it matches|matches|same|the same)\b|一样|相同/;
const PHARMACIST = /\b(pharmacist|pharmacy|chemist)\b|药剂师|药房/;
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
/** "If it's right, send it", "I would send it", "what if I send it": a condition, not an approval. */
const CONDITIONAL = /\b(if|unless|would|could|might|whether|suppose|supposing|later)\b|如果|要是|假如|的话/;
/** "Send it to my daughter": a recipient other than the one reviewed. */
const OTHER_RECIPIENT = /\b(send|submit)\b.*\bto\s+(?!(the\s+)?(pharmacist|pharmacy|brightcare)\b)\w+/;
const QUOTED = /["“”「」『』][^"“”「」『』]*["“”「」『』]/g;

function isSendCommand(n: string, raw: string): boolean {
  if (!SEND.test(n) || HOLD.test(n) || NEGATIVE.test(n) || HEDGE.test(n)) return false;
  if (QUESTION.test(n) || raw.includes("?") || raw.includes("？")) return false;
  if (CONDITIONAL.test(n) || OTHER_RECIPIENT.test(n)) return false;
  // Quoting someone ('she said "send it"') is not an approval; typing just the quoted phrase is.
  const outside = raw.replace(QUOTED, "").trim();
  if (outside !== raw.trim() && /\p{L}/u.test(outside)) return false;
  // A natural spoken sentence ("okay, let's continue and send it"), not a long ramble that
  // happens to contain the word (owner retest, 13 October 2026).
  return isSentence(n) || n.length <= 8;
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
const DOSE_WORD = /\b(dose|doses|dosage|dosing)\b|剂量|用量/;
/** Asking (not stating): "how many…", "should I take…", "吃多少". */
/** Asking as a request rather than a question: "I want to know the dosage", "tell me my dose". */
const DOSE_REQUEST = /\b(want|need|like|wanna) (to )?(know|hear|check)\b|\b(tell|remind) me\b|\bwhat('?s| is| was)\b|想知道|告诉我|是多少/;
const DOSE_ASK = /\bhow (many|much)\b.*\b(take|tablets?|pills?|mg|milligrams?)\b|\bshould i (take|have)\b|吃几|吃多少|服用多少|该吃多少/;
/**
 * A question about what dose to take. Only a question counts — "what should my dose be?",
 * "how many should I take" — never a statement like "yes, that is my correct dosage".
 */
function isDoseQuestion(n: string, raw: string): boolean {
  const asked = QUESTION.test(n) || raw.includes("?") || raw.includes("？") || /多少|几/.test(n);
  return (DOSE_WORD.test(n) && (asked || DOSE_REQUEST.test(n))) || DOSE_ASK.test(n);
}

/** A question, as opposed to a command or an answer (used to choose honest wording). */
export function isQuestion(text: string): boolean {
  const raw = text.trim();
  return QUESTION.test(normalise(raw)) || raw.includes("?") || raw.includes("？");
}
/** Words that only appear when someone is reading an instruction, not answering yes or no. */
/** Words that only label wording would contain, for the label step without AI. ("Day", "morning" and
 *  "one" alone are not enough: "it's been a long day", "that's the one".) */
const LABEL_WORDS =
  /\d|\b(take|tablets?|tabs?|capsules?|caps?|pills?|two|three|four|five|half|once|twice|daily|mg|ml|directed|crush|chew|swallow|dissolve|meals?|food|bedtime|every)\b|\bone (tablet|capsule|pill|a day|daily|twice|in the)\b|片|粒|次|服|餐|饭|睡前|每日|每天/;
const INSTRUCTION_WORDS =
  /\d|\b(take|tablets?|tabs?|capsules?|pills?|one|two|three|four|half|once|twice|daily|day|times?|meals?|food|morning|night|bedtime|mg)\b|片|粒|次|服|餐|饭|睡前|早上|每日|每天/;

/**
 * The summary on screen, answered in words before any "send" is looked for: a correction updates it
 * (a new revision: approval is cleared and it is shown again), "cancel" drops it, a question about
 * sending is answered. Returns null when none of these apply.
 */
function reviewAnswer(
  n: string,
  raw: string,
  draft: NonNullable<DoseCheck["callback"]>["draft"],
  question: boolean,
): VoiceIntent | null {
  const save = (changes: Partial<{ callbackContact: string; concernSummary: string; labelInstruction: string }>): VoiceIntent => ({
    kind: "event",
    event: {
      type: "DOSE",
      action: {
        kind: "save",
        changes: {
          callbackContact: draft.callbackContact,
          concernSummary: draft.concernSummary,
          labelInstruction: draft.confirmedLabel?.instructionText ?? "",
          ...changes,
        },
      },
    },
  });
  const change = CHANGE_ANY.test(n);
  const phone = raw.match(PHONE)?.[0].trim();
  // "Who will see this?": exactly who, from the summary — never a guess.
  if (/\bwho\b.*\b(see|get|read|receive|sees|gets)\b|谁.*(看|收到)/.test(n)) return { kind: "reply", key: "doseWhoSees" };
  // "That's my old number": ask for the new one.
  if (!phone && /\b(old|new|different|changed|wrong|not my)\b.*\b(number|phone)\b|\b(number|phone)\b.*\b(old|changed|wrong|different|out of date)\b|号码.*(换|变|旧|不对)/.test(n)) {
    return { kind: "reply", key: "doseAskNumber" };
  }
  // Asking to see the number: said back in full (it is masked in the summary).
  if (NUMBER_WORDS.test(n) && !change && !phone && (question || SHOW_NUMBER.test(n))) return { kind: "reply", key: "doseNumberIs" };
  // A new number: "change the number to 0000 0199", or just the number after being asked for it.
  if (phone && (change || NUMBER_WORDS.test(n) || n.replace(/[\d\s+-]/g, "") === "")) {
    return isPlausibleNumber(phone) ? save({ callbackContact: phone }) : { kind: "reply", key: "doseAskNumber" };
  }
  if (change && NUMBER_WORDS.test(n)) return { kind: "reply", key: "doseAskNumber" };
  // "Change the reason to …": her own words, never a record fact.
  const reason = /\breason\b|原因/.test(n) ? (raw.match(REASON_TO)?.[2] ?? raw.match(/原因(?:改成|是)[:：，,]?\s*(.+)$/)?.[1]) : undefined;
  if (reason && reason.trim()) return save({ concernSummary: reason.trim().replace(/[.。]+$/, "").slice(0, 200) });
  if (change && /\breason\b|原因/.test(n)) return { kind: "reply", key: "doseAskReason" };
  // New label wording ("the label says …"): shown back to confirm, then compared again.
  const wording = raw.match(LABEL_SAYS);
  const labelText = (wording?.[1] ?? wording?.[2])?.trim();
  if (labelText && INSTRUCTION_WORDS.test(labelText.toLowerCase())) return save({ labelInstruction: labelText.slice(0, 200) });
  if (change && (CHANGE_WORDING.test(n) || /\b(label|wording)\b|标签/.test(n))) return { kind: "reply", key: "doseAskWording" };
  // Any other "change …" (including "change something, then send"): ask what — never send.
  if (change) return { kind: "reply", key: "doseWhatToChange" };
  if (CANCEL.test(n) && !/\b(don't|dont|do not)\b.{0,8}\bcancel/.test(n) && !question && isShort(n)) {
    return { kind: "event", event: { type: "DOSE", action: { kind: "dont-send" } } };
  }
  // "What happens if I say send?": a fixed answer; nothing is sent.
  if (question && SEND.test(n)) return { kind: "reply", key: "doseSendExplained" };
  // A plain "no" / "not really" / "不对": what would she like changed? (Nothing is sent or dropped.)
  if (NEGATIVE.test(n) && !SEND.test(n) && !HOLD.test(n) && !AFFIRM.test(n.replace(NEGATED_YES, " ")) && isShort(n)) {
    return { kind: "reply", key: "doseWhatToChange" };
  }
  // Unsure: no pressure; nothing is sent until she says so.
  if (HEDGE.test(n.replace(BACKCHANNEL_YES, " "))) return { kind: "reply", key: "doseReviewUnsure" };
  return null;
}

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
  if (INTERRUPT_OFF.test(n)) return { kind: "ui", action: "interrupt-off" };
  if (INTERRUPT_ON.test(n)) return { kind: "ui", action: "interrupt-on" };
  if (LISTEN_AGAIN.test(n)) return { kind: "ui", action: "listen-again" };

  // 3. The current screen's decision.
  const yesSound = new RegExp(BACKCHANNEL_YES.source).test(n);
  const plain = n.replace(BACKCHANNEL_YES, " ");
  const hedge = HEDGE.test(plain);
  // "I don't know" is unsure, not a no.
  const negative = NEGATIVE.test(plain.replace(HEDGE_ALL, " ").replace(YES_DESPITE_NO, " "));
  // "Is that right?" / "对吗？" asks; it never confirms or consents to anything. Nor does a hedged yes.
  const asked = QUESTION.test(n) || raw.includes("?") || raw.includes("？");
  // "ok" alone is not a yes (owner brief, 14 October 2026): at a decision it is asked again plainly.
  const bareOk = BARE_OK.test(n.trim());
  const affirm = (AFFIRM.test(plain.replace(NEGATED_YES, " ")) || yesSound || new RegExp(YES_DESPITE_NO.source).test(n)) && !asked && !hedge && !bareOk;

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
      if (bareOk) return { kind: "reply", key: "okIsItYes" };
      if (negative || hedge) return { kind: "event", event: { type: "HELP_CONFIRM", granted: false } };
      if (affirm && isSentence(n)) return { kind: "event", event: { type: "HELP_CONFIRM", granted: true } };
      return { kind: "unclear" };
    case "failed":
      if (TRY_AGAIN.test(n)) return { kind: "event", event: { type: "HELP_RETRY" } };
      if (/\b(number|phone|contact)\b|电话|号码/.test(n)) return { kind: "event", event: { type: "HELP_SHOW_NUMBER" } };
      if (negative) return { kind: "event", event: { type: "HELP_DISMISS" } };
      return { kind: "unclear" };
    case "sent":
    case "info":
      // "Is there anything else I can help you with?" — "no", "that's all": she's finished, so the
      // call ends. "Yes" / "carry on": back to where she was.
      if (NOTHING_ELSE.test(n) || (negative && !affirm)) return { kind: "event", event: { type: "END_CALL" } };
      if (NEXT.test(n) || BACK_TO_CALL.test(n) || affirm) return { kind: "event", event: { type: "HELP_DISMISS" } };
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
      // Just asked "What else can I help with?": "no", "that's all" finish the call; "yes" asks what.
      if (ctx.anythingElse) {
        if (NOTHING_ELSE.test(n) || (negative && !affirm && isShort(n))) return { kind: "event", event: { type: "END_CALL" } };
        if (affirm && isShort(n)) return { kind: "reply", key: "anotherMedicineGuide" };
      }
      const question = QUESTION.test(n) || raw.includes("?") || raw.includes("？");
      if (offered.length === 1 && offered[0] === "show-medicine" && affirm && !negative && !hedge && !question && isShort(n)) {
        return { kind: "event", event: { type: "SELECT_ROUTE", route: "show-medicine" } };
      }
      // "Can a pharmacist call me back?" before any medicine is checked: the same pharmacist step as
      // on the help screen (confirm, then review, then an explicit "send"). A changed dose is a
      // comparison, not a callback, so it goes to the reducer.
      if (PHARMACIST_CONTACT.test(n) && !negative && !isDoseChange(raw)) {
        return { kind: "event", event: { type: "HELP_START", kind: "pharmacist-callback" } };
      }
      // "Shall I let your family know…?" — "let my family know" (it was a button): the same consent
      // step as before; nothing is sent without her yes and her "send".
      if (offered.includes("ask-family") && FAMILY.test(n) && !negative && !hedge && !question) {
        return { kind: "event", event: { type: "HELP_START", kind: "family" } };
      }
      return { kind: "message", text: raw };
    }

    case "camera-permission": {
      // One question: may I see the label, with the camera or a photo? A clear yes (or asking for
      // the camera or a photo) only brings up Take photo and Upload; a no or a hedge never does.
      // The name and strength can simply be said instead.
      const said = parseSpokenLabel(raw);
      const parsed = said ? parseTypedLabel({ ...said, patientName: "" }) : null;
      if (parsed?.ok) return { kind: "event", event: { type: "SUBMIT_LABEL", input: parsed.input } };
      if (/\b(i'?d|i would) rather not\b|\bprefer not\b/.test(n) && !asked) return { kind: "event", event: { type: "CAMERA_CONSENT", granted: false } };
      if (hedge || asked) return { kind: "unclear" };
      if (negative && !affirm) return { kind: "event", event: { type: "CAMERA_CONSENT", granted: false } };
      // "Is that okay?" — "okay" is a yes here: it only brings up Take photo / Upload, never a photo by itself.
      if ((affirm || bareOk) && !negative && isSentence(n)) return { kind: "event", event: { type: "CAMERA_CONSENT", granted: true } };
      if (!negative && (TAKE_PHOTO.test(n) || PHOTO_INSTEAD.test(n) || /\bcamera\b|相机|摄像头/.test(n))) {
        return { kind: "event", event: { type: "CAMERA_CONSENT", granted: true } };
      }
      return { kind: "unclear" };
    }

    case "camera-guidance": {
      if (TAKE_PHOTO.test(n) && ctx.cameraLive) return { kind: "ui", action: "capture" };
      const camera = /\bcamera\b|相机|摄像头/.test(n);
      const photo = PHOTO_INSTEAD.test(n) && !TAKE_PHOTO.test(n);
      if (ctx.cameraMode === "preview") {
        // "Cancel", or "I'll upload one instead": back to Take photo / Upload.
        if ((CLOSE_CAMERA.test(n) && !TAKE_PHOTO.test(n)) || photo) return { kind: "event", event: { type: "CLOSE_CAMERA" } };
      } else if (ctx.cameraMode === "ready") {
        if (TAKE_PHOTO.test(n) || camera) return { kind: "event", event: { type: "OPEN_CAMERA" } };
        // The phone's photo picker only opens from a tap: say where to tap.
        if (photo || SHOW_LABEL.test(n)) return { kind: "reply", key: "photoNeedsTap" };
      } else if (ctx.cameraMode === "fallback") {
        const wants = SHOW_LABEL.test(n) || TAKE_PHOTO.test(n) || photo || camera;
        // After a "no": asked again. With the camera off or missing: Upload is still in the message.
        if (wants && !negative && !ctx.cameraIssue) return { kind: "event", event: { type: "SHOW_LABEL_AGAIN" } };
        if (wants && !negative && ctx.cameraIssue) return { kind: "reply", key: "photoNeedsTap" };
      }
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
      if (/\bwhat('s| is| does)?\b.*\b(for|do|does)\b|\bwhat it'?s for\b|做什么|干什么|治什么/.test(n) && !negative && !affirm) {
        return { kind: "reply", key: "confirmWhatFor" };
      }
      // Hedging beats everything: "yes, but I'm not sure" must NOT confirm a medicine.
      if (bareOk) return { kind: "reply", key: "okIsItYes" };
      if (hedge) return { kind: "event", event: { type: "CONFIRM_MATCH", candidateId: id, decision: "unsure" } };
      if (negative && affirm) return { kind: "unclear" }; // contradictory
      if (negative) return { kind: "event", event: { type: "CONFIRM_MATCH", candidateId: id, decision: "denied" } };
      if (affirm && isSentence(n)) return { kind: "event", event: { type: "CONFIRM_MATCH", candidateId: id, decision: "confirmed" } };
      return { kind: "unclear" };
    }

    case "explain": {
      // Dose check: every step is answered in words (said or typed); there are no buttons.
      // Sending is only ever an explicit, short "send" for exactly the revision reviewed.
      if (ctx.doseCheck) {
        const d = ctx.doseCheck;
        const question = QUESTION.test(n) || raw.includes("?") || raw.includes("？");
        const yes = affirm && !negative && !hedge && isShort(n) && !question;
        const no = negative && !affirm && isShort(n) && !question;
        const cb = d.callback;
        // A label correction waiting for its yes is answered at the label step below, even with a summary open.
        if (cb && cb.status === "reviewing" && d.step !== "label") {
          const review = reviewAnswer(n, raw, cb.draft, question);
          if (review) return review;
        }
        if (cb && cb.status !== "cancelled" && d.step !== "label") {
          // "Show pharmacy contact": the pharmacy's own number, once the request has gone (or failed).
          if (cb.status !== "reviewing" && cb.status !== "submitting" && PHARMACY_CONTACT.test(n)) return { kind: "reply", key: "doseCallYourself" };
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
          // A plain yes, or "send" inside a hedge or a long sentence: say how to send, never
          // "I can't send from here" (owner retest, 13 October 2026). A question is answered.
          const fine = /\b(looks (fine|good|right|ok|okay)|all (fine|good)|that's fine|go on then|go ahead)\b|没问题|可以了/.test(n) && !question;
          if (cb.status === "reviewing" && (yes || fine || (SEND.test(n) && !question))) return { kind: "reply", key: "doseSayToSend" };
          // After the outcome there is nothing left to decide here: "that's all" ends the call;
          // anything else carries the conversation on (the companion says what is still open).
          // Submitted ("…anything else I can help with?"): "no" / "that's all" finish; "yes" carries on.
          if (cb.status === "submitted") {
            if (/\bwhen\b.*\b(call|ring|hear|contact)\b|什么时候.*(回电|打|联系)/.test(n)) return { kind: "reply", key: "doseNoCallbackTime" };
            if (NOTHING_ELSE.test(n) || (no && !HOLD.test(n))) return { kind: "event", event: { type: "END_CALL" } };
            if (BACK_TO_CALL.test(n) || NEXT.test(n) || yes) return { kind: "event", event: { type: "DOSE", action: { kind: "return-to-call" } } };
            return { kind: "unclear" };
          }
          // Not sent, or not confirmed ("If you'd like me to try again, say “send the request”. Or we can
          // leave it for now."): "leave it" / "no" carries on; a plain yes is told how to retry — it never sends.
          if (cb.status === "failed" || cb.status === "unknown") {
            if (/\b(ring|call|phone|contact)\b.*\b(them|myself|pharmacy|direct(ly)?)\b|自己打|直接打/.test(n)) return { kind: "reply", key: "doseCallYourself" };
            if (BACK_TO_CALL.test(n) || NEXT.test(n) || /\b(leave it|not now|that's fine)\b|算了|先不/.test(n) || (no && !SEND.test(n))) {
              return { kind: "event", event: { type: "DOSE", action: { kind: "return-to-call" } } };
            }
            if (NOTHING_ELSE.test(n)) return { kind: "event", event: { type: "END_CALL" } };
            if (yes) return { kind: "reply", key: "doseRetryPrompt" };
          }
          return { kind: "unclear" };
        }
        if (d.offer) {
          if (bareOk) return { kind: "reply", key: "okIsItYes" };
          if (no || (negative && !affirm && !question)) return { kind: "event", event: { type: "DOSE", action: { kind: "decline-offer" } } };
          if (hedge) return { kind: "reply", key: "doseOfferUnsure" };
          if (affirm && !negative && !hedge && !question && isSentence(n)) {
            return { kind: "event", event: { type: "DOSE", action: { kind: "accept-offer" } } };
          }
          return { kind: "unclear" };
        }
        if (d.step === "label") {
          // A question is not label wording ("What does twice daily mean?", "Should I take two?"):
          // asking how much to take gets a fixed answer; anything else is understood by meaning.
          if (QUESTION.test(n) && !/^(it|the label|the box|this)\b/.test(n)) {
            return isDoseQuestion(n, raw) ? { kind: "reply", key: "doseLabelStepQuestion" } : { kind: "unclear" };
          }
          if (CANT_READ.test(n)) return { kind: "event", event: { type: "DOSE", action: { kind: "cannot-confirm" } } };
          // "OK, one tablet twice daily" is new wording, not a yes to the reading on screen.
          // Shown back to confirm, never trusted as-is.
          if (LABEL_WORDS.test(n)) return { kind: "message", text: raw };
          if (d.reading && (no || CHANGE_WORDING.test(n))) return { kind: "event", event: { type: "DOSE", action: { kind: "reject-reading" } } };
          if (d.reading && yes) {
            return { kind: "event", event: { type: "DOSE", action: { kind: "confirm-label", revision: d.labelRevision } } };
          }
          // Unsure: no pressure, and nothing guessed.
          if (hedge) return { kind: "reply", key: "doseReadingHedge" };
          // Anything else ("next", "it's been a long day", "send the request") is not the box's
          // wording: understood by meaning, never read back as the label.
          return { kind: "unclear" };
        }
        // A difference, an incomplete check or an unreachable record can go to a pharmacist (a
        // match offers nothing: the reducer refuses it too). The offer still asks before preparing.
        const canOffer = (d.step === "compared" && d.comparison?.outcome !== "match") || d.step === "record-unavailable";
        if (canOffer && (isDoseQuestion(n, raw) || /\bwhich (one|dose|instruction|is right)\b|\bwhat (do|should) i (take|do)\b|哪个|吃哪/.test(n))) {
          return { kind: "reply", key: "doseWhichOne" };
        }
        if (canOffer && (PHARMACIST.test(n) || yes)) {
          return { kind: "event", event: { type: "DOSE", action: { kind: "offer-callback" } } };
        }
        // "Change the wording": back to the label step to read the box again.
        if (d.step === "compared" && CHANGE_WORDING.test(n)) {
          return { kind: "event", event: { type: "DOSE", action: { kind: "review-details" } } };
        }
        if (d.step === "compared" || d.step === "record-unavailable") {
          // After a match ("…anything else I can help with?"): "no", "that's all" finish the call.
          if (!canOffer && (NOTHING_ELSE.test(n) || no)) return { kind: "event", event: { type: "END_CALL" } };
          // "No thanks" to a callback, "carry on", or "yes" after a match: back to the conversation,
          // where the companion says what is still open.
          if (BACK_TO_CALL.test(n) || NEXT.test(n) || no || NOTHING_ELSE.test(n) || (yes && !canOffer)) {
            return { kind: "event", event: { type: "DOSE", action: { kind: "return-to-call" } } };
          }
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
      if (isDoseQuestion(n, raw)) return { kind: "reply", key: "explainDoseQuestion" };
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
        if ((affirm || bareOk) && !negative && isShort(n)) return { kind: "reply", key: "explainWhichOne" }; // not a decision: just "which one?"
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
      if (BACK_TO_CALL.test(n) || NEXT.test(n)) return { kind: "event", event: { type: "RETURN_TO_CALL" } };
      if (ctx.safetyReason !== "urgent-risk") {
        // "No thanks": nothing is sent, and the conversation carries on.
        if (NOTHING_ELSE.test(n) || (negative && !affirm && isShort(n) && !asked)) return { kind: "event", event: { type: "RETURN_TO_CALL" } };
        // A plain "yes" or "I'm not sure" doesn't say who: asked which, gently.
        if ((affirm && isShort(n)) || hedge) return { kind: "reply", key: "safetyWhichOne" };
      }
      return { kind: "unclear" };
    }

    case "complete":
      if (hedge && !NOTHING_ELSE.test(n)) return { kind: "unclear" }; // "I'm not sure" neither ends the call nor starts again
      if (NOTHING_ELSE.test(n) || (negative && !affirm && isShort(n))) return { kind: "event", event: { type: "END_CALL" } };
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
/** An action does something (`event`), or answers with a fixed line (`say`) — never AI-written words. */
export type SpokenAction = { id: IntentActionId; description: string } & ({ event: SessionEvent; say?: never } | { say: CopyKey; event?: never });

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
  const a = (id: IntentActionId, description: string, event: SessionEvent): SpokenAction => ({ id, description, event });
  const dose = (id: IntentActionId, description: string, action: Extract<SessionEvent, { type: "DOSE" }>["action"]) =>
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
      return [
        a("dismiss", "carry on with the call", { type: "HELP_DISMISS" }),
        a("end", "end the call because they need nothing else", { type: "END_CALL" }),
      ];
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
      return [
        a("no-camera", "not use the camera or a photo, and say the medicine name instead", { type: "CAMERA_CONSENT", granted: false }),
      ];
    case "camera-guidance":
      if (ctx.cameraMode === "ready") return [a("camera", "open the camera to take a photo of the label", { type: "OPEN_CAMERA" })];
      if (ctx.cameraMode === "preview") return [a("close-camera", "close the camera without taking a photo", { type: "CLOSE_CAMERA" })];
      return [];
    case "confirm-match":
      return ctx.candidateId
        ? [
            a("not-it", "say this is not their medicine", { type: "CONFIRM_MATCH", candidateId: ctx.candidateId, decision: "denied" }),
            a("unsure", "say they are not sure it is their medicine", { type: "CONFIRM_MATCH", candidateId: ctx.candidateId, decision: "unsure" }),
          ]
        : [];
    case "complete":
      return [
        a("another", "ask about another medicine", { type: "NEW_MEDICINE" }),
        a("end", "end the call because they need nothing else", { type: "END_CALL" }),
      ];
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
      out.push(a("dose-wrong", "say the dose or amount in the record is not right, or not what they take or were told", { type: "START_DOSE_CHECK" }));
      // Any wording of "what's my dose?": the fixed line quoting the confirmed record (explainDoseQuestion).
      out.push({ id: "dose", description: "hear what their pharmacy record says about how much to take and when (their dose)", say: "explainDoseQuestion" });
      out.push(a("pharmacist", "ask for a pharmacist to contact or call them (they are asked to confirm first)", { type: "HELP_START", kind: "pharmacist-callback" }));
      out.push(a("another", "ask about a different medicine", { type: "NEW_MEDICINE" }));
      return out;
    }
    case "listening":
      return [a("pharmacist", "ask for a pharmacist to contact or call them back (they are asked to confirm, and see the message, before anything is sent)", { type: "HELP_START", kind: "pharmacist-callback" })];
    default:
      return [];
  }
}

/**
 * A short command ("next", "yes", "end the call", "发送"): the fixed phrases can act on it at
 * once. Anything longer is a sentence, whose meaning is worked out first (when the AI is on)
 * before any non-gate action is taken — so a keyword inside a sentence can't steer the call.
 */
export function isBrief(text: string): boolean {
  const t = text.trim();
  const cjk = (t.match(/[一-鿿]/g) ?? []).length;
  if (cjk > 0) return cjk <= 6;
  return t.split(/\s+/).filter(Boolean).length <= 4;
}

/**
 * Answers to a decision only the person can make — confirming the medicine, the label,
 * consent to contact someone, the camera, sending. Decided by the fixed rules only (never by
 * the AI), so they act as soon as the rules recognise them, short or long.
 */
export function isGateAnswer(e: SessionEvent): boolean {
  switch (e.type) {
    case "CONFIRM_MATCH":
    case "LABEL_CHECK":
    case "HELP_CONFIRM":
    case "HELP_SEND":
    case "CAMERA_CONSENT":
    case "SET_LANGUAGE":
      return true;
    case "DOSE":
      return ["confirm-label", "reject-reading", "enter-label", "send", "dont-send", "accept-offer", "decline-offer"].includes(e.action.kind);
    default:
      return false;
  }
}

/** Controls available on every step, offered to the meaning-match alongside the step's own actions. */
export function callActions(ctx: Pick<CommandContext, "state" | "helpStage">): SpokenAction[] {
  const out: SpokenAction[] = [
    { id: "repeat", description: "hear the companion's last words again", event: { type: "REPEAT" } },
    { id: "end-call", description: "end the call", event: { type: "END_CALL" } },
  ];
  if (ctx.state !== "safety" && !ctx.helpStage) {
    out.push({ id: "get-help", description: "get help from a person (a pharmacist or family)", event: { type: "GET_HELP" } });
  }
  return out;
}
