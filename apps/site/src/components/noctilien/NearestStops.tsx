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
  strings,
}: {
  target: SearchResult;
  stops: StopWithDistance[];
  night: NightType;
  onClear: () => void;
  onSelectLine: (line: string) => void;
  strings: Strings;
}) {
  return (
    <div className="nearest">
      <div className="nearest-header">
        <strong>{strings.nearTitle(target.label)}</strong>
        <button onClick={onClear} aria-label={strings.clearSearch}>
          ✕
        </button>
      </div>
      {stops.length === 0 ? (
        <p className="nearest-empty">{strings.noStop}</p>
      ) : (
        <ul>
          {stops.map((stop) => {
            const stats = stop[night];
            return (
              <li key={`${stop.name}-${stop.lat}`}>
                <div className="nearest-name">
                  {stop.name}
                  <span className="nearest-dist">
                    {Math.round(stop.distanceM)} m ·{" "}
                    {Math.max(1, Math.round(stop.distanceM / WALK_M_PER_MIN))}{" "}
                    {strings.minWalk}
                  </span>
                </div>
                <div className="nearest-stat">
                  {stop.lines.map((line, i) => (
                    <span key={line}>
                      {i > 0 && " · "}
                      <button
                        className="line-link"
                        title={strings.highlightLine(line)}
                        onClick={() => onSelectLine(line)}
                      >
                        {line}
                      </button>
                    </span>
                  ))}{" "}
                  -{" "}
                  {stats.headway
                    ? strings.busEvery(stats.headway)
                    : strings.busesPerNight(stats.dep)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
