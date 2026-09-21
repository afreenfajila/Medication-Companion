import { Info, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Light-teal pill naming the demo record. The text itself states "demo record". */
export function TrustBadge({ label, className }: { label: string; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-pill bg-teal-100 px-3 py-1.5 text-[13px] font-medium leading-tight text-navy-900",
        className,
      )}
    >
      <ShieldCheck className="h-4 w-4 shrink-0 text-teal-800" aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}

/** Quiet disclosure/notice. Used for demo-only, prototype and fallback messages. */
export function DemoNotice({
  children,
  className,
  role,
}: {
  children: ReactNode;
  className?: string;
  role?: "status" | "note";
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-2.5 rounded-md border border-line bg-surface px-4 py-3 text-sm leading-snug text-navy-700",
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-800" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
