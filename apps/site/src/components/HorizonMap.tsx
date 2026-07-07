"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Deck, type PickingInfo } from "@deck.gl/core";
import { BitmapLayer, ScatterplotLayer } from "@deck.gl/layers";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { FLUX, HORIZON } from "@/lib/siteStrings";
import { currentSearchParams } from "@/lib/viz";
import { createBasemapLayer, DECK_TOOLTIP_STYLE } from "./viz/basemap";
import { useAnimationClock } from "./viz/useAnimationClock";
import VizLinks from "./viz/VizLinks";
import VizPanel from "./viz/VizPanel";

interface HorizonStation {
  name: string;
  lat: number;
  lon: number;
  m: number; // mode bitmask: 1 métro, 2 RER/Transilien, 4 tram
}

interface HorizonMeta {
  date: string;
  window: string;
  stations: HorizonStation[];
}

const MAX_T = 75; // largest displayed travel-time budget (minutes)
const WRAP_T = 76; // the clock wraps just past the end so the wave replays
const BAND_MIN = 15; // one color band per 15 minutes
const WALK_M_PER_MIN = 80; // ~4.8 km/h
const MAX_WALK_MIN = 15; // walking leg cap at the destination end
const GRID_W = 1280;

// travel-time bands, nearest first: sun yellow → orange → rose → violet → blue
const BAND_COLORS: [number, number, number][] = [
  [255, 209, 102],
  [247, 144, 74],
  [235, 87, 122],
  [164, 93, 240],
  [78, 124, 246],
];
const UNREACHED_DOT: [number, number, number, number] = [70, 76, 92, 110];

// playback speeds: simulated minutes of travel per real second
const SPEEDS = [
  { value: 1, label: "1 min/s" },
  { value: 3, label: "3 min/s" },
  { value: 8, label: "8 min/s" },
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const EARTH_R = 6_378_137; // WGS84, matches the web-mercator basemap
/** Latitude (degrees) → unitless spherical-mercator y. */
const merc = (lat: number) => Math.asinh(Math.tan((lat * Math.PI) / 180));

const DEFAULT_ORIGIN = "châtelet - les halles";

function readParams() {
  const p = currentSearchParams();
  const t = p.get("t") ? +p.get("t")! : 0;
  return {
    from: p.get("from") ?? "",
    t: Number.isFinite(t) ? Math.max(0, Math.min(MAX_T, t)) : 0,
    paused: p.get("paused") === "1",
  };
}

export default function HorizonMap() {
  // read once per mount (module-level reads go stale across client navs)
  const [params] = useState(readParams);
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<HorizonMeta | null>(null);
  const [matrix, setMatrix] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState(-1);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [lang, setLang] = useState<Lang>(loadLang);
  const fx = FLUX[lang];
  const hz = HORIZON[lang];
  const langRef = useRef(lang);
  langRef.current = lang;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const originRef = useRef(origin);
  originRef.current = origin;

  useEffect(() => {
    fetch("/horizon/stations.json")
      .then((r) => {
        if (!r.ok) throw new Error(`stations.json: HTTP ${r.status}`);
        return r.json() as Promise<HorizonMeta>;
      })
      .then(setMeta)
      .catch((e: Error) => setError(e.message));
    fetch("/horizon/matrix.bin")
      .then((r) => {
        if (!r.ok) throw new Error(`matrix.bin: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => setMatrix(new Uint8Array(buf)))
      .catch((e: Error) => setError(e.message));
  }, []);

  // pick the initial origin once the stations arrive (?from= wins)
  useEffect(() => {
    if (!meta || origin >= 0) return;
    const wanted = norm(params.from || DEFAULT_ORIGIN);
    let idx = meta.stations.findIndex((s) => norm(s.name) === wanted);
    if (idx < 0)
      idx = meta.stations.findIndex((s) => norm(s.name) === DEFAULT_ORIGIN);
    setOrigin(Math.max(0, idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  // padded station bbox; the travel-time field is rasterized onto it
  const grid = useMemo(() => {
    if (!meta) return null;
    const lats = meta.stations.map((s) => s.lat);
    const lons = meta.stations.map((s) => s.lon);
    const minLat = Math.min(...lats) - 0.03;
    const maxLat = Math.max(...lats) + 0.03;
    const minLon = Math.min(...lons) - 0.045;
    const maxLon = Math.max(...lons) + 0.045;
    // BitmapLayer stretches the image linearly in Web Mercator space, so grid
    // rows must be spaced in mercator y, not latitude: linear-in-latitude rows
    // land ~450 m north of their true position mid-map
    const mercMin = merc(minLat);
    const mercMax = merc(maxLat);
    const w = GRID_W;
    const h = Math.round(
      (w * (mercMax - mercMin)) / ((maxLon - minLon) * (Math.PI / 180)),
    );
    return { minLat, maxLat, minLon, maxLon, w, h, mercMin, mercMax };
  }, [meta]);

  // minutes-to-reach field: min over stations of (train time + walk), computed
  // once per origin by splatting a walking cone around every reachable
  // station; playback then only recolors it, which keeps animation cheap
  const field = useMemo(() => {
    if (!meta || !matrix || !grid || origin < 0) return null;
    const { w, h, minLon, maxLon, mercMin, mercMax } = grid;
    const f = new Float32Array(w * h).fill(Infinity);
    const N = meta.stations.length;
    const row = origin * N;
    for (let j = 0; j < N; j++) {
      const tj = matrix[row + j];
      if (tj > MAX_T) continue;
      const walkMin = Math.min(MAX_WALK_MIN, MAX_T - tj);
      const st = meta.stations[j];
      // meters per pixel at this station's latitude (both axes scale by
      // cos(lat) here: ground distance per unit of mercator y does too)
      const cosLat = Math.cos((st.lat * Math.PI) / 180);
      const mppX =
        ((maxLon - minLon) * (Math.PI / 180) * EARTH_R * cosLat) / (w - 1);
      const mppY = ((mercMax - mercMin) * EARTH_R * cosLat) / (h - 1);
      const cx = ((st.lon - minLon) / (maxLon - minLon)) * (w - 1);
      const cy = ((mercMax - merc(st.lat)) / (mercMax - mercMin)) * (h - 1);
      const rx = (walkMin * WALK_M_PER_MIN) / mppX;
      const ry = (walkMin * WALK_M_PER_MIN) / mppY;
      const x0 = Math.max(0, Math.floor(cx - rx));
      const x1 = Math.min(w - 1, Math.ceil(cx + rx));
      const y0 = Math.max(0, Math.floor(cy - ry));
      const y1 = Math.min(h - 1, Math.ceil(cy + ry));
      for (let y = y0; y <= y1; y++) {
        const dyM = (y - cy) * mppY;
        for (let x = x0; x <= x1; x++) {
          const dxM = (x - cx) * mppX;
          const wMin = Math.hypot(dxM, dyM) / WALK_M_PER_MIN;
          if (wMin > walkMin) continue; // bounding-box corner, out of range
          const t = tj + wMin;
          const i = y * w + x;
          if (t < f[i]) f[i] = t;
        }
      }
    }
    return f;
  }, [meta, matrix, grid, origin]);
  const fieldRef = useRef(field);
  fieldRef.current = field;
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const matrixRef = useRef(matrix);
  matrixRef.current = matrix;

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);
  const appliedRef = useRef({ tq: -1, field: null as Float32Array | null });
  // two recycled ImageData buffers: alternating gives the BitmapLayer a new
  // object identity (so the texture updates) without allocating ~4.5 MB per
  // recolor tick
  const imgsRef = useRef<ImageData[] | null>(null);
  const imgFlipRef = useRef(0);

  const onFrame = (t: number) => {
    const td = Math.min(MAX_T, t);
    if (clockRef.current)
      clockRef.current.textContent = `${Math.floor(td)} min`;
    if (sliderRef.current && document.activeElement !== sliderRef.current)
      sliderRef.current.value = String(Math.min(MAX_T, Math.round(t * 4) / 4));
    const deck = deckRef.current;
    const basemap = basemapRef.current;
    const f = fieldRef.current;
    const g = gridRef.current;
    const m = metaRef.current;
    const mat = matrixRef.current;
    if (!deck || !basemap || !f || !g || !m || !mat) return;
    // quantize the budget so paused frames and sub-frame ticks skip redraws
    const tq = Math.round(td * 4) / 4;
    if (tq === appliedRef.current.tq && f === appliedRef.current.field) return;
    appliedRef.current = { tq, field: f };

    const { w, h } = g;
    let imgs = imgsRef.current;
    if (!imgs || imgs[0].width !== w || imgs[0].height !== h)
      imgsRef.current = imgs = [new ImageData(w, h), new ImageData(w, h)];
    imgFlipRef.current ^= 1;
    const img = imgs[imgFlipRef.current];
    const px = img.data;
    new Uint32Array(px.buffer).fill(0); // reset the recycled buffer
    for (let i = 0; i < w * h; i++) {
      const ft = f[i];
      const u = tq - ft; // minutes since this pixel was reached
      if (u < 0) continue; // stays transparent
      const band = Math.min(BAND_COLORS.length - 1, (ft / BAND_MIN) | 0);
      const [r, gr, b] = BAND_COLORS[band];
      const o = i * 4;
      px[o] = r;
      px[o + 1] = gr;
      px[o + 2] = b;
      // alpha is a continuous ramp in travel time (rise to a glowing
      // frontier, settle to the body tint) so texture filtering renders the
      // ~125 m grid cells as soft gradients instead of hard squares
      px[o + 3] =
        u < 0.6 ? (u / 0.6) * 225 : u < 2 ? 225 - ((u - 0.6) / 1.4) * 110 : 115;
    }

    const N = m.stations.length;
    const row = originRef.current * N;
    deck.setProps({
      layers: [
        basemap,
        new BitmapLayer({
          id: "horizon-field",
          image: img,
          bounds: [g.minLon, g.minLat, g.maxLon, g.maxLat],
          opacity: 1,
        }),
        new ScatterplotLayer({
          id: "horizon-stations",
          data: m.stations,
          getPosition: (d: HorizonStation) => [d.lon, d.lat],
          getRadius: (_: HorizonStation, { index }: { index: number }) =>
            index === originRef.current ? 260 : 120,
          radiusMinPixels: 2,
          radiusMaxPixels: 12,
          stroked: true,
          getLineColor: (_: HorizonStation, { index }: { index: number }) =>
            index === originRef.current
              ? [255, 255, 255, 255]
              : [230, 232, 238, 90],
          getLineWidth: (_: HorizonStation, { index }: { index: number }) =>
            index === originRef.current ? 60 : 10,
          lineWidthMinPixels: 1,
          getFillColor: (_: HorizonStation, { index }: { index: number }) => {
            if (index === originRef.current) return [255, 255, 255, 255];
            const tj = mat[row + index];
            if (tj > tq) return UNREACHED_DOT;
            const band = Math.min(BAND_COLORS.length - 1, (tj / BAND_MIN) | 0);
            return [...BAND_COLORS[band], 240] as [number, number, number, number];
          },
          pickable: true,
          onClick: (info: PickingInfo) => {
            if (info.index >= 0) setOrigin(info.index);
          },
          updateTriggers: {
            getFillColor: [tq, originRef.current],
            getRadius: originRef.current,
            getLineColor: originRef.current,
            getLineWidth: originRef.current,
          },
        }),
      ],
    });
  };

  const clock = useAnimationClock({
    initialTime: params.t,
    autoplay: !params.paused,
    initialSpeed: 3,
    normalize: (t) => ((t % WRAP_T) + WRAP_T) % WRAP_T,
    onFrame,
  });
  const { timeRef } = clock;

  useEffect(() => {
    basemapRef.current = createBasemapLayer();
    const deck = new Deck({
      parent: containerRef.current!,
      initialViewState: {
        longitude: 2.42,
        latitude: 48.83,
        zoom: 9,
        minZoom: 7.5,
        maxZoom: 14,
      },
      controller: true,
      pickingRadius: 12,
      getCursor: ({ isDragging, isHovering }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
      getTooltip: ({ object, index, layer }) => {
        if (!object || index < 0 || layer?.id !== "horizon-stations") return null;
        const st = object as HorizonStation;
        const h = HORIZON[langRef.current];
        const m = metaRef.current;
        const mat = matrixRef.current;
        if (!m || !mat) return null;
        if (index === originRef.current)
          return { text: st.name, style: DECK_TOOLTIP_STYLE };
        const tj = mat[originRef.current * m.stations.length + index];
        return {
          text: `${st.name}\n${tj > MAX_T ? h.beyond : h.minutes(tj)}`,
          style: DECK_TOOLTIP_STYLE,
        };
      },
      layers: [basemapRef.current],
    });
    deckRef.current = deck;
    (window as unknown as Record<string, unknown>).__horizon = {
      setTime: (t: number) => {
        timeRef.current = t;
      },
    };
    return () => {
      deckRef.current = null;
      deck.finalize();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const originName = origin >= 0 && meta ? meta.stations[origin].name : "…";

  const results = useMemo(() => {
    if (!meta || norm(query).length < 2) return [];
    const q = norm(query);
    const starts: { name: string; idx: number }[] = [];
    const contains: { name: string; idx: number }[] = [];
    meta.stations.forEach((s, idx) => {
      const n = norm(s.name);
      if (n.startsWith(q)) starts.push({ name: s.name, idx });
      else if (n.includes(q)) contains.push({ name: s.name, idx });
    });
    return [...starts, ...contains].slice(0, 8);
  }, [meta, query]);

  const pick = (idx: number) => {
    setOrigin(idx);
    setQuery("");
    setHighlight(0);
  };

  return (
    <div className="flow">
      <div ref={containerRef} className="flow-canvas" />
      <VizPanel
        lang={lang}
        onLang={(l) => {
          setLang(l);
          saveLang(l);
        }}
        title={hz.title}
        subtitle={
          error
            ? fx.error(error)
            : meta
              ? hz.subtitle(
                  meta.stations.length.toLocaleString(locale),
                  new Date(meta.date).toLocaleDateString(locale, {
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  }),
                )
              : hz.loading
        }
        clockRef={clockRef}
        clockInitial={`${Math.floor(params.t)} min`}
        clockNote={<div className="clock-note">{hz.clockNote(originName)}</div>}
        playing={clock.playing}
        onTogglePlay={() => clock.setPlaying((p) => !p)}
        speed={clock.speed}
        speeds={SPEEDS}
        onSpeed={clock.setSpeed}
        labels={{
          play: fx.play,
          pause: fx.pause,
          speed: fx.speed,
          time: fx.time,
          sheetToggle: fx.sheetToggle,
        }}
        beforeSlider={
          <div className="searchbox horizon-search sheet-hide">
            <input
              value={query}
              placeholder={hz.searchPlaceholder}
              aria-label={hz.searchAria}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={(e) => {
                if (!results.length) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((i) => Math.min(results.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  pick(results[Math.min(highlight, results.length - 1)].idx);
                } else if (e.key === "Escape") {
                  setQuery("");
                }
              }}
            />
            {results.length > 0 && (
              <ul className="search-results" role="listbox">
                {results.map((r, i) => (
                  <li
                    key={r.idx}
                    role="option"
                    aria-selected={i === highlight}
                    className={i === highlight ? "highlighted" : ""}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(r.idx)}
                  >
                    {r.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        }
        slider={{
          ref: sliderRef,
          min: 0,
          max: MAX_T,
          step: 0.25,
          defaultValue: params.t,
          onInput: (v) => {
            timeRef.current = v;
          },
        }}
        footer={hz.footer}
      >
        <div className="iso-legend sheet-hide">
          <div className="iso-swatches">
            {BAND_COLORS.map((c, i) => (
              <span
                key={i}
                className="iso-swatch"
                style={{ background: `rgb(${c[0]}, ${c[1]}, ${c[2]})` }}
              />
            ))}
          </div>
          <div className="legend-labels">
            <span>15</span>
            <span>30</span>
            <span>45</span>
            <span>60</span>
            <span>75 min</span>
          </div>
          <p className="pulse-legend">{hz.legend}</p>
        </div>
        <VizLinks current="horizon" lang={lang} />
      </VizPanel>
    </div>
  );
}
