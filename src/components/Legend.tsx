"use client";

// Must mirror HEAT_GRADIENT in NoctilienMap.tsx.
const RAMP =
  "linear-gradient(to right, #160b39, #56106e, #a52c60, #e55c30, #f98e09, #fcffa4)";

export default function Legend() {
  return (
    <div className="legend">
      <div className="legend-bar" style={{ background: RAMP }} />
      <div className="legend-labels">
        <span>few buses / night</span>
        <span>many</span>
      </div>
    </div>
  );
}
