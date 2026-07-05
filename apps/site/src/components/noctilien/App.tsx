"use client";

import { useEffect, useMemo, useState } from "react";
import type { NoctilienData } from "@/lib/noctilien/types";
import { nearestStops } from "@/lib/noctilien/geo";
import { STRINGS, loadLang, saveLang, type Lang } from "@/lib/noctilien/i18n";
import { buildHash, parseHash, type MapView } from "@/lib/noctilien/urlState";
import LangToggle from "../LangToggle";
import NoctilienMap from "./NoctilienMap";
import SearchBox from "./SearchBox";
import NightToggle from "./NightToggle";
import NearestStops from "./NearestStops";
import Legend from "./Legend";

// Fetched, not bundled: keeps ~640 KB out of the JS the browser must parse
// before anything renders, and lets the data cache separately from code.
// Kicked off at module load so it runs while React hydrates.
const dataPromise: Promise<NoctilienData> | null =
  typeof window === "undefined"
    ? null
    : fetch("/noctilien.json").then((r) => {
        if (!r.ok) throw new Error(`noctilien.json: HTTP ${r.status}`);
        return r.json();
      });

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
  // read once per mount (module-level reads go stale across client navs)
  const [initial] = useState(() =>
    parseHash(typeof window === "undefined" ? "" : window.location.hash),
  );
  const [data, setData] = useState<NoctilienData | null>(null);
  const [dataError, setDataError] = useState(false);
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

  useEffect(() => {
    dataPromise?.then(setData).catch(() => setDataError(true));
  }, []);

  // Keep the URL shareable: it always reflects the current situation.
  useEffect(() => {
    const hash = buildHash({ view, night, line: selectedLine, target });
    window.history.replaceState(null, "", hash || window.location.pathname);
  }, [view, night, selectedLine, target]);

  const nearby = useMemo(
    () =>
      data && target ? nearestStops(data.stops, target.lat, target.lon) : [],
    [data, target],
  );
  const selectedLineColor = selectedLine
    ? (data?.routes.find((r) => r.name === selectedLine)?.color ?? "#3F2A7E")
    : null;

  const toggle = (key: keyof LayerToggles) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }));

  const switchLang = (next: Lang) => {
    setLang(next);
    saveLang(next);
  };

  // On small screens the panel is a bottom sheet, collapsed by default.
  const [sheetOpen, setSheetOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 640,
  );

  // Selecting a result must reveal the nearest-stops list on mobile.
  const selectTarget = (r: SearchResult | null) => {
    setTarget(r);
    if (r) setSheetOpen(true);
  };

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        selectTarget({
          label: t.myLocation,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      () => {},
      { timeout: 8000 },
    );
  };

  if (!data) {
    return (
      <div className="app-loading">
        <strong>Noctilien</strong>
        <span>
          {dataError
            ? "Impossible de charger les données / failed to load data"
            : "chargement de la carte… / loading map…"}
        </span>
      </div>
    );
  }

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

      <div className={`panel${sheetOpen ? "" : " collapsed"}`}>
        <a className="home-link" href="/">
          ← Paris Viz
        </a>
        <div className="panel-title-row">
          <h1>
            Noctilien <span className="panel-sub">{t.subtitle}</span>
          </h1>
          <LangToggle lang={lang} onChange={switchLang} />
          <button
            className="sheet-toggle"
            aria-label={t.sheetToggle}
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen((o) => !o)}
          >
            {sheetOpen ? "⌄" : "⌃"}
          </button>
        </div>
        <div className="search-row">
          <SearchBox onSelect={selectTarget} t={t} />
          <button className="locate-btn" title={t.locate} onClick={locate}>
            ◎
          </button>
        </div>

        <div className="sheet-hide">
          <p className="panel-hint">{t.hint}</p>

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
    </div>
  );
}
