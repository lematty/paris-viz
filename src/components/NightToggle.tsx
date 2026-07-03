"use client";

import type { NightType } from "./App";

export default function NightToggle({
  value,
  onChange,
}: {
  value: NightType;
  onChange: (v: NightType) => void;
}) {
  return (
    <div className="night-toggle" role="radiogroup" aria-label="Night type">
      {(
        [
          ["week", "Sun–Thu nights"],
          ["weekend", "Fri–Sat nights"],
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
