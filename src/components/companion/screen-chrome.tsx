import Link from "next/link";
import { formatVerifiedDate } from "@/lib/content/explanation";
import { recordSource } from "@/lib/content/seed-record";
import type { CopyKey } from "@/lib/content/translations";
import type { UiLanguage } from "@/types/content";
import { Info } from "lucide-react";
import { TrustBadge } from "@/components/ui/notices";

export type T = (key: CopyKey) => string;

/**
 * App name + the record's provenance. Present on every primary-user state (design-standard §4).
 * Before a call: "Plan checked by BrightCare Pharmacy · <date>". In a call (`compact`): the
 * short demo-record label only — the full source and date are in the record's own messages,
 * so the header never reads as a pharmacist having checked what is being said.
 */
export function ScreenHeader({
  t,
  language,
  control,
  compact = false,
}: {
  t: T;
  language: UiLanguage;
  control?: React.ReactNode;
  /** In a call: tighter, so the conversation keeps the screen. */
  compact?: boolean;
}) {
  if (compact) {
    // In a call: the name centred on top; under it, the record label (one quiet line) with Help
    // on the same row. The label never wraps; only on very narrow screens does it end in "…".
    return (
      // On phones the fixed prototype badge sits at the very top, so the title starts below it.
      // Below 380px the gutters and the label tighten a little, so it still fits on one line at 360px.
      <header className="flex flex-col gap-1 border-b border-line px-4 pb-2 pt-7 max-[379px]:px-3 md:pt-2">
        <p className="truncate text-center text-[17px] font-bold tracking-tight">{t("appName")}</p>
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[14px] text-navy-700 max-[379px]:gap-1 max-[379px]:text-[13px]">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 overflow-hidden text-ellipsis">{t("recordFictional").replace("{name}", recordSource.name)}</span>
          </p>
          {control}
        </div>
      </header>
    );
  }
  return (
    <header className="flex flex-col items-center gap-2 px-6 pb-2 pt-6 text-center">
      <p className="text-[17px] font-bold tracking-tight">{t("appName")}</p>
      {/* The date comes from the record. */}
      <TrustBadge label={t("trustBadge").replace("{verifiedDate}", formatVerifiedDate(language))} />
      {control}
    </header>
  );
}

/**
 * Persistent disclosure + link to /about (site-contract §15). During a call the words stay,
 * small and centred under the control row; the link is on the start screen only, so the call
 * keeps just its own controls.
 */
export function DisclosureFooter({ t, inCall = false }: { t: T; inCall?: boolean }) {
  return (
    <footer className="px-6 pb-3 pt-1.5 text-center text-[12px] leading-snug text-navy-700">
      <p className="font-medium">{t("aiDisclosure")}</p>
      <p>
        {t("prototypeNotice")}
        {!inCall && (
          <>
            {" "}·{" "}
            <AboutLink t={t} className="-my-3 inline-block py-3" />
          </>
        )}
      </p>
    </footer>
  );
}

export function AboutLink({ t, className }: { t: T; className?: string }) {
  return (
    <Link href="/about" className={`font-medium text-teal-800 underline underline-offset-2 ${className ?? ""}`}>
      {t("aboutLink")}
    </Link>
  );
}

/** Short uppercase state label (the only sanctioned use of uppercase). */
export function StateLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] font-bold uppercase tracking-wide text-teal-800">{children}</p>
  );
}
