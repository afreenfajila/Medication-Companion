import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { StatusChip } from "@/components/ui/status-chip";
import { TranscriptCard } from "@/components/ui/transcript-card";
import type { FeedMessage } from "./use-call-feed";
import type { T } from "./screen-chrome";

/** Within this many pixels of the end counts as "reading the latest". */
const NEAR_BOTTOM_PX = 48;

/**
 * Tracks whether the person is at the bottom of the call's one scrolling area. Live words,
 * "thinking" and status changes follow only while they are; a NEW message is always brought
 * into view (there is no "Latest message" button to get back down).
 */
export function useFollowLatest(scrollerRef: RefObject<HTMLElement | null>) {
  const atBottom = useRef(true);
  /**
   * The view was placed at the start of a new summary by the call itself, and the reader hasn't
   * scrolled since. The call is still "following" (her next turn brings the conversation on), but
   * live words, status and playback don't move the view off what she is reading.
   */
  const placed = useRef(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
      if (!placed.current) atBottom.current = near; // our own placement isn't her leaving the bottom
    };
    // Her own scrolling (touch, wheel, keys) ends the placement: from then on, her position rules.
    const onReader = () => {
      placed.current = false;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    for (const type of ["wheel", "touchstart", "keydown"] as const) el.addEventListener(type, onReader, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      for (const type of ["wheel", "touchstart", "keydown"] as const) el.removeEventListener(type, onReader);
    };
  }, [scrollerRef]);

  return { atBottom, placed };
}

/**
 * The whole conversation of this call, oldest first, every turn in full — what
 * was heard and what the companion said — with nothing tucked behind a toggle.
 * It lives in the call's one scrolling area; there is no inner scroller. New
 * turns are brought into view only while the person is already at the bottom
 * (`atBottom`, from `useFollowLatest`).
 *
 * Consecutive messages from the same speaker share one label. Structured content
 * (a comparison, a request to check) sits inside its message with short headings
 * and subtle dividers. Live (interim) words are marked as temporary and are
 * replaced, not repeated, when the final words arrive. Transcript content is
 * static text; the one exception is Take photo / Upload (`labelActions`), drawn
 * inside the newest message that offers them, only while they apply.
 */
export function CallFeed({
  entries,
  interim,
  thinking = false,
  hideRecord = false,
  atBottom,
  placedRef,
  labelActions = null,
  t,
}: {
  entries: FeedMessage[];
  interim: string;
  /** The companion is working out a reply to what was just said. */
  thinking?: boolean;
  /** Escalated: record content already shown stays out of view until they carry on. */
  hideRecord?: boolean;
  /** Whether the reader is at the bottom of the scroller (see `useFollowLatest`). */
  atBottom?: RefObject<boolean>;
  /** Set while the view sits where the call placed it (see `useFollowLatest`). */
  placedRef?: RefObject<boolean>;
  /** Take photo / Upload, while a photo can be taken; null once it can't. */
  labelActions?: ReactNode;
  t: T;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const last = entries.at(-1);
    const isNew = last?.id !== lastId.current;
    lastId.current = last?.id;
    // A new message always comes into view; otherwise someone re-reading an earlier turn
    // keeps their place. (jsdom has no scrollIntoView.)
    if (!isNew && !(atBottom?.current ?? true)) return;
    // A new summary to check (or comparison) opens at its first line, not its last.
    const start = isNew && last?.sections?.length ? listRef.current?.querySelector<HTMLElement>(`[data-entry="${last.id}"]`) : null;
    if (start?.scrollIntoView) {
      start.scrollIntoView({ block: "start" });
      if (placedRef) placedRef.current = true;
      return;
    }
    // Reading the placed summary: live words, "thinking" and status changes don't move it.
    if (placedRef?.current && !isNew) return;
    if (placedRef) placedRef.current = false;
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [entries, interim, thinking, atBottom, placedRef]);

  const labelFor = (speaker: FeedMessage["speaker"]) => (speaker === "user" ? t("youSay") : t("companionSays"));
  const last = entries.at(-1);
  const offerId = labelActions ? entries.findLast((e) => e.labelActions)?.id : undefined;

  return (
    <div ref={listRef} className="flex flex-col gap-3" data-transcript>
      {entries.map((entry, i) => (
        <TranscriptCard
          key={entry.id}
          entryId={entry.id}
          urgent={entry.tone === "urgent"}
          speaker={entry.speaker}
          label={entries[i - 1]?.speaker === entry.speaker ? undefined : labelFor(entry.speaker)}
        >
          {hideRecord && entry.record ? (
            <p className="text-base font-normal italic text-navy-700">{t("recordHidden")}</p>
          ) : (
            <>
              {entry.lines.map((line, j) => (
                <p key={j}>{line}</p>
              ))}
              {entry.sections && entry.sections.length > 0 && (
                <div data-sections className="mt-1 divide-y divide-line border-y border-line text-[17px] font-normal leading-snug">
                  {entry.sections.map((s, j) => (
                    <div key={j} className="py-2">
                      {s.heading && <p className="text-[14px] font-bold uppercase tracking-wide text-teal-800">{s.heading}</p>}
                      <p className="font-medium">{s.text}</p>
                      {s.note && <p className="text-[15px] text-navy-700">{s.note}</p>}
                    </div>
                  ))}
                </div>
              )}
              {entry.id === offerId && labelActions}
              {entry.chips && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.chips.map((c) => (
                    <StatusChip key={c.key} label={t(c.key)} tone={c.tone} />
                  ))}
                </div>
              )}
            </>
          )}
        </TranscriptCard>
      ))}
      {thinking && (
        <TranscriptCard speaker="companion" label={last?.speaker === "companion" ? undefined : t("companionSays")}>
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
    </div>
  );
}
