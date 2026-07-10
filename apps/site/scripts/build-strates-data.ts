/**
 * Builds the building-age data for /strates: every built footprint of Paris
 * intra-muros with its construction year or period, from the Apur
 * "emprise batie decomposee" layer (Open Data, ODbL), fetched through the
 * Apur ArcGIS server.
 *
 * Dating comes from the Apur's own sources: the Loyer dating survey for
 * pre-1940 facades, DGFiP fiscal files, building permits and field surveys.
 * About 6% of footprints could not be dated; they are kept (band 255) so the
 * client can show them as undated bedrock. Heights are the median height of
 * the footprint from the Apur MNE/MNT photogrammetry (h_med).
 *
 * Output: apps/site/public/strates/
 *   meta.json      fetch date, counts, period band table, year maximum
 *   buildings.bin  binary footprints + attributes, little-endian:
 *     Uint32 magic "STRA", Uint32 N buildings, Uint32 R rings, Uint32 V verts
 *     Float64[4] bbox (minLon, minLat, maxLon, maxLat)
 *     Uint16[N] construction year (0 = unknown)
 *     Uint16[N] height in decimeters
 *     Uint8[N]  period band index into meta.bands (255 = undated)
 *     Uint8[N]  ring count (first ring is the outline, the rest are holes)
 *     pad to even offset
 *     Uint16[R] vertices per ring
 *     Uint16[2V] vertex coords quantized to the bbox (x then y, ~0.3 m grid)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simplifyPath } from "@paris-viz/gtfs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_ROOT = process.env.DATA_CACHE_DIR
  ? path.resolve(process.env.DATA_CACHE_DIR)
  : path.join(ROOT, "data");
const CACHE_DIR = path.join(DATA_ROOT, "strates");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "strates");

const LAYER =
  "https://carto2.apur.org/apur/rest/services/OPENDATA/EMPRISE_BATIE_PARIS/MapServer/0/query";
const PAGE = 2000;
const FIELDS = "n_sq_eb,an_const,c_perconst,h_med,h_moy";

// the Apur "periode de construction" classification (codes 4 and 13+ unused);
// band 1 is open-ended backwards, [from] only anchors the animation spread
const BANDS = [
  { code: 1, from: 1600, to: 1800 },
  { code: 2, from: 1801, to: 1850 },
  { code: 3, from: 1851, to: 1914 },
  { code: 5, from: 1915, to: 1939 },
  { code: 6, from: 1940, to: 1967 },
  { code: 7, from: 1968, to: 1975 },
  { code: 8, from: 1976, to: 1981 },
  { code: 9, from: 1982, to: 1989 },
  { code: 10, from: 1990, to: 1999 },
  { code: 11, from: 2000, to: 2007 },
  { code: 12, from: 2008, to: 2026 },
];
const UNDATED = 255;

// same fixed quantization frame as vertige, so both artifacts share precision
const MIN_LON = 2.224;
const MAX_LON = 2.47;
const MIN_LAT = 48.813;
const MAX_LAT = 48.906;
const QUANT = 65535; // Uint16 coordinate grid over the bbox (~0.3 m steps)
const SIMPLIFY_TOL = 1.1; // Douglas-Peucker tolerance in grid units (~0.33 m)

interface Feature {
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  } | null;
  properties: {
    n_sq_eb: number;
    an_const: number | null;
    c_perconst: number | null;
    h_med: number | null;
    h_moy: number | null;
  };
}

/** Fetch with cache; never cache an ArcGIS error body or a page without
 * features (the server returns HTTP 200 for both). */
async function fetchCached(url: string, file: string): Promise<string> {
  const full = path.join(CACHE_DIR, file);
  if (existsSync(full)) return readFileSync(full, "utf8");
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
      const text = await res.text();
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error) throw new Error(`ArcGIS: ${parsed.error.message}`);
      writeFileSync(full, text);
      return text;
    } catch (err) {
      if (attempt >= 4) throw err;
      console.warn(`  retry ${attempt} for ${file}: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

function pageUrl(offset: number): string {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: FIELDS,
    orderByFields: "OBJECTID",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
    outSR: "4326",
    geometryPrecision: "7",
    f: "geojson",
  });
  return `${LAYER}?${params}`;
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // --- paginated download (each page cached individually) --------------------
  const countUrl = `${LAYER}?${new URLSearchParams({ where: "1=1", returnCountOnly: "true", f: "json" })}`;
  const total = (JSON.parse(await fetchCached(countUrl, "count.json")) as { count: number })
    .count;
  console.log(`Apur emprises baties: ${total}`);

  const offsets: number[] = [];
  for (let offset = 0; offset < total; offset += PAGE) offsets.push(offset);
  const pages: Feature[][] = [];
  // a few pages in flight at a time: fast, but polite to the ArcGIS server
  const PARALLEL = 4;
  for (let i = 0; i < offsets.length; i += PARALLEL) {
    const batch = offsets.slice(i, i + PARALLEL);
    const texts = await Promise.all(
      batch.map((offset) => fetchCached(pageUrl(offset), `page-${offset}.json`)),
    );
    for (const text of texts) {
      const parsed = JSON.parse(text) as { features?: Feature[] };
      if (!Array.isArray(parsed.features))
        throw new Error("page without features - upstream change?");
      pages.push(parsed.features);
    }
    console.log(`  pages ${Math.min(i + PARALLEL, offsets.length)}/${offsets.length}`);
  }

  // --- filter, quantize ---------------------------------------------------------
  const quantizeX = (lon: number) =>
    Math.max(0, Math.min(QUANT, Math.round(((lon - MIN_LON) / (MAX_LON - MIN_LON)) * QUANT)));
  const quantizeY = (lat: number) =>
    Math.max(0, Math.min(QUANT, Math.round(((lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * QUANT)));
  const bandIndexByCode = new Map(BANDS.map((band, index) => [band.code, index]));

  const years: number[] = [];
  const heightsDm: number[] = [];
  const bands: number[] = [];
  const ringCounts: number[] = [];
  const ringVertexCounts: number[] = [];
  const coords: number[] = [];
  let skippedNoHeight = 0;
  let skippedGeometry = 0;
  let undatedCount = 0;
  let maxYear = 0;

  for (const features of pages) {
    for (const feature of features) {
      const props = feature.properties;
      // median footprint height, or the mean for the handful without one
      const height = props.h_med && props.h_med > 0 ? props.h_med : (props.h_moy ?? 0);
      if (height <= 0) {
        skippedNoHeight++;
        continue;
      }
      const year =
        props.an_const && props.an_const >= 1000 && props.an_const <= 2035
          ? props.an_const
          : 0;
      const band = bandIndexByCode.get(props.c_perconst ?? -1) ?? UNDATED;
      if (!feature.geometry) {
        skippedGeometry++;
        continue;
      }
      const polys =
        feature.geometry.type === "MultiPolygon"
          ? (feature.geometry.coordinates as number[][][][])
          : [feature.geometry.coordinates as number[][][]];

      for (const poly of polys) {
        const keptRings: number[][][] = [];
        for (const ring of poly) {
          // quantize, drop the closing duplicate and collinear micro-detail
          let quantized: [number, number][] = ring.map((pt) => [quantizeX(pt[0]), quantizeY(pt[1])]);
          if (
            quantized.length > 1 &&
            quantized[0][0] === quantized[quantized.length - 1][0] &&
            quantized[0][1] === quantized[quantized.length - 1][1]
          )
            quantized = quantized.slice(0, -1);
          quantized = simplifyPath(quantized, SIMPLIFY_TOL);
          const dedup: [number, number][] = [];
          for (const pt of quantized) {
            const last = dedup[dedup.length - 1];
            if (!last || last[0] !== pt[0] || last[1] !== pt[1]) dedup.push(pt);
          }
          if (dedup.length >= 3 && dedup.length <= 65535) keptRings.push(dedup);
          else if (keptRings.length === 0) break; // outline degenerate: drop all
        }
        if (keptRings.length === 0 || keptRings.length > 255) {
          skippedGeometry++;
          continue;
        }

        years.push(year);
        heightsDm.push(Math.min(65535, Math.round(height * 10)));
        bands.push(band);
        if (band === UNDATED && year === 0) undatedCount++;
        if (year > maxYear) maxYear = year;
        ringCounts.push(keptRings.length);
        for (const ring of keptRings) {
          ringVertexCounts.push(ring.length);
          for (const [x, y] of ring) coords.push(x, y);
        }
      }
    }
  }

  const buildingCount = years.length;
  const ringTotal = ringVertexCounts.length;
  const vertexTotal = coords.length / 2;
  console.log(
    `Footprints kept: ${buildingCount} (${ringTotal} rings, ${vertexTotal} vertices) · ` +
      `skipped: ${skippedNoHeight} without height, ${skippedGeometry} degenerate · ` +
      `${undatedCount} undated · years up to ${maxYear}`,
  );
  if (buildingCount < 100_000)
    throw new Error("Suspiciously few footprints - upstream change?");

  // --- sanity: the band histogram should crest at 1851-1914 ---------------------
  const hist = new Array(BANDS.length + 1).fill(0);
  for (const band of bands) hist[band === UNDATED ? BANDS.length : band]++;
  console.log(
    "Period bands (" +
      BANDS.map((band) => band.code).join(", ") +
      ", undated): " +
      hist.map((count) => `${Math.round((count / buildingCount) * 100)}%`).join(" "),
  );

  // --- emit ---------------------------------------------------------------------
  const headerBytes = 16 + 4 * 8;
  const attrBytes = 2 * buildingCount + 2 * buildingCount + buildingCount + buildingCount;
  const pad = (headerBytes + attrBytes) % 2;
  const bytes = headerBytes + attrBytes + pad + 2 * ringTotal + 4 * vertexTotal;
  const buf = Buffer.alloc(bytes);
  let offset = 0;
  buf.writeUInt32LE(0x53545241, offset); offset += 4; // "STRA"
  buf.writeUInt32LE(buildingCount, offset); offset += 4;
  buf.writeUInt32LE(ringTotal, offset); offset += 4;
  buf.writeUInt32LE(vertexTotal, offset); offset += 4;
  for (const v of [MIN_LON, MIN_LAT, MAX_LON, MAX_LAT]) {
    buf.writeDoubleLE(v, offset);
    offset += 8;
  }
  for (const v of years) { buf.writeUInt16LE(v, offset); offset += 2; }
  for (const v of heightsDm) { buf.writeUInt16LE(v, offset); offset += 2; }
  for (const v of bands) { buf.writeUInt8(v, offset); offset += 1; }
  for (const v of ringCounts) { buf.writeUInt8(v, offset); offset += 1; }
  offset += pad;
  for (const v of ringVertexCounts) { buf.writeUInt16LE(v, offset); offset += 2; }
  for (const v of coords) { buf.writeUInt16LE(v, offset); offset += 2; }
  if (offset !== bytes) throw new Error(`layout mismatch: wrote ${offset} of ${bytes}`);

  writeFileSync(path.join(OUT_DIR, "buildings.bin"), buf);
  writeFileSync(
    path.join(OUT_DIR, "meta.json"),
    JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      count: buildingCount,
      undated: undatedCount,
      maxYear,
      bands: BANDS,
      source: "Apur, emprise batie decomposee (ODbL)",
    }),
  );
  console.log(
    `Wrote buildings.bin (${(bytes / 1e6).toFixed(1)} MB), meta.json (${BANDS.length} bands)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
