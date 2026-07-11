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
  { value: 6, windowHours: 1, windowLabel: "", label: "6 h/s" },
  { value: 24, windowHours: 24, windowLabel: "24 h", label: "1 j/s" },
  { value: 72, windowHours: 72, windowLabel: "3 j", label: "3 j/s" },
  { value: 168, windowHours: 168, windowLabel: "7 j", label: "7 j/s" },
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

function rampColor(normalized: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, normalized));
  for (let i = 1; i < RAMP.length; i++) {
    if (clamped <= RAMP[i][0]) {
      const [startStop, startColor] = RAMP[i - 1];
      const [endStop, endColor] = RAMP[i];
      const fraction = (clamped - startStop) / (endStop - startStop || 1);
      return [
        Math.round(startColor[0] + (endColor[0] - startColor[0]) * fraction),
        Math.round(startColor[1] + (endColor[1] - startColor[1]) * fraction),
        Math.round(startColor[2] + (endColor[2] - startColor[2]) * fraction),
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
const CLOCK_FORMATS: Record<string, Intl.DateTimeFormat[]> = {};
const clockFormats = (locale: string) =>
  (CLOCK_FORMATS[locale] ??= [
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
  const searchParams = currentSearchParams();
  const year = searchParams.get("year");
  const poll = searchParams.get("poll");
  return {
    year: year && /^20\d\d$/.test(year) ? +year : 2025,
    poll: POLLS.includes(poll as Poll) ? (poll as Poll) : ("no2" as Poll),
    paused: searchParams.get("paused") === "1",
    time: searchParams.get("t") ? +searchParams.get("t")! : 8, // hours since Jan 1
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
  const commonStrings = FLUX[lang];
  const strings = AIR[lang];
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
      .then((response) => {
        if (!response.ok) throw new Error(`meta.json: HTTP ${response.status}`);
        return response.json() as Promise<AirMeta>;
      })
      .then(setMeta)
      .catch((err: Error) => setError(err.message));
  }, []);

  // load the selected pollutant/year series
  useEffect(() => {
    if (!meta) return;
    const info = meta.pollutants[poll]?.years[year];
    if (!info) return;
    setSeries(null);
    const requested = { poll, year };
    fetch(`/air/${poll}-${year}.bin`)
      .then((response) => {
        if (!response.ok)
          throw new Error(`${poll}-${year}.bin: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buf) => {
        if (pollRef.current !== requested.poll || yearRef.current !== requested.year)
          return;
        const values = new Uint8Array(buf);
        const stationCount = meta.stations.length;
        const sums = new Uint32Array((info.hours + 1) * stationCount);
        const counts = new Uint16Array((info.hours + 1) * stationCount);
        for (let h = 0; h < info.hours; h++) {
          const row = h * stationCount;
          for (let s = 0; s < stationCount; s++) {
            const value = values[row + s];
            const ok = value !== 255;
            sums[row + stationCount + s] = sums[row + s] + (ok ? value : 0);
            counts[row + stationCount + s] = counts[row + s] + (ok ? 1 : 0);
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
      .catch((err: Error) => setError(err.message));
  }, [meta, poll, year]);

  // station bbox for the veil (padded); mercator y extents too, since the
  // BitmapLayer stretches the image linearly in mercator space and rows
  // spaced linearly in latitude would land ~450 m north of their true
  // position mid-map
  const bbox = useMemo(() => {
    if (!meta) return null;
    const lats = meta.stations.map((station) => station.lat);
    const lons = meta.stations.map((station) => station.lon);
    const minLat = Math.min(...lats) - 0.08;
    const maxLat = Math.max(...lats) + 0.08;
    const degToRad = Math.PI / 180;
    return {
      minLat,
      maxLat,
      minLon: Math.min(...lons) - 0.12,
      maxLon: Math.max(...lons) + 0.12,
      mercMin: Math.asinh(Math.tan(minLat * degToRad)),
      mercMax: Math.asinh(Math.tan(maxLat * degToRad)),
    };
  }, [meta]);
  const bboxRef = useRef(bbox);
  bboxRef.current = bbox;

  // yearly regional-mean curve for the sparkline (daily means)
  const curve = useMemo(() => {
    if (!series || !meta) return null;
    const stationCount = meta.stations.length;
    const days = Math.floor(series.hours / 24);
    const daily: number[] = [];
    for (let dayIdx = 0; dayIdx < days; dayIdx++) {
      let sum = 0;
      let count = 0;
      for (let h = dayIdx * 24; h < dayIdx * 24 + 24; h++) {
        for (let s = 0; s < stationCount; s++) {
          const value = series.values[h * stationCount + s];
          if (value !== 255) {
            sum += value;
            count++;
          }
        }
      }
      daily.push(count ? sum / count : 0);
    }
    const max = Math.max(...daily, 1);
    const points = daily.map((value, dayIdx) => {
      const x = ((dayIdx + 0.5) / days) * 240;
      const y = 46 - (value / max) * 42;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { path: `M0,46 L${points.join(" L")} L240,46 Z`, days };
  }, [series, meta]);

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);
  const veilCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const appliedRef = useRef({ t: -1, signature: "" });

  // mean over a windowHours-wide window centered on the given hour; a window
  // of 1 is the raw hourly value, and 255-coded gaps just shrink the window
  // instead of poking holes
  const meanAt = (
    stationIdx: number,
    hour: number,
    windowHours: number,
  ): number | null => {
    const currentSeries = seriesRef.current;
    const currentMeta = metaRef.current;
    if (!currentSeries || !currentMeta) return null;
    const stationCount = currentMeta.stations.length;
    const windowStart = Math.max(0, hour - (windowHours >> 1));
    const windowEnd = Math.min(currentSeries.hours, windowStart + windowHours);
    const count =
      currentSeries.counts[windowEnd * stationCount + stationIdx] -
      currentSeries.counts[windowStart * stationCount + stationIdx];
    if (!count) return null;
    return (
      (currentSeries.sums[windowEnd * stationCount + stationIdx] -
        currentSeries.sums[windowStart * stationCount + stationIdx]) /
      count
    );
  };

  const valueAt = (
    stationIdx: number,
    t: number,
    windowHours = 1,
  ): number | null => {
    const currentSeries = seriesRef.current;
    if (!currentSeries) return null;
    const h0 = Math.max(0, Math.min(currentSeries.hours - 1, Math.floor(t)));
    const h1 = Math.min(currentSeries.hours - 1, h0 + 1);
    const mean0 = meanAt(stationIdx, h0, windowHours);
    const mean1 = meanAt(stationIdx, h1, windowHours);
    if (mean0 === null && mean1 === null) return null;
    const value0 = mean0 === null ? (mean1 as number) : mean0;
    const value1 = mean1 === null ? (mean0 as number) : mean1;
    return value0 + (value1 - value0) * (t - h0);
  };
  const valueAtRef = useRef(valueAt);
  valueAtRef.current = valueAt;
  // rolling-mean window in hours, follows the selected playback speed
  const windowHoursRef = useRef(24);

  const onFrame = (t: number) => {
    const currentSeries = seriesRef.current;
    const hours = currentSeries?.hours ?? 8760;
    if (clockRef.current) {
      const start = currentSeries?.start;
      if (start) {
        const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
        const [dateFmt, timeFmt] = clockFormats(locale);
        const date = new Date(start + Math.floor(t) * 3600e3);
        clockRef.current.textContent = `${dateFmt.format(date)}\n${timeFmt.format(date)}`;
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
    const veilContext = veilCtxRef.current;
    if (!deck || !basemap || !veilContext) return;
    const windowHours = windowHoursRef.current;
    const signature = `${pollRef.current}|${yearRef.current}|${windowHours}|${currentSeries ? 1 : 0}`;
    if (
      Math.abs(t - appliedRef.current.t) < 0.02 &&
      signature === appliedRef.current.signature
    )
      return;
    appliedRef.current = { t, signature };
    const currentMeta = metaRef.current;
    const box = bboxRef.current;
    if (!currentSeries || !currentMeta || !box) return;

    // current value per station (rolling mean sized to the playback speed)
    const stationCount = currentMeta.stations.length;
    const stationValues = new Float32Array(stationCount).fill(-1);
    for (let i = 0; i < stationCount; i++) {
      const value = valueAtRef.current(i, t, windowHours);
      if (value !== null) stationValues[i] = value;
    }

    // IDW veil onto the grid; alpha fades away from the nearest station
    const img = veilContext.createImageData(GRID_W, GRID_H);
    const domain = DOMAIN[pollRef.current];
    const lonSpan = box.maxLon - box.minLon;
    const mercSpan = box.mercMax - box.mercMin;
    for (let gy = 0; gy < GRID_H; gy++) {
      const mercY = box.mercMax - (gy / (GRID_H - 1)) * mercSpan;
      const lat = Math.atan(Math.sinh(mercY)) * (180 / Math.PI);
      for (let gx = 0; gx < GRID_W; gx++) {
        const lon = box.minLon + (gx / (GRID_W - 1)) * lonSpan;
        let numerator = 0;
        let denominator = 0;
        let minDistSq = Infinity;
        for (let i = 0; i < stationCount; i++) {
          if (stationValues[i] < 0) continue;
          const station = currentMeta.stations[i];
          const dx = (station.lon - lon) * 0.66; // ≈cos(48.8°), degrees→comparable
          const dy = station.lat - lat;
          const distSq = dx * dx + dy * dy + 1e-6;
          if (distSq < minDistSq) minDistSq = distSq;
          const weight = 1 / (distSq * distSq); // IDW power 4: crisper local structure
          numerator += weight * stationValues[i];
          denominator += weight;
        }
        const pixelOffset = (gy * GRID_W + gx) * 4;
        if (!denominator) continue;
        const value = numerator / denominator;
        const [r, g, b] = rampColor(value / domain);
        // fade the veil where the nearest station is far (no information)
        const dist = Math.sqrt(minDistSq);
        const confidence = Math.max(0, 1 - dist / 0.35);
        img.data[pixelOffset] = r;
        img.data[pixelOffset + 1] = g;
        img.data[pixelOffset + 2] = b;
        img.data[pixelOffset + 3] = Math.round(150 * Math.pow(confidence, 0.8));
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
          data: currentMeta.stations,
          getPosition: (station: AirStation) => [station.lon, station.lat],
          getRadius: 700,
          radiusMinPixels: 3,
          radiusMaxPixels: 14,
          stroked: true,
          getLineColor: [230, 232, 238, 200],
          lineWidthMinPixels: 1,
          getFillColor: (station: AirStation, { index }) => {
            const value = stationValues[index];
            if (value < 0) return [80, 86, 100, 120];
            const [r, g, b] = rampColor(value / domain);
            return [r, g, b, 235];
          },
          pickable: true,
          updateTriggers: { getFillColor: [t, pollRef.current, windowHours] },
        }),
      ],
    });
  };

  const clock = useAnimationClock({
    initialTime: params.time,
    autoplay: !params.paused,
    initialSpeed: 24,
    normalize: (t) => {
      const hours = seriesRef.current?.hours ?? 8760;
      return ((t % hours) + hours) % hours;
    },
    onFrame,
  });
  const { timeRef } = clock;
  const speedDef = SPEEDS.find((speed) => speed.value === clock.speed) ?? SPEEDS[1];
  windowHoursRef.current = speedDef.windowHours;
  const meanNote =
    speedDef.windowHours > 1
      ? strings.mean(
          lang === "fr" ? speedDef.windowLabel : speedDef.windowLabel.replace("j", "d"),
        )
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
            const value = valueAtRef.current(
              index,
              timeRef.current,
              windowHoursRef.current,
            );
            const station = object as AirStation;
            const airStrings = AIR[langRef.current];
            const note = meanNoteRef.current;
            return {
              text:
                `${station.name}\n` +
                (value === null
                  ? airStrings.noData
                  : `${Math.round(value)} µg/m³ ${POLL_LABEL[pollRef.current]}` +
                    (note ? ` (${note})` : "")) +
                `\n${station.traffic ? airStrings.traffic : airStrings.background}`,
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
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    timeRef.current = fraction * hours;
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
        infoViz="air"
        onLang={(newLang) => {
          setLang(newLang);
          saveLang(newLang);
        }}
        title={strings.title}
        subtitle={
          <>
            {error
              ? commonStrings.error(error)
              : meta
                ? strings.subtitle(meta.stations.length.toLocaleString(locale))
                : strings.loading}
            {meta && !series && !error && (
              <span className="mode-loading"> …</span>
            )}
          </>
        }
        clockRef={clockRef}
        clockInitial="--"
        clockNote={<div className="clock-note">{meanNote ?? strings.hourly}</div>}
        playing={clock.playing}
        onTogglePlay={() => clock.setPlaying((playing) => !playing)}
        speed={clock.speed}
        speeds={SPEEDS.map((speed) => ({
          value: speed.value,
          label: lang === "fr" ? speed.label : speed.label.replace("j/s", "d/s"),
        }))}
        onSpeed={clock.setSpeed}
        labels={{
          play: commonStrings.play,
          pause: commonStrings.pause,
          speed: commonStrings.speed,
          time: commonStrings.time,
          sheetToggle: commonStrings.sheetToggle,
        }}
        controlsExtra={
          <div className="poll-toggle" role="radiogroup" aria-label="Polluant">
            {POLLS.map((pollutant) => (
              <button
                key={pollutant}
                role="radio"
                aria-checked={poll === pollutant}
                className={poll === pollutant ? "active" : ""}
                onClick={() => setPoll(pollutant)}
              >
                {POLL_LABEL[pollutant]}
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
          onInput: (value) => {
            timeRef.current = value;
          },
        }}
        footer={strings.footer}
      >
        <div
          className="year-row sheet-hide"
          role="radiogroup"
          aria-label={strings.yearAria}
        >
          {years.map((yearOption) => (
            <button
              key={yearOption}
              role="radio"
              aria-checked={year === yearOption}
              className={`year-pill${year === yearOption ? " active" : ""}`}
              onClick={() => setYear(yearOption)}
            >
              {yearOption}
            </button>
          ))}
        </div>
        <button className="story-btn sheet-hide" onClick={lockdown}>
          {strings.lockdown}
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
          <p className="pulse-legend">{strings.legend}</p>
        </div>
        <VizLinks current="air" lang={lang} />
      </VizPanel>
    </div>
  );
}
