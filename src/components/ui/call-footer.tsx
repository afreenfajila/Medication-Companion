import { ArrowUp, Mic, MicOff, PhoneOff } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The call's one control row, like an AI voice call: the message pill (type, then the send
 * arrow or Enter), the mic, and End call — one row at every width (the pill shrinks, the round
 * buttons don't), 12px apart, no dividers. Everything else is said or typed.
 *
 * Typed text goes through exactly the same path as speech, so any words that work aloud work
 * here. The mic is mute/unmute (`aria-pressed` = muted); while listening is paused it turns the
 * mic back on, and in push-to-talk it starts and sends a turn — its label always says which.
 * End call is the only solid control (red), and acts once.
 */
export function CallFooter({
  labels,
  onSend,
  muted,
  micDisabled = false,
  onMic,
  onEnd,
}: {
  labels: { group: string; message: string; placeholder: string; send: string; mic: string; end: string };
  /** A typed turn, handled like a spoken one. */
  onSend: (text: string) => void;
  muted: boolean;
  /** No speech input on this call (typing only): there is nothing to mute. */
  micDisabled?: boolean;
  onMic: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const ended = useRef(false);
  const round = "round-focus flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-colors";
  const typed = draft.trim() !== "";
  return (
    <nav aria-label={labels.group} className="flex items-center gap-3 px-4 pt-3">
      {/* One 2px ring on the pill while its text box has focus (keyboard or tap); the send arrow
          keeps its own focus ring, so there is never more than one at a time. */}
      <form
        className="flex h-14 min-w-0 flex-1 items-center rounded-pill border border-navy-700/30 bg-surface pl-5 pr-2 has-[input:focus]:ring-2 has-[input:focus]:ring-navy-900"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          onSend(text);
          setDraft("");
        }}
      >
        <input
          type="text"
          value={draft}
          maxLength={300}
          autoComplete="off"
          aria-label={labels.message}
          placeholder={labels.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          className="pill-input h-full min-w-0 flex-1 text-[17px] placeholder:text-navy-700/80"
        />
        <button
          type="submit"
          aria-label={labels.send}
          disabled={!typed}
          className={cn(
            "round-focus ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
            typed ? "bg-navy-900 text-white hover:bg-[#1f4368]" : "cursor-not-allowed bg-transparent text-navy-700/40",
          )}
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
      <button
        type="button"
        aria-label={labels.mic}
        aria-pressed={muted}
        disabled={micDisabled}
        onClick={onMic}
        className={cn(
          round,
          "border text-navy-900 disabled:cursor-not-allowed disabled:opacity-50",
          muted ? "border-teal-600/40 bg-teal-100 hover:bg-[#d7ebe9]" : "border-navy-700/30 bg-surface hover:bg-teal-100",
        )}
      >
        {muted ? <MicOff className="h-6 w-6" aria-hidden="true" /> : <Mic className="h-6 w-6" aria-hidden="true" />}
      </button>
      <button
        type="button"
        aria-label={labels.end}
        onClick={() => {
          if (ended.current) return;
          ended.current = true;
          onEnd();
        }}
        className={cn(round, "bg-danger-800 text-white hover:bg-[#7a322d]")}
      >
        <PhoneOff className="h-6 w-6" aria-hidden="true" />
      </button>
    </nav>
  );
}
