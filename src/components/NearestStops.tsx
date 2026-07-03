"use client";

import type { StopWithDistance } from "@/lib/geo";
import type { NightType, SearchResult } from "./App";

const WALK_M_PER_MIN = 80;

export default function NearestStops({
  target,
  stops,
  night,
  onClear,
}: {
  target: SearchResult;
  stops: StopWithDistance[];
  night: NightType;
  onClear: () => void;
}) {
  return (
    <div className="nearest">
      <div className="nearest-header">
        <strong>Noctilien near “{target.label}”</strong>
        <button onClick={onClear} aria-label="Clear search result">
          ✕
        </button>
      </div>
      {stops.length === 0 ? (
        <p className="nearest-empty">
          No Noctilien stop within 1.5 km — this area is not covered by the
          night-bus network.
        </p>
      ) : (
        <ul>
          {stops.map((s) => {
            const stat = s[night];
            return (
              <li key={`${s.name}-${s.lat}`}>
                <div className="nearest-name">
                  {s.name}
                  <span className="nearest-dist">
                    {Math.round(s.distanceM)} m ·{" "}
                    {Math.max(1, Math.round(s.distanceM / WALK_M_PER_MIN))} min
                    walk
                  </span>
                </div>
                <div className="nearest-stat">
                  {s.lines.join(" · ")} —{" "}
                  {stat.headway
                    ? `a bus every ~${stat.headway} min`
                    : `${stat.dep} bus${stat.dep >= 2 ? "es" : ""}/night`}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
