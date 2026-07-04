"use client";

import { useEffect, useRef, useState } from "react";
import { Deck } from "@deck.gl/core";
import { TileLayer, type GeoBoundingBox } from "@deck.gl/geo-layers";
import { BitmapLayer, ScatterplotLayer } from "@deck.gl/layers";
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

const SPEEDS = [60, 120, 300, 600];

const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** Validations per hour at continuous time t (seconds), interpolating
 * between the two surrounding hour buckets. */
function tapsPerHour(st: PulseStation, day: DayKey, t: number): number {
  const arr = st[DAY_FIELD[day]];
  const daily = arr[0];
  if (!daily) return 0;
  const h = (t / 3600) % 24;
  const h0 = Math.floor(h) % 24;
  const h1 = (h0 + 1) % 24;
  const f = h - Math.floor(h);
  const share = (arr[1 + h0] * (1 - f) + arr[1 + h1] * f) / 1000;
  return daily * share;
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
  const [data, setData] = useState<PulseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(!params.paused);
  const [speed, setSpeed] = useState(300);
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
        latitude: 48.86,
        zoom: 10.5,
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
      const sig = `${dayRef.current}|${dataRef.current ? 1 : 0}`;
      if (t === appliedTime && sig === appliedSig) return;
      appliedTime = t;
      appliedSig = sig;
      if (!dataRef.current) return;
      deck.setProps({
        layers: [
          basemap,
          new ScatterplotLayer({
            id: "pulse",
            data: dataRef.current.stations,
            getPosition: (d: PulseStation) => [d.lon, d.lat],
            // area ∝ validations/hour → radius ∝ sqrt
            getRadius: (d: PulseStation) =>
              20 + Math.sqrt(tapsPerHour(d, dayRef.current, t)) * 9,
            radiusMinPixels: 1.5,
            radiusMaxPixels: 120,
            getFillColor: [249, 142, 9, 110],
            getLineColor: [252, 255, 164, 160],
            lineWidthMinPixels: 1,
            stroked: true,
            pickable: true,
            updateTriggers: { getRadius: [t, dayRef.current] },
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
        <p className="flow-footer sheet-hide">{pu.footer}</p>
      </div>
    </div>
  );
}
