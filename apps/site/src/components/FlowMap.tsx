"use client";

import { useEffect, useRef, useState } from "react";
import { Deck } from "@deck.gl/core";
import { TileLayer, TripsLayer, type GeoBoundingBox } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";

interface FlowMeta {
  name: string;
  color: string;
  date: string;
  trips: number;
  minT: number;
  maxT: number;
  counts: number[];
}

interface Trip {
  path: [number, number][];
  timestamps: number[];
}

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

async function loadFlow(key: string): Promise<{ meta: FlowMeta; trips: Trip[] }> {
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
  const floats = new Float32Array(buf);
  const trips: Trip[] = [];
  let i = 0;
  for (const count of meta.counts) {
    const path: [number, number][] = [];
    const timestamps: number[] = [];
    for (let j = 0; j < count; j++) {
      path.push([floats[i], floats[i + 1]]);
      timestamps.push(floats[i + 2]);
      i += 3;
    }
    trips.push({ path, timestamps });
  }
  return { meta, trips };
}

export default function FlowMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<FlowMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(60);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const timeRef = useRef<number>(0);

  useEffect(() => {
    let deck: Deck | null = null;
    let raf = 0;
    let disposed = false;

    loadFlow("metro1")
      .then(({ meta, trips }) => {
        if (disposed) return;
        setMeta(meta);
        timeRef.current = meta.minT + 3600 * 3; // start mid-morning
        const color = hexToRgb(meta.color);

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
            longitude: 2.34,
            latitude: 48.862,
            zoom: 12,
            minZoom: 9,
            maxZoom: 17,
          },
          controller: true,
          layers: [basemap],
        });

        let last = performance.now();
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          const dt = (now - last) / 1000;
          last = now;
          if (playingRef.current) {
            let t = timeRef.current + dt * speedRef.current;
            if (t > meta.maxT) t = meta.minT; // loop the day
            timeRef.current = t;
          }
          const t = timeRef.current;
          // DOM updated directly — re-rendering React 60×/s buys nothing here
          if (clockRef.current) clockRef.current.textContent = fmtClock(t);
          if (sliderRef.current && document.activeElement !== sliderRef.current)
            sliderRef.current.value = String(Math.round(t));
          deck!.setProps({
            layers: [
              basemap,
              new TripsLayer({
                id: "trips",
                data: trips,
                getPath: (d: Trip) => d.path,
                getTimestamps: (d: Trip) => d.timestamps,
                getColor: color,
                widthMinPixels: 4,
                capRounded: true,
                jointRounded: true,
                trailLength: 120, // seconds of fading trail
                currentTime: t,
                shadowEnabled: false,
              }),
            ],
          });
        };
        raf = requestAnimationFrame(tick);

        // automation/debug handle
        (window as unknown as Record<string, unknown>).__flow = {
          setTime: (t: number) => {
            timeRef.current = t;
          },
          getTime: () => timeRef.current,
        };
      })
      .catch((e: Error) => setError(e.message));

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      deck?.finalize();
    };
  }, []);

  return (
    <div className="flow">
      <div ref={containerRef} className="flow-canvas" />
      <div className="flow-panel">
        <h1>Flux — {meta ? meta.name : "métro"}</h1>
        <p className="sub">
          {meta
            ? `Chaque rame d'après l'horaire du ${meta.date} (${meta.trips} trajets)`
            : error
              ? `Erreur : ${error}`
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
        {meta && (
          <input
            ref={sliderRef}
            className="flow-slider"
            type="range"
            min={meta.minT}
            max={meta.maxT}
            step={60}
            defaultValue={meta.minT}
            onInput={(e) => {
              timeRef.current = +(e.target as HTMLInputElement).value;
            }}
            aria-label="Heure"
          />
        )}
        <p className="flow-footer">
          Horaires : Île-de-France Mobilités · Fond de carte © OpenStreetMap ©
          CARTO
        </p>
      </div>
    </div>
  );
}
