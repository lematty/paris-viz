"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Deck, type PickingInfo } from "@deck.gl/core";
import { SolidPolygonLayer } from "@deck.gl/layers";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { CANICULE, FLUX } from "@/lib/siteStrings";
import { currentSearchParams, hexToRgb } from "@/lib/viz";
import LangToggle from "./LangToggle";
import { createBasemapLayer, DECK_TOOLTIP_STYLE } from "./viz/basemap";
import { mountDeck } from "./viz/deckMount";
import VizLinks from "./viz/VizLinks";

interface CaniculeMeta {
  date: string;
  count: number;
  lcz: string[];
  noteMin: number;
  noteMax: number;
}

/** One block: element offsets into the shared flat positions array. */
interface Block {
  idx: number;
  start: number;
  end: number;
  holes?: number[];
}

interface BlockData {
  blocks: Block[];
  positions: Float64Array;
  aleaJ: Int8Array;
  aleaN: Int8Array;
  vulnJ: Uint8Array;
  vulnN: Uint8Array;
  lcz: Uint8Array;
  bati: Uint8Array;
  permeable: Uint8Array;
}

type Axis = "alea" | "vuln";
type Moment = "jour" | "nuit";

// diverging-by-hue, monotone-by-lightness heat ramp: cool blocks recede into
// the dark basemap, overheating blocks glow (validated: visible step gaps,
// order readable under CVD via lightness; the hue spread is the point)
const ALEA_BINS = [-2, 2, 6, 10, 14, 18]; // note < bin; last bin catches the rest
const ALEA_HEX = [
  "#2b5273",
  "#48678b",
  "#847b70",
  "#b48a38",
  "#dc9a37",
  "#ffa96e",
  "#ffd2bc",
];
const ALEA_RGB = ALEA_HEX.map(hexToRgb);
const aleaBin = (note: number) => {
  for (let b = 0; b < ALEA_BINS.length; b++) if (note < ALEA_BINS[b]) return b;
  return ALEA_BINS.length;
};

// vulnerability 1..9 in seven violet steps cut on the real distribution
// (notes 3-7 hold 88% of blocks, so each gets its own step); 0 = not scored
const VULN_HEX = [
  "#4d4560",
  "#655380",
  "#7d619e",
  "#9670ba",
  "#b07ed2",
  "#cf8ee4",
  "#eda1f2",
];
const VULN_RGB = VULN_HEX.map(hexToRgb);
const VULN_UNKNOWN_RGB = hexToRgb("#33363c");
const vulnBin = (note: number) => (note <= 2 ? 0 : note >= 8 ? 6 : note - 2);

function readParams(): { axis: Axis; moment: Moment } {
  const vue = currentSearchParams().get("vue") || "";
  return {
    axis: vue.startsWith("vuln") ? "vuln" : "alea",
    moment: vue.endsWith("jour") ? "jour" : "nuit",
  };
}

function parseBlocks(buf: ArrayBuffer): BlockData {
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== 0x43414e49)
    throw new Error("blocks.bin: bad magic");
  const blockCount = view.getUint32(4, true);
  const ringCount = view.getUint32(8, true);
  const vertexCount = view.getUint32(12, true);
  const minLon = view.getFloat64(16, true);
  const minLat = view.getFloat64(24, true);
  const maxLon = view.getFloat64(32, true);
  const maxLat = view.getFloat64(40, true);
  let offset = 48;
  const aleaJ = new Int8Array(buf, offset, blockCount);
  offset += blockCount;
  const aleaN = new Int8Array(buf, offset, blockCount);
  offset += blockCount;
  const vulnJ = new Uint8Array(buf, offset, blockCount);
  offset += blockCount;
  const vulnN = new Uint8Array(buf, offset, blockCount);
  offset += blockCount;
  const lcz = new Uint8Array(buf, offset, blockCount);
  offset += blockCount;
  const bati = new Uint8Array(buf, offset, blockCount);
  offset += blockCount;
  const permeable = new Uint8Array(buf, offset, blockCount);
  offset += blockCount;
  offset += blockCount; // mean height: parsed but unused so far
  const rings = new Uint8Array(buf, offset, blockCount);
  offset += blockCount;
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

  const blocks: Block[] = new Array(blockCount);
  let ringCursor = 0;
  let elementCursor = 0; // element cursor into positions
  for (let i = 0; i < blockCount; i++) {
    const start = elementCursor;
    const nRings = rings[i];
    let holes: number[] | undefined;
    for (let k = 0; k < nRings; k++) {
      elementCursor += ringVerts[ringCursor + k] * 2;
      if (k < nRings - 1) (holes ??= []).push(elementCursor - start);
    }
    ringCursor += nRings;
    blocks[i] = { idx: i, start, end: elementCursor, holes };
  }
  return { blocks, positions, aleaJ, aleaN, vulnJ, vulnN, lcz, bati, permeable };
}

export default function CaniculeMap() {
  // read once per mount (module-level reads go stale across client navs)
  const [params] = useState(readParams);
  const containerRef = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<CaniculeMeta | null>(null);
  const [data, setData] = useState<BlockData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [axis, setAxis] = useState<Axis>(params.axis);
  const [moment, setMoment] = useState<Moment>(params.moment);
  const [lang, setLang] = useState<Lang>(loadLang);
  // on small screens the panel is a bottom sheet, collapsed by default
  const [sheetOpen, setSheetOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 640,
  );
  const commonStrings = FLUX[lang];
  const strings = CANICULE[lang];
  const langRef = useRef(lang);
  langRef.current = lang;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const dataRef = useRef(data);
  dataRef.current = data;
  const axisRef = useRef(axis);
  axisRef.current = axis;
  const momentRef = useRef(moment);
  momentRef.current = moment;

  useEffect(() => {
    Promise.all([
      fetch("/canicule/meta.json").then((response) => {
        if (!response.ok) throw new Error(`meta.json: HTTP ${response.status}`);
        return response.json() as Promise<CaniculeMeta>;
      }),
      fetch("/canicule/blocks.bin").then((response) => {
        if (!response.ok) throw new Error(`blocks.bin: HTTP ${response.status}`);
        return response.arrayBuffer();
      }),
    ])
      .then(([nextMeta, buf]) => {
        setMeta(nextMeta);
        setData(parseBlocks(buf));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const deckRef = useRef<Deck | null>(null);
  const basemapRef = useRef<ReturnType<typeof createBasemapLayer> | null>(null);

  // one flat layer; switching variable or moment only re-evaluates the fill
  // color attribute (the geometry is tessellated and uploaded exactly once)
  useEffect(() => {
    const deck = deckRef.current;
    const basemap = basemapRef.current;
    if (!deck || !basemap || !data) return;
    const vue = `${axis}-${moment}`;
    const aleaNotes = moment === "jour" ? data.aleaJ : data.aleaN;
    const vulnNotes = moment === "jour" ? data.vulnJ : data.vulnN;
    deck.setProps({
      layers: [
        basemap,
        new SolidPolygonLayer<Block>({
          id: "canicule-blocks",
          data: data.blocks,
          positionFormat: "XY",
          getPolygon: (block: Block) =>
            block.holes
              ? {
                  positions: data.positions.subarray(block.start, block.end),
                  holeIndices: block.holes,
                }
              : data.positions.subarray(block.start, block.end),
          getFillColor: (block: Block) =>
            axis === "alea"
              ? ALEA_RGB[aleaBin(aleaNotes[block.idx])]
              : vulnNotes[block.idx] === 0
                ? VULN_UNKNOWN_RGB
                : VULN_RGB[vulnBin(vulnNotes[block.idx])],
          updateTriggers: { getFillColor: vue },
          transitions: { getFillColor: 300 },
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 90],
        }),
      ],
    });
  }, [data, axis, moment]);

  useEffect(() => {
    basemapRef.current = createBasemapLayer();
    return mountDeck(
      () => {
        const deck = new Deck({
          parent: containerRef.current!,
          initialViewState: {
            longitude: 2.388,
            latitude: 48.86,
            zoom: 10.4,
            minZoom: 9.3,
            maxZoom: 15,
          },
          controller: true,
          getCursor: ({ isDragging, isHovering }) =>
            isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
          getTooltip: ({ object, layer }: PickingInfo) => {
            if (!object || layer?.id !== "canicule-blocks") return null;
            const data = dataRef.current;
            const meta = metaRef.current;
            if (!data || !meta) return null;
            const strings = CANICULE[langRef.current];
            const block = object as Block;
            const moment = momentRef.current;
            const aleaNote = (moment === "jour" ? data.aleaJ : data.aleaN)[block.idx];
            const vulnNote = (moment === "jour" ? data.vulnJ : data.vulnN)[block.idx];
            const lczCode = meta.lcz[data.lcz[block.idx]];
            const parts = [
              strings.lcz[lczCode] ?? lczCode,
              strings.alea(aleaNote),
              vulnNote > 0 ? strings.vuln(vulnNote) : strings.vulnUnknown,
              strings.built(data.bati[block.idx]),
              strings.permeable(data.permeable[block.idx]),
            ];
            return { text: parts.join(" · "), style: DECK_TOOLTIP_STYLE };
          },
          layers: [basemapRef.current],
        });
        deckRef.current = deck;
        (window as unknown as Record<string, unknown>).__canicule = {
          // camera override for tests and promo screenshots
          setView: (viewState: Record<string, number>) =>
            deck.setProps({
              initialViewState: {
                longitude: 2.388,
                latitude: 48.86,
                zoom: 10.4,
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

  // the story flips to the human side of the same night: not where it is
  // hottest, but who cannot escape it
  const atStory = axis === "vuln" && moment === "nuit";
  const story = () => {
    setAxis(atStory ? "alea" : "vuln");
    setMoment("nuit");
  };

  const subtitle = useMemo(() => {
    if (error) return commonStrings.error(error);
    if (!meta || !data) return strings.loading;
    return strings.subtitle(meta.count.toLocaleString(locale));
  }, [error, meta, data, commonStrings, strings, locale]);

  const legendHex = axis === "alea" ? ALEA_HEX : VULN_HEX;
  const legendLeft = axis === "alea" ? strings.legendCool : strings.legendVulnLow;
  const legendRight = axis === "alea" ? strings.legendHot : strings.legendVulnHigh;

  return (
    <div className="flow">
      <div ref={containerRef} className="flow-canvas" />
      <div className={`flow-panel${sheetOpen ? "" : " collapsed"}`}>
        <div className="flow-topbar">
          <a className="home-link" href="/">
            ← Paris Viz
          </a>
          <LangToggle
            lang={lang}
            onChange={(nextLang) => {
              setLang(nextLang);
              saveLang(nextLang);
            }}
          />
          <button
            className="sheet-toggle"
            aria-label={commonStrings.sheetToggle}
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen((open) => !open)}
          >
            {sheetOpen ? "⌄" : "⌃"}
          </button>
        </div>
        <h1 className="sheet-hide">{strings.title}</h1>
        <p className="sub sheet-hide">{subtitle}</p>
        <div className="flow-controls">
          <button
            aria-label={strings.momentAria}
            aria-pressed={moment === "nuit"}
            onClick={() => setMoment(moment === "nuit" ? "jour" : "nuit")}
          >
            {moment === "nuit" ? `☾ ${strings.night}` : `☀ ${strings.day}`}
          </button>
          <select
            value={axis}
            onChange={(e) => setAxis(e.target.value as Axis)}
            aria-label={strings.axisAria}
          >
            <option value="alea">{strings.axisAlea}</option>
            <option value="vuln">{strings.axisVuln}</option>
          </select>
        </div>
        <button className="story-btn sheet-hide" onClick={story}>
          {atStory ? strings.storyAlea : strings.storyVuln}
        </button>
        <div className="iso-legend sheet-hide">
          <div className="iso-swatches">
            {legendHex.map((hex) => (
              <span key={hex} className="iso-swatch" style={{ background: hex }} />
            ))}
          </div>
          <div className="legend-labels">
            <span>{legendLeft}</span>
            <span>{legendRight}</span>
          </div>
          <p className="pulse-legend">{strings.legend}</p>
        </div>
        <VizLinks current="canicule" lang={lang} />
        <p className="flow-footer sheet-hide">{strings.footer}</p>
      </div>
    </div>
  );
}
