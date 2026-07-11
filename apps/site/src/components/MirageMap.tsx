"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Deck, type PickingInfo } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import {
  DataFilterExtension,
  type DataFilterExtensionProps,
} from "@deck.gl/extensions";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { FLUX, MIRAGE } from "@/lib/siteStrings";
import { currentSearchParams, hexToRgb } from "@/lib/viz";
import { createBasemapLayer, DECK_TOOLTIP_STYLE } from "./viz/basemap";
import { mountDeck } from "./viz/deckMount";
import { useAnimationClock } from "./viz/useAnimationClock";
import VizLinks from "./viz/VizLinks";
import VizPanel from "./viz/VizPanel";

interface MirageMeta {
  snapshot: string;
  count: number;
  minMonth: number;
  maxMonth: number;
  neverReviewed: number;
  statuses: { declared: number; none: number; mobility: number; exempt: number };
  rooms: { entire: number; private: number; shared: number; hotel: number };
  neighbourhoods: { name: string; number: number }[];
}

interface ListingData {
  count: number;
  positions: Float32Array;
  colors: Uint8Array;
  /** GPU filter dimensions per listing: display first month, status index. */
  filterValues: Float32Array;
  first: Uint16Array;
  reviews: Uint16Array;
  hosts: Uint16Array;
  prices: Uint16Array;
  status: Uint8Array;
  room: Uint8Array;
  arr: Uint8Array;
  /** Month by which half of the dated listings had their first review. */
  medianMonth: number;
}

const NEVER = 0xffff;
/** Hold on the fully assembled city before the loop restarts, in months. */
const HOLD = 12;

type StatusFilter = "tous" | "declare" | "sans" | "bail" | "exempt";

const STATUS_INDEX: Record<Exclude<StatusFilter, "tous">, number> = {
  declare: 0,
  sans: 1,
  bail: 2,
  exempt: 3,
};
const STATUS_KEYS = ["declared", "none", "bail", "exempt"] as const;
const STATUS_FILTERS = ["declare", "sans", "bail", "exempt"] as const;

// declared rentals in steel blue, the unregistered in vermilion, mobility
// leases gold, hotel-type slate: every pair clears CVD deltaE >= 17 on the
// dark basemap (validated); brightness deliberately leaves the flat-chart
// band so the dots glow, and the legend and tooltips carry identity beyond
// color alone
const STATUS_HEX = ["#4f8fe6", "#ff5c3d", "#f0c04a", "#8a93a6"];
const STATUS_RGB = STATUS_HEX.map(hexToRgb);

const SPEEDS = [
  { value: 12, label: "1×" },
  { value: 24, label: "2×" },
  { value: 48, label: "4×" },
];

// slider bounds before meta.json arrives (January 2010 to the snapshot)
const DEFAULT_MIN = 120;
const DEFAULT_MAX = 317;

const monthLabel = (t: number, locale: string) => {
  const m = Math.max(0, Math.floor(t));
  return new Date(2000 + Math.floor(m / 12), m % 12, 1).toLocaleDateString(locale, {
    month: "short",
    year: "numeric",
  });
};

function readParams() {
  const searchParams = currentSearchParams();
  const t = searchParams.get("t") ? +searchParams.get("t")! : DEFAULT_MIN;
  const statut = searchParams.get("statut") ?? "";
  return {
    t: Number.isFinite(t) ? Math.max(0, Math.min(5000, t)) : DEFAULT_MIN,
    paused: searchParams.get("paused") === "1",
    statut: (statut in STATUS_INDEX ? statut : "tous") as StatusFilter,
  };
}

function parseListings(buf: ArrayBuffer, meta: MirageMeta): ListingData {
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== 0x4d495241)
    throw new Error("listings.bin: bad magic");
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
  const first = new Uint16Array(buf, offset, count);
  offset += 2 * count;
  offset += 2 * count; // last review month: in the artifact, unused so far
  const reviews = new Uint16Array(buf, offset, count);
  offset += 2 * count;
  const hosts = new Uint16Array(buf, offset, count);
  offset += 2 * count;
  const prices = new Uint16Array(buf, offset, count);
  offset += 2 * count;
  const status = new Uint8Array(buf, offset, count);
  offset += count;
  const room = new Uint8Array(buf, offset, count);
  offset += count;
  const arr = new Uint8Array(buf, offset, count);

  const positions = new Float32Array(2 * count);
  const sx = (maxLon - minLon) / 65535;
  const sy = (maxLat - minLat) / 65535;
  const colors = new Uint8Array(4 * count);
  const filterValues = new Float32Array(2 * count);
  const monthHist = new Uint32Array(meta.maxMonth + 2);
  let dated = 0;
  for (let i = 0; i < count; i++) {
    positions[2 * i] = minLon + x[i] * sx;
    positions[2 * i + 1] = minLat + y[i] * sy;
    const rgb = STATUS_RGB[status[i]];
    colors[4 * i] = rgb[0];
    colors[4 * i + 1] = rgb[1];
    colors[4 * i + 2] = rgb[2];
    colors[4 * i + 3] = 185;
    // never-reviewed listings cannot be dated: they exist in the snapshot,
    // so they join in the sweep's final beat instead of posing as history
    filterValues[2 * i] = first[i] === NEVER ? meta.maxMonth : first[i];
    filterValues[2 * i + 1] = status[i];
    if (first[i] !== NEVER) {
      monthHist[Math.min(first[i], meta.maxMonth)]++;
      dated++;
    }
  }
  let medianMonth = meta.maxMonth;
  for (let m = 0, seen = 0; m < monthHist.length; m++) {
    seen += monthHist[m];
    if (seen >= dated / 2) {
      medianMonth = m;
      break;
    }
  }

  return {
    count,
    positions,
    colors,
    filterValues,
    first,
    reviews,
    hosts,
    prices,
    status,
    room,
    arr,
    medianMonth,
  };
}

export default function MirageMap() {
  // read once per mount (module-level reads go stale across client navs)
  const [params] = useState(readParams);
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<MirageMeta | null>(null);
  const [data, setData] = useState<ListingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statut, setStatut] = useState<StatusFilter>(params.statut);
  const [lang, setLang] = useState<Lang>(loadLang);
  const commonStrings = FLUX[lang];
  const strings = MIRAGE[lang];
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const langRef = useRef(lang);
  langRef.current = lang;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const dataRef = useRef(data);
  dataRef.current = data;
  const statutRef = useRef(statut);
  statutRef.current = statut;
  const rangeRef = useRef({ min: DEFAULT_MIN, max: DEFAULT_MAX });

  useEffect(() => {
    fetch("/mirage/meta.json")
      .then((response) => {
        if (!response.ok) throw new Error(`meta.json: HTTP ${response.status}`);
        return response.json() as Promise<MirageMeta>;
      })
      .then(async (nextMeta) => {
        rangeRef.current = { min: nextMeta.minMonth, max: nextMeta.maxMonth };
        setMeta(nextMeta);
        const response = await fetch("/mirage/listings.bin");
        if (!response.ok)
          throw new Error(`listings.bin: HTTP ${response.status}`);
        setData(parseListings(await response.arrayBuffer(), nextMeta));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);
  const appliedRef = useRef({
    quantizedMonth: -1,
    statut: "tous" as StatusFilter,
    data: null as ListingData | null,
  });

  const onFrame = (t: number) => {
    const { min, max } = rangeRef.current;
    const displayTime = Math.min(max, t);
    if (clockRef.current)
      clockRef.current.textContent = monthLabel(displayTime, locale);
    if (sliderRef.current && document.activeElement !== sliderRef.current)
      sliderRef.current.value = String(Math.round(displayTime * 4) / 4);
    const deck = deckRef.current;
    const basemap = basemapRef.current;
    const data = dataRef.current;
    if (!deck || !basemap || !data) return;
    // quantize to half a month so paused frames and sub-frame ticks skip
    // redraws; the geometry uploads exactly once, the sweep is a GPU uniform
    const quantizedMonth = Math.round(displayTime * 2) / 2;
    const statut = statutRef.current;
    const applied = appliedRef.current;
    if (
      quantizedMonth === applied.quantizedMonth &&
      statut === applied.statut &&
      data === applied.data
    )
      return;
    appliedRef.current = { quantizedMonth, statut, data };

    const statusRange: [number, number] =
      statut === "tous" ? [-1, 9] : [STATUS_INDEX[statut] - 0.5, STATUS_INDEX[statut] + 0.5];
    deck.setProps({
      layers: [
        basemap,
        new ScatterplotLayer<null, DataFilterExtensionProps<null>>({
          id: "mirage-listings",
          data: {
            length: data.count,
            attributes: {
              getPosition: { value: data.positions, size: 2 },
              getFillColor: { value: data.colors, size: 4 },
              getFilterValue: { value: data.filterValues, size: 2 },
            },
          } as unknown as null[],
          radiusUnits: "meters",
          getRadius: 15,
          radiusMinPixels: 1.4,
          radiusMaxPixels: 12,
          stroked: false,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 150],
          extensions: [new DataFilterExtension({ filterSize: 2 })],
          filterRange: [[min - 1, quantizedMonth], statusRange],
          filterSoftRange: [
            [min - 1, Math.max(min - 1, quantizedMonth - 2)],
            statusRange,
          ],
        }),
      ],
    });
  };

  const clock = useAnimationClock({
    initialTime: params.t,
    autoplay: !params.paused,
    initialSpeed: 12,
    normalize: (t) => {
      const { min, max } = rangeRef.current;
      const span = max - min + HOLD;
      return min + ((((t - min) % span) + span) % span);
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
            longitude: 2.345,
            latitude: 48.859,
            zoom: 11.6,
            minZoom: 10.3,
            maxZoom: 16.5,
          },
          controller: true,
          getCursor: ({ isDragging, isHovering }) =>
            isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
          getTooltip: ({ index, layer }: PickingInfo) => {
            if (index < 0 || layer?.id !== "mirage-listings") return null;
            const data = dataRef.current;
            const meta = metaRef.current;
            if (!data || !meta) return null;
            const strings = MIRAGE[langRef.current];
            const locale = langRef.current === "fr" ? "fr-FR" : "en-GB";
            const roomKeys = ["entire", "private", "shared", "hotel"] as const;
            const hood = meta.neighbourhoods[data.arr[index]];
            const hosts = data.hosts[index];
            const price = data.prices[index];
            const facts = [
              `${hood.name} (${hood.number}ᵉ)`,
              data.first[index] === NEVER
                ? strings.never
                : strings.since(monthLabel(data.first[index], locale)),
              strings.reviews(data.reviews[index].toLocaleString(locale)),
            ];
            if (price > 0) facts.push(strings.perNight(price.toLocaleString(locale)));
            return {
              html:
                `<div style="font-weight:600;margin-bottom:3px">${strings.rooms[roomKeys[data.room[index]]]}` +
                (hosts > 1 ? ` · ${strings.hostListings(hosts.toLocaleString(locale))}` : "") +
                `</div>` +
                `<div><span style="color:${STATUS_HEX[data.status[index]]}">●</span> ${strings.statuses[STATUS_KEYS[data.status[index]]]}</div>` +
                `<div style="color:#8b93a3;margin-top:3px">${facts.join(" · ")}</div>`,
              style: DECK_TOOLTIP_STYLE,
            };
          },
          layers: [basemapRef.current],
        });
        deckRef.current = deck;
        (window as unknown as Record<string, unknown>).__mirage = {
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
                zoom: 11.6,
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

  // the hinge of the story: the month by which half of today's stock had
  // appeared. Pinned there, the button offers the completed tide instead.
  const [, storyTick] = useState(0);
  const atStory =
    statut === "tous" &&
    !clock.playing &&
    data !== null &&
    Math.abs(Math.min(rangeRef.current.max, timeRef.current) - data.medianMonth) < 0.5;
  const story = () => {
    if (!data) return;
    if (atStory) {
      timeRef.current = rangeRef.current.max;
    } else {
      setStatut("tous");
      timeRef.current = data.medianMonth;
    }
    clock.setPlaying(false);
    // atStory reads the time ref, so pinning from an already-paused state
    // changes no React state: force the re-render that flips the label
    storyTick((n) => n + 1);
  };

  const subtitle = useMemo(() => {
    if (error) return commonStrings.error(error);
    if (!meta || !data) return strings.loading;
    const [y, m, d] = meta.snapshot.split("-").map(Number);
    const date = new Date(y, m - 1, d).toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return strings.subtitle(meta.count.toLocaleString(locale), date);
  }, [error, meta, data, commonStrings, strings, locale]);

  const statusCounts = meta
    ? [meta.statuses.declared, meta.statuses.none, meta.statuses.mobility, meta.statuses.exempt]
    : [0, 0, 0, 0];
  const neverPct = meta ? Math.round((meta.neverReviewed / meta.count) * 100) : 0;

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
        clockInitial={monthLabel(Math.min(params.t, DEFAULT_MAX), locale)}
        clockNote={<div className="clock-note">{strings.note}</div>}
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
          min: meta?.minMonth ?? DEFAULT_MIN,
          max: meta?.maxMonth ?? DEFAULT_MAX,
          step: 0.25,
          defaultValue: params.t,
          onInput: (v) => {
            timeRef.current = v;
          },
        }}
        footer={strings.footer}
      >
        <button className="story-btn sheet-hide" onClick={story}>
          {atStory
            ? strings.storyBack(monthLabel(rangeRef.current.max, locale))
            : strings.storyHalf(
                data ? monthLabel(data.medianMonth, locale) : "…",
              )}
        </button>
        <div className="iso-legend sheet-hide">
          <div role="group" aria-label={strings.statutAria}>
            {STATUS_KEYS.map((key, index) => {
              const value = STATUS_FILTERS[index];
              const active = statut === value;
              return (
                <button
                  type="button"
                  className={`mirage-legend-row${statut !== "tous" && !active ? " dimmed" : ""}`}
                  key={key}
                  aria-pressed={active}
                  title={strings.statusTips[key]}
                  onClick={() => setStatut(active ? "tous" : value)}
                >
                  <span
                    className="undated-swatch"
                    style={{ background: STATUS_HEX[index] }}
                  />
                  {strings.statuses[key]}
                  <span>{statusCounts[index].toLocaleString(locale)}</span>
                </button>
              );
            })}
          </div>
          <p className="pulse-legend">{strings.filterHint}</p>
          <p className="pulse-legend">{strings.neverNote(neverPct)}</p>
          <p className="pulse-legend">{strings.legend}</p>
        </div>
        <VizLinks current="mirage" lang={lang} />
      </VizPanel>
    </div>
  );
}
