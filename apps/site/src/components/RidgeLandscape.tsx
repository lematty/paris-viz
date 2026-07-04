"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
const ROWS = 70;
const SAMPLES = 260;

const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

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

/** Station projected into ridge space: fractional row + sample column. */
interface Placed {
  st: PulseStation;
  row: number;
  col: number;
}

export default function RidgeLandscape() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
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
  const timeRef = useRef(params.time);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    fetch("/pulse.json")
      .then((r) => {
        if (!r.ok) throw new Error(`pulse.json: HTTP ${r.status}`);
        return r.json() as Promise<PulseData>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  // Stations projected onto the ridge grid. The window is the dense core of
  // the network (5th–95th percentile of station coordinates, padded) so the
  // landscape fills the screen instead of being dominated by empty far edges.
  const placed = useMemo(() => {
    if (!data) return null;
    const lats = data.stations.map((s) => s.lat).sort((a, b) => a - b);
    const lons = data.stations.map((s) => s.lon).sort((a, b) => a - b);
    const q = (arr: number[], f: number) => arr[Math.floor(arr.length * f)];
    const latPad = 0.06;
    const lonPad = 0.1;
    const minLat = q(lats, 0.04) - latPad;
    const maxLat = q(lats, 0.96) + latPad;
    const minLon = q(lons, 0.04) - lonPad;
    const maxLon = q(lons, 0.96) + lonPad;
    const list: Placed[] = [];
    let maxTaps = 0;
    for (const st of data.stations) {
      const row = ((maxLat - st.lat) / (maxLat - minLat)) * (ROWS - 1);
      const col = ((st.lon - minLon) / (maxLon - minLon)) * (SAMPLES - 1);
      if (row < -2 || row > ROWS + 1 || col < -4 || col > SAMPLES + 3) continue;
      list.push({ st, row, col });
      for (const f of ["w", "s", "u"] as const) {
        const arr = st[f];
        for (let h = 0; h < 24; h++) {
          maxTaps = Math.max(maxTaps, (arr[0] * arr[1 + h]) / 1000);
        }
      }
    }
    return { list, maxTaps, minLat, maxLat, minLon, maxLon };
  }, [data]);
  const placedRef = useRef(placed);
  placedRef.current = placed;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const heights = new Float32Array(ROWS * SAMPLES);

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

      const p = placedRef.current;
      const W = canvas.width;
      const H = canvas.height;
      ctx.fillStyle = "#06080d";
      ctx.fillRect(0, 0, W, H);
      if (!p) return;

      const day = dayRef.current;
      const top = H * 0.1;
      const spacing = (H * 0.8) / ROWS;
      const amp = spacing * 7; // tallest peak spans ~7 rows
      const xStep = W / (SAMPLES - 1);

      // accumulate the landscape: each station is a small gaussian bump
      // spread over neighbouring rows and columns
      heights.fill(0);
      const norm = 1 / Math.sqrt(p.maxTaps || 1);
      for (const { st, row, col } of p.list) {
        const v = tapsPerHour(st, day, t);
        if (v <= 0) continue;
        const a = Math.sqrt(v) * norm * amp;
        const r0 = Math.max(0, Math.ceil(row - 1.6));
        const r1 = Math.min(ROWS - 1, Math.floor(row + 1.6));
        const c0 = Math.max(0, Math.ceil(col - 7));
        const c1 = Math.min(SAMPLES - 1, Math.floor(col + 7));
        for (let r = r0; r <= r1; r++) {
          const wr = Math.exp(-((r - row) * (r - row)) / 1.1);
          const base = r * SAMPLES;
          for (let c = c0; c <= c1; c++) {
            const wc = Math.exp(-((c - col) * (c - col)) / 9);
            heights[base + c] += a * wr * wc;
          }
        }
      }

      // draw back (north) to front (south); filled areas occlude what's behind
      ctx.lineWidth = Math.max(1, W / 1600);
      for (let r = 0; r < ROWS; r++) {
        const baseY = top + r * spacing;
        ctx.beginPath();
        ctx.moveTo(0, baseY - heights[r * SAMPLES]);
        for (let c = 1; c < SAMPLES; c++) {
          ctx.lineTo(c * xStep, baseY - heights[r * SAMPLES + c]);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fillStyle = "#06080d";
        ctx.fill();
        ctx.strokeStyle = "rgba(230, 232, 238, 0.85)";
        ctx.beginPath();
        ctx.moveTo(0, baseY - heights[r * SAMPLES]);
        for (let c = 1; c < SAMPLES; c++) {
          ctx.lineTo(c * xStep, baseY - heights[r * SAMPLES + c]);
        }
        ctx.stroke();
      }

      // hover: name the tallest station near the cursor
      const m = mouseRef.current;
      if (m) {
        const dpr = canvas.width / canvas.clientWidth;
        const mx = m.x * dpr;
        const my = m.y * dpr;
        let best: Placed | null = null;
        let bestD = Infinity;
        for (const pl of p.list) {
          const sx = pl.col * xStep;
          const sy = top + pl.row * spacing;
          const d = Math.hypot(sx - mx, sy - my);
          if (d < bestD) {
            bestD = d;
            best = pl;
          }
        }
        if (best && bestD < 40 * dpr) {
          const v = Math.round(tapsPerHour(best.st, day, t));
          const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
          const label = `${best.st.n} · ${PULSE[langRef.current].perHour(v.toLocaleString(locale))}`;
          const sx = best.col * xStep;
          const sy = top + best.row * spacing;
          ctx.font = `${13 * dpr}px system-ui, sans-serif`;
          const w = ctx.measureText(label).width + 16 * dpr;
          const bx = Math.min(Math.max(sx - w / 2, 8), W - w - 8);
          const by = Math.max(sy - 46 * dpr, 8);
          ctx.fillStyle = "rgba(16, 24, 40, 0.92)";
          ctx.beginPath();
          ctx.roundRect(bx, by, w, 26 * dpr, 6 * dpr);
          ctx.fill();
          ctx.fillStyle = "#e6e8ee";
          ctx.fillText(label, bx + 8 * dpr, by + 18 * dpr);
          ctx.fillStyle = "#f98e09";
          ctx.beginPath();
          ctx.arc(sx, sy, 3 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    raf = requestAnimationFrame(tick);
    (window as unknown as Record<string, unknown>).__pulse = {
      setTime: (t: number) => {
        timeRef.current = t;
      },
    };
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const locale = lang === "fr" ? "fr-FR" : "en-GB";

  return (
    <div className="flow">
      <canvas
        ref={canvasRef}
        className="ridge-canvas"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }}
        onPointerLeave={() => {
          mouseRef.current = null;
        }}
      />
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
        <p className="pulse-legend sheet-hide">{pu.legend}</p>
        <p className="flow-footer sheet-hide">{pu.footer}</p>
      </div>
    </div>
  );
}
