"use client";

import type { Strings } from "@/lib/noctilien/i18n";
import type { NightType } from "./App";

export default function NightToggle({
  value,
  onChange,
  strings,
}: {
  value: NightType;
  onChange: (night: NightType) => void;
  strings: Strings;
}) {
  return (
    <div className="night-toggle" role="radiogroup" aria-label={strings.nightAria}>
      {(
        [
          ["week", strings.weekNights],
          ["weekend", strings.weekendNights],
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
