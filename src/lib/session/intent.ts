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
};

const HELP_REQUEST =
  /(talk|speak) to (a |the |my )?(person|human|pharmacist|doctor|nurse|someone)|\bget help\b|need (a )?(person|human|pharmacist)|real person|联系药剂师|找人|人工/i;

const UNKNOWN_MEDICINE =
  /what('?s| is| are) (this|that|it|these)\b|what medicine|which medicine|what.*\bfor\b|is this (my |the |a )?(medicine|pill|tablet)|这是什么|什么药|做什么用/i;

const SCHEDULE =
  /\b(when|what time|schedule|how often|how many times|timing|times a day|what do i take|take (it )?(now|today))\b|服药时间|什么时候|几点|多久|每天/i;

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
