"use client";

import { useMemo, useState } from "react";
import type { NoctilienData } from "@/lib/types";
import { nearestStops } from "@/lib/geo";
import rawData from "@/data/noctilien.json";
import NoctilienMap from "./NoctilienMap";
import SearchBox from "./SearchBox";
import NightToggle from "./NightToggle";
import NearestStops from "./NearestStops";
import Legend from "./Legend";

const data = rawData as unknown as NoctilienData;

export type NightType = "week" | "weekend";

export interface SearchResult {
  label: string;
  lat: number;
  lon: number;
}

export interface LayerToggles {
  heat: boolean;
  stops: boolean;
  routes: boolean;
}

export default function App() {
  const [night, setNight] = useState<NightType>("week");
  const [layers, setLayers] = useState<LayerToggles>({
    heat: true,
    stops: true,
    routes: false,
  });
  const [target, setTarget] = useState<SearchResult | null>(null);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);

  const nearby = useMemo(
    () => (target ? nearestStops(data.stops, target.lat, target.lon) : []),
    [target],
  );
  const selectedLineColor = selectedLine
    ? (data.routes.find((r) => r.name === selectedLine)?.color ?? "#3F2A7E")
    : null;

  const toggle = (key: keyof LayerToggles) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }));

  return (
    <div className="app">
      <NoctilienMap
        data={data}
        night={night}
        layers={layers}
        target={target}
        selectedLine={selectedLine}
        onSelectLine={setSelectedLine}
      />

      <div className="panel">
        <h1>
          Noctilien <span className="panel-sub">night-bus frequency</span>
        </h1>
        <p className="panel-hint">
          How often a night bus (~00:30–05:30) passes near each point of
          Île-de-France. Bright = frequent service; dark = long waits or no
          coverage.
        </p>

        <SearchBox onSelect={setTarget} />

        <NightToggle value={night} onChange={setNight} />

        <div className="layer-toggles">
          {(
            [
              ["heat", "Heatmap"],
              ["stops", "Stops"],
              ["routes", "Lines"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={() => toggle(key)}
              />
              {label}
            </label>
          ))}
        </div>

        <Legend />

        {selectedLine && (
          <div className="line-chip">
            <span
              className="line-badge"
              style={{ background: selectedLineColor ?? undefined }}
            >
              {selectedLine}
            </span>
            <span>line highlighted</span>
            <button
              onClick={() => setSelectedLine(null)}
              aria-label="Clear line highlight"
            >
              ✕
            </button>
          </div>
        )}

        {target && (
          <NearestStops
            target={target}
            stops={nearby}
            night={night}
            onClear={() => setTarget(null)}
            onSelectLine={(line) =>
              setSelectedLine(line === selectedLine ? null : line)
            }
          />
        )}

        <p className="panel-footer">
          Schedules: Île-de-France Mobilités open data,{" "}
          {data.feedWindow.start} → {data.feedWindow.end} · Geocoding:
          adresse.data.gouv.fr
        </p>
      </div>
    </div>
  );
}
