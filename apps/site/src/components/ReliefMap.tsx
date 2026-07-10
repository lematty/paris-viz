"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { FLUX, RELIEF } from "@/lib/siteStrings";
import { currentSearchParams, fmtClock } from "@/lib/viz";
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
const ROWS = 42; // latitude slices, north at the back
const BG = "#06080d";
const STROKE = "#ffd166"; // the site's gold, brighter toward the front

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

/** Stations arranged into west-east rows plus the region-wide hourly total. */
interface Landscape {
  rows: { station: ReliefStation; x: number }[][]; // x normalized 0..1
  totals: Record<DayType, number[]>;
  maxTotal: number;
  sqrtMax: number;
}

function buildLandscape(meta: ReliefMeta): Landscape {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const station of meta.stations) {
    if (station.lon < minLon) minLon = station.lon;
    if (station.lon > maxLon) maxLon = station.lon;
    if (station.lat < minLat) minLat = station.lat;
    if (station.lat > maxLat) maxLat = station.lat;
  }
  const rows: { station: ReliefStation; x: number }[][] = Array.from(
    { length: ROWS },
    () => [],
  );
  for (const station of meta.stations) {
    const row = Math.min(
      ROWS - 1,
      Math.floor(((maxLat - station.lat) / (maxLat - minLat + 1e-9)) * ROWS),
    );
    rows[row].push({
      station,
      x: (station.lon - minLon) / (maxLon - minLon + 1e-9),
    });
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);

  const totals: Record<DayType, number[]> = {
    w: new Array(24).fill(0),
    s: new Array(24).fill(0),
    d: new Array(24).fill(0),
  };
  for (const station of meta.stations)
    for (const type of ["w", "s", "d"] as const)
      for (let hour = 0; hour < 24; hour++) totals[type][hour] += station[type][hour];
  const maxTotal = Math.max(...totals.w, ...totals.s, ...totals.d);
  return { rows, totals, maxTotal, sqrtMax: Math.sqrt(meta.maxPerHour) };
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const curveRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
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
  const landscapeRef = useRef<Landscape | null>(null);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  // hovered station and pointer position, updated without re-rendering
  const hoverRef = useRef<{ station: ReliefStation; x: number; row: number } | null>(null);

  useEffect(() => {
    fetch("/relief/stations.json")
      .then((response) => {
        if (!response.ok)
          throw new Error(`stations.json: HTTP ${response.status}`);
        return response.json() as Promise<ReliefMeta>;
      })
      .then((nextMeta) => {
        landscapeRef.current = buildLandscape(nextMeta);
        setMeta(nextMeta);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // canvas geometry, shared by drawing and hit testing
  const layout = (width: number, height: number) => {
    const left = Math.max(24, width * 0.03);
    const right = width - left;
    const top = height * 0.17;
    const bottom = height * 0.94;
    const rowY = (row: number) => top + ((bottom - top) * row) / (ROWS - 1);
    const peak = height * 0.16;
    const bump = Math.max(5, width * 0.005);
    return { left, right, top, bottom, rowY, peak, bump };
  };

  const draw = (t: number) => {
    const canvas = canvasRef.current;
    const landscape = landscapeRef.current;
    if (!canvas || !landscape) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);

    const { left, right, rowY, peak, bump } = layout(width, height);
    const span = right - left;
    const hourFloat = t / 3600;
    const day = dayRef.current;
    const hover = hoverRef.current;

    for (let row = 0; row < ROWS; row++) {
      const y = rowY(row);
      ctx.beginPath();
      ctx.moveTo(left, y);
      for (const { station, x } of landscape.rows[row]) {
        const value = valueAt(station[day], hourFloat);
        const h = value <= 0 ? 0 : peak * (Math.sqrt(value) / landscape.sqrtMax);
        const cx = left + x * span;
        if (h > 0.4) {
          ctx.lineTo(cx - bump, y);
          ctx.lineTo(cx, y - h);
          ctx.lineTo(cx + bump, y);
        }
      }
      ctx.lineTo(right, y);
      // fill under the line first so nearer rows occlude the ones behind
      ctx.fillStyle = BG;
      ctx.fill();
      ctx.strokeStyle = STROKE;
      ctx.globalAlpha = 0.4 + 0.55 * (row / (ROWS - 1));
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // hovered summit: a small ring and the tooltip pinned to the peak
    const tooltip = tooltipRef.current;
    if (hover && tooltip) {
      const value = valueAt(hover.station[day], hourFloat);
      const h = value <= 0 ? 0 : peak * (Math.sqrt(value) / landscape.sqrtMax);
      const cx = left + hover.x * span;
      const cy = rowY(hover.row) - h;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const strings = RELIEF[langRef.current];
      const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
      tooltip.style.display = "block";
      tooltip.style.left = `${Math.min(cx + 14, width - 220)}px`;
      tooltip.style.top = `${Math.max(8, cy - 34)}px`;
      tooltip.textContent = `${hover.station.n} · ${strings.perHour(
        (Math.round(value / 10) * 10).toLocaleString(locale),
      )}`;
    } else if (tooltip) {
      tooltip.style.display = "none";
    }

    // the day curve in the panel: region total with a playhead
    const curve = curveRef.current;
    if (curve) {
      const curveWidth = curve.clientWidth;
      const curveHeight = curve.clientHeight;
      if (curveWidth > 0 && curve.width !== Math.round(curveWidth * dpr)) {
        curve.width = Math.round(curveWidth * dpr);
        curve.height = Math.round(curveHeight * dpr);
      }
      const curveCtx = curve.getContext("2d")!;
      curveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      curveCtx.clearRect(0, 0, curveWidth, curveHeight);
      curveCtx.beginPath();
      const totals = landscape.totals[day];
      for (let i = 0; i <= 96; i++) {
        const x = (i / 96) * curveWidth;
        const v = valueAt(totals, (i / 96) * 24);
        const y = curveHeight - 3 - (curveHeight - 8) * (v / landscape.maxTotal);
        if (i === 0) curveCtx.moveTo(x, y);
        else curveCtx.lineTo(x, y);
      }
      curveCtx.strokeStyle = STROKE;
      curveCtx.globalAlpha = 0.9;
      curveCtx.lineWidth = 1.25;
      curveCtx.stroke();
      curveCtx.globalAlpha = 1;
      const playX = (t / DAY_SECONDS) * curveWidth;
      curveCtx.strokeStyle = "#e6e8ee";
      curveCtx.beginPath();
      curveCtx.moveTo(playX, 0);
      curveCtx.lineTo(playX, curveHeight);
      curveCtx.stroke();
    }
  };

  const onFrame = (t: number) => {
    if (clockRef.current) clockRef.current.textContent = fmtClock(t);
    if (sliderRef.current && document.activeElement !== sliderRef.current)
      sliderRef.current.value = String(Math.round(t / 60) * 60);
    draw(t);
  };

  const clock = useAnimationClock({
    initialTime: params.t,
    autoplay: !params.paused,
    initialSpeed: 1200,
    normalize: (t) => ((t % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS,
    onFrame,
  });
  const { timeRef } = clock;

  // hit test: nearest station peak around the pointer
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const landscape = landscapeRef.current;
    if (!canvas || !landscape) return;
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const { left, right, rowY, peak } = layout(rect.width, rect.height);
    const span = right - left;
    const hourFloat = timeRef.current / 3600;
    const day = dayRef.current;
    let best: { station: ReliefStation; x: number; row: number } | null = null;
    let bestDist = 18;
    for (let row = 0; row < ROWS; row++) {
      const y = rowY(row);
      if (y - py > peak + 20 || py - y > 24) continue;
      for (const { station, x } of landscape.rows[row]) {
        const cx = left + x * span;
        const dx = Math.abs(cx - px);
        if (dx > bestDist) continue;
        const value = valueAt(station[day], hourFloat);
        const h = value <= 0 ? 0 : peak * (Math.sqrt(value) / landscape.sqrtMax);
        if (py < y - h - 16 || py > y + 12) continue;
        bestDist = dx;
        best = { station, x, row };
      }
    }
    hoverRef.current = best;
  };
  const onPointerLeave = () => {
    hoverRef.current = null;
  };

  // the small curve is also a scrubber: drag to move through the day
  const scrub = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.buttons === 0 && event.type !== "pointerdown") return;
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    timeRef.current = frac * DAY_SECONDS;
  };

  const story = () => {
    setDay("w");
    timeRef.current = 18 * 3600;
    clock.setPlaying(false);
  };

  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const period = useMemo(() => {
    if (!meta) return "";
    const format = (iso: string) =>
      new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, {
        month: "short",
        year: undefined,
      });
    const year = meta.end.slice(0, 4);
    return `${format(meta.start)}-${format(meta.end)} ${year}`;
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
      <canvas
        ref={canvasRef}
        className="ridge-canvas"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      />
      <div
        ref={tooltipRef}
        style={{
          display: "none",
          position: "fixed",
          zIndex: 5,
          pointerEvents: "none",
          background: "#101828",
          color: "#e6e8ee",
          fontSize: "12px",
          borderRadius: "6px",
          padding: "4px 8px",
        }}
      />
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
