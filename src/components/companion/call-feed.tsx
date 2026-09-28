import { useEffect, useRef } from "react";
import { TranscriptCard } from "@/components/ui/transcript-card";
import type { FeedMessage } from "./use-call-feed";
import type { T } from "./screen-chrome";

/**
 * The scrolling conversation transcript — the whole call happens on this one
 * page; this is what keeps everything said so far in view instead of it being
 * replaced by the next screen. Auto-scrolls to the newest message.
 */
export function CallFeed({
  entries,
  interim,
  thinking = false,
  t,
}: {
  entries: FeedMessage[];
  interim: string;
  /** The companion is working out a reply to what was just said. */
  thinking?: boolean;
  t: T;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // jsdom (tests) has no scrollIntoView implementation at all.
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [entries.length, interim, thinking]);

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <TranscriptCard
          key={entry.id}
          speaker={entry.speaker}
          label={entry.speaker === "user" ? t("youSay") : t("companionSays")}
        >
          {entry.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </TranscriptCard>
      ))}
      {thinking && (
        <TranscriptCard speaker="companion" label={t("companionSays")}>
          <span role="status" className="inline-flex items-center gap-1.5 py-2 text-navy-700">
            <span className="sr-only">{t("companionThinking")}</span>
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
