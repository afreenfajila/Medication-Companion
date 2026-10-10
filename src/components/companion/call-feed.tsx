import { useEffect, useRef } from "react";
import { TranscriptCard } from "@/components/ui/transcript-card";
import type { FeedMessage } from "./use-call-feed";
import type { T } from "./screen-chrome";

/**
 * The conversation, as design-standard §10 asks: the person's latest response
 * and the companion's current message stay in view; everything earlier is
 * optional history behind "Earlier in this call" (a native <details>), so the
 * transcript never dominates the call. Auto-scrolls to the newest message.
 */
export function CallFeed({
  entries,
  interim,
  thinking = false,
  hideRecord = false,
  t,
}: {
  entries: FeedMessage[];
  interim: string;
  /** The companion is working out a reply to what was just said. */
  thinking?: boolean;
  /** Escalated: record content already shown stays out of view until they carry on. */
  hideRecord?: boolean;
  t: T;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // jsdom (tests) has no scrollIntoView implementation at all.
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [entries.length, interim, thinking]);

  const card = (entry: FeedMessage) => (
    <TranscriptCard
      key={entry.id}
      speaker={entry.speaker}
      label={entry.speaker === "user" ? t("youSay") : t("companionSays")}
    >
      {hideRecord && entry.record ? (
        <p className="text-base font-normal italic text-navy-700">{t("recordHidden")}</p>
      ) : (
        entry.lines.map((line, i) => <p key={i}>{line}</p>)
      )}
    </TranscriptCard>
  );
  const lastCompanion = entries.findLastIndex((e) => e.speaker === "companion");
  const lastUser = entries.findLastIndex((e) => e.speaker === "user");
  const isCurrent = (i: number) => i === lastCompanion || i === lastUser;
  const earlier = entries.filter((_, i) => !isCurrent(i));

  return (
    <div className="flex flex-col gap-3">
      {earlier.length > 0 && (
        <details className="rounded-lg border border-line bg-surface px-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-base font-medium text-navy-700">
            {t("earlierInCall")} ({earlier.length})
          </summary>
          <div className="flex flex-col gap-3 pb-3">{earlier.map(card)}</div>
        </details>
      )}
      {entries.filter((_, i) => isCurrent(i)).map(card)}
      {thinking && (
        <TranscriptCard speaker="companion" label={t("companionSays")}>
          <span role="status" className="inline-flex items-center gap-1.5 py-2 text-navy-700">
            {/* Words, not just dots: every state says what is happening. Kept first so the
                dots' nth-child stagger in globals.css still lines up. */}
            <span className="text-lg">{t("companionThinking")}</span>
            <span className="call-dot" aria-hidden="true" />
            <span className="call-dot" aria-hidden="true" />
            <span className="call-dot" aria-hidden="true" />
          </span>
        </TranscriptCard>
      )}
      {interim && (
        <TranscriptCard speaker="user" label={t("youSay")}>
          {interim}
        </TranscriptCard>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
