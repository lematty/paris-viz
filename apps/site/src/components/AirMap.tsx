"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Deck } from "@deck.gl/core";
import { BitmapLayer, ScatterplotLayer } from "@deck.gl/layers";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { AIR, FLUX } from "@/lib/siteStrings";
import { currentSearchParams } from "@/lib/viz";
import { createBasemapLayer, DECK_TOOLTIP_STYLE } from "./viz/basemap";
import { mountDeck } from "./viz/deckMount";
import { useAnimationClock } from "./viz/useAnimationClock";
import VizLinks from "./viz/VizLinks";
import VizPanel from "./viz/VizPanel";

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
  pollutants: Record<
    string,
    { years: Record<string, { hours: number; start: number }> }
  >;
}

// playback speeds (simulated hours per real second) and the rolling-mean
// window displayed at each: raw hourly values strobe once the diurnal cycle
// plays at 1 Hz or more, so every speed averages about what passes in one
// real second and the eye gets one readable value per second instead
const SPEEDS = [
  { v: 6, w: 1, wLabel: "", label: "6 h/s" },
  { v: 24, w: 24, wLabel: "24 h", label: "1 j/s" },
  { v: 72, w: 72, wLabel: "3 j", label: "3 j/s" },
  { v: 168, w: 168, wLabel: "7 j", label: "7 j/s" },
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

// clock formatters cached per locale; date and time render as two fixed
// lines so the panel never reflows as label widths change during playback
const CLOCK_FMT: Record<string, Intl.DateTimeFormat[]> = {};
const clockFormats = (locale: string) =>
  (CLOCK_FMT[locale] ??= [
    new Intl.DateTimeFormat(locale, {
      timeZone: "Europe/Paris",
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
    new Intl.DateTimeFormat(locale, {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
    }),
  ]);

function readParams() {
  const p = currentSearchParams();
  const year = p.get("year");
  const poll = p.get("poll");
  return {
    year: year && /^20\d\d$/.test(year) ? +year : 2025,
    poll: POLLS.includes(poll as Poll) ? (poll as Poll) : ("no2" as Poll),
    paused: p.get("paused") === "1",
    time: p.get("t") ? +p.get("t")! : 8, // hours since Jan 1
  };
}
export default function AirMap() {
  // read once per mount (module-level reads go stale across client navs)
  const [params] = useState(readParams);
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const playheadRef = useRef<SVGLineElement>(null);
  const [meta, setMeta] = useState<AirMeta | null>(null);
  const [series, setSeries] = useState<{
    poll: Poll;
    year: number;
    hours: number;
    start: number;
    values: Uint8Array;
    // per-station prefix sums over hours (row h = hours before h), so a
    // rolling mean over any window is O(1) to sample during playback
    sums: Uint32Array;
    counts: Uint16Array;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(params.year);
  const [poll, setPoll] = useState<Poll>(params.poll);
  const [lang, setLang] = useState<Lang>(loadLang);
  const fx = FLUX[lang];
  const ar = AIR[lang];
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
    const info = meta.pollutants[poll]?.years[year];
    if (!info) return;
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
        const values = new Uint8Array(buf);
        const n = meta.stations.length;
        const sums = new Uint32Array((info.hours + 1) * n);
        const counts = new Uint16Array((info.hours + 1) * n);
        for (let h = 0; h < info.hours; h++) {
          const row = h * n;
          for (let s = 0; s < n; s++) {
            const v = values[row + s];
            const ok = v !== 255;
            sums[row + n + s] = sums[row + s] + (ok ? v : 0);
            counts[row + n + s] = counts[row + s] + (ok ? 1 : 0);
          }
        }
        setSeries({
          poll,
          year,
          hours: info.hours,
          start: info.start,
          values,
          sums,
          counts,
        });
        timeRef.current = Math.min(timeRef.current, info.hours - 2);
      })
      .catch((e: Error) => setError(e.message));
  }, [meta, poll, year]);

  // station bbox for the veil (padded); mercator y extents too, since the
  // BitmapLayer stretches the image linearly in mercator space and rows
  // spaced linearly in latitude would land ~450 m north of their true
  // position mid-map
  const bbox = useMemo(() => {
    if (!meta) return null;
    const lats = meta.stations.map((s) => s.lat);
    const lons = meta.stations.map((s) => s.lon);
    const minLat = Math.min(...lats) - 0.08;
    const maxLat = Math.max(...lats) + 0.08;
    const rad = Math.PI / 180;
    return {
      minLat,
      maxLat,
      minLon: Math.min(...lons) - 0.12,
      maxLon: Math.max(...lons) + 0.12,
      mercMin: Math.asinh(Math.tan(minLat * rad)),
      mercMax: Math.asinh(Math.tan(maxLat * rad)),
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

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);
  const veilCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const appliedRef = useRef({ t: -1, sig: "" });

  // mean over a w-hour window centered on hour h; w = 1 is the raw hourly
  // value, and 255-coded gaps just shrink the window instead of poking holes
  const meanAt = (stationIdx: number, h: number, w: number): number | null => {
    const s = seriesRef.current;
    const m = metaRef.current;
    if (!s || !m) return null;
    const n = m.stations.length;
    const a = Math.max(0, h - (w >> 1));
    const b = Math.min(s.hours, a + w);
    const cnt = s.counts[b * n + stationIdx] - s.counts[a * n + stationIdx];
    if (!cnt) return null;
    return (s.sums[b * n + stationIdx] - s.sums[a * n + stationIdx]) / cnt;
  };

  const valueAt = (stationIdx: number, t: number, w = 1): number | null => {
    const s = seriesRef.current;
    if (!s) return null;
    const h0 = Math.max(0, Math.min(s.hours - 1, Math.floor(t)));
    const h1 = Math.min(s.hours - 1, h0 + 1);
    const a = meanAt(stationIdx, h0, w);
    const b = meanAt(stationIdx, h1, w);
    if (a === null && b === null) return null;
    const va = a === null ? (b as number) : a;
    const vb = b === null ? (a as number) : b;
    return va + (vb - va) * (t - h0);
  };
  const valueAtRef = useRef(valueAt);
  valueAtRef.current = valueAt;
  // rolling-mean window in hours, follows the selected playback speed
  const winRef = useRef(24);

  const onFrame = (t: number) => {
    const s = seriesRef.current;
    const hours = s?.hours ?? 8760;
    if (clockRef.current) {
      const start = s?.start;
      if (start) {
        const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
        const [dateFmt, timeFmt] = clockFormats(locale);
        const d = new Date(start + Math.floor(t) * 3600e3);
        clockRef.current.textContent = `${dateFmt.format(d)}\n${timeFmt.format(d)}`;
      } else {
        clockRef.current.textContent = "--";
      }
    }
    if (sliderRef.current && document.activeElement !== sliderRef.current)
      sliderRef.current.value = String(Math.round(t));
    if (playheadRef.current) {
      const x = (t / hours) * 240;
      playheadRef.current.setAttribute("x1", String(x));
      playheadRef.current.setAttribute("x2", String(x));
    }
    const deck = deckRef.current;
    const basemap = basemapRef.current;
    const vctx = veilCtxRef.current;
    if (!deck || !basemap || !vctx) return;
    const w = winRef.current;
    const sig = `${pollRef.current}|${yearRef.current}|${w}|${s ? 1 : 0}`;
    if (Math.abs(t - appliedRef.current.t) < 0.02 && sig === appliedRef.current.sig)
      return;
    appliedRef.current = { t, sig };
    const m = metaRef.current;
    const box = bboxRef.current;
    if (!s || !m || !box) return;

    // current value per station (rolling mean sized to the playback speed)
    const n = m.stations.length;
    const vals = new Float32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const v = valueAtRef.current(i, t, w);
      if (v !== null) vals[i] = v;
    }

    // IDW veil onto the grid; alpha fades away from the nearest station
    const img = vctx.createImageData(GRID_W, GRID_H);
    const domain = DOMAIN[pollRef.current];
    const lonSpan = box.maxLon - box.minLon;
    const mercSpan = box.mercMax - box.mercMin;
    for (let gy = 0; gy < GRID_H; gy++) {
      const mercY = box.mercMax - (gy / (GRID_H - 1)) * mercSpan;
      const lat = Math.atan(Math.sinh(mercY)) * (180 / Math.PI);
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
          getFillColor: (d: AirStation, { index }) => {
            const v = vals[index];
            if (v < 0) return [80, 86, 100, 120];
            const [r, g, b] = rampColor(v / domain);
            return [r, g, b, 235];
          },
          pickable: true,
          updateTriggers: { getFillColor: [t, pollRef.current, w] },
        }),
      ],
    });
  };

  const clock = useAnimationClock({
    initialTime: params.time,
    autoplay: !params.paused,
    initialSpeed: 24,
    normalize: (t) => {
      const h = seriesRef.current?.hours ?? 8760;
      return ((t % h) + h) % h;
    },
    onFrame,
  });
  const { timeRef } = clock;
  const speedDef = SPEEDS.find((s) => s.v === clock.speed) ?? SPEEDS[1];
  winRef.current = speedDef.w;
  const meanNote =
    speedDef.w > 1
      ? ar.mean(lang === "fr" ? speedDef.wLabel : speedDef.wLabel.replace("j", "d"))
      : null;
  const meanNoteRef = useRef(meanNote);
  meanNoteRef.current = meanNote;

  useEffect(() => {
    const veil = document.createElement("canvas");
    veil.width = GRID_W;
    veil.height = GRID_H;
    veilCtxRef.current = veil.getContext("2d");
    basemapRef.current = createBasemapLayer();
    return mountDeck(
      () => {
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
          getTooltip: ({ object, index, layer }) => {
            if (!object || index < 0 || layer?.id !== "air-stations")
              return null;
            const v = valueAtRef.current(
              index,
              timeRef.current,
              winRef.current,
            );
            const st = object as AirStation;
            const a = AIR[langRef.current];
            const note = meanNoteRef.current;
            return {
              text:
                `${st.name}\n` +
                (v === null
                  ? a.noData
                  : `${Math.round(v)} µg/m³ ${POLL_LABEL[pollRef.current]}` +
                    (note ? ` (${note})` : "")) +
                `\n${st.traffic ? a.traffic : a.background}`,
              style: DECK_TOOLTIP_STYLE,
            };
          },
          layers: [basemapRef.current],
        });
        deckRef.current = deck;
        (window as unknown as Record<string, unknown>).__air = {
          setTime: (t: number) => {
            timeRef.current = t;
          },
        };
        return deck;
      },
      () => {
        deckRef.current = null;
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // lockdown story: 17 March 2020, 08:00 Paris (NO2 collapses within days)
  const lockdown = () => {
    const start = meta?.pollutants.no2?.years[2020]?.start;
    if (!start) return;
    setPoll("no2");
    setYear(2020);
    clock.setPlaying(true);
    clock.setSpeed(24);
    timeRef.current = Math.max(0, (Date.UTC(2020, 2, 17, 7) - start) / 3600e3);
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
        title={ar.title}
        subtitle={
          <>
            {error
              ? fx.error(error)
              : meta
                ? ar.subtitle(meta.stations.length.toLocaleString(locale))
                : ar.loading}
            {meta && !series && !error && (
              <span className="mode-loading"> …</span>
            )}
          </>
        }
        clockRef={clockRef}
        clockInitial="--"
        clockNote={<div className="clock-note">{meanNote ?? ar.hourly}</div>}
        playing={clock.playing}
        onTogglePlay={() => clock.setPlaying((p) => !p)}
        speed={clock.speed}
        speeds={SPEEDS.map((s) => ({
          value: s.v,
          label: lang === "fr" ? s.label : s.label.replace("j/s", "d/s"),
        }))}
        onSpeed={clock.setSpeed}
        labels={{
          play: fx.play,
          pause: fx.pause,
          speed: fx.speed,
          time: fx.time,
          sheetToggle: fx.sheetToggle,
        }}
        controlsExtra={
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
        }
        beforeSlider={
          curve ? (
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
          ) : undefined
        }
        slider={{
          ref: sliderRef,
          min: 0,
          max: hours - 1,
          step: 1,
          defaultValue: params.time,
          onInput: (v) => {
            timeRef.current = v;
          },
        }}
        footer={ar.footer}
      >
        <div
          className="year-row sheet-hide"
          role="radiogroup"
          aria-label={ar.yearAria}
        >
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
        <VizLinks current="air" lang={lang} />
      </VizPanel>
    </div>
  );
}
