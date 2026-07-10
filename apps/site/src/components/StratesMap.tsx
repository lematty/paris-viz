"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  Deck,
  DirectionalLight,
  LightingEffect,
} from "@deck.gl/core";
import { SolidPolygonLayer } from "@deck.gl/layers";
import {
  DataFilterExtension,
  type DataFilterExtensionProps,
} from "@deck.gl/extensions";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { FLUX, STRATES } from "@/lib/siteStrings";
import { currentSearchParams, hexToRgb } from "@/lib/viz";
import { createBasemapLayer, DECK_TOOLTIP_STYLE } from "./viz/basemap";
import { mountDeck } from "./viz/deckMount";
import { useAnimationClock } from "./viz/useAnimationClock";
import VizLinks from "./viz/VizLinks";
import VizPanel from "./viz/VizPanel";

interface StratesMeta {
  date: string;
  count: number;
  undated: number;
  maxYear: number;
  bands: { code: number; from: number; to: number }[];
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
  yearExact: Uint16Array;
  band: Uint8Array;
  /** Exact year, or a deterministic spread inside the Apur period band; the
   * animation filters on this so banded buildings trickle in instead of
   * popping at the band edge. 0 = undated. */
  displayYear: Float32Array;
}

const UNDATED = 255;

type TimeMode = "before" | "after";

// piecewise clock: the sweep lingers where Paris actually built (64 years of
// 1850-1914 hold 44% of the city), and compresses the thin centuries
const TIMELINE: [number, number][] = [
  [0, 1600],
  [12, 1800],
  [24, 1850],
  [60, 1914],
  [70, 1940],
  [80, 1975],
  [90, 2026],
];
const MAX_T = 90;
const WRAP_T = 96; // a short hold on the full city before the loop restarts
const yearAt = (t: number): number => {
  for (let i = 1; i < TIMELINE.length; i++) {
    const [t1, y1] = TIMELINE[i];
    if (t <= t1) {
      const [t0, y0] = TIMELINE[i - 1];
      return y0 + ((t - t0) * (y1 - y0)) / (t1 - t0);
    }
  }
  return TIMELINE[TIMELINE.length - 1][1];
};
const timeForYear = (year: number): number => {
  for (let i = 1; i < TIMELINE.length; i++) {
    const [t1, y1] = TIMELINE[i];
    if (year <= y1) {
      const [t0, y0] = TIMELINE[i - 1];
      return t0 + ((year - y0) * (t1 - t0)) / (y1 - y0);
    }
  }
  return MAX_T;
};
const STORY_YEAR = 1914; // half the city already built, the Belle Époque peak

// display bands merge the 11 Apur periods along their own edges; the ramp is
// one rose family, monotone lightness, oldest darkest (validated on the dark
// basemap: adjacent steps distinct, dark end still clears the surface)
const BAND_ENDS = [1800, 1850, 1914, 1939, 1975, 1999];
const BAND_HEX = [
  "#6d3540",
  "#8a4650",
  "#a5555a",
  "#c06563",
  "#da766d",
  "#f28878",
  "#ffa48a",
];
const BAND_RGB = BAND_HEX.map(hexToRgb);
const UNDATED_HEX = "#40454e";
const UNDATED_RGB = hexToRgb(UNDATED_HEX);
const bandOfYear = (year: number) => {
  for (let b = 0; b < BAND_ENDS.length; b++) if (year <= BAND_ENDS[b]) return b;
  return BAND_ENDS.length;
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
    mode: (searchParams.get("mode") === "after" ? "after" : "before") as TimeMode,
    back: searchParams.get("dir") === "back",
  };
}

function parseBuildings(
  buf: ArrayBuffer,
  bands: { from: number; to: number }[],
): BuildingData {
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== 0x53545241)
    throw new Error("buildings.bin: bad magic");
  const buildingCount = view.getUint32(4, true);
  const ringCount = view.getUint32(8, true);
  const vertexCount = view.getUint32(12, true);
  const minLon = view.getFloat64(16, true);
  const minLat = view.getFloat64(24, true);
  const maxLon = view.getFloat64(32, true);
  const maxLat = view.getFloat64(40, true);
  let offset = 48;
  const yearExact = new Uint16Array(buf, offset, buildingCount);
  offset += 2 * buildingCount;
  const heightDm = new Uint16Array(buf, offset, buildingCount);
  offset += 2 * buildingCount;
  const band = new Uint8Array(buf, offset, buildingCount);
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

  const displayYear = new Float32Array(buildingCount);
  for (let i = 0; i < buildingCount; i++) {
    let year = yearExact[i];
    if (year === 0 && band[i] !== UNDATED && bands[band[i]]) {
      const { from, to } = bands[band[i]];
      // deterministic per-building hash so the spread is stable across loads
      const h = (Math.imul(i ^ (i >>> 13), 2654435761) >>> 0) / 4294967296;
      year = from + h * (to - from);
    }
    displayYear[i] = year;
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
  return { buildings, positions, heightDm, yearExact, band, displayYear };
}

export default function StratesMap() {
  // read once per mount (module-level reads go stale across client navs)
  const [params] = useState(readParams);
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<StratesMeta | null>(null);
  const [data, setData] = useState<BuildingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TimeMode>(params.mode);
  const [lang, setLang] = useState<Lang>(loadLang);
  const commonStrings = FLUX[lang];
  const strings = STRATES[lang];
  const langRef = useRef(lang);
  langRef.current = lang;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const dataRef = useRef(data);
  dataRef.current = data;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    Promise.all([
      fetch("/strates/meta.json").then((response) => {
        if (!response.ok) throw new Error(`meta.json: HTTP ${response.status}`);
        return response.json() as Promise<StratesMeta>;
      }),
      fetch("/strates/buildings.bin").then((response) => {
        if (!response.ok)
          throw new Error(`buildings.bin: HTTP ${response.status}`);
        return response.arrayBuffer();
      }),
    ])
      .then(([nextMeta, buf]) => {
        setMeta(nextMeta);
        setData(parseBuildings(buf, nextMeta.bands));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);
  const appliedRef = useRef({
    quantizedYear: -1,
    mode: "before" as TimeMode,
    data: null as BuildingData | null,
  });

  const onFrame = (t: number) => {
    const displayTime = Math.min(MAX_T, t);
    const year = yearAt(displayTime);
    if (clockRef.current) clockRef.current.textContent = String(Math.round(year));
    if (sliderRef.current && document.activeElement !== sliderRef.current)
      sliderRef.current.value = String(Math.round(displayTime * 4) / 4);
    const deck = deckRef.current;
    const basemap = basemapRef.current;
    const data = dataRef.current;
    if (!deck || !basemap || !data) return;
    // quantize the year so paused frames and sub-frame ticks skip redraws
    const quantizedYear = Math.round(year * 4) / 4;
    const mode = modeRef.current;
    const applied = appliedRef.current;
    if (
      quantizedYear === applied.quantizedYear &&
      mode === applied.mode &&
      data === applied.data
    )
      return;
    appliedRef.current = { quantizedYear, mode, data };

    const positions = data.positions;
    const heights = data.heightDm;
    const displayYear = data.displayYear;
    const band = data.band;
    deck.setProps({
      layers: [
        basemap,
        new SolidPolygonLayer<Building, DataFilterExtensionProps<Building>>({
          id: "strates-buildings",
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
            band[building.idx] === UNDATED
              ? UNDATED_RGB
              : BAND_RGB[bandOfYear(displayYear[building.idx])],
          material: {
            ambient: 0.45,
            diffuse: 0.7,
            shininess: 24,
            specularColor: [60, 60, 55],
          },
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 110],
          // GPU filter: sweeping the year only updates a uniform, the 1.2
          // M-vertex geometry is tessellated and uploaded exactly once
          extensions: [new DataFilterExtension({ filterSize: 1 })],
          getFilterValue: (building: Building) => displayYear[building.idx],
          filterRange:
            mode === "before"
              ? [-1, quantizedYear]
              : [quantizedYear, 3000],
          filterSoftRange:
            mode === "before"
              ? [-1, Math.max(-1, quantizedYear - 4)]
              : [Math.min(3000, quantizedYear + 4), 3000],
        }),
      ],
    });
  };

  // direction is the sign of the clock speed: negative rewinds the sweep, so
  // the city strips back down to its oldest layers
  const clock = useAnimationClock({
    initialTime: params.t,
    autoplay: !params.paused,
    initialSpeed: params.back ? -4 : 4,
    normalize: (t) => ((t % WRAP_T) + WRAP_T) % WRAP_T,
    onFrame,
  });
  const { timeRef } = clock;
  const goingBack = clock.speed < 0;

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
            if (!object || layer?.id !== "strates-buildings") return null;
            const data = dataRef.current;
            const meta = metaRef.current;
            if (!data || !meta) return null;
            const strings = STRATES[langRef.current];
            const building = object as Building;
            const year = data.yearExact[building.idx];
            const bandIndex = data.band[building.idx];
            const parts: string[] = [];
            if (year > 0) parts.push(strings.built(year));
            else if (bandIndex !== UNDATED && meta.bands[bandIndex]) {
              const { from, to } = meta.bands[bandIndex];
              if (bandIndex === 0) parts.push(strings.periodBefore(to));
              else if (bandIndex === meta.bands.length - 1)
                parts.push(strings.periodSince(from));
              else parts.push(strings.period(from, to));
            } else parts.push(strings.undated);
            parts.push(
              `${(data.heightDm[building.idx] / 10).toLocaleString(
                langRef.current === "fr" ? "fr-FR" : "en-GB",
                { maximumFractionDigits: 1 },
              )} m`,
            );
            return { text: parts.join(" · "), style: DECK_TOOLTIP_STYLE };
          },
          layers: [basemapRef.current],
        });
        deckRef.current = deck;
        (window as unknown as Record<string, unknown>).__strates = {
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

  // 1914 is the hinge of the story: half the city already stands. Frozen on
  // one side of it, the button offers the other side.
  const [, storyTick] = useState(0);
  const atStory =
    mode === "before" &&
    !clock.playing &&
    Math.abs(yearAt(Math.min(MAX_T, timeRef.current)) - STORY_YEAR) < 0.5;
  const story = () => {
    setMode(atStory ? "after" : "before");
    timeRef.current = timeForYear(STORY_YEAR);
    clock.setPlaying(false);
    // atStory reads the time ref, so pinning from the already-paused default
    // state changes no React state: force the re-render that flips the label
    storyTick((n) => n + 1);
  };

  const subtitle = useMemo(() => {
    if (error) return commonStrings.error(error);
    if (!meta || !data) return strings.loading;
    return strings.subtitle(meta.count.toLocaleString(locale));
  }, [error, meta, data, commonStrings, strings, locale]);

  const undatedPct = meta ? Math.round((meta.undated / meta.count) * 100) : 0;

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
        clockInitial={String(Math.round(yearAt(params.t)))}
        clockNote={
          <div className="clock-note">
            {mode === "before" ? strings.noteBefore : strings.noteAfter}
          </div>
        }
        playing={clock.playing}
        onTogglePlay={() => clock.setPlaying((playing) => !playing)}
        speed={Math.abs(clock.speed)}
        speeds={SPEEDS}
        onSpeed={(value) => clock.setSpeed(goingBack ? -value : value)}
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
              aria-pressed={goingBack}
              title={goingBack ? strings.dirBack : strings.dirForward}
              onClick={() => clock.setSpeed(-clock.speed)}
            >
              {goingBack ? "◀" : "▶"}
            </button>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as TimeMode)}
              aria-label={strings.modeAria}
            >
              <option value="before">{strings.modeBefore}</option>
              <option value="after">{strings.modeAfter}</option>
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
          {atStory ? strings.storyAfter : strings.storyBefore}
        </button>
        <div className="iso-legend sheet-hide">
          <div className="iso-swatches">
            {BAND_HEX.map((hex) => (
              <span key={hex} className="iso-swatch" style={{ background: hex }} />
            ))}
          </div>
          <div className="legend-labels">
            <span>1800</span>
            <span>1850</span>
            <span>1914</span>
            <span>1939</span>
            <span>1975</span>
            <span>1999</span>
            <span>{strings.legendNew}</span>
          </div>
          <p className="pulse-legend">
            <span
              className="undated-swatch"
              style={{ background: UNDATED_HEX }}
            />{" "}
            {strings.undatedNote(undatedPct)}
          </p>
          <p className="pulse-legend">{strings.legend}</p>
        </div>
        <VizLinks current="strates" lang={lang} />
      </VizPanel>
    </div>
  );
}
