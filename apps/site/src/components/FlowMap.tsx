"use client";

import { useEffect, useRef, useState } from "react";
import { Deck } from "@deck.gl/core";
import { TileLayer, TripsLayer, type GeoBoundingBox } from "@deck.gl/geo-layers";
import { BitmapLayer, ScatterplotLayer } from "@deck.gl/layers";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { FLUX } from "@/lib/siteStrings";
import LangToggle from "./LangToggle";

interface FlowMeta {
  name: string;
  date: string;
  minT: number;
  maxT: number;
  lines: { name: string; color: string }[];
  counts: number[];
  lineIdx: number[];
  stations: [number, number][];
}

interface Trip {
  path: [number, number][];
  timestamps: number[];
  color: [number, number, number];
  line: string;
}

interface ModeData {
  meta: FlowMeta;
  trips: Trip[];
}

interface BusMeta {
  name: string;
  date: string;
  lines: { name: string; color: string }[];
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
  t0: number; // quantized time origin (seconds)
  hours: number[];
}

/** Chunk layout: u32 tripCount | per trip (u16 wpCount, u16 lineIdx) |
 * per waypoint (u16 qLon, u16 qLat, u16 qT — 2-second steps from t0). */
function decodeBusChunk(buf: ArrayBuffer, meta: BusMeta): Trip[] {
  const dv = new DataView(buf);
  const [minLon, minLat, maxLon, maxLat] = meta.bbox;
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;
  const colors = meta.lines.map((l) => hexToRgb(l.color));
  const n = dv.getUint32(0, true);
  let o = 4;
  const headers: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    headers.push([dv.getUint16(o, true), dv.getUint16(o + 2, true)]);
    o += 4;
  }
  const trips: Trip[] = [];
  for (const [count, lineIdx] of headers) {
    const path: [number, number][] = [];
    const timestamps: number[] = [];
    for (let j = 0; j < count; j++) {
      path.push([
        minLon + (dv.getUint16(o, true) / 65535) * lonSpan,
        minLat + (dv.getUint16(o + 2, true) / 65535) * latSpan,
      ]);
      timestamps.push(meta.t0 + dv.getUint16(o + 4, true) * 2);
      o += 6;
    }
    trips.push({
      path,
      timestamps,
      color: colors[lineIdx],
      line: meta.lines[lineIdx].name,
    });
  }
  return trips;
}

const MODES = [{ key: "metro" }, { key: "rail" }, { key: "tram" }] as const;
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
    trips.push({
      path,
      timestamps,
      color: colors[meta.lineIdx[k]],
      line: meta.lines[meta.lineIdx[k]].name,
    });
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
    // buses are opt-in: heavy, and visually dominant over the rail network
    bus: modesParam ? modesParam.includes("bus") : false,
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
  const [lang, setLang] = useState<Lang>(loadLang);
  // solo one line: {mode, line} — clicking its chip again returns to all
  const [solo, setSolo] = useState<{ mode: ModeKey; line: string } | null>(null);
  const [busEnabled, setBusEnabled] = useState(params.bus);
  const [busMeta, setBusMeta] = useState<BusMeta | null>(null);
  const [busLoading, setBusLoading] = useState(0);
  const langRef = useRef(lang);
  langRef.current = lang;
  const fx = FLUX[lang];
  const busEnabledRef = useRef(busEnabled);
  busEnabledRef.current = busEnabled;
  const soloRef = useRef(solo);
  soloRef.current = solo;
  const busMetaRef = useRef(busMeta);
  busMetaRef.current = busMeta;
  const busChunksRef = useRef(new Map<number, Trip[]>());
  const busPendingRef = useRef(new Set<number>());

  // bus meta loads lazily on first enable
  useEffect(() => {
    if (!busEnabled || busMeta) return;
    fetch("/flow/bus.json")
      .then((r) => {
        if (!r.ok) throw new Error(`bus.json: HTTP ${r.status}`);
        return r.json() as Promise<BusMeta>;
      })
      .then(setBusMeta)
      .catch((e: Error) => setError(e.message));
  }, [busEnabled, busMeta]);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  // trips actually drawn per mode (full set, or the soloed line's subset)
  const displayRef = useRef<Partial<Record<ModeKey, Trip[]>>>({});
  const dataVersionRef = useRef(0);

  useEffect(() => {
    const display: Partial<Record<ModeKey, Trip[]>> = {};
    for (const { key } of MODES) {
      const data = loaded[key];
      if (!data) continue;
      display[key] =
        solo && solo.mode === key
          ? data.trips.filter((t) => t.line === solo.line)
          : solo
            ? [] // solo hides the other modes' trains too
            : data.trips;
    }
    displayRef.current = display;
    dataVersionRef.current++;
  }, [loaded, solo]);
  const timeRef = useRef<number>(params.time);
  const boundsRef = useRef<[number, number]>([5 * 3600, 26 * 3600]);

  // Sliding window: keep only the chunks for [h-1, h, h+1] loaded; called
  // from the animation loop (cheap set arithmetic per frame).
  const ensureBusChunks = (t: number) => {
    const meta = busMetaRef.current;
    if (!meta) return;
    const h = Math.floor(t / 3600);
    const wanted = new Set(
      [h - 1, h, h + 1].filter((x) => meta.hours.includes(x)),
    );
    for (const hour of wanted) {
      if (busChunksRef.current.has(hour) || busPendingRef.current.has(hour))
        continue;
      busPendingRef.current.add(hour);
      setBusLoading((n) => n + 1);
      fetch(`/flow/bus-${hour}.bin`)
        .then((r) => {
          if (!r.ok) throw new Error(`bus-${hour}.bin: HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          busChunksRef.current.set(hour, decodeBusChunk(buf, meta));
          dataVersionRef.current++;
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => {
          busPendingRef.current.delete(hour);
          setBusLoading((n) => n - 1);
        });
    }
    for (const hour of [...busChunksRef.current.keys()]) {
      if (!wanted.has(hour)) {
        busChunksRef.current.delete(hour);
        dataVersionRef.current++;
      }
    }
  };
  const ensureBusChunksRef = useRef(ensureBusChunks);
  ensureBusChunksRef.current = ensureBusChunks;

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
      pickingRadius: 6,
      getTooltip: ({ object, layer }) => {
        if (!object || !layer) return null;
        const mode = layer.id.split("-")[1] as ModeKey;
        return {
          text: `${FLUX[langRef.current].modes[mode]} ${(object as Trip).line}`,
          style: {
            background: "#101828",
            color: "#e6e8ee",
            fontSize: "12px",
            borderRadius: "6px",
            padding: "4px 8px",
          },
        };
      },
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
      if (busEnabledRef.current) ensureBusChunksRef.current(t);
      // while paused (and nothing toggled/loaded), skip the redraw entirely
      const sig =
        MODES.map(({ key }) =>
          enabledRef.current[key] && loadedRef.current[key] ? key : "",
        ).join(",") +
        `|v${dataVersionRef.current}|b${busEnabledRef.current ? 1 : 0}|s${soloRef.current ? 1 : 0}`;
      if (t === appliedTime && sig === appliedSig) return;
      appliedTime = t;
      appliedSig = sig;
      const activeModes = MODES.filter(
        ({ key }) => enabledRef.current[key] && loadedRef.current[key],
      );
      const layers = [
        basemap,
        // buses: one stable layer per loaded hourly chunk, hidden while a
        // rail line is soloed
        ...(busEnabledRef.current && !soloRef.current
          ? [...busChunksRef.current.entries()].map(
              ([hour, trips]) =>
                new TripsLayer({
                  id: `bus-${hour}`,
                  data: trips,
                  getPath: (d: Trip) => d.path,
                  getTimestamps: (d: Trip) => d.timestamps,
                  getColor: (d: Trip) => d.color,
                  widthMinPixels: 2,
                  capRounded: true,
                  jointRounded: true,
                  trailLength: 90,
                  currentTime: t,
                  opacity: 0.5,
                  shadowEnabled: false,
                }),
            )
          : []),
        // stations: faint fixed dots under the trains
        ...activeModes.map(
          ({ key }) =>
            new ScatterplotLayer({
              id: `stations-${key}`,
              data: loadedRef.current[key]!.meta.stations,
              getPosition: (d: [number, number]) => d,
              getFillColor: [154, 163, 181, 90],
              radiusMinPixels: 1.1,
              radiusMaxPixels: 3,
              getRadius: 25,
              pickable: false,
            }),
        ),
        // comet effect: long faint tail + short bright head per mode
        ...activeModes.flatMap(({ key }) => {
          const data = displayRef.current[key] ?? [];
          const common = {
            data,
            getPath: (d: Trip) => d.path,
            getTimestamps: (d: Trip) => d.timestamps,
            getColor: (d: Trip) => d.color,
            capRounded: true,
            jointRounded: true,
            currentTime: t,
            shadowEnabled: false,
          };
          return [
            new TripsLayer({
              ...common,
              id: `tail-${key}`,
              widthMinPixels: 2.5,
              opacity: 0.45,
              trailLength: 150,
            }),
            new TripsLayer({
              ...common,
              id: `head-${key}`,
              widthMinPixels: 4,
              opacity: 0.85,
              trailLength: 25,
              // hovering a train head shows its line
              pickable: true,
            }),
          ];
        }),
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
        </div>
        <h1>{fx.title}</h1>
        <p className="sub">
          {error
            ? fx.error(error)
            : date
              ? fx.subtitle(
                  totalTrips.toLocaleString(lang === "fr" ? "fr-FR" : "en-GB"),
                  date,
                )
              : fx.loading}
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
          min={5 * 3600}
          max={26 * 3600}
          step={60}
          defaultValue={params.time}
          onInput={(e) => {
            timeRef.current = +(e.target as HTMLInputElement).value;
          }}
          aria-label={fx.time}
        />
        <div className="flow-modes">
          {MODES.map(({ key }) => (
            <div key={key} className="flow-mode">
              <label>
                <input
                  type="checkbox"
                  checked={enabled[key]}
                  onChange={() =>
                    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                />
                {fx.modes[key]}
                {!loaded[key] && !error && (
                  <span className="mode-loading"> …</span>
                )}
              </label>
              {enabled[key] && loaded[key] && (
                <div className="line-pills">
                  {loaded[key]!.meta.lines.map((l) => {
                    const isSolo =
                      solo?.mode === key && solo.line === l.name;
                    return (
                      <button
                        key={l.name}
                        className={`line-pill${isSolo ? " solo" : ""}${solo && !isSolo ? " dimmed" : ""}`}
                        style={{ background: l.color }}
                        title={
                          lang === "fr"
                            ? isSolo
                              ? "Réafficher toutes les lignes"
                              : `Afficher seulement ${l.name}`
                            : isSolo
                              ? "Show all lines again"
                              : `Show only ${l.name}`
                        }
                        onClick={() =>
                          setSolo(isSolo ? null : { mode: key, line: l.name })
                        }
                      >
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <div className="flow-mode">
            <label>
              <input
                type="checkbox"
                checked={busEnabled}
                onChange={() => setBusEnabled((b) => !b)}
              />
              {fx.modes.bus}
              {busEnabled && (!busMeta || busLoading > 0) && (
                <span className="mode-loading"> …</span>
              )}
            </label>
          </div>
        </div>
        <p className="flow-footer">{fx.footer}</p>
      </div>
    </div>
  );
}
