"use client";

import { useEffect, useMemo, useState } from "react";
import type { NoctilienData } from "@/lib/noctilien/types";
import { nearestStops } from "@/lib/noctilien/geo";
import { STRINGS, loadLang, saveLang, type Lang } from "@/lib/noctilien/i18n";
import { buildHash, parseHash, type MapView } from "@/lib/noctilien/urlState";
import LangToggle from "../LangToggle";
import VizInfo from "../viz/VizInfo";
import VizLinks from "../viz/VizLinks";
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
    : fetch("/noctilien.json").then((response) => {
        if (!response.ok) throw new Error(`noctilien.json: HTTP ${response.status}`);
        return response.json();
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
  const [initialState] = useState(() =>
    parseHash(typeof window === "undefined" ? "" : window.location.hash),
  );
  const [data, setData] = useState<NoctilienData | null>(null);
  const [dataError, setDataError] = useState(false);
  const [lang, setLang] = useState<Lang>(loadLang);
  const [night, setNight] = useState<NightType>(initialState.night);
  const [layers, setLayers] = useState<LayerToggles>({
    heat: true,
    stops: true,
    routes: initialState.line !== null,
  });
  const [target, setTarget] = useState<SearchResult | null>(initialState.target);
  const [selectedLine, setSelectedLine] = useState<string | null>(initialState.line);
  const [view, setView] = useState<MapView | null>(initialState.view);

  const strings = STRINGS[lang];

  useEffect(() => {
    dataPromise?.then(setData).catch(() => setDataError(true));
  }, []);

  // Keep the URL shareable: it always reflects the current situation.
  useEffect(() => {
    const hash = buildHash({ view, night, line: selectedLine, target });
    window.history.replaceState(null, "", hash || window.location.pathname);
  }, [view, night, selectedLine, target]);

  const nearbyStops = useMemo(
    () =>
      data && target ? nearestStops(data.stops, target.lat, target.lon) : [],
    [data, target],
  );
  const selectedLineColor = selectedLine
    ? (data?.routes.find((route) => route.name === selectedLine)?.color ?? "#3F2A7E")
    : null;

  const toggleLayer = (key: keyof LayerToggles) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  const switchLang = (next: Lang) => {
    setLang(next);
    saveLang(next);
  };

  // On small screens the panel is a bottom sheet, collapsed by default.
  const [sheetOpen, setSheetOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 640,
  );

  // Selecting a result must reveal the nearest-stops list on mobile.
  const selectTarget = (result: SearchResult | null) => {
    setTarget(result);
    if (result) setSheetOpen(true);
  };

  // story: it's a weekend night at Châtelet and the métro is closed -
  // these are your night buses home
  const story = () => {
    setNight("weekend");
    selectTarget({ label: "Châtelet", lat: 48.8587, lon: 2.3469 });
  };

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        selectTarget({
          label: strings.myLocation,
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
        initialView={initialState.view}
        skipInitialFly={initialState.view !== null}
        onViewChange={setView}
      />

      <div className={`panel${sheetOpen ? "" : " collapsed"}`}>
        <a className="home-link" href="/">
          ← Paris Viz
        </a>
        <div className="panel-title-row">
          <h1>
            Noctilien <span className="panel-sub">{strings.subtitle}</span>
          </h1>
          <LangToggle lang={lang} onChange={switchLang} />
          <VizInfo viz="noctilien" lang={lang} />
          <button
            className="sheet-toggle"
            aria-label={strings.sheetToggle}
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen((open) => !open)}
          >
            {sheetOpen ? "⌄" : "⌃"}
          </button>
        </div>
        <div className="search-row">
          <SearchBox onSelect={selectTarget} strings={strings} />
          <button className="locate-btn" title={strings.locate} onClick={locate}>
            ◎
          </button>
        </div>

        <div className="sheet-hide">
          <p className="panel-hint">{strings.hint}</p>

          <NightToggle value={night} onChange={setNight} strings={strings} />

        <div className="layer-toggles">
          {(
            [
              ["heat", strings.heatmap],
              ["stops", strings.stops],
              ["routes", strings.lines],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={() => toggleLayer(key)}
              />
              {label}
            </label>
          ))}
        </div>

        <Legend strings={strings} />

        <button className="story-btn" onClick={story}>
          {strings.story}
        </button>

        {selectedLine && (
          <div className="line-chip">
            <span
              className="line-badge"
              style={{ background: selectedLineColor ?? undefined }}
            >
              {selectedLine}
            </span>
            <span>{strings.lineHighlighted}</span>
            <button
              onClick={() => setSelectedLine(null)}
              aria-label={strings.clearLine}
            >
              ✕
            </button>
          </div>
        )}

        {target && (
          <NearestStops
            target={target}
            stops={nearbyStops}
            night={night}
            onClear={() => setTarget(null)}
            onSelectLine={(line) =>
              setSelectedLine(line === selectedLine ? null : line)
            }
            strings={strings}
          />
        )}

          <VizLinks current="noctilien" lang={lang} />
          <p className="panel-footer">
            {strings.footer(data.feedWindow.start, data.feedWindow.end)}
          </p>
        </div>
      </div>
    </div>
  );
}
