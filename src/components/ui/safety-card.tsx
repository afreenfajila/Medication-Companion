import { LifeBuoy, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Uncertainty/limit card. Meaning is carried by words + icon + surface, never
 * colour alone. Normal uncertainty is calm (teal); urgent is the only red one,
 * with a stronger border and an assertive live-region role.
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
  // Only urgent risk looks like an alarm. Every other "let's check with a person"
  // moment (a blurry label, a question for the pharmacist) gets a calm teal surface,
  // so the gentle wording isn't contradicted by a red card.
  const Icon = urgent ? TriangleAlert : LifeBuoy;
  return (
    <section
      role={urgent ? "alert" : "status"}
      aria-labelledby="safety-heading"
      className={cn(
        "fade-in rounded-lg p-5",
        urgent ? "border-2 border-danger-700 bg-danger-100" : "border border-teal-600/30 bg-teal-100",
      )}
    >
      <div className={cn("flex items-center gap-2 text-[13px] font-bold", urgent ? "text-danger-800" : "text-teal-800")}>
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <h2 id="safety-heading" className="mt-2 text-[22px] font-bold leading-tight">
        {heading}
      </h2>
      {reason && <p className="mt-3 text-lg leading-snug">{reason}</p>}
      <p className="mt-3 text-lg leading-snug">{body}</p>
      {children}
    </section>
  );
}
