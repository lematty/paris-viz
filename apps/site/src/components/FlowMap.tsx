"use client";

import { useEffect, useRef, useState } from "react";
import { Deck } from "@deck.gl/core";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { FLUX } from "@/lib/siteStrings";
import { currentSearchParams, fmtClock, hexToRgb } from "@/lib/viz";
import { createBasemapLayer, DECK_TOOLTIP_STYLE } from "./viz/basemap";
import { mountDeck } from "./viz/deckMount";
import { useAnimationClock } from "./viz/useAnimationClock";
import VizLinks from "./viz/VizLinks";
import VizPanel from "./viz/VizPanel";

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
 * per waypoint (u16 qLon, u16 qLat, u16 qT - 2-second steps from t0). */
function decodeBusChunk(buf: ArrayBuffer, meta: BusMeta): Trip[] {
  const view = new DataView(buf);
  const [minLon, minLat, maxLon, maxLat] = meta.bbox;
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;
  const colors = meta.lines.map((line) => hexToRgb(line.color));
  const tripCount = view.getUint32(0, true);
  let offset = 4;
  const headers: [number, number][] = [];
  for (let i = 0; i < tripCount; i++) {
    headers.push([view.getUint16(offset, true), view.getUint16(offset + 2, true)]);
    offset += 4;
  }
  const trips: Trip[] = [];
  for (const [count, lineIdx] of headers) {
    const path: [number, number][] = [];
    const timestamps: number[] = [];
    for (let j = 0; j < count; j++) {
      path.push([
        minLon + (view.getUint16(offset, true) / 65535) * lonSpan,
        minLat + (view.getUint16(offset + 2, true) / 65535) * latSpan,
      ]);
      timestamps.push(meta.t0 + view.getUint16(offset + 4, true) * 2);
      offset += 6;
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

type DayKey = "weekday" | "saturday" | "sunday";
const DAY_KEYS: DayKey[] = ["weekday", "saturday", "sunday"];

async function loadMode(key: ModeKey, day: DayKey): Promise<ModeData> {
  const [meta, buf] = await Promise.all([
    fetch(`/flow/${day}/${key}.json`).then((response) => {
      if (!response.ok) throw new Error(`${key}.json: HTTP ${response.status}`);
      return response.json() as Promise<FlowMeta>;
    }),
    fetch(`/flow/${day}/${key}.bin`).then((response) => {
      if (!response.ok) throw new Error(`${key}.bin: HTTP ${response.status}`);
      return response.arrayBuffer();
    }),
  ]);
  const colors = meta.lines.map((line) => hexToRgb(line.color));
  const floats = new Float32Array(buf);
  const trips: Trip[] = [];
  let floatIdx = 0;
  for (let k = 0; k < meta.counts.length; k++) {
    const count = meta.counts[k];
    const path: [number, number][] = [];
    const timestamps: number[] = [];
    for (let j = 0; j < count; j++) {
      path.push([floats[floatIdx], floats[floatIdx + 1]]);
      timestamps.push(floats[floatIdx + 2]);
      floatIdx += 3;
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
  const searchParams = currentSearchParams();
  const modesParam = searchParams.get("modes")?.split(",");
  const enabled = Object.fromEntries(
    MODES.map(({ key }) => [key, modesParam ? modesParam.includes(key) : true]),
  ) as Record<ModeKey, boolean>;
  const day = searchParams.get("day");
  return {
    enabled,
    // buses are opt-in: heavy, and visually dominant over the rail network
    bus: modesParam ? modesParam.includes("bus") : false,
    day: DAY_KEYS.includes(day as DayKey) ? (day as DayKey) : "weekday",
    paused: searchParams.get("paused") === "1",
    time: searchParams.get("t") ? +searchParams.get("t")! : 8 * 3600,
    speed: searchParams.get("speed") ? +searchParams.get("speed")! : 60,
  };
}
export default function FlowMap() {
  // read once per MOUNT, not per module load: Next keeps modules alive
  // across client-side navigations, so a module-level read would serve
  // stale params on later visits to this page
  const [params] = useState(readParams);
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Partial<Record<ModeKey, ModeData>>>({});
  const [enabled, setEnabled] = useState<Record<ModeKey, boolean>>(
    params.enabled,
  );
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(loadLang);
  // solo one line: {mode, line} - clicking its chip again returns to all
  const [solo, setSolo] = useState<{ mode: ModeKey; line: string } | null>(null);
  const [busEnabled, setBusEnabled] = useState(params.bus);
  const [busMeta, setBusMeta] = useState<BusMeta | null>(null);
  const [busLoading, setBusLoading] = useState(0);
  const [day, setDay] = useState<DayKey>(params.day);
  const dayRef = useRef(day);
  dayRef.current = day;
  const langRef = useRef(lang);
  langRef.current = lang;
  const strings = FLUX[lang];
  const busEnabledRef = useRef(busEnabled);
  busEnabledRef.current = busEnabled;
  const soloRef = useRef(solo);
  soloRef.current = solo;
  const busMetaRef = useRef(busMeta);
  busMetaRef.current = busMeta;
  const busChunksRef = useRef(new Map<number, Trip[]>());
  const busPendingRef = useRef(new Set<number>());

  // bus meta loads lazily on first enable (and again after a day switch)
  useEffect(() => {
    if (!busEnabled || busMeta) return;
    const requestedDay = day;
    fetch(`/flow/${requestedDay}/bus.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`bus.json: HTTP ${response.status}`);
        return response.json() as Promise<BusMeta>;
      })
      .then((meta) => {
        if (dayRef.current === requestedDay) setBusMeta(meta);
      })
      .catch((err: Error) => setError(err.message));
  }, [busEnabled, busMeta, day]);

  // rail modes load per day; a day switch clears everything and reloads
  useEffect(() => {
    setLoaded({});
    setBusMeta(null);
    busChunksRef.current.clear();
    dataVersionRef.current++;
    const requestedDay = day;
    for (const { key } of MODES) {
      loadMode(key, requestedDay)
        .then((data) => {
          if (dayRef.current !== requestedDay) return;
          setLoaded((prev) => {
            const next = { ...prev, [key]: data };
            const metas = Object.values(next).map((modeData) => modeData!.meta);
            boundsRef.current = [
              Math.min(...metas.map((meta) => meta.minT)),
              Math.max(...metas.map((meta) => meta.maxT)),
            ];
            if (sliderRef.current) {
              sliderRef.current.min = String(boundsRef.current[0]);
              sliderRef.current.max = String(boundsRef.current[1]);
            }
            return next;
          });
        })
        .catch((err: Error) => setError(err.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);
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
  const boundsRef = useRef<[number, number]>([5 * 3600, 26 * 3600]);

  // Sliding window: keep only the chunks for [h-1, h, h+1] loaded; called
  // from the animation loop (cheap set arithmetic per frame).
  const ensureBusChunks = (t: number) => {
    const meta = busMetaRef.current;
    if (!meta) return;
    const centerHour = Math.floor(t / 3600);
    const wanted = new Set(
      [centerHour - 1, centerHour, centerHour + 1].filter((hour) =>
        meta.hours.includes(hour),
      ),
    );
    for (const hour of wanted) {
      if (busChunksRef.current.has(hour) || busPendingRef.current.has(hour))
        continue;
      busPendingRef.current.add(hour);
      setBusLoading((count) => count + 1);
      const requestedDay = dayRef.current;
      fetch(`/flow/${requestedDay}/bus-${hour}.bin`)
        .then((response) => {
          if (!response.ok)
            throw new Error(`bus-${hour}.bin: HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((buf) => {
          if (dayRef.current !== requestedDay) return; // day switched mid-fetch
          busChunksRef.current.set(hour, decodeBusChunk(buf, meta));
          dataVersionRef.current++;
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => {
          busPendingRef.current.delete(hour);
          setBusLoading((count) => count - 1);
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

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);
  const appliedRef = useRef({ t: -1, signature: "" });

  const onFrame = (t: number) => {
    // DOM updated directly - re-rendering React 60×/s buys nothing here
    if (clockRef.current) clockRef.current.textContent = fmtClock(t);
    if (sliderRef.current && document.activeElement !== sliderRef.current)
      sliderRef.current.value = String(Math.round(t));
    if (busEnabledRef.current) ensureBusChunksRef.current(t);
    const deck = deckRef.current;
    const basemap = basemapRef.current;
    if (!deck || !basemap) return;
    // while paused (and nothing toggled/loaded), skip the redraw entirely
    const signature =
      MODES.map(({ key }) =>
        enabledRef.current[key] && loadedRef.current[key] ? key : "",
      ).join(",") +
      `|v${dataVersionRef.current}|b${busEnabledRef.current ? 1 : 0}|s${soloRef.current ? 1 : 0}|d${dayRef.current}`;
    if (t === appliedRef.current.t && signature === appliedRef.current.signature)
      return;
    appliedRef.current = { t, signature };
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
                getPath: (trip: Trip) => trip.path,
                getTimestamps: (trip: Trip) => trip.timestamps,
                getColor: (trip: Trip) => trip.color,
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
            getPosition: (position: [number, number]) => position,
            getFillColor: [154, 163, 181, 90],
            radiusMinPixels: 1.1,
            radiusMaxPixels: 3,
            getRadius: 25,
            pickable: false,
          }),
      ),
      ...activeModes.map(({ key }) => {
        // single slim layer: the original, calmer look
        return new TripsLayer({
          id: `trips-${key}`,
          data: displayRef.current[key] ?? [],
          getPath: (trip: Trip) => trip.path,
          getTimestamps: (trip: Trip) => trip.timestamps,
          getColor: (trip: Trip) => trip.color,
          capRounded: true,
          jointRounded: true,
          currentTime: t,
          shadowEnabled: false,
          widthMinPixels: 3,
          trailLength: 120,
          // hovering a train shows its line
          pickable: true,
        });
      }),
    ];
    deck.setProps({ layers });
  };

  const clock = useAnimationClock({
    initialTime: params.time,
    autoplay: !params.paused,
    initialSpeed: params.speed,
    normalize: (t) => {
      const [minT, maxT] = boundsRef.current;
      return t > maxT ? minT : t; // loop the day
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
            longitude: 2.35,
            latitude: 48.86,
            zoom: 11,
            minZoom: 8,
            maxZoom: 17,
          },
          controller: true,
          layers: [basemapRef.current],
          pickingRadius: 6,
          getTooltip: ({ object, layer }) => {
            if (!object || !layer) return null;
            const mode = layer.id.split("-")[1] as ModeKey;
            return {
              text: `${FLUX[langRef.current].modes[mode]} ${(object as Trip).line}`,
              style: DECK_TOOLTIP_STYLE,
            };
          },
        });
        deckRef.current = deck;
        // automation/debug handle
        (window as unknown as Record<string, unknown>).__flow = {
          setTime: (t: number) => {
            timeRef.current = t;
          },
          getTime: () => timeRef.current,
        };
        return deck;
      },
      () => {
        deckRef.current = null;
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const totalTrips = Object.values(loaded).reduce(
    (sum, modeData) => sum + (modeData?.meta.counts.length ?? 0),
    0,
  );
  const date = Object.values(loaded)[0]?.meta.date;

  return (
    <div className="flow">
      <div ref={containerRef} className="flow-canvas" />
      <VizPanel
        lang={lang}
        infoViz="flux"
        onLang={(newLang) => {
          setLang(newLang);
          saveLang(newLang);
        }}
        title={strings.title}
        subtitle={
          error
            ? strings.error(error)
            : date
              ? strings.subtitle(
                  totalTrips.toLocaleString(lang === "fr" ? "fr-FR" : "en-GB"),
                  date,
                )
              : strings.loading
        }
        clockRef={clockRef}
        playing={clock.playing}
        onTogglePlay={() => clock.setPlaying((playing) => !playing)}
        speed={clock.speed}
        speeds={SPEEDS.map((speed) => ({ value: speed, label: `×${speed}` }))}
        onSpeed={clock.setSpeed}
        labels={{
          play: strings.play,
          pause: strings.pause,
          speed: strings.speed,
          time: strings.time,
          sheetToggle: strings.sheetToggle,
        }}
        slider={{
          ref: sliderRef,
          min: 5 * 3600,
          max: 26 * 3600,
          step: 60,
          defaultValue: params.time,
          onInput: (value) => {
            timeRef.current = value;
          },
        }}
        footer={strings.footer}
      >
        <div
          className="night-toggle sheet-hide"
          role="radiogroup"
          aria-label={strings.dayAria}
        >
          {DAY_KEYS.map((dayKey) => (
            <button
              key={dayKey}
              role="radio"
              aria-checked={day === dayKey}
              className={day === dayKey ? "active" : ""}
              onClick={() => setDay(dayKey)}
            >
              {strings.days[dayKey]}
            </button>
          ))}
        </div>
        <div className="flow-modes sheet-hide">
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
                {strings.modes[key]}
                {!loaded[key] && !error && (
                  <span className="mode-loading"> …</span>
                )}
              </label>
              {enabled[key] && loaded[key] && (
                <div className="line-pills">
                  {loaded[key]!.meta.lines.map((line) => {
                    const isSolo =
                      solo?.mode === key && solo.line === line.name;
                    return (
                      <button
                        key={line.name}
                        className={`line-pill${isSolo ? " solo" : ""}${solo && !isSolo ? " dimmed" : ""}`}
                        style={{ background: line.color }}
                        title={
                          lang === "fr"
                            ? isSolo
                              ? "Réafficher toutes les lignes"
                              : `Afficher seulement ${line.name}`
                            : isSolo
                              ? "Show all lines again"
                              : `Show only ${line.name}`
                        }
                        onClick={() =>
                          setSolo(isSolo ? null : { mode: key, line: line.name })
                        }
                      >
                        {line.name}
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
                onChange={() => setBusEnabled((prev) => !prev)}
              />
              {strings.modes.bus}
              {busEnabled && (!busMeta || busLoading > 0) && (
                <span className="mode-loading"> …</span>
              )}
            </label>
          </div>
        </div>
        <VizLinks current="flux" lang={lang} />
      </VizPanel>
    </div>
  );
}
