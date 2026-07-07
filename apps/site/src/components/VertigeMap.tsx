"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  Deck,
  DirectionalLight,
  LightingEffect,
  type PickingInfo,
} from "@deck.gl/core";
import { SolidPolygonLayer } from "@deck.gl/layers";
import {
  DataFilterExtension,
  type DataFilterExtensionProps,
} from "@deck.gl/extensions";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { FLUX, VERTIGE } from "@/lib/siteStrings";
import { currentSearchParams, hexToRgb } from "@/lib/viz";
import { createBasemapLayer, DECK_TOOLTIP_STYLE } from "./viz/basemap";
import { useAnimationClock } from "./viz/useAnimationClock";
import VizLinks from "./viz/VizLinks";
import VizPanel from "./viz/VizPanel";

interface VertigeMeta {
  date: string;
  count: number;
  maxH: number;
  usages: string[];
}

/** One building: element offsets into the shared flat positions array. */
interface Building {
  i: number;
  s: number;
  e: number;
  holes?: number[];
}

interface BuildingData {
  buildings: Building[];
  positions: Float64Array;
  hDm: Uint16Array;
  year: Uint16Array;
  floors: Uint8Array;
  usage: Uint8Array;
}

type CeilMode = "below" | "above";

// the clock ceiling rises 0.5 m per unit up to the Haussmann skyline, then
// accelerates: almost everything lives under 30 m and the tower race above
// it would otherwise be minutes of nothing
const BREAK_T = 60; // clock units spent on 0-30 m
const BREAK_M = 30;
const TOP_M = 290; // just above the tallest record (Eiffel Tower, 286 m)
const MAX_T = 90;
const WRAP_T = 96; // a short hold on the full city before the loop restarts
const ceilingAt = (t: number) =>
  t <= BREAK_T
    ? (t * BREAK_M) / BREAK_T
    : BREAK_M + ((t - BREAK_T) * (TOP_M - BREAK_M)) / (MAX_T - BREAK_T);
const timeAt = (m: number) =>
  m <= BREAK_M
    ? (m * BREAK_T) / BREAK_M
    : BREAK_T + ((m - BREAK_M) * (MAX_T - BREAK_T)) / (TOP_M - BREAK_M);

// sequential amber ramp, dim bronze floor to the site's signature gold:
// lightness rises with height so the towers glow on the dark basemap
const BAND_TOPS = [9, 15, 21, 30, 50, 100];
const BAND_HEX = [
  "#514027",
  "#6d5426",
  "#8a6a28",
  "#a9832c",
  "#c99e33",
  "#e9bc44",
  "#ffd166",
];
const BAND_RGB = BAND_HEX.map(hexToRgb);
const bandOf = (dm: number) => {
  const m = dm / 10;
  for (let b = 0; b < BAND_TOPS.length; b++) if (m < BAND_TOPS[b]) return b;
  return BAND_TOPS.length;
};

const SPEEDS = [
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
];

function readParams() {
  const p = currentSearchParams();
  const t = p.get("t") ? +p.get("t")! : 0;
  return {
    t: Number.isFinite(t) ? Math.max(0, Math.min(MAX_T, t)) : 0,
    paused: p.get("paused") === "1",
    mode: (p.get("mode") === "above" ? "above" : "below") as CeilMode,
  };
}

function parseBuildings(buf: ArrayBuffer): BuildingData {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x56455254)
    throw new Error("buildings.bin: bad magic");
  const N = dv.getUint32(4, true);
  const R = dv.getUint32(8, true);
  const V = dv.getUint32(12, true);
  const minLon = dv.getFloat64(16, true);
  const minLat = dv.getFloat64(24, true);
  const maxLon = dv.getFloat64(32, true);
  const maxLat = dv.getFloat64(40, true);
  let off = 48;
  const hDm = new Uint16Array(buf, off, N);
  off += 2 * N;
  const year = new Uint16Array(buf, off, N);
  off += 2 * N;
  const floors = new Uint8Array(buf, off, N);
  off += N;
  const usage = new Uint8Array(buf, off, N);
  off += N;
  const rings = new Uint8Array(buf, off, N);
  off += N;
  off += off % 2;
  const ringVerts = new Uint16Array(buf, off, R);
  off += 2 * R;
  const q = new Uint16Array(buf, off, 2 * V);

  const positions = new Float64Array(2 * V);
  const sx = (maxLon - minLon) / 65535;
  const sy = (maxLat - minLat) / 65535;
  for (let i = 0; i < V; i++) {
    positions[2 * i] = minLon + q[2 * i] * sx;
    positions[2 * i + 1] = minLat + q[2 * i + 1] * sy;
  }

  const buildings: Building[] = new Array(N);
  let ri = 0;
  let ve = 0; // element cursor into positions
  for (let i = 0; i < N; i++) {
    const s = ve;
    const nRings = rings[i];
    let holes: number[] | undefined;
    for (let k = 0; k < nRings; k++) {
      ve += ringVerts[ri + k] * 2;
      if (k < nRings - 1) (holes ??= []).push(ve - s);
    }
    ri += nRings;
    buildings[i] = { i, s, e: ve, holes };
  }
  return { buildings, positions, hDm, year, floors, usage };
}

export default function VertigeMap() {
  // read once per mount (module-level reads go stale across client navs)
  const [params] = useState(readParams);
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<VertigeMeta | null>(null);
  const [data, setData] = useState<BuildingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<CeilMode>(params.mode);
  const [lang, setLang] = useState<Lang>(loadLang);
  const fx = FLUX[lang];
  const vg = VERTIGE[lang];
  const langRef = useRef(lang);
  langRef.current = lang;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const dataRef = useRef(data);
  dataRef.current = data;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    fetch("/vertige/meta.json")
      .then((r) => {
        if (!r.ok) throw new Error(`meta.json: HTTP ${r.status}`);
        return r.json() as Promise<VertigeMeta>;
      })
      .then(setMeta)
      .catch((e: Error) => setError(e.message));
    fetch("/vertige/buildings.bin")
      .then((r) => {
        if (!r.ok) throw new Error(`buildings.bin: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => setData(parseBuildings(buf)))
      .catch((e: Error) => setError(e.message));
  }, []);

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);
  const appliedRef = useRef({
    cq: -1,
    mode: "below" as CeilMode,
    data: null as BuildingData | null,
  });

  const onFrame = (t: number) => {
    const td = Math.min(MAX_T, t);
    const ceil = ceilingAt(td);
    if (clockRef.current) clockRef.current.textContent = `${Math.round(ceil)} m`;
    if (sliderRef.current && document.activeElement !== sliderRef.current)
      sliderRef.current.value = String(Math.round(td * 4) / 4);
    const deck = deckRef.current;
    const basemap = basemapRef.current;
    const d = dataRef.current;
    if (!deck || !basemap || !d) return;
    // quantize the ceiling so paused frames and sub-frame ticks skip redraws
    const cq = Math.round(ceil * 4) / 4;
    const m = modeRef.current;
    const a = appliedRef.current;
    if (cq === a.cq && m === a.mode && d === a.data) return;
    appliedRef.current = { cq, mode: m, data: d };

    const P = d.positions;
    const H = d.hDm;
    deck.setProps({
      layers: [
        basemap,
        new SolidPolygonLayer<Building, DataFilterExtensionProps<Building>>({
          id: "vertige-buildings",
          data: d.buildings,
          extruded: true,
          positionFormat: "XY",
          getPolygon: (b: Building) =>
            b.holes
              ? { positions: P.subarray(b.s, b.e), holeIndices: b.holes }
              : P.subarray(b.s, b.e),
          getElevation: (b: Building) => H[b.i] / 10,
          getFillColor: (b: Building) => BAND_RGB[bandOf(H[b.i])],
          material: {
            ambient: 0.45,
            diffuse: 0.7,
            shininess: 24,
            specularColor: [60, 60, 55],
          },
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 110],
          // GPU filter: sweeping the ceiling only updates a uniform, the
          // 1.1 M-vertex geometry is tessellated and uploaded exactly once
          extensions: [new DataFilterExtension({ filterSize: 1 })],
          getFilterValue: (b: Building) => H[b.i] / 10,
          filterRange: m === "below" ? [-1, cq] : [cq, TOP_M + 100],
          filterSoftRange:
            m === "below"
              ? [-1, Math.max(-1, cq - 2)]
              : [Math.min(TOP_M + 100, cq + 2), TOP_M + 100],
        }),
      ],
    });
  };

  const clock = useAnimationClock({
    initialTime: params.t,
    autoplay: !params.paused,
    initialSpeed: 1,
    normalize: (t) => ((t % WRAP_T) + WRAP_T) % WRAP_T,
    onFrame,
  });
  const { timeRef } = clock;

  useEffect(() => {
    basemapRef.current = createBasemapLayer();
    const deck = new Deck({
      parent: containerRef.current!,
      initialViewState: {
        longitude: 2.347,
        latitude: 48.855,
        zoom: 12,
        pitch: 55,
        bearing: -12,
        minZoom: 10.3,
        maxZoom: 16.5,
        maxPitch: 70,
      },
      controller: true,
      effects: [
        new LightingEffect({
          ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.1 }),
          sun: new DirectionalLight({
            color: [255, 235, 205],
            intensity: 1.5,
            direction: [-1, -0.6, -2],
          }),
        }),
      ],
      getCursor: ({ isDragging, isHovering }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
      getTooltip: ({ object, layer }) => {
        if (!object || layer?.id !== "vertige-buildings") return null;
        const d = dataRef.current;
        const m = metaRef.current;
        if (!d || !m) return null;
        const s = VERTIGE[langRef.current];
        const b = object as Building;
        const parts = [`${(d.hDm[b.i] / 10).toLocaleString(langRef.current === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 1 })} m`];
        if (d.floors[b.i] !== 255) parts.push(s.floors(d.floors[b.i]));
        const label = m.usages[d.usage[b.i]];
        if (label && label !== "Indifférencié")
          parts.push(s.usages[label] ?? label);
        const y = d.year[b.i];
        if (y > 1000 && y < 2100) parts.push(s.built(y));
        return { text: parts.join(" · "), style: DECK_TOOLTIP_STYLE };
      },
      layers: [basemapRef.current],
    });
    deckRef.current = deck;
    (window as unknown as Record<string, unknown>).__vertige = {
      setTime: (t: number) => {
        timeRef.current = t;
      },
      // camera override for tests and promo screenshots
      setView: (vs: Record<string, number>) =>
        deck.setProps({
          initialViewState: {
            longitude: 2.347,
            latitude: 48.855,
            zoom: 12,
            pitch: 55,
            bearing: -12,
            ...vs,
          },
        }),
    };
    return () => {
      deckRef.current = null;
      deck.finalize();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locale = lang === "fr" ? "fr-FR" : "en-GB";

  // the 1977 planning cap froze central Paris at 37 m: strip everything
  // below it and only churches, the grands ensembles and the towers remain
  const story = () => {
    setMode("above");
    timeRef.current = timeAt(37);
    clock.setPlaying(false);
  };

  const subtitle = useMemo(() => {
    if (error) return fx.error(error);
    if (!meta || !data) return vg.loading;
    return vg.subtitle(meta.count.toLocaleString(locale));
  }, [error, meta, data, fx, vg, locale]);

  return (
    <div className="flow">
      <div ref={containerRef} className="flow-canvas" />
      <VizPanel
        lang={lang}
        onLang={(l) => {
          setLang(l);
          saveLang(l);
        }}
        title={vg.title}
        subtitle={subtitle}
        clockRef={clockRef}
        clockInitial={`${Math.round(ceilingAt(params.t))} m`}
        clockNote={
          <div className="clock-note">
            {mode === "below" ? vg.noteBelow : vg.noteAbove}
          </div>
        }
        playing={clock.playing}
        onTogglePlay={() => clock.setPlaying((p) => !p)}
        speed={clock.speed}
        speeds={SPEEDS}
        onSpeed={clock.setSpeed}
        labels={{
          play: fx.play,
          pause: fx.pause,
          speed: fx.speed,
          time: fx.time,
          sheetToggle: fx.sheetToggle,
        }}
        controlsExtra={
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as CeilMode)}
            aria-label={vg.modeAria}
          >
            <option value="below">{vg.modeBelow}</option>
            <option value="above">{vg.modeAbove}</option>
          </select>
        }
        slider={{
          ref: sliderRef,
          min: 0,
          max: MAX_T,
          step: 0.25,
          defaultValue: params.t,
          onInput: (v) => {
            timeRef.current = v;
          },
        }}
        footer={vg.footer}
      >
        <button className="story-btn sheet-hide" onClick={story}>
          {vg.story}
        </button>
        <div className="iso-legend sheet-hide">
          <div className="iso-swatches">
            {BAND_HEX.map((c) => (
              <span key={c} className="iso-swatch" style={{ background: c }} />
            ))}
          </div>
          <div className="legend-labels">
            <span>9</span>
            <span>15</span>
            <span>21</span>
            <span>30</span>
            <span>50</span>
            <span>100</span>
            <span>100+ m</span>
          </div>
          <p className="pulse-legend">{vg.legend}</p>
        </div>
        <VizLinks current="vertige" lang={lang} />
      </VizPanel>
    </div>
  );
}
