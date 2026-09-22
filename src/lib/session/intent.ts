import type { CopyKey } from "@/lib/content/translations";
import { classifySafety } from "@/lib/safety/classify";
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
  route?: ContextualActionId;
};

const HELP_REQUEST =
  /(talk|speak) to (a |the |my )?(person|human|pharmacist|doctor|nurse|someone)|\bget help\b|need (a )?(person|human|pharmacist)|real person|联系药剂师|找人|人工/i;

// Saying it IS the choice: no second "please tap Show medicine" step.
const SHOW_MEDICINE_REQUEST =
  /(want|like|let me|going|ready|can i|could i|need) to (show|scan|check)\b|\bshow (you |me |it |this )?(to you|the|my|a)?\s*(medicine|medication|label|pill|pills|tablet|tablets|bottle|box)|\b(medicine|medication|pill|label) (label )?to (you|show)|\btake a (photo|picture) of (my|the|this)|\blook at (my|the|this) (medicine|label|pill)|显示药物|给你看|看药物标签|看标签/i;

const SCHEDULE_REQUEST =
  /\b(ask|check|tell|know|see)\b.*\bschedule\b|\b(my|the) (medicine |medication )?schedule\b|\bmedicine schedule\b|问.*服药时间|我的服药时间/i;

const UNKNOWN_MEDICINE =
  /what('?s| is| are) (this|that|it|these)\b|what medicine|which medicine|what.*\bfor\b|is this (my |the |a )?(medicine|pill|tablet)|这是什么|什么药|做什么用/i;

const SCHEDULE =
  /\b(when|what time|schedule|how often|how many times|timing|times a day|what do i (need to )?(take|do)|how (do|should) i take|take (it )?(now|today))\b|服药时间|什么时候|几点|多久|每天|怎么吃|我要做什么/i;

/**
 * Deterministic in-call routing (site-contract.md §4). Order matters:
 * safety → human help → unknown medicine → schedule → broad/unclear.
 * "What is this for? When do I take it?" is an unknown-medicine question:
 * we cannot talk about timing until a medicine is identified.
 */
export function routeMessage(
  text: string,
  ctx: { matchConfirmed: boolean },
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
  if (HELP_REQUEST.test(text)) {
    return {
      intent: "get-help",
      assistantKey: "reasonHelp",
      contextualActions: [],
      safetyReason: "help-requested",
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
  return {
    intent: "general",
    assistantKey: "clarificationPrompt",
    contextualActions: ["show-medicine", "ask-schedule"],
  };
}
