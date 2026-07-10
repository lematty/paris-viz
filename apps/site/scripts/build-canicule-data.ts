/**
 * Builds the urban-heat-island data for /canicule: every urban morphological
 * block (IMU) of Paris and the petite couronne with its local climate zone
 * (LCZ) and its day/night heat hazard and vulnerability scores, from the
 * Institut Paris Region ICU dataset (Licence Ouverte v2.0), fetched through
 * the regional open data portal (Opendatasoft exports, tiled by bbox).
 *
 * Blocks are clipped to the four petite couronne departments by testing the
 * footprint centroid against the commune contours from geo.api.gouv.fr, so
 * the map ends at the department limits instead of an arbitrary rectangle.
 *
 * Output: apps/site/public/canicule/
 *   meta.json   fetch date, counts, LCZ table, note ranges
 *   blocks.bin  binary block polygons + attributes, little-endian:
 *     Uint32 magic "CANI", Uint32 N blocks, Uint32 R rings, Uint32 V verts
 *     Float64[4] bbox (minLon, minLat, maxLon, maxLat)
 *     Int8[N]  day heat hazard note (-100 = unknown)
 *     Int8[N]  night heat hazard note (-100 = unknown)
 *     Uint8[N] day vulnerability note (0 = unknown)
 *     Uint8[N] night vulnerability note (0 = unknown)
 *     Uint8[N] LCZ index into meta.lcz
 *     Uint8[N] built %, Uint8[N] permeable %, Uint8[N] mean height (m)
 *     Uint8[N] ring count (first ring is the outline, the rest are holes)
 *     pad to even offset
 *     Uint16[R] vertices per ring
 *     Uint16[2V] vertex coords quantized to the bbox (x then y)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simplifyPath } from "@paris-viz/gtfs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_ROOT = process.env.DATA_CACHE_DIR
  ? path.resolve(process.env.DATA_CACHE_DIR)
  : path.join(ROOT, "data");
const CACHE_DIR = path.join(DATA_ROOT, "canicule");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "canicule");

const DATASET =
  "https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/" +
  "ilots-de-chaleur-urbains-icu-classification-des-imu-en-zone-climatique-locale-lc";
const SELECT =
  "code_imu,type_lcz,aleaj_note,alean_note,vulnj_note,vulnn_note,bati,permeable,hauteur_mo";
const DEPARTEMENTS = ["75", "92", "93", "94"];

// frame covering the petite couronne with margin; the commune clip below
// trims blocks to the department limits
const MIN_LON = 2.09;
const MAX_LON = 2.67;
const MIN_LAT = 48.72;
const MAX_LAT = 49.03;
const TILES_X = 6;
const TILES_Y = 4;
const QUANT = 65535; // Uint16 coordinate grid over the bbox (~0.65 m steps)
const SIMPLIFY_TOL = 1.6; // Douglas-Peucker tolerance in grid units (~1 m)

interface Feature {
  geometry: { type: string; coordinates: number[][][] | number[][][][] } | null;
  properties: {
    code_imu: number;
    type_lcz: string | null;
    aleaj_note: number | null;
    alean_note: number | null;
    vulnj_note: number | null;
    vulnn_note: number | null;
    bati: number | null;
    permeable: number | null;
    hauteur_mo: number | null;
  };
}

/** Fetch with cache; never cache an error body (both endpoints return JSON
 * errors with HTTP 200 in some failure modes). */
async function fetchCached(url: string, file: string): Promise<string> {
  const full = path.join(CACHE_DIR, file);
  if (existsSync(full)) return readFileSync(full, "utf8");
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
      const text = await res.text();
      const parsed = JSON.parse(text) as { features?: unknown; error_code?: string };
      if (parsed.error_code) throw new Error(`API error: ${parsed.error_code}`);
      if (!Array.isArray(parsed.features))
        throw new Error(`no features array in ${file}`);
      writeFileSync(full, text);
      return text;
    } catch (err) {
      if (attempt >= 4) throw err;
      console.warn(`  retry ${attempt} for ${file}: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

function tileUrl(tileX: number, tileY: number): string {
  const lon0 = MIN_LON + ((MAX_LON - MIN_LON) * tileX) / TILES_X;
  const lon1 = MIN_LON + ((MAX_LON - MIN_LON) * (tileX + 1)) / TILES_X;
  const lat0 = MIN_LAT + ((MAX_LAT - MIN_LAT) * tileY) / TILES_Y;
  const lat1 = MIN_LAT + ((MAX_LAT - MIN_LAT) * (tileY + 1)) / TILES_Y;
  const params = new URLSearchParams({
    select: SELECT,
    where: `in_bbox(geo_point_2d,${lat0},${lon0},${lat1},${lon1})`,
  });
  return `${DATASET}/exports/geojson?${params}`;
}

/** Ray-casting point-in-ring test (lon/lat treated as plane coordinates). */
function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // --- the map limit: commune contours of the petite couronne ----------------
  const communeRings: number[][][] = [];
  for (const dept of DEPARTEMENTS) {
    const text = await fetchCached(
      `https://geo.api.gouv.fr/departements/${dept}/communes?format=geojson&geometry=contour`,
      `communes-${dept}.json`,
    );
    const communes = JSON.parse(text) as { features: Feature[] };
    for (const feature of communes.features) {
      const geom = feature.geometry!;
      if (geom.type === "Polygon") communeRings.push((geom.coordinates as number[][][])[0]);
      else if (geom.type === "MultiPolygon")
        for (const poly of geom.coordinates as number[][][][]) communeRings.push(poly[0]);
    }
  }
  const inPetiteCouronne = (x: number, y: number) =>
    communeRings.some((ring) => inRing(x, y, ring));
  console.log(`Map limit: ${communeRings.length} commune rings`);

  // --- tiled download (each tile cached individually) -------------------------
  const tiles: Feature[][] = [];
  for (let tileY = 0; tileY < TILES_Y; tileY++) {
    for (let tileX = 0; tileX < TILES_X; tileX++) {
      const text = await fetchCached(tileUrl(tileX, tileY), `tile-${tileX}-${tileY}.json`);
      const features = (JSON.parse(text) as { features: Feature[] }).features;
      tiles.push(features);
      console.log(`  tile ${tileX},${tileY}: ${features.length} blocks`);
    }
  }

  // --- filter, clip, quantize --------------------------------------------------
  const quantizeX = (lon: number) =>
    Math.max(0, Math.min(QUANT, Math.round(((lon - MIN_LON) / (MAX_LON - MIN_LON)) * QUANT)));
  const quantizeY = (lat: number) =>
    Math.max(0, Math.min(QUANT, Math.round(((lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * QUANT)));

  const lczIndexByCode = new Map<string, number>();
  const lczCodes: string[] = [];
  const lczOf = (code: string): number => {
    let idx = lczIndexByCode.get(code);
    if (idx === undefined) {
      idx = lczCodes.length;
      lczIndexByCode.set(code, idx);
      lczCodes.push(code);
    }
    return idx;
  };

  const seen = new Set<number>();
  const aleaJ: number[] = [];
  const aleaN: number[] = [];
  const vulnJ: number[] = [];
  const vulnN: number[] = [];
  const lcz: number[] = [];
  const bati: number[] = [];
  const permeable: number[] = [];
  const hauteur: number[] = [];
  const ringCounts: number[] = [];
  const ringVertexCounts: number[] = [];
  const coords: number[] = [];
  let skippedOutside = 0;
  let skippedNoNotes = 0;
  let skippedGeometry = 0;
  let minNote = 127;
  let maxNote = -128;

  for (const features of tiles) {
    for (const feature of features) {
      const props = feature.properties;
      if (seen.has(props.code_imu)) continue; // tile edges are inclusive
      seen.add(props.code_imu);
      if (props.aleaj_note == null && props.alean_note == null) {
        skippedNoNotes++;
        continue;
      }
      if (!feature.geometry) {
        skippedGeometry++;
        continue;
      }
      const polys =
        feature.geometry.type === "MultiPolygon"
          ? (feature.geometry.coordinates as number[][][][])
          : [feature.geometry.coordinates as number[][][]];

      for (const poly of polys) {
        const outer = poly[0];
        if (!outer || outer.length < 4) continue;
        // clip by outline centroid: a block belongs to the petite couronne
        // or it doesn't
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < outer.length - 1; i++) {
          cx += outer[i][0];
          cy += outer[i][1];
        }
        cx /= outer.length - 1;
        cy /= outer.length - 1;
        if (!inPetiteCouronne(cx, cy)) {
          skippedOutside++;
          continue;
        }

        const keptRings: number[][][] = [];
        for (const ring of poly) {
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

        const noteJ = props.aleaj_note ?? -100;
        const noteN = props.alean_note ?? -100;
        aleaJ.push(Math.max(-128, Math.min(127, noteJ)));
        aleaN.push(Math.max(-128, Math.min(127, noteN)));
        for (const note of [noteJ, noteN]) {
          if (note !== -100 && note < minNote) minNote = note;
          if (note !== -100 && note > maxNote) maxNote = note;
        }
        vulnJ.push(Math.max(0, Math.min(255, props.vulnj_note ?? 0)));
        vulnN.push(Math.max(0, Math.min(255, props.vulnn_note ?? 0)));
        lcz.push(lczOf(props.type_lcz || "?"));
        bati.push(Math.max(0, Math.min(100, Math.round(props.bati ?? 0))));
        permeable.push(Math.max(0, Math.min(100, Math.round(props.permeable ?? 0))));
        hauteur.push(Math.max(0, Math.min(255, Math.round(props.hauteur_mo ?? 0))));
        ringCounts.push(keptRings.length);
        for (const ring of keptRings) {
          ringVertexCounts.push(ring.length);
          for (const [x, y] of ring) coords.push(x, y);
        }
      }
    }
  }

  const blockCount = aleaJ.length;
  const ringTotal = ringVertexCounts.length;
  const vertexTotal = coords.length / 2;
  console.log(
    `Blocks kept: ${blockCount} (${ringTotal} rings, ${vertexTotal} vertices) · ` +
      `skipped: ${skippedOutside} outside, ${skippedNoNotes} without notes, ` +
      `${skippedGeometry} degenerate · notes ${minNote}..${maxNote}`,
  );
  if (blockCount < 35_000)
    throw new Error("Suspiciously few blocks - upstream change?");

  // --- sanity: the night-hazard histogram should have a long hot tail ---------
  const bins = [-2, 2, 6, 10, 14, 18, Infinity];
  const hist = new Array(bins.length).fill(0);
  for (const note of aleaN) hist[bins.findIndex((b) => note < b)]++;
  console.log(
    "Night hazard notes (<-2, <2, <6, <10, <14, <18, 18+): " +
      hist.map((count) => `${Math.round((count / blockCount) * 100)}%`).join(" "),
  );

  // --- emit ---------------------------------------------------------------------
  const headerBytes = 16 + 4 * 8;
  const attrBytes = 9 * blockCount;
  const pad = (headerBytes + attrBytes) % 2;
  const bytes = headerBytes + attrBytes + pad + 2 * ringTotal + 4 * vertexTotal;
  const buf = Buffer.alloc(bytes);
  let offset = 0;
  buf.writeUInt32LE(0x43414e49, offset); offset += 4; // "CANI"
  buf.writeUInt32LE(blockCount, offset); offset += 4;
  buf.writeUInt32LE(ringTotal, offset); offset += 4;
  buf.writeUInt32LE(vertexTotal, offset); offset += 4;
  for (const v of [MIN_LON, MIN_LAT, MAX_LON, MAX_LAT]) {
    buf.writeDoubleLE(v, offset);
    offset += 8;
  }
  for (const v of aleaJ) { buf.writeInt8(v, offset); offset += 1; }
  for (const v of aleaN) { buf.writeInt8(v, offset); offset += 1; }
  for (const v of vulnJ) { buf.writeUInt8(v, offset); offset += 1; }
  for (const v of vulnN) { buf.writeUInt8(v, offset); offset += 1; }
  for (const v of lcz) { buf.writeUInt8(v, offset); offset += 1; }
  for (const v of bati) { buf.writeUInt8(v, offset); offset += 1; }
  for (const v of permeable) { buf.writeUInt8(v, offset); offset += 1; }
  for (const v of hauteur) { buf.writeUInt8(v, offset); offset += 1; }
  for (const v of ringCounts) { buf.writeUInt8(v, offset); offset += 1; }
  offset += pad;
  for (const v of ringVertexCounts) { buf.writeUInt16LE(v, offset); offset += 2; }
  for (const v of coords) { buf.writeUInt16LE(v, offset); offset += 2; }
  if (offset !== bytes) throw new Error(`layout mismatch: wrote ${offset} of ${bytes}`);

  writeFileSync(path.join(OUT_DIR, "blocks.bin"), buf);
  writeFileSync(
    path.join(OUT_DIR, "meta.json"),
    JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      count: blockCount,
      lcz: lczCodes,
      noteMin: minNote,
      noteMax: maxNote,
      source: "Institut Paris Region, ICU/LCZ (Licence Ouverte v2.0)",
    }),
  );
  console.log(
    `Wrote blocks.bin (${(bytes / 1e6).toFixed(1)} MB), meta.json (${lczCodes.length} LCZ classes)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
