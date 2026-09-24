/**
 * Spine-based redirection (see docs/decisions.md).
 *
 * The companion has one "spine": helping Mei Ling understand the medicine
 * information in her demo pharmacy record. People will still say things that
 * sit off that spine — a greeting, the weather, "can you ring my daughter?".
 * A flat "I cannot help with that" is jarring and, for an older adult who is
 * unsure whether the thing is working at all, reads as rejection.
 *
 * So off-spine input is ACKNOWLEDGED, then walked back to the spine. This is a
 * conversational-scope device only. It is deliberately NOT used for anything
 * the safety classifier catches: urgent-risk and unsupported medical questions
 * must keep their plain, unambiguous escalation (CLAUDE.md §"Absolute safety
 * constraints" 1, 6). Warmth there would soften a message that must not be
 * softened. `routeMessage` therefore runs `classifySafety` FIRST and only ever
 * consults this module afterwards.
 *
 * Classification is deterministic and local — no model is asked, and the reply
 * is a fixed approved line from the copy catalogue, so an off-topic turn can
 * never become a route to invented content.
 */

/**
 * Anything naming a medicine, a label, or a dose belongs to the product's real
 * subject matter and is never treated as off-topic, whatever else the sentence
 * contains. This guard runs first so that a loose social/world pattern can
 * never swallow a genuine medicine question ("is this the pill I saw on TV?").
 */
const MEDICINE_TERM =
  /\b(medicine|medication|pill|pills|tablet|tablets|capsule|capsules|label|dose|dosage|prescription|prescriptions|pharmacy|pharmacist|metformin|mg)\b|药|剂量|标签|处方|药房/i;

/** Asking the app to act in the world: it cannot, and must not imply it can. */
const CAPABILITY_REQUEST =
  /\b(call|phone|ring|text|message|email)\b.{0,20}\b(my|her|his|their|the)\b|\b(book|make|schedule)\b.{0,15}\bappointment\b|\border\b.{0,15}\b(refill|repeat|delivery)\b|\brefill\b|\brenew\b|\bdeliver(y|ed)?\b|\bbuy\b|\bpay\b|打电话|预约|挂号|续药|配药|订购|送药|付款/i;

/** General-knowledge and entertainment chat: outside what this companion knows. */
const WORLD_TOPIC =
  /\bweather\b|\brain(ing)?\b|\bsunny\b|\bnews\b|\bheadlines?\b|\bfootball\b|\bsoccer\b|\bcricket\b|\bbasketball\b|\bsports?\b|\bmovie\b|\bfilm\b|\btv\b|\btelevision\b|\bmusic\b|\bsongs?\b|\brecipes?\b|\bcooking\b|\bjokes?\b|\bvideo ?games?\b|\bpolitics\b|\belections?\b|\bfootie\b|天气|下雨|新闻|足球|篮球|体育|电影|电视|音乐|歌曲|菜谱|做饭|笑话|游戏|政治|选举/i;

/** Greetings, pleasantries, and questions about the companion itself. */
const SOCIAL_TALK =
  /^\s*(hi|hello|hey|good (morning|afternoon|evening|day))\b|\bhow are you\b|\bwhat'?s your name\b|\bwho are you\b|\bare you (a |an )?(robot|real|human|person|ai|computer)\b|\bdo you (like|have|sleep|eat|dream)\b|\bthank(s| you)\b|\bmy (daughter|son|grandson|granddaughter|grandchild|husband|wife|neighbou?r|cat|dog)\b|\bbirthday\b|^\s*(你好|您好|早上好|下午好|晚上好)|你叫什么|你是谁|你是机器人|谢谢|我的(女儿|儿子|孙子|孙女|丈夫|妻子)|生日/i;

export type OffTopicKind = "capability" | "world" | "social";

/**
 * Returns the kind of off-spine talk this is, or `null` when the message should
 * continue down the normal medicine-routing path.
 *
 * Note what is deliberately absent: feeling and symptom words ("I feel tired",
 * "I'm dizzy"). Those are never routed here — a chatty redirect is the wrong
 * response to something that might be a symptom, so they fall through to the
 * ordinary clarification path and stay eligible for the safety classifier.
 */
export function classifyOffTopic(text: string): OffTopicKind | null {
  const input = text.trim();
  if (input.length === 0) return null;
  if (MEDICINE_TERM.test(input)) return null;
  if (CAPABILITY_REQUEST.test(input)) return "capability";
  if (WORLD_TOPIC.test(input)) return "world";
  if (SOCIAL_TALK.test(input)) return "social";
  return null;
}
