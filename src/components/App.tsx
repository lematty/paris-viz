"use client";

import { useEffect, useMemo, useState } from "react";
import type { NoctilienData } from "@/lib/types";
import { nearestStops } from "@/lib/geo";
import { STRINGS, loadLang, saveLang, type Lang } from "@/lib/i18n";
import { buildHash, parseHash, type MapView } from "@/lib/urlState";
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

// Read once at module load (the app is client-only) so first render can
// restore a shared link.
const initial = parseHash(
  typeof window === "undefined" ? "" : window.location.hash,
);

export default function App() {
  const [lang, setLang] = useState<Lang>(loadLang);
  const [night, setNight] = useState<NightType>(initial.night);
  const [layers, setLayers] = useState<LayerToggles>({
    heat: true,
    stops: true,
    routes: initial.line !== null,
  });
  const [target, setTarget] = useState<SearchResult | null>(initial.target);
  const [selectedLine, setSelectedLine] = useState<string | null>(initial.line);
  const [view, setView] = useState<MapView | null>(initial.view);

  const t = STRINGS[lang];

  // Keep the URL shareable: it always reflects the current situation.
  useEffect(() => {
    const hash = buildHash({ view, night, line: selectedLine, target });
    window.history.replaceState(null, "", hash || window.location.pathname);
  }, [view, night, selectedLine, target]);

  const nearby = useMemo(
    () => (target ? nearestStops(data.stops, target.lat, target.lon) : []),
    [target],
  );
  const selectedLineColor = selectedLine
    ? (data.routes.find((r) => r.name === selectedLine)?.color ?? "#3F2A7E")
    : null;

  const toggle = (key: keyof LayerToggles) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }));

  const switchLang = (next: Lang) => {
    setLang(next);
    saveLang(next);
  };

  return (
    <div className="app">
      <NoctilienMap
        data={data}
        night={night}
        layers={layers}
        target={target}
        selectedLine={selectedLine}
        onSelectLine={setSelectedLine}
        lang={lang}
        initialView={initial.view}
        skipInitialFly={initial.view !== null}
        onViewChange={setView}
      />

      <div className="panel">
        <div className="panel-title-row">
          <h1>
            Noctilien <span className="panel-sub">{t.subtitle}</span>
          </h1>
          <div className="lang-toggle" role="radiogroup" aria-label="Language">
            {(["fr", "en"] as const).map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={lang === l}
                className={lang === l ? "active" : ""}
                onClick={() => switchLang(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <p className="panel-hint">{t.hint}</p>

        <SearchBox onSelect={setTarget} t={t} />

        <NightToggle value={night} onChange={setNight} t={t} />

        <div className="layer-toggles">
          {(
            [
              ["heat", t.heatmap],
              ["stops", t.stops],
              ["routes", t.lines],
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

        <Legend t={t} />

        {selectedLine && (
          <div className="line-chip">
            <span
              className="line-badge"
              style={{ background: selectedLineColor ?? undefined }}
            >
              {selectedLine}
            </span>
            <span>{t.lineHighlighted}</span>
            <button
              onClick={() => setSelectedLine(null)}
              aria-label={t.clearLine}
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
            t={t}
          />
        )}

        <p className="panel-footer">
          {t.footer(data.feedWindow.start, data.feedWindow.end)}
        </p>
      </div>
    </div>
  );
}
