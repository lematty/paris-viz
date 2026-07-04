"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Deck } from "@deck.gl/core";
import { TileLayer, type GeoBoundingBox } from "@deck.gl/geo-layers";
import { BitmapLayer, ScatterplotLayer } from "@deck.gl/layers";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { AIR, FLUX } from "@/lib/siteStrings";
import LangToggle from "./LangToggle";

type Poll = "no2" | "pm25";
const POLLS: Poll[] = ["no2", "pm25"];
const POLL_LABEL: Record<Poll, string> = { no2: "NO₂", pm25: "PM₂.₅" };

interface AirStation {
  name: string;
  lat: number;
  lon: number;
  traffic: boolean;
}

interface AirMeta {
  stations: AirStation[];
  pollutants: Record<string, { years: Record<string, number> }>;
}

// playback speeds: simulated hours per real second
const SPEEDS = [
  { v: 6, label: "6 h/s" },
  { v: 24, label: "1 j/s" },
  { v: 72, label: "3 j/s" },
  { v: 168, label: "7 j/s" },
];

// color ramps anchored per pollutant (µg/m³): calm teal → amber → red → violet
const DOMAIN: Record<Poll, number> = { no2: 120, pm25: 80 };
const RAMP: [number, [number, number, number]][] = [
  [0.0, [26, 140, 130]],
  [0.3, [120, 190, 90]],
  [0.5, [240, 190, 60]],
  [0.7, [235, 100, 40]],
  [0.85, [200, 40, 60]],
  [1.0, [150, 40, 160]],
];

function rampColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (x <= RAMP[i][0]) {
      const [t0, a] = RAMP[i - 1];
      const [t1, b] = RAMP[i];
      const f = (x - t0) / (t1 - t0 || 1);
      return [
        Math.round(a[0] + (b[0] - a[0]) * f),
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
      ];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

// interpolation grid for the veil
const GRID_W = 150;
const GRID_H = 100;

function readParams() {
  const p =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const year = p.get("year");
  const poll = p.get("poll");
  return {
    year: year && /^20\d\d$/.test(year) ? +year : 2025,
    poll: POLLS.includes(poll as Poll) ? (poll as Poll) : ("no2" as Poll),
    paused: p.get("paused") === "1",
    time: p.get("t") ? +p.get("t")! : 8, // hours since Jan 1
  };
}
const params = readParams();

export default function AirMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const playheadRef = useRef<SVGLineElement>(null);
  const [meta, setMeta] = useState<AirMeta | null>(null);
  const [series, setSeries] = useState<{
    poll: Poll;
    year: number;
    hours: number;
    values: Uint8Array;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(!params.paused);
  const [speed, setSpeed] = useState(24);
  const [year, setYear] = useState(params.year);
  const [poll, setPoll] = useState<Poll>(params.poll);
  const [lang, setLang] = useState<Lang>(loadLang);
  const [sheetOpen, setSheetOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 640,
  );
  const fx = FLUX[lang];
  const ar = AIR[lang];
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const langRef = useRef(lang);
  langRef.current = lang;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const pollRef = useRef(poll);
  pollRef.current = poll;
  const yearRef = useRef(year);
  yearRef.current = year;
  const timeRef = useRef(params.time);

  useEffect(() => {
    fetch("/air/meta.json")
      .then((r) => {
        if (!r.ok) throw new Error(`meta.json: HTTP ${r.status}`);
        return r.json() as Promise<AirMeta>;
      })
      .then(setMeta)
      .catch((e: Error) => setError(e.message));
  }, []);

  // load the selected pollutant/year series
  useEffect(() => {
    if (!meta) return;
    const hours = meta.pollutants[poll]?.years[year];
    if (!hours) return;
    setSeries(null);
    const requested = { poll, year };
    fetch(`/air/${poll}-${year}.bin`)
      .then((r) => {
        if (!r.ok) throw new Error(`${poll}-${year}.bin: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (pollRef.current !== requested.poll || yearRef.current !== requested.year)
          return;
        setSeries({ poll, year, hours, values: new Uint8Array(buf) });
        timeRef.current = Math.min(timeRef.current, hours - 2);
      })
      .catch((e: Error) => setError(e.message));
  }, [meta, poll, year]);

  // station bbox for the veil (padded)
  const bbox = useMemo(() => {
    if (!meta) return null;
    const lats = meta.stations.map((s) => s.lat);
    const lons = meta.stations.map((s) => s.lon);
    return {
      minLat: Math.min(...lats) - 0.08,
      maxLat: Math.max(...lats) + 0.08,
      minLon: Math.min(...lons) - 0.12,
      maxLon: Math.max(...lons) + 0.12,
    };
  }, [meta]);
  const bboxRef = useRef(bbox);
  bboxRef.current = bbox;

  // yearly regional-mean curve for the sparkline (daily means)
  const curve = useMemo(() => {
    if (!series || !meta) return null;
    const n = meta.stations.length;
    const days = Math.floor(series.hours / 24);
    const daily: number[] = [];
    for (let d = 0; d < days; d++) {
      let sum = 0;
      let cnt = 0;
      for (let h = d * 24; h < d * 24 + 24; h++) {
        for (let s = 0; s < n; s++) {
          const v = series.values[h * n + s];
          if (v !== 255) {
            sum += v;
            cnt++;
          }
        }
      }
      daily.push(cnt ? sum / cnt : 0);
    }
    const max = Math.max(...daily, 1);
    const pts = daily.map((v, d) => {
      const x = ((d + 0.5) / days) * 240;
      const y = 46 - (v / max) * 42;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { path: `M0,46 L${pts.join(" L")} L240,46 Z`, days };
  }, [series, meta]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const veil = document.createElement("canvas");
    veil.width = GRID_W;
    veil.height = GRID_H;
    const vctx = veil.getContext("2d")!;

    const basemap = new TileLayer({
      id: "basemap",
      data: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: (props) => {
        const { west, south, east, north } = props.tile.bbox as GeoBoundingBox;
        return new BitmapLayer(props, {
          data: undefined,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    });

    const valueAt = (stationIdx: number, t: number): number | null => {
      const s = seriesRef.current;
      const m = metaRef.current;
      if (!s || !m) return null;
      const n = m.stations.length;
      const h0 = Math.max(0, Math.min(s.hours - 1, Math.floor(t)));
      const h1 = Math.min(s.hours - 1, h0 + 1);
      const a = s.values[h0 * n + stationIdx];
      const b = s.values[h1 * n + stationIdx];
      if (a === 255 && b === 255) return null;
      const va = a === 255 ? b : a;
      const vb = b === 255 ? a : b;
      return va + (vb - va) * (t - h0);
    };

    const deck = new Deck({
      parent: containerRef.current!,
      initialViewState: {
        longitude: 2.42,
        latitude: 48.8,
        zoom: 8.7,
        minZoom: 7.5,
        maxZoom: 13,
      },
      controller: true,
      pickingRadius: 10,
      getTooltip: ({ object, layer }) => {
        if (!object || layer?.id !== "air-stations") return null;
        const m = metaRef.current;
        if (!m) return null;
        const idx = m.stations.indexOf(object as AirStation);
        const v = valueAt(idx, timeRef.current);
        const st = object as AirStation;
        const a = AIR[langRef.current];
        return {
          text:
            `${st.name}\n` +
            (v === null
              ? a.noData
              : `${Math.round(v)} µg/m³ ${POLL_LABEL[pollRef.current]}`) +
            `\n${st.traffic ? a.traffic : a.background}`,
          style: {
            background: "#101828",
            color: "#e6e8ee",
            fontSize: "12px",
            borderRadius: "6px",
            padding: "4px 8px",
          },
        };
      },
      layers: [basemap],
    });

    let appliedTime = -1;
    let appliedSig = "";
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = (now - last) / 1000;
      last = now;
      const s = seriesRef.current;
      const hours = s?.hours ?? 8760;
      if (playingRef.current) {
        timeRef.current = (timeRef.current + dt * speedRef.current) % hours;
      }
      const t = timeRef.current;
      if (clockRef.current) {
        const date = new Date(
          Date.UTC(yearRef.current, 0, 1) + Math.floor(t) * 3600e3,
        );
        const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
        clockRef.current.textContent =
          date.toLocaleDateString(locale, {
            weekday: "short",
            day: "numeric",
            month: "short",
          }) + ` · ${String(date.getUTCHours()).padStart(2, "0")}:00`;
      }
      if (sliderRef.current && document.activeElement !== sliderRef.current)
        sliderRef.current.value = String(Math.round(t));
      if (playheadRef.current) {
        const x = (t / hours) * 240;
        playheadRef.current.setAttribute("x1", String(x));
        playheadRef.current.setAttribute("x2", String(x));
      }
      const sig = `${pollRef.current}|${yearRef.current}|${s ? 1 : 0}`;
      if (Math.abs(t - appliedTime) < 0.02 && sig === appliedSig) return;
      appliedTime = t;
      appliedSig = sig;
      const m = metaRef.current;
      const box = bboxRef.current;
      if (!s || !m || !box) return;

      // current value per station
      const n = m.stations.length;
      const vals = new Float32Array(n).fill(-1);
      for (let i = 0; i < n; i++) {
        const v = valueAt(i, t);
        if (v !== null) vals[i] = v;
      }

      // IDW veil onto the grid; alpha fades away from the nearest station
      const img = vctx.createImageData(GRID_W, GRID_H);
      const domain = DOMAIN[pollRef.current];
      const lonSpan = box.maxLon - box.minLon;
      const latSpan = box.maxLat - box.minLat;
      for (let gy = 0; gy < GRID_H; gy++) {
        const lat = box.maxLat - (gy / (GRID_H - 1)) * latSpan;
        for (let gx = 0; gx < GRID_W; gx++) {
          const lon = box.minLon + (gx / (GRID_W - 1)) * lonSpan;
          let num = 0;
          let den = 0;
          let dmin = Infinity;
          for (let i = 0; i < n; i++) {
            if (vals[i] < 0) continue;
            const st = m.stations[i];
            const dx = (st.lon - lon) * 0.66; // ≈cos(48.8°), degrees→comparable
            const dy = st.lat - lat;
            const d2 = dx * dx + dy * dy + 1e-6;
            if (d2 < dmin) dmin = d2;
            const w = 1 / (d2 * d2); // IDW power 4: crisper local structure
            num += w * vals[i];
            den += w;
          }
          const o = (gy * GRID_W + gx) * 4;
          if (!den) continue;
          const v = num / den;
          const [r, g, b] = rampColor(v / domain);
          // fade the veil where the nearest station is far (no information)
          const dist = Math.sqrt(dmin);
          const conf = Math.max(0, 1 - dist / 0.35);
          img.data[o] = r;
          img.data[o + 1] = g;
          img.data[o + 2] = b;
          img.data[o + 3] = Math.round(150 * Math.pow(conf, 0.8));
        }
      }

      deck.setProps({
        layers: [
          basemap,
          new BitmapLayer({
            id: "air-veil",
            image: img, // fresh ImageData each frame → texture updates
            bounds: [box.minLon, box.minLat, box.maxLon, box.maxLat],
            opacity: 1,
          }),
          new ScatterplotLayer({
            id: "air-stations",
            data: m.stations,
            getPosition: (d: AirStation) => [d.lon, d.lat],
            getRadius: 700,
            radiusMinPixels: 3,
            radiusMaxPixels: 14,
            stroked: true,
            getLineColor: [230, 232, 238, 200],
            lineWidthMinPixels: 1,
            getFillColor: (d: AirStation) => {
              const i = m.stations.indexOf(d);
              const v = vals[i];
              if (v < 0) return [80, 86, 100, 120];
              const [r, g, b] = rampColor(v / domain);
              return [r, g, b, 235];
            },
            pickable: true,
            updateTriggers: { getFillColor: [t, pollRef.current] },
          }),
        ],
      });
    };
    raf = requestAnimationFrame(tick);
    (window as unknown as Record<string, unknown>).__air = {
      setTime: (t: number) => {
        timeRef.current = t;
      },
    };
    return () => {
      cancelAnimationFrame(raf);
      deck.finalize();
    };
  }, []);

  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const years = meta
    ? Object.keys(meta.pollutants[poll]?.years ?? {}).map(Number)
    : [];
  const hours = series?.hours ?? 8760;

  const seek = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.buttons === 0 && e.type !== "pointerdown") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    timeRef.current = f * hours;
  };

  // lockdown story: 17 March 2020, 08:00 (NO2 collapses within days)
  const lockdown = () => {
    setPoll("no2");
    setYear(2020);
    setPlaying(true);
    setSpeed(24);
    timeRef.current = (31 + 29 + 16) * 24 + 8;
  };

  return (
    <div className="flow">
      <div ref={containerRef} className="flow-canvas" />
      <div className={`flow-panel${sheetOpen ? "" : " collapsed"}`}>
        <div className="flow-topbar">
          <a className="home-link" href="/">
            ← Paris Viz
          </a>
          <LangToggle
            lang={lang}
            onChange={(l) => {
              setLang(l);
              saveLang(l);
            }}
          />
          <button
            className="sheet-toggle"
            aria-label={fx.sheetToggle}
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen((o) => !o)}
          >
            {sheetOpen ? "⌄" : "⌃"}
          </button>
        </div>
        <h1 className="sheet-hide">{ar.title}</h1>
        <p className="sub sheet-hide">
          {error
            ? fx.error(error)
            : meta
              ? ar.subtitle(meta.stations.length.toLocaleString(locale))
              : ar.loading}
          {meta && !series && !error && (
            <span className="mode-loading"> …</span>
          )}
        </p>
        <div className="flow-clock" ref={clockRef}>
          --
        </div>
        <div className="flow-controls">
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? fx.pause : fx.play}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
            aria-label={fx.speed}
          >
            {SPEEDS.map((s) => (
              <option key={s.v} value={s.v}>
                {lang === "fr" ? s.label : s.label.replace("j/s", "d/s")}
              </option>
            ))}
          </select>
          <div className="poll-toggle" role="radiogroup" aria-label="Polluant">
            {POLLS.map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={poll === p}
                className={poll === p ? "active" : ""}
                onClick={() => setPoll(p)}
              >
                {POLL_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        {curve && (
          <svg
            className="pulse-curve"
            viewBox="0 0 240 48"
            preserveAspectRatio="none"
            onPointerDown={seek}
            onPointerMove={seek}
          >
            <path
              d={curve.path}
              fill="rgba(235, 100, 40, 0.25)"
              stroke="#eb6428"
              strokeWidth="1"
            />
            <line
              ref={playheadRef}
              x1="0"
              x2="0"
              y1="0"
              y2="48"
              stroke="#9fd8ff"
              strokeWidth="1.5"
            />
          </svg>
        )}
        <input
          ref={sliderRef}
          className="flow-slider"
          type="range"
          min={0}
          max={hours - 1}
          step={1}
          defaultValue={params.time}
          onInput={(e) => {
            timeRef.current = +(e.target as HTMLInputElement).value;
          }}
          aria-label={fx.time}
        />
        <div className="year-row sheet-hide" role="radiogroup" aria-label={ar.yearAria}>
          {years.map((y) => (
            <button
              key={y}
              role="radio"
              aria-checked={year === y}
              className={`year-pill${year === y ? " active" : ""}`}
              onClick={() => setYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
        <button className="story-btn sheet-hide" onClick={lockdown}>
          {ar.lockdown}
        </button>
        <div className="air-legend sheet-hide">
          <div
            className="legend-bar"
            style={{
              background:
                "linear-gradient(to right, #1a8c82, #78be5a, #f0be3c, #eb6428, #c8283c, #9628a0)",
            }}
          />
          <div className="legend-labels">
            <span>0 µg/m³</span>
            <span>{DOMAIN[poll]}+</span>
          </div>
          <p className="pulse-legend">{ar.legend}</p>
        </div>
        <p className="flow-footer sheet-hide">{ar.footer}</p>
      </div>
    </div>
  );
}
