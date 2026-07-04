"use client";

import { useEffect, useRef, useState } from "react";
import { Deck } from "@deck.gl/core";
import { TileLayer, TripsLayer, type GeoBoundingBox } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";

interface FlowMeta {
  name: string;
  date: string;
  minT: number;
  maxT: number;
  lines: { name: string; color: string }[];
  counts: number[];
  lineIdx: number[];
}

interface Trip {
  path: [number, number][];
  timestamps: number[];
  color: [number, number, number];
}

interface ModeData {
  meta: FlowMeta;
  trips: Trip[];
}

const MODES = [
  { key: "metro", label: "Métro" },
  { key: "rail", label: "RER & Transilien" },
  { key: "tram", label: "Tramway" },
] as const;
type ModeKey = (typeof MODES)[number]["key"];

const SPEEDS = [30, 60, 120, 300];

const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

async function loadMode(key: ModeKey): Promise<ModeData> {
  const [meta, buf] = await Promise.all([
    fetch(`/flow/${key}.json`).then((r) => {
      if (!r.ok) throw new Error(`${key}.json: HTTP ${r.status}`);
      return r.json() as Promise<FlowMeta>;
    }),
    fetch(`/flow/${key}.bin`).then((r) => {
      if (!r.ok) throw new Error(`${key}.bin: HTTP ${r.status}`);
      return r.arrayBuffer();
    }),
  ]);
  const colors = meta.lines.map((l) => hexToRgb(l.color));
  const floats = new Float32Array(buf);
  const trips: Trip[] = [];
  let i = 0;
  for (let k = 0; k < meta.counts.length; k++) {
    const count = meta.counts[k];
    const path: [number, number][] = [];
    const timestamps: number[] = [];
    for (let j = 0; j < count; j++) {
      path.push([floats[i], floats[i + 1]]);
      timestamps.push(floats[i + 2]);
      i += 3;
    }
    trips.push({ path, timestamps, color: colors[meta.lineIdx[k]] });
  }
  return { meta, trips };
}

/** Initial state can come from the URL: ?modes=metro,tram&t=30600&paused=1&speed=120 */
function readParams() {
  const p =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const modesParam = p.get("modes")?.split(",");
  const enabled = Object.fromEntries(
    MODES.map(({ key }) => [key, modesParam ? modesParam.includes(key) : true]),
  ) as Record<ModeKey, boolean>;
  return {
    enabled,
    paused: p.get("paused") === "1",
    time: p.get("t") ? +p.get("t")! : 8 * 3600,
    speed: p.get("speed") ? +p.get("speed")! : 60,
  };
}
const params = readParams();

export default function FlowMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Partial<Record<ModeKey, ModeData>>>({});
  const [enabled, setEnabled] = useState<Record<ModeKey, boolean>>(
    params.enabled,
  );
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(!params.paused);
  const [speed, setSpeed] = useState(params.speed);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const timeRef = useRef<number>(params.time);
  const boundsRef = useRef<[number, number]>([5 * 3600, 26 * 3600]);

  useEffect(() => {
    let deck: Deck | null = null;
    let raf = 0;
    let disposed = false;

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

    deck = new Deck({
      parent: containerRef.current!,
      initialViewState: {
        longitude: 2.35,
        latitude: 48.86,
        zoom: 11,
        minZoom: 8,
        maxZoom: 17,
      },
      controller: true,
      layers: [basemap],
    });

    // all modes load in parallel; each appears as soon as it arrives
    for (const { key } of MODES) {
      loadMode(key)
        .then((data) => {
          if (disposed) return;
          setLoaded((prev) => {
            const next = { ...prev, [key]: data };
            const metas = Object.values(next).map((d) => d!.meta);
            boundsRef.current = [
              Math.min(...metas.map((m) => m.minT)),
              Math.max(...metas.map((m) => m.maxT)),
            ];
            if (sliderRef.current) {
              sliderRef.current.min = String(boundsRef.current[0]);
              sliderRef.current.max = String(boundsRef.current[1]);
            }
            return next;
          });
        })
        .catch((e: Error) => setError(e.message));
    }

    let last = performance.now();
    let appliedTime = -1;
    let appliedSig = "";
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = (now - last) / 1000;
      last = now;
      const [minT, maxT] = boundsRef.current;
      if (playingRef.current) {
        let t = timeRef.current + dt * speedRef.current;
        if (t > maxT) t = minT; // loop the day
        timeRef.current = t;
      }
      const t = timeRef.current;
      // DOM updated directly — re-rendering React 60×/s buys nothing here
      if (clockRef.current) clockRef.current.textContent = fmtClock(t);
      if (sliderRef.current && document.activeElement !== sliderRef.current)
        sliderRef.current.value = String(Math.round(t));
      // while paused (and nothing toggled/loaded), skip the redraw entirely
      const sig = MODES.map(({ key }) =>
        enabledRef.current[key] && loadedRef.current[key] ? key : "",
      ).join(",");
      if (t === appliedTime && sig === appliedSig) return;
      appliedTime = t;
      appliedSig = sig;
      const layers = [
        basemap,
        ...MODES.filter(
          ({ key }) => enabledRef.current[key] && loadedRef.current[key],
        ).map(
          ({ key }) =>
            new TripsLayer({
              id: `trips-${key}`,
              data: loadedRef.current[key]!.trips,
              getPath: (d: Trip) => d.path,
              getTimestamps: (d: Trip) => d.timestamps,
              getColor: (d: Trip) => d.color,
              widthMinPixels: 3,
              capRounded: true,
              jointRounded: true,
              trailLength: 120, // seconds of fading trail
              currentTime: t,
              shadowEnabled: false,
            }),
        ),
      ];
      deck!.setProps({ layers });
    };
    raf = requestAnimationFrame(tick);

    // automation/debug handle
    (window as unknown as Record<string, unknown>).__flow = {
      setTime: (t: number) => {
        timeRef.current = t;
      },
      getTime: () => timeRef.current,
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      deck?.finalize();
    };
  }, []);

  const totalTrips = Object.values(loaded).reduce(
    (s, d) => s + (d?.meta.counts.length ?? 0),
    0,
  );
  const date = Object.values(loaded)[0]?.meta.date;

  return (
    <div className="flow">
      <div ref={containerRef} className="flow-canvas" />
      <div className="flow-panel">
        <h1>Flux — le réseau ferré en direct différé</h1>
        <p className="sub">
          {error
            ? `Erreur : ${error}`
            : date
              ? `${totalTrips.toLocaleString("fr-FR")} trajets d'après l'horaire du ${date}`
              : "chargement des horaires…"}
        </p>
        <div className="flow-clock" ref={clockRef}>
          --:--
        </div>
        <div className="flow-controls">
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause" : "Lecture"}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
            aria-label="Vitesse"
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
          min={5 * 3600}
          max={26 * 3600}
          step={60}
          defaultValue={params.time}
          onInput={(e) => {
            timeRef.current = +(e.target as HTMLInputElement).value;
          }}
          aria-label="Heure"
        />
        <div className="flow-modes">
          {MODES.map(({ key, label }) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={enabled[key]}
                onChange={() =>
                  setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))
                }
              />
              {label}
              {!loaded[key] && !error && <span className="mode-loading"> …</span>}
            </label>
          ))}
        </div>
        <p className="flow-footer">
          Horaires : Île-de-France Mobilités · Fond de carte © OpenStreetMap ©
          CARTO
        </p>
      </div>
    </div>
  );
}
