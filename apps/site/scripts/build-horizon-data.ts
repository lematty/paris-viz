/**
 * Builds the isochrone data for /horizon: a station-to-station travel-time
 * matrix over the rail network (métro, RER & Transilien, tram) for a
 * representative weekday.
 *
 * Model: frequency-based routing, not a single departure. Riding time between
 * consecutive stops is the median scheduled run time; boarding a line costs
 * half its daytime headway (07:00-20:00, capped); transfers use transfers.txt
 * walk times plus proximity fallbacks. One Dijkstra per station over that
 * graph gives "average conditions" door-to-door times, which is what an
 * isochrone should show - a specific 08:17 departure is trivia, the shape of
 * the network is the story.
 *
 * Output: apps/site/public/horizon/
 *   stations.json  station names, positions, mode bitmask, feed date
 *   matrix.bin     N*N uint8, minutes from station i to station j (255 = out
 *                  of reach); row-major, diagonal 0
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DAY_MS,
  downloadGtfs,
  fmtDate,
  haversineMeters,
  loadServiceDates,
  parseGtfsDate,
  parseGtfsTime,
  streamZipCsv,
} from "@paris-viz/gtfs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_ROOT = process.env.DATA_CACHE_DIR
  ? path.resolve(process.env.DATA_CACHE_DIR)
  : path.join(ROOT, "data");
const ZIP_PATH = path.join(DATA_ROOT, "IDFM-gtfs.zip");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "horizon");

// route_type → mode bit (a station can host several modes)
const MODE_BIT: Record<string, number> = { "1": 1, "2": 2, "0": 4 };

// daytime window used to derive headways
const WINDOW_START = 7 * 3600;
const WINDOW_END = 20 * 3600;
const MAX_WAIT_S = 900; // cap boarding wait at 15 min (sparse branches)
const ALIGHT_S = 30; // platform-to-concourse buffer when leaving a train
const WALK_SPEED = 1.2; // m/s for proximity transfers
const TRANSFER_PENALTY_S = 120; // orientation cost added to proximity walks
const MAX_TRANSFER_M = 500;
const MAX_MINUTES = 254; // matrix is uint8; 255 = unreachable

/** Next Monday at least 3 days out (same policy as the flux build). */
function nextMonday(): string {
  const date = new Date(Date.now() + 3 * DAY_MS);
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};

/** Minimal binary min-heap of [cost, node] pairs for Dijkstra. */
class Heap {
  private pairs: number[] = []; // packed pairs: cost at 2k, node at 2k+1
  get size() {
    return this.pairs.length / 2;
  }
  push(cost: number, node: number) {
    const pairs = this.pairs;
    pairs.push(cost, node);
    let i = pairs.length / 2 - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pairs[parent * 2] <= pairs[i * 2]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): [number, number] {
    const pairs = this.pairs;
    const top: [number, number] = [pairs[0], pairs[1]];
    const last = pairs.length / 2 - 1;
    this.swap(0, last);
    pairs.length -= 2;
    let i = 0;
    const pairCount = pairs.length / 2;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < pairCount && pairs[left * 2] < pairs[smallest * 2]) smallest = left;
      if (right < pairCount && pairs[right * 2] < pairs[smallest * 2]) smallest = right;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
    return top;
  }
  private swap(i: number, j: number) {
    const pairs = this.pairs;
    [pairs[i * 2], pairs[j * 2]] = [pairs[j * 2], pairs[i * 2]];
    [pairs[i * 2 + 1], pairs[j * 2 + 1]] = [pairs[j * 2 + 1], pairs[i * 2 + 1]];
  }
}

async function main() {
  await downloadGtfs(ZIP_PATH);
  const date = nextMonday();
  const dayTs = parseGtfsDate(date);

  // --- rail routes -----------------------------------------------------------
  const routes = new Map<string, { bit: number }>();
  await streamZipCsv(ZIP_PATH, "routes.txt", (get) => {
    const bit = MODE_BIT[get("route_type")];
    if (bit) routes.set(get("route_id"), { bit });
  });
  console.log(`Rail routes: ${routes.size}`);

  // --- trips active on the chosen weekday -------------------------------------
  interface Trip {
    routeId: string;
    serviceId: string;
    dir: string;
  }
  const trips = new Map<string, Trip>();
  const serviceIds = new Set<string>();
  await streamZipCsv(ZIP_PATH, "trips.txt", (get) => {
    const routeId = get("route_id");
    if (!routes.has(routeId)) return;
    trips.set(get("trip_id"), {
      routeId,
      serviceId: get("service_id"),
      dir: get("direction_id") || "0",
    });
    serviceIds.add(get("service_id"));
  });
  const serviceDates = await loadServiceDates(ZIP_PATH, serviceIds);
  const active = new Set<string>();
  for (const [id, trip] of trips) {
    if (serviceDates.get(trip.serviceId)?.has(dayTs)) active.add(id);
  }
  console.log(`Active rail trips on ${fmtDate(dayTs)}: ${active.size}`);
  if (active.size === 0) throw new Error("No active trips - date outside feed?");

  // --- stop_times: per-trip stop sequences (the big streaming pass) -----------
  const tripStops = new Map<string, [number, string][]>();
  await streamZipCsv(ZIP_PATH, "stop_times.txt", (get) => {
    const tripId = get("trip_id");
    if (!active.has(tripId)) return;
    const time = get("departure_time") || get("arrival_time");
    if (!time) return;
    let arr = tripStops.get(tripId);
    if (!arr) tripStops.set(tripId, (arr = []));
    arr.push([parseGtfsTime(time), get("stop_id")]);
  });
  console.log(`stop_times: ${tripStops.size} trips with stops`);

  // --- stops: group platforms into stations via parent_station ----------------
  interface StopRow {
    name: string;
    lat: number;
    lon: number;
    parent: string;
  }
  const stopRows = new Map<string, StopRow>();
  await streamZipCsv(ZIP_PATH, "stops.txt", (get) => {
    stopRows.set(get("stop_id"), {
      name: get("stop_name"),
      lat: +get("stop_lat"),
      lon: +get("stop_lon"),
      parent: get("parent_station"),
    });
  });

  const stationIndexByKey = new Map<string, number>(); // station key → index
  const stations: { name: string; lat: number; lon: number; m: number }[] = [];
  const stopStation = new Map<string, number>(); // platform stop_id → station
  function stationOf(stopId: string): number | undefined {
    const cached = stopStation.get(stopId);
    if (cached !== undefined) return cached;
    const row = stopRows.get(stopId);
    if (!row) return undefined;
    const key = row.parent || stopId;
    let idx = stationIndexByKey.get(key);
    if (idx === undefined) {
      const parentRow = stopRows.get(key);
      const src = parentRow ?? row;
      idx = stations.length;
      stationIndexByKey.set(key, idx);
      stations.push({
        name: src.name,
        lat: +src.lat.toFixed(5),
        lon: +src.lon.toFixed(5),
        m: 0,
      });
    }
    stopStation.set(stopId, idx);
    return idx;
  }

  // --- ride segments and boarding headways -------------------------------------
  // segment key: route|dir|fromStation|toStation → run times (s)
  const segTimes = new Map<string, number[]>();
  // departures per route|dir|station within the daytime window
  const departures = new Map<string, number>();
  for (const tripId of active) {
    const stops = tripStops.get(tripId);
    if (!stops || stops.length < 2) continue;
    stops.sort((a, b) => a[0] - b[0]);
    const { routeId, dir } = trips.get(tripId)!;
    const bit = routes.get(routeId)!.bit;
    let prev: [number, number] | null = null; // [station, time]
    for (const [t, stopId] of stops) {
      const stationIdx = stationOf(stopId);
      if (stationIdx === undefined) continue;
      stations[stationIdx].m |= bit;
      if (prev && prev[0] !== stationIdx) {
        const run = t - prev[1];
        if (run > 0 && run < 7200) {
          const key = `${routeId}|${dir}|${prev[0]}|${stationIdx}`;
          let arr = segTimes.get(key);
          if (!arr) segTimes.set(key, (arr = []));
          arr.push(run);
        }
      }
      if (t >= WINDOW_START && t <= WINDOW_END) {
        const departureKey = `${routeId}|${dir}|${stationIdx}`;
        departures.set(departureKey, (departures.get(departureKey) ?? 0) + 1);
      }
      prev = prev && prev[0] === stationIdx ? prev : [stationIdx, t];
    }
  }
  const stationCount = stations.length;
  console.log(`Stations: ${stationCount}, ride segments: ${segTimes.size}`);

  // --- graph nodes: stations [0, stationCount) then one node per route|dir|station
  const rideNodeIdx = new Map<string, number>();
  let nodeCount = stationCount;
  const rideNode = (routeId: string, dir: string, stationIdx: number): number => {
    const key = `${routeId}|${dir}|${stationIdx}`;
    let idx = rideNodeIdx.get(key);
    if (idx === undefined) rideNodeIdx.set(key, (idx = nodeCount++));
    return idx;
  };

  // adjacency as flat arrays (built as triples, then bucketed)
  const edgeFrom: number[] = [];
  const edgeTo: number[] = [];
  const edgeCost: number[] = [];
  const addEdge = (a: number, b: number, cost: number) => {
    edgeFrom.push(a);
    edgeTo.push(b);
    edgeCost.push(cost);
  };

  const windowLen = WINDOW_END - WINDOW_START;
  const boarded = new Set<number>(); // ride nodes with a board edge already
  for (const [key, times] of segTimes) {
    const [routeId, dir, fromS, toS] = key.split("|");
    const fromStation = +fromS;
    const toStation = +toS;
    const nodeFrom = rideNode(routeId, dir, fromStation);
    const nodeTo = rideNode(routeId, dir, toStation);
    addEdge(nodeFrom, nodeTo, median(times));
    for (const [node, stationIdx] of [
      [nodeFrom, fromStation],
      [nodeTo, toStation],
    ] as const) {
      if (boarded.has(node)) continue;
      boarded.add(node);
      const departureCount = departures.get(`${routeId}|${dir}|${stationIdx}`) ?? 0;
      const wait =
        departureCount > 0 ? Math.min(windowLen / departureCount / 2, MAX_WAIT_S) : MAX_WAIT_S;
      addEdge(stationIdx, node, Math.round(wait));
      addEdge(node, stationIdx, ALIGHT_S);
    }
  }

  // --- transfer edges: transfers.txt where it maps to our stations ------------
  const walkSeconds = new Map<string, number>(); // "a|b" → seconds (min of sources)
  const addWalk = (a: number, b: number, cost: number) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const prev = walkSeconds.get(key);
    if (prev === undefined || cost < prev) walkSeconds.set(key, cost);
  };
  await streamZipCsv(ZIP_PATH, "transfers.txt", (get) => {
    const a = stopStation.get(get("from_stop_id"));
    const b = stopStation.get(get("to_stop_id"));
    if (a === undefined || b === undefined) return;
    addWalk(a, b, Math.max(+get("min_transfer_time") || 0, 60));
  });
  const fromTransfers = walkSeconds.size;

  // proximity fallback: nearby stations are walkable even without a transfer
  // record (spatial hash on a ~550 m grid keeps this O(N))
  const gridCells = new Map<string, number[]>();
  const cellOf = (lat: number, lon: number) =>
    `${Math.round(lat / 0.005)}|${Math.round(lon / 0.0075)}`;
  stations.forEach((s, i) => {
    const key = cellOf(s.lat, s.lon);
    let list = gridCells.get(key);
    if (!list) gridCells.set(key, (list = []));
    list.push(i);
  });
  for (let i = 0; i < stationCount; i++) {
    const s = stations[i];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = gridCells.get(
          `${Math.round(s.lat / 0.005) + dy}|${Math.round(s.lon / 0.0075) + dx}`,
        );
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const other = stations[j];
          const d = haversineMeters(s.lat, s.lon, other.lat, other.lon);
          if (d <= MAX_TRANSFER_M)
            addWalk(i, j, Math.round(d / WALK_SPEED + TRANSFER_PENALTY_S));
        }
      }
    }
  }
  for (const [key, cost] of walkSeconds) {
    const [a, b] = key.split("|").map(Number);
    addEdge(a, b, cost);
    addEdge(b, a, cost);
  }
  console.log(
    `Transfer edges: ${walkSeconds.size} station pairs (${fromTransfers} from transfers.txt)`,
  );
  console.log(`Graph: ${nodeCount} nodes, ${edgeFrom.length} directed edges`);

  // bucket edges by source node (CSR layout) for fast Dijkstra
  const edgeOffsets = new Uint32Array(nodeCount + 1);
  for (const f of edgeFrom) edgeOffsets[f + 1]++;
  for (let i = 0; i < nodeCount; i++) edgeOffsets[i + 1] += edgeOffsets[i];
  const adjTo = new Uint32Array(edgeFrom.length);
  const adjCost = new Float64Array(edgeFrom.length);
  const fillCursor = Uint32Array.from(edgeOffsets.subarray(0, nodeCount));
  for (let k = 0; k < edgeFrom.length; k++) {
    const slot = fillCursor[edgeFrom[k]]++;
    adjTo[slot] = edgeTo[k];
    adjCost[slot] = edgeCost[k];
  }

  // --- one Dijkstra per origin station ----------------------------------------
  const matrix = new Uint8Array(stationCount * stationCount).fill(255);
  const dist = new Float64Array(nodeCount);
  console.log(`Running ${stationCount} Dijkstras…`);
  const started = Date.now();
  for (let origin = 0; origin < stationCount; origin++) {
    dist.fill(Infinity);
    dist[origin] = 0;
    const heap = new Heap();
    heap.push(0, origin);
    while (heap.size > 0) {
      const [d, u] = heap.pop();
      if (d > dist[u]) continue;
      for (let k = edgeOffsets[u]; k < edgeOffsets[u + 1]; k++) {
        const v = adjTo[k];
        const newDist = d + adjCost[k];
        if (newDist < dist[v]) {
          dist[v] = newDist;
          heap.push(newDist, v);
        }
      }
    }
    const row = origin * stationCount;
    for (let j = 0; j < stationCount; j++) {
      const minutes = Math.round(dist[j] / 60);
      matrix[row + j] = dist[j] === Infinity || minutes > MAX_MINUTES ? 255 : minutes;
    }
  }
  console.log(`Dijkstras done in ${((Date.now() - started) / 1000).toFixed(1)} s`);

  // --- sanity checks ------------------------------------------------------------
  const find = (name: string) =>
    stations.findIndex((s) => s.name.toLowerCase() === name);
  const chatelet = find("châtelet - les halles");
  const defense = find("la défense");
  if (chatelet >= 0 && defense >= 0) {
    console.log(
      `Châtelet - Les Halles → La Défense: ${matrix[chatelet * stationCount + defense]} min`,
    );
  }
  if (chatelet >= 0) {
    let within60 = 0;
    for (let j = 0; j < stationCount; j++)
      if (matrix[chatelet * stationCount + j] <= 60) within60++;
    console.log(
      `Reachable from Châtelet - Les Halles within 60 min: ${within60}/${stationCount} stations`,
    );
  }

  // --- emit ----------------------------------------------------------------------
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, "stations.json"),
    JSON.stringify({ date: fmtDate(dayTs), window: "07:00-20:00", stations }),
  );
  writeFileSync(path.join(OUT_DIR, "matrix.bin"), Buffer.from(matrix.buffer));
  console.log(
    `Wrote ${stationCount} stations (${Math.round(JSON.stringify(stations).length / 1024)} KB json), ` +
      `matrix ${Math.round(matrix.byteLength / 1024)} KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
