import type { CopyKey } from "@/lib/content/translations";
import { classifySafety } from "@/lib/safety/classify";
import { classifyOffTopic, isLowMood, type OffTopicKind } from "./off-topic";
import type {
  ContextualActionId,
  SafetyReason,
  UserIntent,
} from "@/types/content";

export type RoutedMessage = {
  intent: UserIntent;
  assistantKey: CopyKey;
  /** Temporary in-call choices. Never shown on the start state. */
  contextualActions: ContextualActionId[];
  /** Set when the message must leave the normal conversation path. */
  safetyReason?: SafetyReason;
  /** Only true when a confirmed record already authorises schedule content. */
  toExplain?: boolean;
  /** The person asked for a route outright ("I want to show the medicine"): act as if they chose it. */
  route?: "show-medicine" | "ask-schedule";
  /** Off-spine and wellbeing turns: the only thing the audit log records about them. */
  category?: OffTopicKind | "wellbeing";
};

const OFF_TOPIC_KEYS: Record<OffTopicKind, CopyKey> = {
  social: "offTopicSocial",
  world: "offTopicWorld",
  capability: "offTopicCapability",
};

const HELP_REQUEST =
  /(talk|speak) to (a |the |my )?(person|human|pharmacist|doctor|nurse|someone)|\bget help\b|need (a )?(person|human|pharmacist)|real person|联系药剂师|找人|人工/i;

// Saying it IS the choice: no second "please tap Show medicine" step.
const SHOW_MEDICINE_REQUEST =
  /(want|like|let me|going|ready|can i|could i|need) to (show|scan|check)\b|\bshow (you |me |it |this )?(to you|the|my|a)?\s*(medicine|medication|label|pill|pills|tablet|tablets|bottle|box)|\b(medicine|medication|pill|label) (label )?to (you|show)|\btake a (photo|picture) of (my|the|this)|\blook at (my|the|this) (medicine|label|pill)|显示药物|给你看|看药物标签|看标签/i;

const SCHEDULE_REQUEST =
  /\b(ask|check|tell|know|see)\b.*\bschedule\b|\b(my|the) (medicine |medication )?schedule\b|\bmedicine schedule\b|问.*服药时间|我的服药时间/i;

// "What are MY prescriptions/medicines" — asking what's on file, not identifying
// an unlabelled pill in hand. Checked BEFORE the (looser) UNKNOWN_MEDICINE
// pattern below, which would otherwise swallow it via its bare "what medicine".
const PRESCRIPTIONS_LIST =
  // "my medicine(s)/medication(s)" must be PLURAL to count as a list request —
  // "my medicine" (singular) is ambiguous with an ordinary schedule question
  // ("when do I take my medicine?") and must fall through to SCHEDULE instead.
  /\bmy (current )?(prescriptions?|medications|medicines)\b|\bwhat (medicines?|medications?|prescriptions?)\b[^?]*\b(do i have|am i (on|taking|prescribed))\b|\bwhat am i (taking|prescribed)\b|\b(list|show me) my (medicines?|medications?|prescriptions?)\b|我的处方|我在吃(什么|哪些)药|我有(什么|哪些)药|我的药物清单|我吃(什么|哪些)药/i;

// The record's medicine said (or typed, or spelled) correctly.
const RECORD_MEDICINE_NAME = /\bmetformin\b|二甲双胍/i;

// Ways speech recognition commonly mishears it ("met for pain", "met forming",
// "med for men"). These never count as the name: the companion asks whether
// that is what was meant. Like everything in this router, it only changes what
// the companion SAYS — nothing here selects, matches or confirms a medicine
// (the spoken-label matcher stays deliberately strict).
const RECORD_MEDICINE_SOUNDALIKE =
  /\bmet\s?-?form\w*|\b(met|med|meth)\s?(for|four|fore)\s?(min|mins|men|man|mean|main|mine|ming|pain)\b|\bmetphormin\w*|\bmedformin\w*/i;

// The person disagrees with what the record says (CLAUDE.md § Assignment 3, C).
// Only read while a confirmed record is being explained, and only AFTER the
// safety classifier: "my doctor said I can stop it" is a dose question first.
const RECORD_CONFLICT =
  /\bdoctor (said|told|says)\b|\bthat'?s not (right|what)\b|\bi thought (it was|i take)\b|\bnot the same as\b|医生(说|告诉)|不是这样|我以为/i;

export function isRecordConflict(text: string): boolean {
  return RECORD_CONFLICT.test(text.replace(/[’‘]/g, "'"));
}

// Answers to "Did you mean Metformin?" — only read on the turn right after it.
const NAME_CHECK_YES =
  /^\s*(yes|yeah|yep|yup|correct|right|that's (it|right)|that is (it|right)|exactly|i did|i do)\b|^\s*(是|对|没错)/i;
const NAME_CHECK_NO = /^\s*(no|nope|nah|not (that|quite|really)|wrong)\b|^\s*(不是|不对)/i;

/** "M E T F O R M I N" (spelled out, as speech recognition returns it) → "METFORMIN". */
function joinSpelledLetters(text: string): string {
  // Only lone letters join — the "s" of "it's" or the "a" of "a pill" never do.
  return text.replace(/(?<![\w'’])([a-z])[\s.-]+(?=[a-z](?![\w'’]))/gi, "$1");
}

/**
 * True when the record's medicine is named (or spelled, or a common mishearing).
 * The understanding guard uses this too: a reply may only name the medicine if
 * the person did first.
 */
export function mentionsRecordMedicine(text: string): boolean {
  return RECORD_MEDICINE_NAME.test(joinSpelledLetters(text)) || RECORD_MEDICINE_SOUNDALIKE.test(text);
}

// "I take it twice a day" — talking about taking a medicine without saying which.
// A statement only (anchored at the start), so "When do I take it?" stays a schedule question.
const VAGUE_TAKING =
  /^\s*(?:(?:yes|yeah|well|so|um|uh|ok|okay)[,\s]+)?(?:i|i've|i have|i'm|i am)\s+(?:take|took|taking|been taking|usually take)\b(?![^?]*\?)|^我(?:每天|平时|今天|一天)?(?:都|在)?(?:吃|服用)(?!.*[吗？?])/i;

// "I've got my medicine with me" — the person has something in hand to check.
const MEDICINE_IN_HAND =
  /\b(i('ve| have| do have)|i('ve)? got)\b.*\b(with me|in my hand|right here|here with)\b|\b(i'?m |i am )holding\b|\bin my hand\b|我手上|我手里|我带着|我拿着/i;

const UNKNOWN_MEDICINE =
  /what('?s| is| are) (this|that|it|these)\b|what medicine|which medicine|what.*\bfor\b|is this (my |the |a )?(medicine|pill|tablet)|这是什么|什么药|做什么用/i;

const SCHEDULE =
  /\b(when|what time|schedule|how often|how many times|timing|times a day|what do i (need to )?(take|do)|how (do|should) i take|take (it )?(now|today))\b|服药时间|什么时候|几点|多久|每天|怎么吃|我要做什么/i;

/**
 * Deterministic in-call routing (site-contract.md §4). Order matters:
 * safety → record conflict (explain only) → human help → off-spine talk → explicit route requests →
 * list-my-prescriptions → medicine named / misheard / in hand → unknown medicine →
 * schedule → broad/unclear.
 * "What is this for? When do I take it?" is an unknown-medicine question:
 * we cannot talk about timing until a medicine is identified.
 * "What are my prescriptions?" is different: it asks what's on file, not to
 * identify an unlabelled pill — it's answered by name (from the local record),
 * but still never with dosing details before a confirmed label match.
 */
export function routeMessage(
  text: string,
  ctx: {
    matchConfirmed: boolean;
    /** The companion just asked "did you mean <medicine>?" — a bare "yes"/"no" answers it. */
    nameCheckPending?: boolean;
    /** A confirmed record is on screen, so "that's not right" disputes it. */
    explaining?: boolean;
  },
): RoutedMessage {
  const safety = classifySafety(text);
  if (safety.level === "urgent") {
    return {
      intent: "urgent-risk",
      assistantKey: "urgentHeading",
      contextualActions: [],
      safetyReason: safety.reason,
    };
  }
  if (safety.level === "unsupported") {
    return {
      intent: "unsupported-medical-question",
      assistantKey: "safetyHeading",
      contextualActions: [],
      safetyReason: safety.reason,
    };
  }
  if (ctx.explaining && ctx.matchConfirmed && isRecordConflict(text)) {
    return { intent: "record-conflict", assistantKey: "recordConflict", contextualActions: [] };
  }
  if (HELP_REQUEST.test(text)) {
    return {
      intent: "get-help",
      assistantKey: "reasonHelp",
      contextualActions: [],
      safetyReason: "help-requested",
    };
  }
  // Answering "Did you mean Metformin?". A yes means the name was heard as
  // intended; a no means ask again. Anything else falls through and is
  // understood on its own (the person may simply say the name again).
  if (ctx.nameCheckPending && !ctx.matchConfirmed) {
    if (NAME_CHECK_NO.test(text)) {
      return { intent: "medicine-mentioned", assistantKey: "medicineNameRetry", contextualActions: ["show-medicine"] };
    }
    if (NAME_CHECK_YES.test(text)) {
      return { intent: "medicine-mentioned", assistantKey: "medicineMentioned", contextualActions: ["show-medicine"] };
    }
  }
  // Spine-based redirection. Deliberately AFTER every safety check above, so a
  // safety-classified message can never be answered with a friendly deflection,
  // and before the medicine patterns only because `classifyOffTopic` refuses to
  // fire on anything containing a medicine/label/dose term.
  if (isLowMood(text)) {
    return {
      intent: "wellbeing",
      assistantKey: "wellbeing",
      contextualActions: ["ask-family", "carry-on"],
      category: "wellbeing",
    };
  }
  const offTopic = classifyOffTopic(text);
  if (offTopic) {
    return {
      intent: "off-topic",
      category: offTopic,
      assistantKey: OFF_TOPIC_KEYS[offTopic],
      // Still offering the spine's two doors, exactly as the clarification does.
      contextualActions: ["show-medicine", "ask-schedule"],
    };
  }
  if (SHOW_MEDICINE_REQUEST.test(text)) {
    return {
      intent: "show-medicine",
      assistantKey: "cameraPermissionBody",
      contextualActions: [],
      route: "show-medicine",
    };
  }
  if (SCHEDULE_REQUEST.test(text)) {
    return {
      intent: "ask-schedule",
      assistantKey: "clarificationPrompt",
      contextualActions: [],
      route: "ask-schedule",
    };
  }
  if (PRESCRIPTIONS_LIST.test(text)) {
    return {
      intent: "list-prescriptions",
      assistantKey: "prescriptionsListed",
      contextualActions: ["show-medicine"],
    };
  }
  // Before a match is confirmed, naming the medicine (however garbled) gets an
  // answer that shows it was heard, instead of the generic two-way question.
  if (!ctx.matchConfirmed && RECORD_MEDICINE_NAME.test(joinSpelledLetters(text))) {
    return {
      intent: "medicine-mentioned",
      assistantKey: "medicineMentioned",
      contextualActions: ["show-medicine"],
    };
  }
  // Close, but not the name: check what was meant before assuming anything.
  if (!ctx.matchConfirmed && RECORD_MEDICINE_SOUNDALIKE.test(text)) {
    return {
      intent: "medicine-mentioned",
      assistantKey: "medicineNameCheck",
      contextualActions: ["show-medicine"],
    };
  }
  // A medicine is being talked about but not named: ask which one, never assume.
  if (!ctx.matchConfirmed && VAGUE_TAKING.test(text)) {
    return {
      intent: "unknown-medicine-question",
      assistantKey: "whichMedicine",
      contextualActions: ["show-medicine"],
    };
  }
  if (!ctx.matchConfirmed && MEDICINE_IN_HAND.test(text)) {
    return {
      intent: "unknown-medicine-question",
      assistantKey: "showLabelQuestion",
      contextualActions: ["show-medicine"],
    };
  }
  if (UNKNOWN_MEDICINE.test(text)) {
    return {
      intent: "unknown-medicine-question",
      assistantKey: "showLabelQuestion",
      contextualActions: ["show-medicine"],
    };
  }
  if (SCHEDULE.test(text)) {
    if (ctx.matchConfirmed) {
      return {
        intent: "schedule-question",
        assistantKey: "explainHowTo",
        contextualActions: [],
        toExplain: true,
      };
    }
    return {
      intent: "schedule-question",
      assistantKey: "clarificationPrompt",
      contextualActions: ["show-medicine", "ask-schedule"],
    };
  }
  // Unclear or random ("I don't know what to do", "banana"): say what the companion
  // can help with, then offer the same two doors — guidance, not a bare question.
  return {
    intent: "general",
    assistantKey: "capabilityGuide",
    contextualActions: ["show-medicine", "ask-schedule"],
  };
}
