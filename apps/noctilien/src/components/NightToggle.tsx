"use client";

import type { Strings } from "@/lib/i18n";
import type { NightType } from "./App";

export default function NightToggle({
  value,
  onChange,
  t,
}: {
  value: NightType;
  onChange: (v: NightType) => void;
  t: Strings;
}) {
  return (
    <div className="night-toggle" role="radiogroup" aria-label={t.nightAria}>
      {(
        [
          ["week", t.weekNights],
          ["weekend", t.weekendNights],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          role="radio"
          aria-checked={value === key}
          className={value === key ? "active" : ""}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
