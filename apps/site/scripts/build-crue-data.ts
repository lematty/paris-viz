/**
 * Builds the flood data for /crue: how far the Seine spreads into Paris at
 * every gauge height, from the IGN RGE ALTI terrain model (fetched as raw
 * 32-bit tiles through the Geoplateforme WMS) and a connectivity-aware flood
 * fill seeded in the river.
 *
 * The model is a "rising bathtub with connectivity": a priority flood from
 * the Seine computes, for every terrain cell, the water level (NGF) at which
 * it becomes reachable from the river, so basins behind higher ground do not
 * flood before the water can actually get there. Gauge heights use the
 * Austerlitz scale (zero at 25.92 m NGF IGN69; 1910 = 8.62 m = 34.54 m NGF).
 * It is a visualization, not a safety model: the 10 m terrain grid smooths
 * parapets and ignores protection works and the underground.
 *
 * Output: apps/site/public/crue/
 *   meta.json  frame, grid dims, gauge zero, historical marks, level table
 *   water.bin  extent polygons per 0.25 m gauge step, little-endian:
 *     Uint32 magic "CRUE", Uint32 L levels
 *     per level: Uint32 polygon count; per polygon: Uint8 ring count,
 *       per ring: Uint16 vertex count, then Uint16 x,y pairs quantized to
 *       the vertige frame (first ring is the outline, the rest are holes)
 *   grid.bin   Uint16 W, Uint16 H, then W*H Uint8: gauge decimeters at which
 *     the cell floods (255 = out of range), half the DEM resolution, row 0
 *     at the northern edge
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simplifyPath } from "@paris-viz/gtfs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_ROOT = process.env.DATA_CACHE_DIR
  ? path.resolve(process.env.DATA_CACHE_DIR)
  : path.join(ROOT, "data");
const CACHE_DIR = path.join(DATA_ROOT, "crue");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "crue");

// same frame as vertige, so the water and the buildings share quantization
const MIN_LON = 2.224;
const MAX_LON = 2.47;
const MIN_LAT = 48.813;
const MAX_LAT = 48.906;
const QUANT = 65535;

// DEM grid ~10 m: fetched as four raw float32 tiles from the WMS
const GRID_W = 1808;
const GRID_H = 1032;
const WMS =
  "https://data.geopf.fr/wms-r/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap" +
  "&LAYERS=ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES&STYLES=&CRS=EPSG:4326" +
  "&FORMAT=image%2Fx-bil%3Bbits%3D32";

const GAUGE_ZERO_NGF = 25.92; // zero of the Austerlitz scale, m NGF IGN69
const MIN_GAUGE = 1.0; // below this the Seine stays in its bed
const MAX_GAUGE = 9.0; // just above the 1910 record
const STEP = 0.25;
const SEED_LON = 2.3661; // in the river by pont d'Austerlitz
const SEED_LAT = 48.8437;
const RIVER_MAX_NGF = 27.4; // cells this low touching the seed are the river
const MARKS = [
  { year: 1910, month: 1, gauge: 8.62 },
  { year: 1955, month: 1, gauge: 7.12 },
  { year: 1982, month: 12, gauge: 6.15 },
  { year: 2016, month: 6, gauge: 6.1 },
  { year: 2018, month: 1, gauge: 5.85 },
];

async function fetchTile(x0: number, y0: number, w: number, h: number): Promise<Buffer> {
  const file = path.join(CACHE_DIR, `dem-${x0}-${y0}.bil`);
  if (existsSync(file)) return readFileSync(file);
  const lon0 = MIN_LON + ((MAX_LON - MIN_LON) * x0) / GRID_W;
  const lon1 = MIN_LON + ((MAX_LON - MIN_LON) * (x0 + w)) / GRID_W;
  const lat1 = MAX_LAT - ((MAX_LAT - MIN_LAT) * y0) / GRID_H;
  const lat0 = MAX_LAT - ((MAX_LAT - MIN_LAT) * (y0 + h)) / GRID_H;
  const url = `${WMS}&BBOX=${lat0},${lon0},${lat1},${lon1}&WIDTH=${w}&HEIGHT=${h}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length !== w * h * 4)
        throw new Error(`expected ${w * h * 4} bytes, got ${buf.length}`);
      writeFileSync(file, buf);
      return buf;
    } catch (err) {
      if (attempt >= 4) throw err;
      console.warn(`  retry ${attempt} for tile ${x0},${y0}: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

/** Priority flood from the river: the level at which each cell gets wet. */
function priorityFlood(elev: Float32Array): Float32Array {
  const flood = new Float32Array(elev.length).fill(Infinity);
  // binary min-heap on flood level
  const heapIdx = new Int32Array(elev.length + 1);
  const heapVal = new Float64Array(elev.length + 1);
  let heapSize = 0;
  const push = (idx: number, val: number) => {
    let i = ++heapSize;
    while (i > 1 && heapVal[i >> 1] > val) {
      heapVal[i] = heapVal[i >> 1];
      heapIdx[i] = heapIdx[i >> 1];
      i >>= 1;
    }
    heapVal[i] = val;
    heapIdx[i] = idx;
  };
  const pop = (): number => {
    const top = heapIdx[1];
    const val = heapVal[heapSize];
    const idx = heapIdx[heapSize--];
    let i = 1;
    for (;;) {
      let child = i << 1;
      if (child > heapSize) break;
      if (child < heapSize && heapVal[child + 1] < heapVal[child]) child++;
      if (heapVal[child] >= val) break;
      heapVal[i] = heapVal[child];
      heapIdx[i] = heapIdx[child];
      i = child;
    }
    heapVal[i] = val;
    heapIdx[i] = idx;
    return top;
  };

  // the river: cells near retenue level connected to the seed point; the
  // configured point may land on a quai or a barge, so take the lowest cell
  // of its neighborhood
  const aimX = Math.floor(((SEED_LON - MIN_LON) / (MAX_LON - MIN_LON)) * GRID_W);
  const aimY = Math.floor(((MAX_LAT - SEED_LAT) / (MAX_LAT - MIN_LAT)) * GRID_H);
  let seedIdx = aimY * GRID_W + aimX;
  for (let dy = -30; dy <= 30; dy++)
    for (let dx = -30; dx <= 30; dx++) {
      const idx = (aimY + dy) * GRID_W + (aimX + dx);
      if (idx >= 0 && idx < elev.length && elev[idx] < elev[seedIdx]) seedIdx = idx;
    }
  console.log(`Seed cell at ${elev[seedIdx].toFixed(2)} m NGF`);
  if (elev[seedIdx] > RIVER_MAX_NGF)
    throw new Error(`seed cell is at ${elev[seedIdx]} m NGF - not in the river?`);
  const queue = [seedIdx];
  const seen = new Uint8Array(elev.length);
  seen[seedIdx] = 1;
  let riverCells = 0;
  while (queue.length) {
    const idx = queue.pop()!;
    riverCells++;
    flood[idx] = Math.max(elev[idx], 0);
    push(idx, flood[idx]);
    const x = idx % GRID_W;
    for (const next of [idx - GRID_W, idx + GRID_W, x > 0 ? idx - 1 : -1, x < GRID_W - 1 ? idx + 1 : -1]) {
      if (next < 0 || next >= elev.length || seen[next]) continue;
      if (elev[next] > RIVER_MAX_NGF || !Number.isFinite(elev[next])) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  console.log(`River component: ${riverCells} cells`);

  while (heapSize > 0) {
    const idx = pop();
    const level = flood[idx];
    const x = idx % GRID_W;
    for (const next of [idx - GRID_W, idx + GRID_W, x > 0 ? idx - 1 : -1, x < GRID_W - 1 ? idx + 1 : -1]) {
      if (next < 0 || next >= elev.length || flood[next] !== Infinity) continue;
      const nextLevel = Math.max(level, elev[next]);
      flood[next] = nextLevel;
      push(next, nextLevel);
    }
  }
  return flood;
}

/** Marching squares on mask (1 = wet), returning closed rings in grid space. */
function traceRings(wet: Uint8Array): [number, number][][] {
  // segments across cell edges, keyed by their start point (x*2,y*2 grid)
  const segments = new Map<number, [number, number, number, number]>();
  const key = (x: number, y: number) => y * (GRID_W * 2 + 2) + x;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= GRID_W || y >= GRID_H ? 0 : wet[y * GRID_W + x];
  for (let y = -1; y < GRID_H; y++) {
    for (let x = -1; x < GRID_W; x++) {
      const caseId =
        (at(x, y) << 3) | (at(x + 1, y) << 2) | (at(x + 1, y + 1) << 1) | at(x, y + 1);
      if (caseId === 0 || caseId === 15) continue;
      // edge midpoints in doubled coordinates
      const top: [number, number] = [x * 2 + 2, y * 2 + 1];
      const bottom: [number, number] = [x * 2 + 2, y * 2 + 3];
      const leftEdge: [number, number] = [x * 2 + 1, y * 2 + 2];
      const rightEdge: [number, number] = [x * 2 + 3, y * 2 + 2];
      // directed segments keeping wet on the LEFT of travel
      const emit = (a: [number, number], b: [number, number]) =>
        segments.set(key(a[0], a[1]), [a[0], a[1], b[0], b[1]]);
      switch (caseId) {
        case 1: emit(bottom, leftEdge); break;
        case 2: emit(rightEdge, bottom); break;
        case 3: emit(rightEdge, leftEdge); break;
        case 4: emit(top, rightEdge); break;
        case 5: emit(top, leftEdge); emit(bottom, rightEdge); break;
        case 6: emit(top, bottom); break;
        case 7: emit(top, leftEdge); break;
        case 8: emit(leftEdge, top); break;
        case 9: emit(bottom, top); break;
        case 10: emit(leftEdge, bottom); emit(rightEdge, top); break;
        case 11: emit(rightEdge, top); break;
        case 12: emit(leftEdge, rightEdge); break;
        case 13: emit(bottom, rightEdge); break;
        case 14: emit(leftEdge, bottom); break;
      }
    }
  }
  const rings: [number, number][][] = [];
  while (segments.size) {
    const first = segments.values().next().value!;
    const ring: [number, number][] = [[first[0], first[1]]];
    segments.delete(key(first[0], first[1]));
    let cx = first[2];
    let cy = first[3];
    while (cx !== ring[0][0] || cy !== ring[0][1]) {
      ring.push([cx, cy]);
      const next = segments.get(key(cx, cy));
      if (!next) break; // open ring should not happen; drop it
      segments.delete(key(cx, cy));
      cx = next[2];
      cy = next[3];
    }
    if (ring.length >= 4) rings.push(ring);
    else if (process.env.CRUE_DEBUG) console.log(`    dropped short/open ring (${ring.length} pts)`);
  }
  return rings;
}

const signedArea = (ring: [number, number][]): number => {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return area / 2;
};

function inRing(x: number, y: number, ring: [number, number][]): boolean {
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

  // --- terrain --------------------------------------------------------------
  const elev = new Float32Array(GRID_W * GRID_H);
  const tileW = GRID_W / 2;
  const tileH = GRID_H / 2;
  for (const [tx, ty] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    const buf = await fetchTile(tx * tileW, ty * tileH, tileW, tileH);
    const tile = new Float32Array(buf.buffer, buf.byteOffset, tileW * tileH);
    for (let y = 0; y < tileH; y++)
      elev.set(
        tile.subarray(y * tileW, (y + 1) * tileW),
        (ty * tileH + y) * GRID_W + tx * tileW,
      );
    console.log(`  tile ${tx},${ty} loaded`);
  }
  for (let i = 0; i < elev.length; i++)
    if (elev[i] < -100 || !Number.isFinite(elev[i])) elev[i] = Infinity; // nodata: never floods
  let lowCells = 0;
  for (let i = 0; i < elev.length; i++) if (elev[i] < 30) lowCells++;
  console.log(`DEM ${GRID_W}x${GRID_H}, ${Math.round((lowCells / elev.length) * 100)}% under 30 m NGF`);

  // --- flood levels -----------------------------------------------------------
  const flood = priorityFlood(elev);

  // --- sanity: flooded share at the historical marks --------------------------
  for (const mark of MARKS) {
    const level = GAUGE_ZERO_NGF + mark.gauge;
    let wetCells = 0;
    for (let i = 0; i < flood.length; i++) if (flood[i] <= level) wetCells++;
    console.log(
      `  ${mark.year} (${mark.gauge} m): ${((wetCells / flood.length) * 100).toFixed(1)}% of the frame under water`,
    );
  }

  // --- extent polygons per step ------------------------------------------------
  const levels: number[] = [];
  for (let g = MIN_GAUGE; g <= MAX_GAUGE + 1e-6; g += STEP) levels.push(+g.toFixed(2));
  const sx = QUANT / (2 * GRID_W);
  const sy = QUANT / (2 * GRID_H);
  const chunks: Buffer[] = [];
  const header = Buffer.alloc(8);
  header.writeUInt32LE(0x43525545, 0); // "CRUE"
  header.writeUInt32LE(levels.length, 4);
  chunks.push(header);
  const wet = new Uint8Array(GRID_W * GRID_H);

  for (const gauge of levels) {
    const ngf = GAUGE_ZERO_NGF + gauge;
    for (let i = 0; i < flood.length; i++) wet[i] = flood[i] <= ngf ? 1 : 0;
    const raw = traceRings(wet);
    if (process.env.CRUE_DEBUG && Math.abs(gauge - 8.5) < 0.01) {
      const areas = raw.map(signedArea);
      const biggest = raw.reduce((a, b) => (a.length > b.length ? a : b));
      console.log(
        `  DEBUG ${gauge}m: ${raw.length} raw rings, ${areas.filter((a) => a > 0).length} positive / ` +
          `${areas.filter((a) => a < 0).length} negative area, biggest ring ${biggest.length} pts`,
      );
    }
    // quantize into the shared frame, simplify, drop slivers
    const rings = raw
      .map((ring) => {
        const quantized: [number, number][] = ring.map(([gx, gy]) => [
          Math.max(0, Math.min(QUANT, Math.round(gx * sx))),
          Math.max(0, Math.min(QUANT, Math.round(QUANT - gy * sy))),
        ]);
        return { pts: simplifyPath(quantized, 45), area: signedArea(ring) };
      })
      .filter((r) => r.pts.length >= 4 && Math.abs(r.area) >= 12);
    // wet-on-the-left tracing in a y-down grid makes outer boundaries come
    // out with NEGATIVE shoelace area and dry-island holes positive
    const outers = rings
      .filter((r) => r.area < 0)
      .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const holes = rings
      .filter((r) => r.area > 0)
      .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const polys = outers.map((outer) => ({ outer: outer.pts, holes: [] as [number, number][][] }));
    for (const hole of holes) {
      const [hx, hy] = hole.pts[0];
      // smallest outer containing the hole (outers sorted big to small);
      // ring count is a Uint8, so keep at most 254 (largest first)
      for (let i = polys.length - 1; i >= 0; i--) {
        if (inRing(hx, hy, polys[i].outer)) {
          if (polys[i].holes.length < 254) polys[i].holes.push(hole.pts);
          break;
        }
      }
    }
    const head = Buffer.alloc(4);
    head.writeUInt32LE(polys.length, 0);
    chunks.push(head);
    for (const poly of polys) {
      const ringList = [poly.outer, ...poly.holes];
      const ringHead = Buffer.alloc(1);
      ringHead.writeUInt8(ringList.length, 0);
      chunks.push(ringHead);
      for (const ring of ringList) {
        const buf = Buffer.alloc(2 + ring.length * 4);
        buf.writeUInt16LE(ring.length, 0);
        for (let i = 0; i < ring.length; i++) {
          buf.writeUInt16LE(ring[i][0], 2 + i * 4);
          buf.writeUInt16LE(ring[i][1], 4 + i * 4);
        }
        chunks.push(buf);
      }
    }
  }
  const water = Buffer.concat(chunks);

  // --- tint grid: half resolution, gauge decimeters ----------------------------
  const gridW = GRID_W / 2;
  const gridH = GRID_H / 2;
  const grid = Buffer.alloc(4 + gridW * gridH);
  grid.writeUInt16LE(gridW, 0);
  grid.writeUInt16LE(gridH, 2);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      let minLevel = Infinity;
      for (const idx of [
        2 * y * GRID_W + 2 * x,
        2 * y * GRID_W + 2 * x + 1,
        (2 * y + 1) * GRID_W + 2 * x,
        (2 * y + 1) * GRID_W + 2 * x + 1,
      ])
        if (flood[idx] < minLevel) minLevel = flood[idx];
      const gauge = minLevel - GAUGE_ZERO_NGF;
      grid[4 + y * gridW + x] =
        gauge > 25 || !Number.isFinite(gauge) ? 255 : Math.max(0, Math.round(gauge * 10));
    }
  }

  writeFileSync(path.join(OUT_DIR, "water.bin"), water);
  writeFileSync(path.join(OUT_DIR, "grid.bin"), grid);
  writeFileSync(
    path.join(OUT_DIR, "meta.json"),
    JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      bbox: [MIN_LON, MIN_LAT, MAX_LON, MAX_LAT],
      gaugeZero: GAUGE_ZERO_NGF,
      minGauge: MIN_GAUGE,
      maxGauge: MAX_GAUGE,
      step: STEP,
      levels: levels.length,
      marks: MARKS,
      source: "IGN RGE ALTI (Geoplateforme) · echelle d'Austerlitz",
    }),
  );
  console.log(
    `Wrote water.bin (${(water.length / 1e6).toFixed(1)} MB, ${levels.length} levels), ` +
      `grid.bin (${(grid.length / 1e6).toFixed(1)} MB)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
