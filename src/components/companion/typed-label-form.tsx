"use client";

import { useId, useState } from "react";
import { SecondaryButton } from "@/components/ui/buttons";
import { parseTypedLabel } from "@/lib/label/typed-label";
import type { LabelInput } from "@/types/content";
import type { T } from "./screen-chrome";

const inputClass =
  "min-h-14 w-full rounded-md border border-navy-700/30 bg-surface px-4 text-lg placeholder:text-navy-700/70";

/** Typed-label fallback. Validated with Zod; matched deterministically like every other input. */
export function TypedLabelForm({ t, onSubmit }: { t: T; onSubmit: (input: LabelInput) => void }) {
  const [medicineName, setMedicineName] = useState("");
  const [strength, setStrength] = useState("");
  const [patientName, setPatientName] = useState("");
  const [invalid, setInvalid] = useState(false);
  const ids = { med: useId(), str: useId(), pat: useId(), err: useId() };

  return (
    <form
      className="fade-in flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const result = parseTypedLabel({ medicineName, strength, patientName });
        if (!result.ok) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        onSubmit(result.input);
      }}
    >
      <h2 className="text-[20px] font-bold leading-tight">{t("typedHeading")}</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor={ids.med} className="text-sm font-bold text-navy-700">
          {t("fieldMedicineName")}
        </label>
        <input
          id={ids.med}
          className={inputClass}
          value={medicineName}
          maxLength={80}
          autoComplete="off"
          aria-invalid={invalid && medicineName.trim() === ""}
          aria-describedby={invalid ? ids.err : undefined}
          onChange={(e) => setMedicineName(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={ids.str} className="text-sm font-bold text-navy-700">
          {t("fieldStrengthInput")}
        </label>
        <input
          id={ids.str}
          className={inputClass}
          value={strength}
          maxLength={20}
          autoComplete="off"
          aria-invalid={invalid && strength.trim() === ""}
          aria-describedby={invalid ? ids.err : undefined}
          onChange={(e) => setStrength(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={ids.pat} className="text-sm font-bold text-navy-700">
          {t("fieldPatientOptional")}
        </label>
        <input
          id={ids.pat}
          className={inputClass}
          value={patientName}
          maxLength={80}
          autoComplete="off"
          onChange={(e) => setPatientName(e.target.value)}
        />
      </div>

      {invalid && (
        <p id={ids.err} role="alert" className="text-base font-medium text-danger-800">
          {t("typedRequired")}
        </p>
      )}

      <SecondaryButton type="submit">{t("typedSubmit")}</SecondaryButton>
    </form>
  );
}
