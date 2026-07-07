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
import { mountDeck } from "./viz/deckMount";
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
  idx: number;
  start: number;
  end: number;
  holes?: number[];
}

interface BuildingData {
  buildings: Building[];
  positions: Float64Array;
  heightDm: Uint16Array;
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
const timeForCeiling = (meters: number) =>
  meters <= BREAK_M
    ? (meters * BREAK_T) / BREAK_M
    : BREAK_T + ((meters - BREAK_M) * (MAX_T - BREAK_T)) / (TOP_M - BREAK_M);

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
  const meters = dm / 10;
  for (let b = 0; b < BAND_TOPS.length; b++)
    if (meters < BAND_TOPS[b]) return b;
  return BAND_TOPS.length;
};

const SPEEDS = [
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 4, label: "4×" },
];

function readParams() {
  const searchParams = currentSearchParams();
  const t = searchParams.get("t") ? +searchParams.get("t")! : 0;
  return {
    t: Number.isFinite(t) ? Math.max(0, Math.min(MAX_T, t)) : 0,
    paused: searchParams.get("paused") === "1",
    mode: (searchParams.get("mode") === "above" ? "above" : "below") as CeilMode,
    down: searchParams.get("dir") === "down",
  };
}

function parseBuildings(buf: ArrayBuffer): BuildingData {
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== 0x56455254)
    throw new Error("buildings.bin: bad magic");
  const buildingCount = view.getUint32(4, true);
  const ringCount = view.getUint32(8, true);
  const vertexCount = view.getUint32(12, true);
  const minLon = view.getFloat64(16, true);
  const minLat = view.getFloat64(24, true);
  const maxLon = view.getFloat64(32, true);
  const maxLat = view.getFloat64(40, true);
  let offset = 48;
  const heightDm = new Uint16Array(buf, offset, buildingCount);
  offset += 2 * buildingCount;
  const year = new Uint16Array(buf, offset, buildingCount);
  offset += 2 * buildingCount;
  const floors = new Uint8Array(buf, offset, buildingCount);
  offset += buildingCount;
  const usage = new Uint8Array(buf, offset, buildingCount);
  offset += buildingCount;
  const rings = new Uint8Array(buf, offset, buildingCount);
  offset += buildingCount;
  offset += offset % 2;
  const ringVerts = new Uint16Array(buf, offset, ringCount);
  offset += 2 * ringCount;
  const quantized = new Uint16Array(buf, offset, 2 * vertexCount);

  const positions = new Float64Array(2 * vertexCount);
  const sx = (maxLon - minLon) / 65535;
  const sy = (maxLat - minLat) / 65535;
  for (let i = 0; i < vertexCount; i++) {
    positions[2 * i] = minLon + quantized[2 * i] * sx;
    positions[2 * i + 1] = minLat + quantized[2 * i + 1] * sy;
  }

  const buildings: Building[] = new Array(buildingCount);
  let ringCursor = 0;
  let elementCursor = 0; // element cursor into positions
  for (let i = 0; i < buildingCount; i++) {
    const start = elementCursor;
    const nRings = rings[i];
    let holes: number[] | undefined;
    for (let k = 0; k < nRings; k++) {
      elementCursor += ringVerts[ringCursor + k] * 2;
      if (k < nRings - 1) (holes ??= []).push(elementCursor - start);
    }
    ringCursor += nRings;
    buildings[i] = { idx: i, start, end: elementCursor, holes };
  }
  return { buildings, positions, heightDm, year, floors, usage };
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
  const commonStrings = FLUX[lang];
  const strings = VERTIGE[lang];
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
      .then((response) => {
        if (!response.ok) throw new Error(`meta.json: HTTP ${response.status}`);
        return response.json() as Promise<VertigeMeta>;
      })
      .then(setMeta)
      .catch((e: Error) => setError(e.message));
    fetch("/vertige/buildings.bin")
      .then((response) => {
        if (!response.ok)
          throw new Error(`buildings.bin: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buf) => setData(parseBuildings(buf)))
      .catch((e: Error) => setError(e.message));
  }, []);

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);
  const appliedRef = useRef({
    quantizedCeiling: -1,
    mode: "below" as CeilMode,
    data: null as BuildingData | null,
  });

  const onFrame = (t: number) => {
    const displayTime = Math.min(MAX_T, t);
    const ceil = ceilingAt(displayTime);
    if (clockRef.current) clockRef.current.textContent = `${Math.round(ceil)} m`;
    if (sliderRef.current && document.activeElement !== sliderRef.current)
      sliderRef.current.value = String(Math.round(displayTime * 4) / 4);
    const deck = deckRef.current;
    const basemap = basemapRef.current;
    const data = dataRef.current;
    if (!deck || !basemap || !data) return;
    // quantize the ceiling so paused frames and sub-frame ticks skip redraws
    const quantizedCeiling = Math.round(ceil * 4) / 4;
    const mode = modeRef.current;
    const applied = appliedRef.current;
    if (
      quantizedCeiling === applied.quantizedCeiling &&
      mode === applied.mode &&
      data === applied.data
    )
      return;
    appliedRef.current = { quantizedCeiling, mode, data };

    const positions = data.positions;
    const heights = data.heightDm;
    deck.setProps({
      layers: [
        basemap,
        new SolidPolygonLayer<Building, DataFilterExtensionProps<Building>>({
          id: "vertige-buildings",
          data: data.buildings,
          extruded: true,
          positionFormat: "XY",
          getPolygon: (building: Building) =>
            building.holes
              ? {
                  positions: positions.subarray(building.start, building.end),
                  holeIndices: building.holes,
                }
              : positions.subarray(building.start, building.end),
          getElevation: (building: Building) => heights[building.idx] / 10,
          getFillColor: (building: Building) =>
            BAND_RGB[bandOf(heights[building.idx])],
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
          getFilterValue: (building: Building) => heights[building.idx] / 10,
          filterRange:
            mode === "below"
              ? [-1, quantizedCeiling]
              : [quantizedCeiling, TOP_M + 100],
          filterSoftRange:
            mode === "below"
              ? [-1, Math.max(-1, quantizedCeiling - 2)]
              : [Math.min(TOP_M + 100, quantizedCeiling + 2), TOP_M + 100],
        }),
      ],
    });
  };

  // direction is the sign of the clock speed: negative sweeps the ceiling
  // back down, so the city appears from the towers downward
  const clock = useAnimationClock({
    initialTime: params.t,
    autoplay: !params.paused,
    initialSpeed: params.down ? -4 : 4,
    normalize: (t) => ((t % WRAP_T) + WRAP_T) % WRAP_T,
    onFrame,
  });
  const { timeRef } = clock;
  const goingDown = clock.speed < 0;

  useEffect(() => {
    basemapRef.current = createBasemapLayer();
    return mountDeck(
      () => {
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
              ambient: new AmbientLight({
                color: [255, 255, 255],
                intensity: 1.1,
              }),
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
            const data = dataRef.current;
            const meta = metaRef.current;
            if (!data || !meta) return null;
            const strings = VERTIGE[langRef.current];
            const building = object as Building;
            const parts = [
              `${(data.heightDm[building.idx] / 10).toLocaleString(
                langRef.current === "fr" ? "fr-FR" : "en-GB",
                { maximumFractionDigits: 1 },
              )} m`,
            ];
            if (data.floors[building.idx] !== 255)
              parts.push(strings.floors(data.floors[building.idx]));
            const label = meta.usages[data.usage[building.idx]];
            if (label && label !== "Indifférencié")
              parts.push(strings.usages[label] ?? label);
            const year = data.year[building.idx];
            if (year > 1000 && year < 2100) parts.push(strings.built(year));
            return { text: parts.join(" · "), style: DECK_TOOLTIP_STYLE };
          },
          layers: [basemapRef.current],
        });
        deckRef.current = deck;
        (window as unknown as Record<string, unknown>).__vertige = {
          setTime: (t: number) => {
            timeRef.current = t;
          },
          getTime: () => timeRef.current,
          // camera override for tests and promo screenshots
          setView: (viewState: Record<string, number>) =>
            deck.setProps({
              initialViewState: {
                longitude: 2.347,
                latitude: 48.855,
                zoom: 12,
                pitch: 55,
                bearing: -12,
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

  const locale = lang === "fr" ? "fr-FR" : "en-GB";

  // the 1977 planning cap froze central Paris at 37 m: strip everything
  // below it and only churches, the grands ensembles and the towers remain
  const story = () => {
    setMode("above");
    timeRef.current = timeForCeiling(37);
    clock.setPlaying(false);
  };

  const subtitle = useMemo(() => {
    if (error) return commonStrings.error(error);
    if (!meta || !data) return strings.loading;
    return strings.subtitle(meta.count.toLocaleString(locale));
  }, [error, meta, data, commonStrings, strings, locale]);

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
        clockInitial={`${Math.round(ceilingAt(params.t))} m`}
        clockNote={
          <div className="clock-note">
            {mode === "below" ? strings.noteBelow : strings.noteAbove}
          </div>
        }
        playing={clock.playing}
        onTogglePlay={() => clock.setPlaying((playing) => !playing)}
        speed={Math.abs(clock.speed)}
        speeds={SPEEDS}
        onSpeed={(value) => clock.setSpeed(goingDown ? -value : value)}
        labels={{
          play: commonStrings.play,
          pause: commonStrings.pause,
          speed: commonStrings.speed,
          time: commonStrings.time,
          sheetToggle: commonStrings.sheetToggle,
        }}
        controlsExtra={
          <>
            <button
              aria-label={strings.dirAria}
              aria-pressed={goingDown}
              title={goingDown ? strings.dirDown : strings.dirUp}
              onClick={() => clock.setSpeed(-clock.speed)}
            >
              {goingDown ? "▼" : "▲"}
            </button>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as CeilMode)}
              aria-label={strings.modeAria}
            >
              <option value="below">{strings.modeBelow}</option>
              <option value="above">{strings.modeAbove}</option>
            </select>
          </>
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
        footer={strings.footer}
      >
        <button className="story-btn sheet-hide" onClick={story}>
          {strings.story}
        </button>
        <div className="iso-legend sheet-hide">
          <div className="iso-swatches">
            {BAND_HEX.map((hex) => (
              <span key={hex} className="iso-swatch" style={{ background: hex }} />
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
          <p className="pulse-legend">{strings.legend}</p>
        </div>
        <VizLinks current="vertige" lang={lang} />
      </VizPanel>
    </div>
  );
}
