"use client";

import type { Strings } from "@/lib/noctilien/i18n";

// Must mirror HEAT_GRADIENT in NoctilienMap.tsx.
const RAMP =
  "linear-gradient(to right, #160b39, #56106e, #a52c60, #e55c30, #f98e09, #fcffa4)";

export default function Legend({ t }: { t: Strings }) {
  return (
    <div className="legend">
      <div className="legend-bar" style={{ background: RAMP }} />
      <div className="legend-labels">
        <span>{t.fewBuses}</span>
        <span>{t.many}</span>
      </div>
    </div>
  );
}
