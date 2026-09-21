import { CircleAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Uncertainty/limit card. Meaning is carried by words + icon + surface, never
 * colour alone. Normal uncertainty is calm; urgent gets a stronger border and
 * an assertive live-region role.
 */
export function SafetyCard({
  label,
  heading,
  body,
  reason,
  urgent = false,
  children,
}: {
  label: string;
  heading: string;
  body: string;
  reason?: string | null;
  urgent?: boolean;
  children?: ReactNode;
}) {
  const Icon = urgent ? TriangleAlert : CircleAlert;
  return (
    <section
      role={urgent ? "alert" : "status"}
      aria-labelledby="safety-heading"
      className={cn(
        "fade-in rounded-lg bg-danger-100 p-5",
        urgent ? "border-2 border-danger-700" : "border border-danger-700/25",
      )}
    >
      <div className="flex items-center gap-2 text-[13px] font-bold text-danger-700">
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <h1 id="safety-heading" className="mt-2 text-[26px] font-bold leading-tight">
        {heading}
      </h1>
      {reason && <p className="mt-3 text-lg leading-snug">{reason}</p>}
      <p className="mt-3 text-lg leading-snug">{body}</p>
      {children}
    </section>
  );
}
