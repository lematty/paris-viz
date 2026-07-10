"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  Deck,
  DirectionalLight,
  LightingEffect,
} from "@deck.gl/core";
import { ColumnLayer, ScatterplotLayer } from "@deck.gl/layers";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { FLUX, RELIEF } from "@/lib/siteStrings";
import { currentSearchParams, fmtClock, hexToRgb } from "@/lib/viz";
import { createBasemapLayer, DECK_TOOLTIP_STYLE } from "./viz/basemap";
import { mountDeck } from "./viz/deckMount";
import { useAnimationClock } from "./viz/useAnimationClock";
import VizLinks from "./viz/VizLinks";
import VizPanel from "./viz/VizPanel";

interface ReliefStation {
  n: string;
  lon: number;
  lat: number;
  w: number[];
  s: number[];
  d: number[];
}

interface ReliefMeta {
  start: string;
  end: string;
  count: number;
  maxPerHour: number;
  stations: ReliefStation[];
}

type DayType = "w" | "s" | "d";

const DAY_PARAM: Record<string, DayType> = {
  weekday: "w",
  saturday: "s",
  sunday: "d",
};
const PARAM_OF_DAY: Record<DayType, "weekday" | "saturday" | "sunday"> = {
  w: "weekday",
  s: "saturday",
  d: "sunday",
};

const DAY_SECONDS = 86400;
// height is linear in validations/hour (the honest length encoding: the
// summits tower, the sea stays calm); color carries the mid-range through
// the site's amber ramp, dark bronze to white-hot
const SPIKE_HEX = ["#8a6a28", "#a9832c", "#c99e33", "#e9bc44", "#ffd166", "#fff0c2"];
const SPIKE_RGB = SPIKE_HEX.map(hexToRgb);
const SPIKE_BINS = [0.12, 0.25, 0.4, 0.6, 0.8]; // sqrt share of the peak
const BASE_DOT_RGBA: [number, number, number, number] = [230, 232, 238, 60];
const MAX_SPIKE_M = 7000; // Saint-Lazare at 6pm, in meters of column
const MIN_SPIKE_M = 40; // active stations register at least as a nub

const SPEEDS = [
  { value: 600, label: "1×" },
  { value: 1200, label: "2×" },
  { value: 2400, label: "4×" },
];

function readParams() {
  const searchParams = currentSearchParams();
  const t = searchParams.get("t") ? +searchParams.get("t")! : 8 * 3600;
  return {
    t: Number.isFinite(t) ? Math.max(0, Math.min(DAY_SECONDS, t)) : 8 * 3600,
    paused: searchParams.get("paused") === "1",
    day: DAY_PARAM[searchParams.get("day") || ""] ?? ("w" as DayType),
  };
}

/** Validations/hour at a fractional hour, the day wrapping at midnight. */
function valueAt(values: number[], hourFloat: number): number {
  const h0 = Math.floor(hourFloat) % 24;
  const h1 = (h0 + 1) % 24;
  const frac = hourFloat - Math.floor(hourFloat);
  return values[h0] + (values[h1] - values[h0]) * frac;
}

export default function ReliefMap() {
  // read once per mount (module-level reads go stale across client navs)
  const [params] = useState(readParams);
  const containerRef = useRef<HTMLDivElement>(null);
  const curveRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<ReliefMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<DayType>(params.day);
  const [lang, setLang] = useState<Lang>(loadLang);
  const commonStrings = FLUX[lang];
  const strings = RELIEF[lang];
  const langRef = useRef(lang);
  langRef.current = lang;
  const dayRef = useRef(day);
  dayRef.current = day;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const totalsRef = useRef<Record<DayType, number[]> | null>(null);
  const maxTotalRef = useRef(1);
  const hourRef = useRef(params.t / 3600);

  useEffect(() => {
    fetch("/relief/stations.json")
      .then((response) => {
        if (!response.ok)
          throw new Error(`stations.json: HTTP ${response.status}`);
        return response.json() as Promise<ReliefMeta>;
      })
      .then((nextMeta) => {
        const totals: Record<DayType, number[]> = {
          w: new Array(24).fill(0),
          s: new Array(24).fill(0),
          d: new Array(24).fill(0),
        };
        for (const station of nextMeta.stations)
          for (const type of ["w", "s", "d"] as const)
            for (let hour = 0; hour < 24; hour++)
              totals[type][hour] += station[type][hour];
        totalsRef.current = totals;
        maxTotalRef.current = Math.max(...totals.w, ...totals.s, ...totals.d);
        setMeta(nextMeta);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);
  const appliedRef = useRef({ quantized: -1, day: "w" as DayType, meta: null as ReliefMeta | null });

  const draw = (t: number) => {
    const deck = deckRef.current;
    const basemap = basemapRef.current;
    const meta = metaRef.current;
    if (!deck || !basemap || !meta) return;
    const hourFloat = t / 3600;
    hourRef.current = hourFloat;
    // quantize so paused frames and sub-frame ticks skip redraws
    const quantized = Math.round(hourFloat * 60) / 60;
    const day = dayRef.current;
    const applied = appliedRef.current;
    if (quantized === applied.quantized && day === applied.day && meta === applied.meta)
      return;
    appliedRef.current = { quantized, day, meta };

    const sqrtMax = Math.sqrt(meta.maxPerHour);
    const colorOf = (value: number): [number, number, number] => {
      const share = Math.sqrt(value) / sqrtMax;
      for (let bin = 0; bin < SPIKE_BINS.length; bin++)
        if (share < SPIKE_BINS[bin]) return SPIKE_RGB[bin];
      return SPIKE_RGB[SPIKE_BINS.length];
    };
    deck.setProps({
      layers: [
        basemap,
        // every station keeps a faint footprint, so the quiet network stays
        // visible on the map at 3am
        new ScatterplotLayer<ReliefStation>({
          id: "relief-dots",
          data: meta.stations,
          getPosition: (station) => [station.lon, station.lat],
          getRadius: 90,
          radiusUnits: "meters",
          getFillColor: BASE_DOT_RGBA,
        }),
        new ColumnLayer<ReliefStation>({
          id: "relief-spikes",
          data: meta.stations,
          diskResolution: 10,
          radius: 130,
          extruded: true,
          getPosition: (station) => [station.lon, station.lat],
          getElevation: (station) => {
            const value = valueAt(station[day], quantized);
            return value <= 0
              ? 0
              : Math.max(MIN_SPIKE_M, MAX_SPIKE_M * (value / meta.maxPerHour));
          },
          getFillColor: (station) => colorOf(valueAt(station[day], quantized)),
          updateTriggers: { getElevation: [quantized, day], getFillColor: [quantized, day] },
          material: {
            ambient: 0.55,
            diffuse: 0.6,
            shininess: 40,
            specularColor: [80, 70, 40],
          },
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 120],
        }),
      ],
    });
  };

  const drawCurve = (t: number) => {
    const curve = curveRef.current;
    const totals = totalsRef.current;
    if (!curve || !totals) return;
    const dpr = window.devicePixelRatio || 1;
    const width = curve.clientWidth;
    const height = curve.clientHeight;
    if (width === 0) return;
    if (curve.width !== Math.round(width * dpr)) {
      curve.width = Math.round(width * dpr);
      curve.height = Math.round(height * dpr);
    }
    const ctx = curve.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    const values = totals[dayRef.current];
    for (let i = 0; i <= 96; i++) {
      const x = (i / 96) * width;
      const v = valueAt(values, (i / 96) * 24);
      const y = height - 3 - (height - 8) * (v / maxTotalRef.current);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#ffd166";
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.globalAlpha = 1;
    const playX = (t / DAY_SECONDS) * width;
    ctx.strokeStyle = "#e6e8ee";
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();
  };

  const onFrame = (t: number) => {
    if (clockRef.current) clockRef.current.textContent = fmtClock(t);
    if (sliderRef.current && document.activeElement !== sliderRef.current)
      sliderRef.current.value = String(Math.round(t / 60) * 60);
    draw(t);
    drawCurve(t);
  };

  const clock = useAnimationClock({
    initialTime: params.t,
    autoplay: !params.paused,
    initialSpeed: 1200,
    normalize: (t) => ((t % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS,
    onFrame,
  });
  const { timeRef } = clock;

  useEffect(() => {
    basemapRef.current = createBasemapLayer();
    return mountDeck(
      () => {
        const deck = new Deck({
          parent: containerRef.current!,
          initialViewState: {
            longitude: 2.36,
            latitude: 48.83,
            zoom: 9.7,
            pitch: 52,
            bearing: 0,
            minZoom: 8.5,
            maxZoom: 14,
            maxPitch: 65,
          },
          controller: true,
          effects: [
            new LightingEffect({
              ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.2 }),
              sun: new DirectionalLight({
                color: [255, 235, 205],
                intensity: 1.2,
                direction: [-1, -0.7, -2],
              }),
            }),
          ],
          getCursor: ({ isDragging, isHovering }) =>
            isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
          getTooltip: ({ object, layer }) => {
            if (!object || layer?.id !== "relief-spikes") return null;
            const strings = RELIEF[langRef.current];
            const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
            const station = object as ReliefStation;
            const value = valueAt(station[dayRef.current], hourRef.current);
            return {
              text: `${station.n} · ${strings.perHour(
                (Math.round(value / 10) * 10).toLocaleString(locale),
              )}`,
              style: DECK_TOOLTIP_STYLE,
            };
          },
          layers: [basemapRef.current],
        });
        deckRef.current = deck;
        (window as unknown as Record<string, unknown>).__relief = {
          setTime: (t: number) => {
            timeRef.current = t;
          },
          getTime: () => timeRef.current,
          // camera override for tests and promo screenshots
          setView: (viewState: Record<string, number>) =>
            deck.setProps({
              initialViewState: {
                longitude: 2.36,
                latitude: 48.83,
                zoom: 9.7,
                pitch: 52,
                bearing: 0,
                ...viewState,
              },
            }),
        };
        return deck;
      },
      () => {
        deckRef.current = null;
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the small curve is also a scrubber: drag to move through the day
  const scrub = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.buttons === 0 && event.type !== "pointerdown") return;
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    timeRef.current = frac * DAY_SECONDS;
  };

  const [, storyTick] = useState(0);
  const story = () => {
    setDay("w");
    timeRef.current = 18 * 3600;
    clock.setPlaying(false);
    // the clock is a ref, so jumping from an already-paused weekday changes
    // no React state: force the re-render anyway
    storyTick((n) => n + 1);
  };

  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const period = useMemo(() => {
    if (!meta) return "";
    const format = (iso: string) =>
      new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { month: "short" });
    return `${format(meta.start)}-${format(meta.end)} ${meta.end.slice(0, 4)}`;
  }, [meta, locale]);

  const subtitle = useMemo(() => {
    if (error) return commonStrings.error(error);
    if (!meta) return strings.loading;
    return strings.subtitle(
      meta.count.toLocaleString(locale),
      new Date(`${meta.start}T12:00:00Z`).toLocaleDateString(locale, {
        month: "short",
        year: "numeric",
      }),
      new Date(`${meta.end}T12:00:00Z`).toLocaleDateString(locale, {
        month: "short",
        year: "numeric",
      }),
    );
  }, [error, meta, commonStrings, strings, locale]);

  return (
    <div className="flow">
      <div ref={containerRef} className="flow-canvas" />
      <VizPanel
        lang={lang}
        onLang={(nextLang) => {
          setLang(nextLang);
          saveLang(nextLang);
        }}
        title={strings.title}
        subtitle={subtitle}
        clockRef={clockRef}
        clockInitial={fmtClock(params.t)}
        clockNote={
          <div className="clock-note">{strings.note(strings.days[day], period)}</div>
        }
        playing={clock.playing}
        onTogglePlay={() => clock.setPlaying((playing) => !playing)}
        speed={clock.speed}
        speeds={SPEEDS}
        onSpeed={(value) => clock.setSpeed(value)}
        labels={{
          play: commonStrings.play,
          pause: commonStrings.pause,
          speed: commonStrings.speed,
          time: commonStrings.time,
          sheetToggle: commonStrings.sheetToggle,
        }}
        controlsExtra={
          <select
            value={PARAM_OF_DAY[day]}
            onChange={(e) => setDay(DAY_PARAM[e.target.value])}
            aria-label={commonStrings.dayAria}
          >
            <option value="weekday">{commonStrings.days.weekday}</option>
            <option value="saturday">{commonStrings.days.saturday}</option>
            <option value="sunday">{commonStrings.days.sunday}</option>
          </select>
        }
        beforeSlider={
          <canvas
            ref={curveRef}
            className="pulse-curve"
            onPointerDown={scrub}
            onPointerMove={scrub}
          />
        }
        slider={{
          ref: sliderRef,
          min: 0,
          max: DAY_SECONDS,
          step: 300,
          defaultValue: params.t,
          onInput: (v) => {
            timeRef.current = v;
          },
        }}
        footer={strings.footer}
      >
        <button className="story-btn sheet-hide" onClick={story}>
          {strings.story}
        </button>
        <p className="pulse-legend sheet-hide">{strings.legend}</p>
        <VizLinks current="relief" lang={lang} />
      </VizPanel>
    </div>
  );
}
