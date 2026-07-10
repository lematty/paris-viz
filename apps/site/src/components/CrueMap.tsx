"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  Deck,
  DirectionalLight,
  LightingEffect,
} from "@deck.gl/core";
import { SolidPolygonLayer } from "@deck.gl/layers";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { CRUE, FLUX } from "@/lib/siteStrings";
import { currentSearchParams } from "@/lib/viz";
import { createBasemapLayer, DECK_TOOLTIP_STYLE } from "./viz/basemap";
import { mountDeck } from "./viz/deckMount";
import { useAnimationClock } from "./viz/useAnimationClock";
import VizLinks from "./viz/VizLinks";
import VizPanel from "./viz/VizPanel";

interface CrueMeta {
  bbox: [number, number, number, number];
  gaugeZero: number;
  minGauge: number;
  maxGauge: number;
  step: number;
  levels: number;
  marks: { year: number; month: number; gauge: number }[];
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
  /** Gauge decimeters at which the building's street floods (255 = never). */
  floodDm: Uint8Array;
}

type WaterLevel = [number, number][][][]; // polygons -> rings -> points

const MIN_GAUGE = 1.0;
const MAX_GAUGE = 9.0;
const WRAP_HOLD = 0.75; // linger on the full flood before the loop restarts
const DRY_RGB: [number, number, number] = [92, 84, 68];
const FLOODED_RGB: [number, number, number] = [106, 149, 186];
const WATER_RGBA: [number, number, number, number] = [52, 118, 176, 168];
const DRY_HEX = "#5c5444";
const FLOODED_HEX = "#6a95ba";

const SPEEDS = [
  { value: 0.1, label: "1×" },
  { value: 0.2, label: "2×" },
  { value: 0.4, label: "4×" },
];

function readParams() {
  const searchParams = currentSearchParams();
  const gauge = searchParams.get("g") ? +searchParams.get("g")! : MIN_GAUGE;
  return {
    g: Number.isFinite(gauge)
      ? Math.max(MIN_GAUGE, Math.min(MAX_GAUGE, gauge))
      : MIN_GAUGE,
    paused: searchParams.get("paused") === "1",
  };
}

/** vertige's buildings.bin: geometry and heights (the rest is ignored). */
function parseBuildings(
  buf: ArrayBuffer,
  floodGaugeAt: (lon: number, lat: number) => number,
): BuildingData {
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
  offset += 2 * buildingCount; // construction years
  offset += buildingCount; // floor counts
  offset += buildingCount; // usage
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
  const floodDm = new Uint8Array(buildingCount);
  let ringCursor = 0;
  let elementCursor = 0;
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
    // street flood level sampled at the outline centroid
    const outlineEnd = holes ? start + holes[0] : elementCursor;
    let cx = 0;
    let cy = 0;
    const n = (outlineEnd - start) / 2;
    for (let k = start; k < outlineEnd; k += 2) {
      cx += positions[k];
      cy += positions[k + 1];
    }
    floodDm[i] = floodGaugeAt(cx / n, cy / n);
  }
  return { buildings, positions, heightDm, floodDm };
}

function parseWater(buf: ArrayBuffer, bbox: [number, number, number, number]): WaterLevel[] {
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== 0x43525545)
    throw new Error("water.bin: bad magic");
  const levelCount = view.getUint32(4, true);
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const sx = (maxLon - minLon) / 65535;
  const sy = (maxLat - minLat) / 65535;
  let offset = 8;
  const levels: WaterLevel[] = [];
  for (let l = 0; l < levelCount; l++) {
    const polyCount = view.getUint32(offset, true);
    offset += 4;
    const polys: [number, number][][][] = [];
    for (let p = 0; p < polyCount; p++) {
      const ringCount = view.getUint8(offset);
      offset += 1;
      const rings: [number, number][][] = [];
      for (let r = 0; r < ringCount; r++) {
        const vertCount = view.getUint16(offset, true);
        offset += 2;
        const ring: [number, number][] = new Array(vertCount);
        for (let i = 0; i < vertCount; i++) {
          ring[i] = [
            minLon + view.getUint16(offset, true) * sx,
            minLat + view.getUint16(offset + 2, true) * sy,
          ];
          offset += 4;
        }
        rings.push(ring);
      }
      polys.push(rings);
    }
    levels.push(polys);
  }
  return levels;
}

export default function CrueMap() {
  // read once per mount (module-level reads go stale across client navs)
  const [params] = useState(readParams);
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<CrueMeta | null>(null);
  const [data, setData] = useState<{
    buildings: BuildingData;
    water: WaterLevel[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveLevel, setLiveLevel] = useState<number | null>(null);
  const [lang, setLang] = useState<Lang>(loadLang);
  const commonStrings = FLUX[lang];
  const strings = CRUE[lang];
  const langRef = useRef(lang);
  langRef.current = lang;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    Promise.all([
      fetch("/crue/meta.json").then((response) => {
        if (!response.ok) throw new Error(`meta.json: HTTP ${response.status}`);
        return response.json() as Promise<CrueMeta>;
      }),
      fetch("/crue/water.bin").then((response) => {
        if (!response.ok) throw new Error(`water.bin: HTTP ${response.status}`);
        return response.arrayBuffer();
      }),
      fetch("/crue/grid.bin").then((response) => {
        if (!response.ok) throw new Error(`grid.bin: HTTP ${response.status}`);
        return response.arrayBuffer();
      }),
      fetch("/vertige/buildings.bin").then((response) => {
        if (!response.ok)
          throw new Error(`buildings.bin: HTTP ${response.status}`);
        return response.arrayBuffer();
      }),
    ])
      .then(([nextMeta, waterBuf, gridBuf, buildingsBuf]) => {
        const gridView = new DataView(gridBuf);
        const gridW = gridView.getUint16(0, true);
        const gridH = gridView.getUint16(2, true);
        const grid = new Uint8Array(gridBuf, 4);
        const [minLon, minLat, maxLon, maxLat] = nextMeta.bbox;
        const floodGaugeAt = (lon: number, lat: number) => {
          const gx = Math.max(
            0,
            Math.min(gridW - 1, Math.floor(((lon - minLon) / (maxLon - minLon)) * gridW)),
          );
          const gy = Math.max(
            0,
            Math.min(gridH - 1, Math.floor(((maxLat - lat) / (maxLat - minLat)) * gridH)),
          );
          return grid[gy * gridW + gx];
        };
        setMeta(nextMeta);
        setData({
          buildings: parseBuildings(buildingsBuf, floodGaugeAt),
          water: parseWater(waterBuf, nextMeta.bbox),
        });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // the Seine right now, straight from Hub'Eau in the visitor's browser;
  // silently absent when the API is unreachable
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const base = "https://hubeau.eaufrance.fr/api/v1/hydrometrie";
        const stations = (await (
          await fetch(
            `${base}/referentiel/stations?code_commune_station=75056&format=json&size=200`,
            { signal: controller.signal },
          )
        ).json()) as { data?: { code_station: string; libelle_station: string }[] };
        const station = stations.data?.find((s) =>
          /austerlitz/i.test(s.libelle_station),
        );
        if (!station) return;
        const observations = (await (
          await fetch(
            `${base}/observations_tr?code_entite=${station.code_station}&grandeur_hydro=H&size=1&sort=desc`,
            { signal: controller.signal },
          )
        ).json()) as { data?: { resultat_obs: number }[] };
        const mm = observations.data?.[0]?.resultat_obs;
        if (typeof mm === "number" && Number.isFinite(mm))
          setLiveLevel(Math.round(mm / 10) / 100);
      } catch {
        // stay quiet: the button simply does not appear
      }
    })();
    return () => controller.abort();
  }, []);

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);
  const appliedRef = useRef({ quantized: -1, data: null as unknown });

  const markLabel = (gauge: number): string | null => {
    const meta = metaRef.current;
    if (!meta) return null;
    // 1982 (6.15 m) and 2016 (6.10 m) sit five centimeters apart: name the
    // nearest mark, not the first within tolerance
    let best: { year: number; month: number } | null = null;
    let bestDiff = 0.12;
    for (const mark of meta.marks) {
      const diff = Math.abs(mark.gauge - gauge);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = mark;
      }
    }
    if (!best) return null;
    const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
    return new Date(Date.UTC(best.year, best.month - 1, 15)).toLocaleDateString(
      locale,
      { month: "long", year: "numeric" },
    );
  };

  const onFrame = (t: number) => {
    const gauge = Math.min(MAX_GAUGE, t);
    const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
    if (clockRef.current)
      clockRef.current.textContent = `${gauge.toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} m`;
    if (noteRef.current) {
      const label = markLabel(gauge);
      const strings = CRUE[langRef.current];
      noteRef.current.textContent = label
        ? strings.noteMark(label)
        : strings.noteDefault;
    }
    if (sliderRef.current && document.activeElement !== sliderRef.current)
      sliderRef.current.value = String(Math.round(gauge * 100) / 100);
    const deck = deckRef.current;
    const basemap = basemapRef.current;
    const data = dataRef.current;
    const meta = metaRef.current;
    if (!deck || !basemap || !data || !meta) return;
    const quantized = Math.round(gauge * 20) / 20; // redraw every 5 cm
    const applied = appliedRef.current;
    if (quantized === applied.quantized && data === applied.data) return;
    appliedRef.current = { quantized, data };

    const levelIndex = Math.max(
      0,
      Math.min(
        data.water.length - 1,
        Math.round((quantized - meta.minGauge) / meta.step),
      ),
    );
    const floodDmNow = Math.round(quantized * 10);
    const positions = data.buildings.positions;
    const heights = data.buildings.heightDm;
    const floodDm = data.buildings.floodDm;
    // the water volume: extent at this level, surface rising with the gauge
    const waterTop = Math.max(0.5, quantized - meta.minGauge + 0.5);
    deck.setProps({
      layers: [
        basemap,
        new SolidPolygonLayer<[number, number][][]>({
          id: "crue-water",
          data: data.water[levelIndex],
          extruded: true,
          getPolygon: (rings) => rings,
          getElevation: waterTop,
          getFillColor: WATER_RGBA,
          material: { ambient: 0.8, diffuse: 0.35, shininess: 60, specularColor: [80, 90, 110] },
          updateTriggers: { getElevation: quantized },
        }),
        new SolidPolygonLayer<Building>({
          id: "crue-buildings",
          data: data.buildings.buildings,
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
            floodDm[building.idx] <= floodDmNow ? FLOODED_RGB : DRY_RGB,
          updateTriggers: { getFillColor: floodDmNow },
          material: {
            ambient: 0.45,
            diffuse: 0.7,
            shininess: 24,
            specularColor: [60, 60, 55],
          },
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 110],
        }),
      ],
    });
  };

  const clock = useAnimationClock({
    initialTime: params.g,
    autoplay: !params.paused,
    initialSpeed: 0.2,
    normalize: (t) => {
      const span = MAX_GAUGE + WRAP_HOLD - MIN_GAUGE;
      return MIN_GAUGE + ((((t - MIN_GAUGE) % span) + span) % span);
    },
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
            longitude: 2.352,
            latitude: 48.852,
            zoom: 12.2,
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
                color: [235, 240, 255],
                intensity: 1.4,
                direction: [-1, -0.6, -2],
              }),
            }),
          ],
          getCursor: ({ isDragging, isHovering }) =>
            isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
          getTooltip: ({ object, layer }) => {
            if (!object || layer?.id !== "crue-buildings") return null;
            const data = dataRef.current;
            if (!data) return null;
            const strings = CRUE[langRef.current];
            const building = object as Building;
            const floodAt = data.buildings.floodDm[building.idx];
            const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
            const parts = [
              `${(data.buildings.heightDm[building.idx] / 10).toLocaleString(locale, {
                maximumFractionDigits: 1,
              })} m`,
              floodAt === 255
                ? strings.legendDry
                : `${strings.legendFlooded} ≥ ${(floodAt / 10).toLocaleString(locale, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })} m`,
            ];
            return { text: parts.join(" · "), style: DECK_TOOLTIP_STYLE };
          },
          layers: [basemapRef.current],
        });
        deckRef.current = deck;
        (window as unknown as Record<string, unknown>).__crue = {
          setGauge: (gauge: number) => {
            timeRef.current = gauge;
          },
          getGauge: () => timeRef.current,
          // camera override for tests and promo screenshots
          setView: (viewState: Record<string, number>) =>
            deck.setProps({
              initialViewState: {
                longitude: 2.352,
                latitude: 48.852,
                zoom: 12.2,
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

  // frozen on the 1910 record, the button offers 2016 instead, and back
  const [, storyTick] = useState(0);
  const at1910 =
    !clock.playing && Math.abs(Math.min(MAX_GAUGE, timeRef.current) - 8.62) < 0.05;
  const story = () => {
    timeRef.current = at1910 ? 6.1 : 8.62;
    clock.setPlaying(false);
    // the target is a ref, so jumping from the already-paused default state
    // changes no React state: force the re-render that flips the label
    storyTick((n) => n + 1);
  };

  const subtitle = useMemo(() => {
    if (error) return commonStrings.error(error);
    if (!meta || !data) return strings.loading;
    return strings.subtitle(data.buildings.buildings.length.toLocaleString(locale));
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
        clockInitial={`${params.g.toLocaleString(locale, {
          minimumFractionDigits: 2,
        })} m`}
        clockNote={
          <div className="clock-note" ref={noteRef}>
            {strings.noteDefault}
          </div>
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
        slider={{
          ref: sliderRef,
          min: MIN_GAUGE,
          max: MAX_GAUGE,
          step: 0.01,
          defaultValue: params.g,
          onInput: (v) => {
            timeRef.current = v;
          },
        }}
        footer={strings.footer}
      >
        <button className="story-btn sheet-hide" onClick={story}>
          {at1910 ? strings.story2016 : strings.story1910}
        </button>
        {liveLevel !== null && (
          <button
            className="story-btn sheet-hide"
            onClick={() => {
              timeRef.current = Math.max(MIN_GAUGE, Math.min(MAX_GAUGE, liveLevel));
              clock.setPlaying(false);
              storyTick((n) => n + 1);
            }}
          >
            {strings.live(
              liveLevel.toLocaleString(locale, { minimumFractionDigits: 2 }),
            )}
          </button>
        )}
        <p className="pulse-legend sheet-hide">
          <span className="undated-swatch" style={{ background: FLOODED_HEX }} />{" "}
          {strings.legendFlooded} ·{" "}
          <span className="undated-swatch" style={{ background: DRY_HEX }} />{" "}
          {strings.legendDry}
        </p>
        <p className="pulse-legend sheet-hide">{strings.legend}</p>
        <VizLinks current="crue" lang={lang} />
      </VizPanel>
    </div>
  );
}
