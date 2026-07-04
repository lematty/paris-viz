"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Deck } from "@deck.gl/core";
import { TileLayer, type GeoBoundingBox } from "@deck.gl/geo-layers";
import { BitmapLayer, ColumnLayer } from "@deck.gl/layers";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { FLUX, PULSE } from "@/lib/siteStrings";
import LangToggle from "./LangToggle";

type DayKey = "weekday" | "saturday" | "sunday";
const DAY_KEYS: DayKey[] = ["weekday", "saturday", "sunday"];
const DAY_FIELD: Record<DayKey, "w" | "s" | "u"> = {
  weekday: "w",
  saturday: "s",
  sunday: "u",
};

interface PulseStation {
  n: string;
  lat: number;
  lon: number;
  w: number[]; // [avgDaily, ...24 per-mille hourly shares]
  s: number[];
  u: number[];
}

interface PulseData {
  period: { start: string; end: string };
  stations: PulseStation[];
}

const SPEEDS = [120, 300, 600, 1200];

const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** Hourly share (fraction of the day) at continuous time t, interpolated. */
function shareAt(arr: number[], t: number): number {
  const h = (t / 3600) % 24;
  const h0 = Math.floor(h) % 24;
  const h1 = (h0 + 1) % 24;
  const f = h - Math.floor(h);
  return (arr[1 + h0] * (1 - f) + arr[1 + h1] * f) / 1000;
}

const tapsPerHour = (st: PulseStation, day: DayKey, t: number) => {
  const arr = st[DAY_FIELD[day]];
  return arr[0] * shareAt(arr, t);
};

// diverging color: blue (quieter than the network right now) → neutral →
// amber (busier than the network right now)
const COLD: [number, number, number] = [64, 130, 224];
const MID: [number, number, number] = [110, 118, 134];
const WARM: [number, number, number] = [249, 142, 9];

function divergingColor(logRatio: number): [number, number, number, number] {
  const t = Math.max(-1.5, Math.min(1.5, logRatio)) / 1.5; // -1..1
  const [a, b] = t < 0 ? [MID, COLD] : [MID, WARM];
  const f = Math.abs(t);
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
    210,
  ];
}

function readParams() {
  const p =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const day = p.get("day");
  return {
    day: DAY_KEYS.includes(day as DayKey) ? (day as DayKey) : "weekday",
    paused: p.get("paused") === "1",
    time: p.get("t") ? +p.get("t")! : 8 * 3600,
  };
}
const params = readParams();

export default function PulseMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const playheadRef = useRef<SVGLineElement>(null);
  const [data, setData] = useState<PulseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(!params.paused);
  const [speed, setSpeed] = useState(600);
  const [day, setDay] = useState<DayKey>(params.day);
  const [lang, setLang] = useState<Lang>(loadLang);
  const [sheetOpen, setSheetOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 640,
  );
  const fx = FLUX[lang];
  const pu = PULSE[lang];
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const dayRef = useRef(day);
  dayRef.current = day;
  const langRef = useRef(lang);
  langRef.current = lang;
  const dataRef = useRef(data);
  dataRef.current = data;
  const timeRef = useRef(params.time);

  // network-wide hourly curve for the selected day type: taps/hour totals
  // (drives both the sparkline and the "busier than the network" coloring)
  const network = useMemo(() => {
    if (!data) return null;
    const field = DAY_FIELD[day];
    const curve = new Array<number>(24).fill(0);
    let total = 0;
    for (const st of data.stations) {
      const arr = st[field];
      total += arr[0];
      for (let h = 0; h < 24; h++) curve[h] += (arr[0] * arr[1 + h]) / 1000;
    }
    // share arr shaped like a station's: [total, ...per-mille]
    const share = [total, ...curve.map((v) => (total ? (v / total) * 1000 : 0))];
    return { curve, max: Math.max(...curve), share };
  }, [data, day]);
  const networkRef = useRef(network);
  networkRef.current = network;

  useEffect(() => {
    fetch("/pulse.json")
      .then((r) => {
        if (!r.ok) throw new Error(`pulse.json: HTTP ${r.status}`);
        return r.json() as Promise<PulseData>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    let raf = 0;
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

    const deck = new Deck({
      parent: containerRef.current!,
      initialViewState: {
        longitude: 2.35,
        latitude: 48.8,
        zoom: 10.3,
        pitch: 52,
        bearing: -12,
        minZoom: 8,
        maxZoom: 15,
      },
      controller: true,
      pickingRadius: 8,
      getTooltip: ({ object }) => {
        if (!object) return null;
        const st = object as PulseStation;
        const v = tapsPerHour(st, dayRef.current, timeRef.current);
        const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
        return {
          text: `${st.n}\n${PULSE[langRef.current].perHour(Math.round(v).toLocaleString(locale))}`,
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

    let last = performance.now();
    let appliedTime = -1;
    let appliedSig = "";
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = (now - last) / 1000;
      last = now;
      if (playingRef.current) {
        timeRef.current = (timeRef.current + dt * speedRef.current) % 86400;
      }
      const t = timeRef.current;
      if (clockRef.current) clockRef.current.textContent = fmtClock(t);
      if (sliderRef.current && document.activeElement !== sliderRef.current)
        sliderRef.current.value = String(Math.round(t));
      if (playheadRef.current) {
        const x = (t / 86400) * 240;
        playheadRef.current.setAttribute("x1", String(x));
        playheadRef.current.setAttribute("x2", String(x));
      }
      const sig = `${dayRef.current}|${dataRef.current ? 1 : 0}`;
      if (t === appliedTime && sig === appliedSig) return;
      appliedTime = t;
      appliedSig = sig;
      const net = networkRef.current;
      if (!dataRef.current || !net) return;
      const day = dayRef.current;
      const netShare = shareAt(net.share, t);
      deck.setProps({
        layers: [
          basemap,
          new ColumnLayer({
            id: "pulse-columns",
            data: dataRef.current.stations,
            diskResolution: 8,
            extruded: true,
            getPosition: (d: PulseStation) => [d.lon, d.lat],
            // footprint hints at overall size; height is the live signal
            getRadius: (d: PulseStation) => 50 + Math.sqrt(d.w[0]) * 0.35,
            getElevation: (d: PulseStation) => {
              const v = tapsPerHour(d, day, t);
              return v > 0 ? 40 + v * 0.28 : 0;
            },
            getFillColor: (d: PulseStation) => {
              if (netShare < 0.002) return [...MID, 200] as [number, number, number, number];
              const own = shareAt(d[DAY_FIELD[day]], t);
              return divergingColor(Math.log2(own / netShare || 1));
            },
            pickable: true,
            updateTriggers: { getElevation: t, getFillColor: t },
          }),
        ],
      });
    };
    raf = requestAnimationFrame(tick);
    (window as unknown as Record<string, unknown>).__pulse = {
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

  // area path for the 24h curve sparkline (viewBox 240×48)
  const curvePath = useMemo(() => {
    if (!network) return "";
    const pts = network.curve.map((v, h) => {
      const x = ((h + 0.5) / 24) * 240;
      const y = 46 - (v / (network.max || 1)) * 42;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M0,46 L${pts.join(" L")} L240,46 Z`;
  }, [network]);

  const seek = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.buttons === 0 && e.type !== "pointerdown") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    timeRef.current = f * 86400;
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
        <h1 className="sheet-hide">{pu.title}</h1>
        <p className="sub sheet-hide">
          {error
            ? fx.error(error)
            : data
              ? pu.subtitle(
                  data.stations.length.toLocaleString(locale),
                  data.period.start,
                  data.period.end,
                )
              : pu.loading}
        </p>
        <div className="flow-clock" ref={clockRef}>
          --:--
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
              <option key={s} value={s}>
                ×{s}
              </option>
            ))}
          </select>
        </div>
        {network && (
          <svg
            className="pulse-curve"
            viewBox="0 0 240 48"
            preserveAspectRatio="none"
            onPointerDown={seek}
            onPointerMove={seek}
          >
            <path d={curvePath} fill="rgba(249, 142, 9, 0.25)" stroke="#f98e09" strokeWidth="1" />
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
          max={86400}
          step={60}
          defaultValue={params.time}
          onInput={(e) => {
            timeRef.current = +(e.target as HTMLInputElement).value;
          }}
          aria-label={fx.time}
        />
        <div
          className="night-toggle sheet-hide"
          role="radiogroup"
          aria-label={fx.dayAria}
        >
          {DAY_KEYS.map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={day === d}
              className={day === d ? "active" : ""}
              onClick={() => setDay(d)}
            >
              {fx.days[d]}
            </button>
          ))}
        </div>
        <p className="pulse-legend sheet-hide">{pu.legend}</p>
        <p className="flow-footer sheet-hide">{pu.footer}</p>
      </div>
    </div>
  );
}
