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
  const d = new Date(Date.now() + 3 * DAY_MS);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};

/** Minimal binary min-heap of [cost, node] pairs for Dijkstra. */
class Heap {
  private a: number[] = []; // packed pairs: cost at 2k, node at 2k+1
  get size() {
    return this.a.length / 2;
  }
  push(cost: number, node: number) {
    const a = this.a;
    a.push(cost, node);
    let i = a.length / 2 - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p * 2] <= a[i * 2]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.a;
    const top: [number, number] = [a[0], a[1]];
    const last = a.length / 2 - 1;
    this.swap(0, last);
    a.length -= 2;
    let i = 0;
    const n = a.length / 2;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < n && a[l * 2] < a[m * 2]) m = l;
      if (r < n && a[r * 2] < a[m * 2]) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
  private swap(i: number, j: number) {
    const a = this.a;
    [a[i * 2], a[j * 2]] = [a[j * 2], a[i * 2]];
    [a[i * 2 + 1], a[j * 2 + 1]] = [a[j * 2 + 1], a[i * 2 + 1]];
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
  for (const [id, t] of trips) {
    if (serviceDates.get(t.serviceId)?.has(dayTs)) active.add(id);
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

  const stationIdx = new Map<string, number>(); // station key → index
  const stations: { name: string; lat: number; lon: number; m: number }[] = [];
  const stopStation = new Map<string, number>(); // platform stop_id → station
  function stationOf(stopId: string): number | undefined {
    const cached = stopStation.get(stopId);
    if (cached !== undefined) return cached;
    const row = stopRows.get(stopId);
    if (!row) return undefined;
    const key = row.parent || stopId;
    let idx = stationIdx.get(key);
    if (idx === undefined) {
      const parentRow = stopRows.get(key);
      const src = parentRow ?? row;
      idx = stations.length;
      stationIdx.set(key, idx);
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
      const st = stationOf(stopId);
      if (st === undefined) continue;
      stations[st].m |= bit;
      if (prev && prev[0] !== st) {
        const run = t - prev[1];
        if (run > 0 && run < 7200) {
          const key = `${routeId}|${dir}|${prev[0]}|${st}`;
          let arr = segTimes.get(key);
          if (!arr) segTimes.set(key, (arr = []));
          arr.push(run);
        }
      }
      if (t >= WINDOW_START && t <= WINDOW_END) {
        const dkey = `${routeId}|${dir}|${st}`;
        departures.set(dkey, (departures.get(dkey) ?? 0) + 1);
      }
      prev = prev && prev[0] === st ? prev : [st, t];
    }
  }
  const N = stations.length;
  console.log(`Stations: ${N}, ride segments: ${segTimes.size}`);

  // --- graph nodes: stations [0, N) then one node per route|dir|station --------
  const rideIdx = new Map<string, number>();
  let nodeCount = N;
  const rideNode = (routeId: string, dir: string, st: number): number => {
    const key = `${routeId}|${dir}|${st}`;
    let idx = rideIdx.get(key);
    if (idx === undefined) rideIdx.set(key, (idx = nodeCount++));
    return idx;
  };

  // adjacency as flat arrays (built as triples, then bucketed)
  const eFrom: number[] = [];
  const eTo: number[] = [];
  const eCost: number[] = [];
  const addEdge = (a: number, b: number, cost: number) => {
    eFrom.push(a);
    eTo.push(b);
    eCost.push(cost);
  };

  const windowLen = WINDOW_END - WINDOW_START;
  const boarded = new Set<number>(); // ride nodes with a board edge already
  for (const [key, times] of segTimes) {
    const [routeId, dir, fromS, toS] = key.split("|");
    const a = +fromS;
    const b = +toS;
    const na = rideNode(routeId, dir, a);
    const nb = rideNode(routeId, dir, b);
    addEdge(na, nb, median(times));
    for (const [node, st] of [
      [na, a],
      [nb, b],
    ] as const) {
      if (boarded.has(node)) continue;
      boarded.add(node);
      const deps = departures.get(`${routeId}|${dir}|${st}`) ?? 0;
      const wait = deps > 0 ? Math.min(windowLen / deps / 2, MAX_WAIT_S) : MAX_WAIT_S;
      addEdge(st, node, Math.round(wait));
      addEdge(node, st, ALIGHT_S);
    }
  }

  // --- transfer edges: transfers.txt where it maps to our stations ------------
  const walk = new Map<string, number>(); // "a|b" → seconds (min of sources)
  const addWalk = (a: number, b: number, cost: number) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const prev = walk.get(key);
    if (prev === undefined || cost < prev) walk.set(key, cost);
  };
  await streamZipCsv(ZIP_PATH, "transfers.txt", (get) => {
    const a = stopStation.get(get("from_stop_id"));
    const b = stopStation.get(get("to_stop_id"));
    if (a === undefined || b === undefined) return;
    addWalk(a, b, Math.max(+get("min_transfer_time") || 0, 60));
  });
  const fromTransfers = walk.size;

  // proximity fallback: nearby stations are walkable even without a transfer
  // record (spatial hash on a ~550 m grid keeps this O(N))
  const cell = new Map<string, number[]>();
  const cellOf = (lat: number, lon: number) =>
    `${Math.round(lat / 0.005)}|${Math.round(lon / 0.0075)}`;
  stations.forEach((s, i) => {
    const key = cellOf(s.lat, s.lon);
    let list = cell.get(key);
    if (!list) cell.set(key, (list = []));
    list.push(i);
  });
  for (let i = 0; i < N; i++) {
    const s = stations[i];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = cell.get(
          `${Math.round(s.lat / 0.005) + dy}|${Math.round(s.lon / 0.0075) + dx}`,
        );
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const o = stations[j];
          const d = haversineMeters(s.lat, s.lon, o.lat, o.lon);
          if (d <= MAX_TRANSFER_M)
            addWalk(i, j, Math.round(d / WALK_SPEED + TRANSFER_PENALTY_S));
        }
      }
    }
  }
  for (const [key, cost] of walk) {
    const [a, b] = key.split("|").map(Number);
    addEdge(a, b, cost);
    addEdge(b, a, cost);
  }
  console.log(
    `Transfer edges: ${walk.size} station pairs (${fromTransfers} from transfers.txt)`,
  );
  console.log(`Graph: ${nodeCount} nodes, ${eFrom.length} directed edges`);

  // bucket edges by source node (CSR layout) for fast Dijkstra
  const deg = new Uint32Array(nodeCount + 1);
  for (const f of eFrom) deg[f + 1]++;
  for (let i = 0; i < nodeCount; i++) deg[i + 1] += deg[i];
  const adjTo = new Uint32Array(eFrom.length);
  const adjCost = new Float64Array(eFrom.length);
  const fill = Uint32Array.from(deg.subarray(0, nodeCount));
  for (let k = 0; k < eFrom.length; k++) {
    const slot = fill[eFrom[k]]++;
    adjTo[slot] = eTo[k];
    adjCost[slot] = eCost[k];
  }

  // --- one Dijkstra per origin station ----------------------------------------
  const matrix = new Uint8Array(N * N).fill(255);
  const dist = new Float64Array(nodeCount);
  console.log(`Running ${N} Dijkstras…`);
  const started = Date.now();
  for (let origin = 0; origin < N; origin++) {
    dist.fill(Infinity);
    dist[origin] = 0;
    const heap = new Heap();
    heap.push(0, origin);
    while (heap.size > 0) {
      const [d, u] = heap.pop();
      if (d > dist[u]) continue;
      for (let k = deg[u]; k < deg[u + 1]; k++) {
        const v = adjTo[k];
        const nd = d + adjCost[k];
        if (nd < dist[v]) {
          dist[v] = nd;
          heap.push(nd, v);
        }
      }
    }
    const row = origin * N;
    for (let j = 0; j < N; j++) {
      const min = Math.round(dist[j] / 60);
      matrix[row + j] = dist[j] === Infinity || min > MAX_MINUTES ? 255 : min;
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
      `Châtelet - Les Halles → La Défense: ${matrix[chatelet * N + defense]} min`,
    );
  }
  if (chatelet >= 0) {
    let within60 = 0;
    for (let j = 0; j < N; j++) if (matrix[chatelet * N + j] <= 60) within60++;
    console.log(
      `Reachable from Châtelet - Les Halles within 60 min: ${within60}/${N} stations`,
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
    `Wrote ${N} stations (${Math.round(JSON.stringify(stations).length / 1024)} KB json), ` +
      `matrix ${Math.round(matrix.byteLength / 1024)} KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
