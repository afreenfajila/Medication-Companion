import Link from "next/link";
import type { CopyKey } from "@/lib/content/translations";
import { TrustBadge } from "@/components/ui/notices";

export type T = (key: CopyKey) => string;

/** App name + trust badge. Present on every primary-user state (design-standard §4). */
export function ScreenHeader({ t, control }: { t: T; control?: React.ReactNode }) {
  return (
    <header className="flex flex-col items-center gap-2 px-6 pb-2 pt-6 text-center">
      <p className="text-[17px] font-bold tracking-tight">{t("appName")}</p>
      <TrustBadge label={t("trustBadge")} />
      {control}
    </header>
  );
}

/** Persistent disclosure + link to /about (site-contract §15). */
export function DisclosureFooter({ t }: { t: T }) {
  return (
    <footer className="px-6 pb-3 pt-1.5 text-center text-[12px] leading-snug text-navy-700">
      <p className="font-medium">{t("aiDisclosure")}</p>
      <p>
        {t("prototypeNotice")} ·{" "}
        <Link href="/about" className="font-medium text-teal-800 underline underline-offset-2">
          {t("aboutLink")}
        </Link>
      </p>
    </footer>
  );
}

/** Short uppercase state label (the only sanctioned use of uppercase). */
export function StateLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] font-bold uppercase tracking-wide text-teal-800">{children}</p>
  );
}
