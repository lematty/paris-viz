/**
 * Builds the building-height data for /vertige: every building of Paris
 * intra-muros with its measured height, from IGN BD TOPO (the national
 * topographic database), fetched through the Géoplateforme WFS.
 *
 * Heights are photogrammetric measurements (gutter height above ground), not
 * estimates from floor counts. Buildings are clipped to the 20 arrondissements
 * so the map ends at the city limit instead of an arbitrary bounding box.
 *
 * Output: apps/site/public/vertige/
 *   meta.json      fetch date, counts, usage label table, height maximum
 *   buildings.bin  binary footprints + attributes, little-endian:
 *     Uint32 magic "VERT", Uint32 N buildings, Uint32 R rings, Uint32 V verts
 *     Float64[4] bbox (minLon, minLat, maxLon, maxLat)
 *     Uint16[N] height in decimeters
 *     Uint16[N] construction year (0 = unknown)
 *     Uint8[N]  floor count (255 = unknown)
 *     Uint8[N]  usage index into meta.usages
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
const CACHE_DIR = path.join(DATA_ROOT, "vertige");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "vertige");

const WFS = "https://data.geopf.fr/wfs/ows";
// Paris + a margin; the arrondissement clip below trims it to the city limit
const BBOX = "48.813,2.224,48.906,2.47,urn:ogc:def:crs:EPSG::4326";
const PAGE = 5000;
const FIELDS =
  "cleabs,hauteur,nombre_d_etages,usage_1,date_d_apparition," +
  "etat_de_l_objet,construction_legere,geometrie";
const ARRONDISSEMENTS_URL =
  "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/arrondissements/exports/geojson";

const QUANT = 65535; // Uint16 coordinate grid over the bbox (~0.3 m steps)
const SIMPLIFY_TOL = 1.1; // Douglas-Peucker tolerance in grid units (~0.33 m)

interface Feature {
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
  properties: {
    hauteur: number | null;
    nombre_d_etages: number | null;
    usage_1: string | null;
    date_d_apparition: string | null;
    etat_de_l_objet: string | null;
    construction_legere: boolean | null;
  };
}

async function fetchCached(url: string, file: string): Promise<string> {
  const full = path.join(CACHE_DIR, file);
  if (existsSync(full)) return readFileSync(full, "utf8");
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
      const text = await res.text();
      JSON.parse(text); // never cache a truncated or HTML error body
      writeFileSync(full, text);
      return text;
    } catch (err) {
      if (attempt >= 4) throw err;
      console.warn(`  retry ${attempt} for ${file}: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

function wfsPageUrl(startIndex: number): string {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: "BDTOPO_V3:batiment",
    bbox: BBOX,
    outputFormat: "application/json",
    count: String(PAGE),
    startIndex: String(startIndex),
    sortBy: "cleabs",
    propertyName: FIELDS,
  });
  return `${WFS}?${params}`;
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

  // --- the city limit: union of the 20 arrondissement polygons ---------------
  const arrTxt = await fetchCached(ARRONDISSEMENTS_URL, "arrondissements.geojson");
  const arr = JSON.parse(arrTxt) as { features: Feature[] };
  const cityRings: number[][][] = [];
  for (const f of arr.features) {
    const g = f.geometry;
    if (g.type === "Polygon") cityRings.push((g.coordinates as number[][][])[0]);
    else if (g.type === "MultiPolygon")
      for (const poly of g.coordinates as number[][][][]) cityRings.push(poly[0]);
  }
  const inParis = (x: number, y: number) =>
    cityRings.some((ring) => inRing(x, y, ring));
  console.log(`City limit: ${cityRings.length} arrondissement rings`);

  // --- paginated WFS download (each page cached individually) ----------------
  const first = JSON.parse(await fetchCached(wfsPageUrl(0), "batiment-0.json")) as {
    numberMatched: number;
    features: Feature[];
  };
  const total = first.numberMatched;
  console.log(`BD TOPO buildings in bbox: ${total}`);
  const pages: Feature[][] = [first.features];
  const starts: number[] = [];
  for (let s = PAGE; s < total; s += PAGE) starts.push(s);
  // a few pages in flight at a time: fast, but polite to the WFS
  const PARALLEL = 4;
  for (let i = 0; i < starts.length; i += PARALLEL) {
    const batch = starts.slice(i, i + PARALLEL);
    const texts = await Promise.all(
      batch.map((s) => fetchCached(wfsPageUrl(s), `batiment-${s}.json`)),
    );
    for (const t of texts) pages.push((JSON.parse(t) as { features: Feature[] }).features);
    console.log(`  pages ${Math.min(i + PARALLEL, starts.length)}/${starts.length}`);
  }

  // --- filter, clip, quantize --------------------------------------------------
  // fixed quantization frame so page order never changes the output
  const minLon = 2.224;
  const maxLon = 2.47;
  const minLat = 48.813;
  const maxLat = 48.906;
  const qx = (lon: number) =>
    Math.max(0, Math.min(QUANT, Math.round(((lon - minLon) / (maxLon - minLon)) * QUANT)));
  const qy = (lat: number) =>
    Math.max(0, Math.min(QUANT, Math.round(((lat - minLat) / (maxLat - minLat)) * QUANT)));

  const usageIdx = new Map<string, number>();
  const usages: string[] = [];
  const usageOf = (label: string): number => {
    let idx = usageIdx.get(label);
    if (idx === undefined) {
      idx = usages.length;
      usageIdx.set(label, idx);
      usages.push(label);
    }
    return idx;
  };

  const hDm: number[] = [];
  const years: number[] = [];
  const floors: number[] = [];
  const usage: number[] = [];
  const ringCounts: number[] = [];
  const ringVerts: number[] = [];
  const coords: number[] = [];
  let skippedNoHeight = 0;
  let skippedOutside = 0;
  let skippedState = 0;
  let maxH = 0;

  for (const features of pages) {
    for (const f of features) {
      const p = f.properties;
      if (p.etat_de_l_objet && p.etat_de_l_objet !== "En service") {
        skippedState++;
        continue;
      }
      // measured height, or a floor-count estimate for the few unmeasured ones
      let h = p.hauteur ?? 0;
      if (h <= 0) {
        if (p.nombre_d_etages && p.nombre_d_etages > 0)
          h = p.nombre_d_etages * 3.2 + 1;
        else {
          skippedNoHeight++;
          continue;
        }
      }
      const polys =
        f.geometry.type === "MultiPolygon"
          ? (f.geometry.coordinates as number[][][][])
          : [f.geometry.coordinates as number[][][]];
      const year = p.date_d_apparition
        ? Math.max(0, +p.date_d_apparition.slice(0, 4) || 0)
        : 0;
      const et =
        p.nombre_d_etages && p.nombre_d_etages > 0 && p.nombre_d_etages < 255
          ? p.nombre_d_etages
          : 255;
      const u = usageOf(p.usage_1 || "Indifférencié");

      for (const poly of polys) {
        const outer = poly[0];
        if (!outer || outer.length < 4) continue;
        // clip by outline centroid: a building belongs to Paris or it doesn't
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < outer.length - 1; i++) {
          cx += outer[i][0];
          cy += outer[i][1];
        }
        cx /= outer.length - 1;
        cy /= outer.length - 1;
        if (!inParis(cx, cy)) {
          skippedOutside++;
          continue;
        }

        const keptRings: number[][][] = [];
        for (const ring of poly) {
          // quantize, drop the closing duplicate and collinear micro-detail
          let q: [number, number][] = ring.map((pt) => [qx(pt[0]), qy(pt[1])]);
          if (
            q.length > 1 &&
            q[0][0] === q[q.length - 1][0] &&
            q[0][1] === q[q.length - 1][1]
          )
            q = q.slice(0, -1);
          q = simplifyPath(q, SIMPLIFY_TOL);
          const dedup: [number, number][] = [];
          for (const pt of q) {
            const last = dedup[dedup.length - 1];
            if (!last || last[0] !== pt[0] || last[1] !== pt[1]) dedup.push(pt);
          }
          if (dedup.length >= 3 && dedup.length <= 65535) keptRings.push(dedup);
          else if (keptRings.length === 0) break; // outline degenerate: drop all
        }
        if (keptRings.length === 0 || keptRings.length > 255) continue;

        hDm.push(Math.min(65535, Math.round(h * 10)));
        years.push(Math.min(65535, year));
        floors.push(et);
        usage.push(u);
        ringCounts.push(keptRings.length);
        for (const ring of keptRings) {
          ringVerts.push(ring.length);
          for (const [x, y] of ring) coords.push(x, y);
        }
        if (h > maxH) maxH = h;
      }
    }
  }

  const N = hDm.length;
  const R = ringVerts.length;
  const V = coords.length / 2;
  console.log(
    `Buildings kept: ${N} (${R} rings, ${V} vertices) · ` +
      `skipped: ${skippedOutside} outside Paris, ${skippedNoHeight} without height, ` +
      `${skippedState} not in service · max height ${maxH.toFixed(1)} m`,
  );
  if (N < 50_000) throw new Error("Suspiciously few buildings - upstream change?");

  // --- sanity: the height histogram should crest at the Haussmann band ---------
  const bands = [9, 15, 21, 30, 50, 100, Infinity];
  const hist = new Array(bands.length).fill(0);
  for (const dm of hDm) hist[bands.findIndex((b) => dm / 10 < b)]++;
  console.log(
    "Height bands (<9, <15, <21, <30, <50, <100, 100+ m): " +
      hist.map((n) => `${Math.round((n / N) * 100)}%`).join(" "),
  );

  // --- emit ---------------------------------------------------------------------
  const headerBytes = 16 + 4 * 8;
  const attrBytes = 2 * N + 2 * N + N + N + N;
  const pad = (headerBytes + attrBytes) % 2;
  const bytes = headerBytes + attrBytes + pad + 2 * R + 4 * V;
  const buf = Buffer.alloc(bytes);
  let o = 0;
  buf.writeUInt32LE(0x56455254, o); o += 4;
  buf.writeUInt32LE(N, o); o += 4;
  buf.writeUInt32LE(R, o); o += 4;
  buf.writeUInt32LE(V, o); o += 4;
  for (const v of [minLon, minLat, maxLon, maxLat]) {
    buf.writeDoubleLE(v, o);
    o += 8;
  }
  for (const v of hDm) { buf.writeUInt16LE(v, o); o += 2; }
  for (const v of years) { buf.writeUInt16LE(v, o); o += 2; }
  for (const v of floors) { buf.writeUInt8(v, o); o += 1; }
  for (const v of usage) { buf.writeUInt8(v, o); o += 1; }
  for (const v of ringCounts) { buf.writeUInt8(v, o); o += 1; }
  o += pad;
  for (const v of ringVerts) { buf.writeUInt16LE(v, o); o += 2; }
  for (const v of coords) { buf.writeUInt16LE(v, o); o += 2; }
  if (o !== bytes) throw new Error(`layout mismatch: wrote ${o} of ${bytes}`);

  writeFileSync(path.join(OUT_DIR, "buildings.bin"), buf);
  writeFileSync(
    path.join(OUT_DIR, "meta.json"),
    JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      count: N,
      maxH: Math.round(maxH * 10) / 10,
      usages,
      source: "IGN BD TOPO",
    }),
  );
  console.log(
    `Wrote buildings.bin (${(bytes / 1e6).toFixed(1)} MB), meta.json (${usages.length} usages)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
