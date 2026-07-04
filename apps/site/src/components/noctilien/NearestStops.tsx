"use client";

import type { StopWithDistance } from "@/lib/noctilien/geo";
import type { Strings } from "@/lib/noctilien/i18n";
import type { NightType, SearchResult } from "./App";

const WALK_M_PER_MIN = 80;

export default function NearestStops({
  target,
  stops,
  night,
  onClear,
  onSelectLine,
  t,
}: {
  target: SearchResult;
  stops: StopWithDistance[];
  night: NightType;
  onClear: () => void;
  onSelectLine: (line: string) => void;
  t: Strings;
}) {
  return (
    <div className="nearest">
      <div className="nearest-header">
        <strong>{t.nearTitle(target.label)}</strong>
        <button onClick={onClear} aria-label={t.clearSearch}>
          ✕
        </button>
      </div>
      {stops.length === 0 ? (
        <p className="nearest-empty">{t.noStop}</p>
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
                    {Math.max(1, Math.round(s.distanceM / WALK_M_PER_MIN))}{" "}
                    {t.minWalk}
                  </span>
                </div>
                <div className="nearest-stat">
                  {s.lines.map((l, i) => (
                    <span key={l}>
                      {i > 0 && " · "}
                      <button
                        className="line-link"
                        title={t.highlightLine(l)}
                        onClick={() => onSelectLine(l)}
                      >
                        {l}
                      </button>
                    </span>
                  ))}{" "}
                  —{" "}
                  {stat.headway
                    ? t.busEvery(stat.headway)
                    : t.busesPerNight(stat.dep)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
