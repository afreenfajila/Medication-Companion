import Link from "next/link";
import { formatVerifiedDate } from "@/lib/content/explanation";
import { recordSource } from "@/lib/content/seed-record";
import type { CopyKey } from "@/lib/content/translations";
import type { UiLanguage } from "@/types/content";
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
  return (
    <header className={compact ? "flex flex-row flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 pb-1 pt-2 text-center" : "flex flex-col items-center gap-2 px-6 pb-2 pt-6 text-center"}>
      <p className="text-[17px] font-bold tracking-tight">{t("appName")}</p>
      {compact ? (
        <TrustBadge plain label={t("recordFictional").replace("{name}", recordSource.name)} />
      ) : (
        // The date comes from the record.
        <TrustBadge label={t("trustBadge").replace("{verifiedDate}", formatVerifiedDate(language))} />
      )}
      {control}
    </header>
  );
}

/**
 * Persistent disclosure + link to /about (site-contract §15). During a call the
 * words stay on screen and the link moves into the Get help sheet, so the call
 * keeps exactly three persistent controls.
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
