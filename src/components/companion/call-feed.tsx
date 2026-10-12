import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { TranscriptCard } from "@/components/ui/transcript-card";
import type { FeedMessage } from "./use-call-feed";
import type { T } from "./screen-chrome";

/** Within this many pixels of the end counts as "reading the latest". */
const NEAR_BOTTOM_PX = 48;

/**
 * The whole conversation of this call, oldest first, every turn in full — what
 * was heard and what the companion said — with nothing tucked behind a toggle.
 * It lives in the call's one scrolling area (`scrollerRef`); there is no inner
 * scroller. New turns are brought into view only while the person is already at
 * the bottom; if they have scrolled up to re-read, their place is kept and a
 * "Latest message" button takes them back down.
 *
 * Live (interim) words are marked as temporary and are replaced, not repeated,
 * when the final words arrive. Transcript content is static text: no buttons,
 * no focus targets.
 */
export function CallFeed({
  entries,
  interim,
  thinking = false,
  hideRecord = false,
  scrollerRef,
  onJumpToLatest,
  t,
}: {
  entries: FeedMessage[];
  interim: string;
  /** The companion is working out a reply to what was just said. */
  thinking?: boolean;
  /** Escalated: record content already shown stays out of view until they carry on. */
  hideRecord?: boolean;
  /** The call's scrolling area, which this feed sits in. */
  scrollerRef?: RefObject<HTMLElement | null>;
  /** Where focus goes after "Latest message" (the button itself then disappears). */
  onJumpToLatest?: () => void;
  t: T;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [scrolledUp, setScrolledUp] = useState(false);

  useEffect(() => {
    const el = scrollerRef?.current;
    if (!el) return;
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
      atBottom.current = near;
      setScrolledUp(!near);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollerRef]);

  useEffect(() => {
    // Never yank someone who is re-reading an earlier turn. (jsdom has no scrollIntoView.)
    if (atBottom.current) bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [entries.length, interim, thinking]);

  const jump = () => {
    atBottom.current = true;
    setScrolledUp(false);
    bottomRef.current?.scrollIntoView?.({ block: "end" });
    onJumpToLatest?.();
  };

  return (
    <div className="flex flex-col gap-3" data-transcript>
      {entries.map((entry) => (
        <TranscriptCard key={entry.id} speaker={entry.speaker} label={entry.speaker === "user" ? t("youSay") : t("companionSays")}>
          {hideRecord && entry.record ? (
            <p className="text-base font-normal italic text-navy-700">{t("recordHidden")}</p>
          ) : (
            entry.lines.map((line, i) => <p key={i}>{line}</p>)
          )}
        </TranscriptCard>
      ))}
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
        // Temporary: still being heard. Replaced by the final words, never added alongside them.
        <TranscriptCard speaker="user" label={t("hearingNow")} className="opacity-80" data-interim>
          <p className="italic">{interim}</p>
        </TranscriptCard>
      )}
      <div ref={bottomRef} />
      {scrolledUp && (
        <div className="sticky bottom-2 flex justify-center">
          <button
            type="button"
            onClick={jump}
            className="inline-flex min-h-12 items-center gap-2 rounded-pill bg-navy-900 px-4 text-[16px] font-bold text-white shadow-md"
          >
            <ArrowDown className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{t("latestMessage")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
