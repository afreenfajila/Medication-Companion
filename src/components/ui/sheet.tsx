"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Non-critical modal built on native <dialog>: focus is trapped while open,
 * Escape closes it, and focus returns to the opener. Where `showModal` is
 * missing (old browsers, jsdom) it opens non-modally, and Escape and focus
 * return are handled here too.
 */
export function Sheet({
  open,
  onClose,
  title,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else {
        dialog.setAttribute("open", "");
        dialog.querySelector<HTMLElement>("button, a, input")?.focus();
      }
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    if (!open && opener.current?.isConnected) {
      opener.current.focus();
      opener.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-[24px] font-bold leading-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-navy-900 hover:bg-teal-100"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
