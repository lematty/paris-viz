"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Deck, type PickingInfo } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import {
  DataFilterExtension,
  type DataFilterExtensionProps,
} from "@deck.gl/extensions";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { FLUX, LOGIS } from "@/lib/siteStrings";
import { currentSearchParams, hexToRgb } from "@/lib/viz";
import { createBasemapLayer, DECK_TOOLTIP_STYLE } from "./viz/basemap";
import { mountDeck } from "./viz/deckMount";
import { useAnimationClock } from "./viz/useAnimationClock";
import VizLinks from "./viz/VizLinks";
import VizPanel from "./viz/VizPanel";

interface LogisMeta {
  millesime: string;
  dwellings: number;
  groups: number;
  skippedNoXY: number;
  minConstruct: number;
  maxConstruct: number;
  minLocat: number;
  maxLocat: number;
  medianConstruct: number;
  medianLocat: number;
  since2000: number;
  students: number;
  categories: number[];
}

interface GroupData {
  count: number;
  positions: Float32Array;
  colors: Uint8Array;
  radii: Float32Array;
  /** GPU filter dimensions per group: construction year, first-letting
   * year, category index. */
  filterValues: Float32Array;
  construct: Uint16Array;
  locat: Uint16Array;
  dwellings: Uint16Array;
  surf: Uint16Array;
  rooms: Uint8Array;
  cat: Uint8Array;
  arr: Uint8Array;
  dpe: Uint8Array;
  student: Uint8Array;
}

type TimeMode = "built" | "let";
type FinanFilter = "tous" | "hbm" | "avant77" | "plai" | "plus" | "pls" | "autre";

const CAT_KEYS = ["hbm", "avant77", "plai", "plus", "pls", "autre"] as const;
const CAT_INDEX: Record<Exclude<FinanFilter, "tous">, number> = {
  hbm: 0,
  avant77: 1,
  plai: 2,
  plus: 3,
  pls: 4,
  autre: 5,
};

// the HBM belt in rose, pre-1977 HLM in ochre, then a subsidy ladder of
// blues (deep = most social) and violet for the residual class; adjacent
// pairs validated CVD-separable on the dark basemap (worst ΔE 16.3),
// brightness deliberately leaves the flat-chart band so the dots glow, and
// the legend and tooltips carry identity beyond color alone
const CAT_HEX = ["#e878b0", "#d9a84e", "#3566d4", "#6da5f4", "#4fd2ee", "#a488e0"];
const CAT_RGB = CAT_HEX.map(hexToRgb);

const DPE_LETTERS = ["", "A", "B", "C", "D", "E", "F", "G"];

const END_YEAR = 2026;

// piecewise clock: linger where Paris actually built and bought (the
// interwar belt and the post-war estates), compress the thin centuries
const TIMELINE: [number, number][] = [
  [0, 1600],
  [4, 1850],
  [10, 1914],
  [30, 1945],
  [60, 1990],
  [80, 2015],
  [90, END_YEAR],
];
const MAX_T = 90;
const WRAP_T = 96; // a short hold on the full stock before the loop restarts
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
// the interwar HBM program peaks: the belt reads as a closed ring
const STORY_YEAR = 1935;

const SPEEDS = [
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 4, label: "4×" },
];

function readParams() {
  const searchParams = currentSearchParams();
  const t = searchParams.get("t") ? +searchParams.get("t")! : 0;
  const finan = searchParams.get("finan") ?? "";
  return {
    t: Number.isFinite(t) ? Math.max(0, Math.min(MAX_T, t)) : 0,
    paused: searchParams.get("paused") === "1",
    mode: (searchParams.get("mode") === "let" ? "let" : "built") as TimeMode,
    finan: (finan in CAT_INDEX ? finan : "tous") as FinanFilter,
  };
}

function parseGroups(buf: ArrayBuffer): GroupData {
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== 0x49474f4c)
    throw new Error("groups.bin: bad magic");
  const count = view.getUint32(4, true);
  const minLon = view.getFloat64(8, true);
  const minLat = view.getFloat64(16, true);
  const maxLon = view.getFloat64(24, true);
  const maxLat = view.getFloat64(32, true);
  let offset = 40;
  const x = new Uint16Array(buf, offset, count);
  offset += 2 * count;
  const y = new Uint16Array(buf, offset, count);
  offset += 2 * count;
  const construct = new Uint16Array(buf, offset, count);
  offset += 2 * count;
  const locat = new Uint16Array(buf, offset, count);
  offset += 2 * count;
  const dwellings = new Uint16Array(buf, offset, count);
  offset += 2 * count;
  const surf = new Uint16Array(buf, offset, count);
  offset += 2 * count;
  const rooms = new Uint8Array(buf, offset, count);
  offset += count;
  const cat = new Uint8Array(buf, offset, count);
  offset += count;
  const arr = new Uint8Array(buf, offset, count);
  offset += count;
  const dpe = new Uint8Array(buf, offset, count);
  offset += count;
  const student = new Uint8Array(buf, offset, count);

  const positions = new Float32Array(2 * count);
  const sx = (maxLon - minLon) / 65535;
  const sy = (maxLat - minLat) / 65535;
  const colors = new Uint8Array(4 * count);
  const radii = new Float32Array(count);
  const filterValues = new Float32Array(3 * count);
  for (let i = 0; i < count; i++) {
    positions[2 * i] = minLon + x[i] * sx;
    positions[2 * i + 1] = minLat + y[i] * sy;
    const rgb = CAT_RGB[cat[i]];
    colors[4 * i] = rgb[0];
    colors[4 * i + 1] = rgb[1];
    colors[4 * i + 2] = rgb[2];
    colors[4 * i + 3] = 205;
    // dot AREA carries the dwelling count
    radii[i] = 5 * Math.sqrt(dwellings[i]);
    filterValues[3 * i] = construct[i];
    filterValues[3 * i + 1] = locat[i];
    filterValues[3 * i + 2] = cat[i];
  }

  return {
    count,
    positions,
    colors,
    radii,
    filterValues,
    construct,
    locat,
    dwellings,
    surf,
    rooms,
    cat,
    arr,
    dpe,
    student,
  };
}

export default function LogisMap() {
  // read once per mount (module-level reads go stale across client navs)
  const [params] = useState(readParams);
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<LogisMeta | null>(null);
  const [data, setData] = useState<GroupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TimeMode>(params.mode);
  const [finan, setFinan] = useState<FinanFilter>(params.finan);
  const [lang, setLang] = useState<Lang>(loadLang);
  const commonStrings = FLUX[lang];
  const strings = LOGIS[lang];
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const langRef = useRef(lang);
  langRef.current = lang;
  const dataRef = useRef(data);
  dataRef.current = data;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const finanRef = useRef(finan);
  finanRef.current = finan;

  useEffect(() => {
    Promise.all([
      fetch("/logis/meta.json").then((response) => {
        if (!response.ok) throw new Error(`meta.json: HTTP ${response.status}`);
        return response.json() as Promise<LogisMeta>;
      }),
      fetch("/logis/groups.bin").then((response) => {
        if (!response.ok) throw new Error(`groups.bin: HTTP ${response.status}`);
        return response.arrayBuffer();
      }),
    ])
      .then(([nextMeta, buf]) => {
        setMeta(nextMeta);
        setData(parseGroups(buf));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);
  const appliedRef = useRef({
    quantizedYear: -1,
    mode: "built" as TimeMode,
    finan: "tous" as FinanFilter,
    data: null as GroupData | null,
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
    // quantize the year so paused frames and sub-frame ticks skip redraws;
    // the geometry uploads exactly once, the sweep is a GPU uniform
    const quantizedYear = Math.round(year * 4) / 4;
    const mode = modeRef.current;
    const finan = finanRef.current;
    const applied = appliedRef.current;
    if (
      quantizedYear === applied.quantizedYear &&
      mode === applied.mode &&
      finan === applied.finan &&
      data === applied.data
    )
      return;
    appliedRef.current = { quantizedYear, mode, finan, data };

    const catRange: [number, number] =
      finan === "tous" ? [-1, 9] : [CAT_INDEX[finan] - 0.5, CAT_INDEX[finan] + 0.5];
    const all: [number, number] = [-1, 3000];
    const swept: [number, number] = [-1, quantizedYear];
    const sweptSoft: [number, number] = [-1, Math.max(-1, quantizedYear - 4)];
    deck.setProps({
      layers: [
        basemap,
        new ScatterplotLayer<null, DataFilterExtensionProps<null>>({
          id: "logis-groups",
          data: {
            length: data.count,
            attributes: {
              getPosition: { value: data.positions, size: 2 },
              getFillColor: { value: data.colors, size: 4 },
              getRadius: { value: data.radii, size: 1 },
              getFilterValue: { value: data.filterValues, size: 3 },
            },
          } as unknown as null[],
          radiusUnits: "meters",
          radiusMinPixels: 1.4,
          radiusMaxPixels: 26,
          stroked: false,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 150],
          extensions: [new DataFilterExtension({ filterSize: 3 })],
          filterRange: mode === "built" ? [swept, all, catRange] : [all, swept, catRange],
          filterSoftRange:
            mode === "built" ? [sweptSoft, all, catRange] : [all, sweptSoft, catRange],
        }),
      ],
    });
  };

  const clock = useAnimationClock({
    initialTime: params.t,
    autoplay: !params.paused,
    initialSpeed: 4,
    normalize: (t) => ((t % WRAP_T) + WRAP_T) % WRAP_T,
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
            longitude: 2.345,
            latitude: 48.859,
            zoom: 11.5,
            minZoom: 10.3,
            maxZoom: 16.5,
          },
          controller: true,
          getCursor: ({ isDragging, isHovering }) =>
            isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
          getTooltip: ({ index, layer }: PickingInfo) => {
            if (index < 0 || layer?.id !== "logis-groups") return null;
            const data = dataRef.current;
            if (!data) return null;
            const strings = LOGIS[langRef.current];
            const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
            const count = data.dwellings[index];
            const built = data.construct[index];
            const firstLet = data.locat[index];
            const facts = [
              strings.arrondissement(data.arr[index] + 1),
              strings.builtIn(built),
            ];
            // an acquisition-conversion gap is the dot's own story
            if (firstLet - built > 2) facts.push(strings.letSince(firstLet));
            const surf = data.surf[index] / 10;
            const rooms = data.rooms[index] / 10;
            if (surf > 0)
              facts.push(
                strings.avg(
                  surf.toLocaleString(locale, { maximumFractionDigits: 0 }),
                  rooms.toLocaleString(locale, { maximumFractionDigits: 1 }),
                ),
              );
            if (data.dpe[index] > 0) facts.push(strings.dpe(DPE_LETTERS[data.dpe[index]]));
            return {
              html:
                `<div style="font-weight:600;margin-bottom:3px">${strings.dwellings(
                  count.toLocaleString(locale),
                  count === 1,
                )}` +
                (data.student[index] ? ` · ${strings.students}` : "") +
                `</div>` +
                `<div><span style="color:${CAT_HEX[data.cat[index]]}">●</span> ${
                  strings.cats[CAT_KEYS[data.cat[index]]]
                }</div>` +
                `<div style="color:#8b93a3;margin-top:3px">${facts.join(" · ")}</div>`,
              style: DECK_TOOLTIP_STYLE,
            };
          },
          layers: [basemapRef.current],
        });
        deckRef.current = deck;
        (window as unknown as Record<string, unknown>).__logis = {
          setTime: (t: number) => {
            timeRef.current = t;
          },
          getTime: () => timeRef.current,
          // camera override for tests and promo screenshots
          setView: (viewState: Record<string, number>) =>
            deck.setProps({
              initialViewState: {
                longitude: 2.345,
                latitude: 48.859,
                zoom: 11.5,
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

  // 1935 is the hinge of the story: the HBM belt reads as a closed ring
  // around the city. Pinned there, the button offers today's full stock.
  const [, storyTick] = useState(0);
  const atStory =
    mode === "built" &&
    finan === "tous" &&
    !clock.playing &&
    Math.abs(yearAt(Math.min(MAX_T, timeRef.current)) - STORY_YEAR) < 0.5;
  const story = () => {
    if (atStory) {
      timeRef.current = MAX_T;
    } else {
      setMode("built");
      setFinan("tous");
      timeRef.current = timeForYear(STORY_YEAR);
    }
    clock.setPlaying(false);
    // atStory reads the time ref, so pinning from an already-paused state
    // changes no React state: force the re-render that flips the label
    storyTick((n) => n + 1);
  };

  const subtitle = useMemo(() => {
    if (error) return commonStrings.error(error);
    if (!meta || !data) return strings.loading;
    return strings.subtitle(meta.dwellings.toLocaleString(locale));
  }, [error, meta, data, commonStrings, strings, locale]);

  const catCounts = meta?.categories ?? [0, 0, 0, 0, 0, 0];
  const missingPct = meta
    ? ((meta.skippedNoXY / (meta.dwellings + meta.skippedNoXY)) * 100).toLocaleString(
        locale,
        { maximumFractionDigits: 1 },
      )
    : "0";

  return (
    <div className="flow">
      <div ref={containerRef} className="flow-canvas" />
      <VizPanel
        lang={lang}
        infoViz="logis"
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
            {mode === "built" ? strings.noteBuilt : strings.noteLet}
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
        controlsExtra={
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as TimeMode)}
            aria-label={strings.modeAria}
          >
            <option value="built">{strings.modeBuilt}</option>
            <option value="let">{strings.modeLet}</option>
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
        footer={strings.footer}
      >
        <button className="story-btn sheet-hide" onClick={story}>
          {atStory ? strings.storyBack : strings.storyBelt}
        </button>
        <div className="iso-legend sheet-hide">
          <div role="group" aria-label={strings.finanAria}>
            {CAT_KEYS.map((key, index) => {
              const active = finan === key;
              return (
                <button
                  type="button"
                  className={`mirage-legend-row${finan !== "tous" && !active ? " dimmed" : ""}`}
                  key={key}
                  aria-pressed={active}
                  title={strings.catTips[key]}
                  onClick={() => setFinan(active ? "tous" : key)}
                >
                  <span
                    className="undated-swatch"
                    style={{ background: CAT_HEX[index] }}
                  />
                  {strings.cats[key]}
                  <span>{catCounts[index].toLocaleString(locale)}</span>
                </button>
              );
            })}
          </div>
          <p className="pulse-legend">{strings.filterHint}</p>
          <p className="pulse-legend">{strings.missingNote(missingPct)}</p>
          <p className="pulse-legend">{strings.legend}</p>
        </div>
        <VizLinks current="logis" lang={lang} />
      </VizPanel>
    </div>
  );
}
