/**
 * Builds the animated flow-map data: every scheduled trip of the Île-de-France
 * network for THREE representative days (next Monday, Saturday, Sunday), as
 * timestamped waypoints for deck.gl's TripsLayer.
 *
 * Output: apps/site/public/flow/<day>/… for day ∈ weekday|saturday|sunday
 *   <mode>.{bin,json}   rail modes - float32 waypoints, shape-following paths
 *   bus.json, bus-<h>.bin  buses - uint16-quantized, one chunk per start hour
 *
 * The expensive pass (stop_times.txt, >1 GB) runs ONCE over the union of the
 * three days' trips; emission then filters per day.
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
  simplifyPath,
  streamZipCsv,
} from "@paris-viz/gtfs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// Downloads land in a configurable cache: on Vercel, ensure-data points
// this at .next/cache (persisted between builds) so deploys survive
// upstream outages and skip re-downloading.
const DATA_ROOT = process.env.DATA_CACHE_DIR
  ? path.resolve(process.env.DATA_CACHE_DIR)
  : path.join(ROOT, "data");
const ZIP_PATH = path.join(DATA_ROOT, "IDFM-gtfs.zip");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "flow");

// GTFS route_type → mode file. Rail modes ship full-day float32 files with
// shape-following paths; buses (10× the trips) ship straight stop-to-stop
// paths, uint16-quantized, in one binary chunk per start hour.
const MODES: Record<string, { key: string; name: string }> = {
  "0": { key: "tram", name: "Tramway" },
  "1": { key: "metro", name: "Métro" },
  "2": { key: "rail", name: "RER & Transilien" },
};
const BUS_ROUTE_TYPE = "3";
const SIMPLIFY_TOL = 1e-4; // ≈11 m

/** Next calendar date with the given UTC weekday, at least 3 days out so a
 * fresh feed always covers it. */
function nextDow(dow: number): string {
  const date = new Date(Date.now() + 3 * DAY_MS);
  while (date.getUTCDay() !== dow) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

const DAYS: { key: string; date: string }[] = [
  { key: "weekday", date: nextDow(1) },
  { key: "saturday", date: nextDow(6) },
  { key: "sunday", date: nextDow(0) },
];

async function main() {
  await downloadGtfs(ZIP_PATH);

  interface RouteInfo {
    mode: string;
    name: string;
    color: string;
  }
  const routes = new Map<string, RouteInfo>();
  await streamZipCsv(ZIP_PATH, "routes.txt", (get) => {
    const type = get("route_type");
    const mode = MODES[type];
    if (!mode && type !== BUS_ROUTE_TYPE) return;
    routes.set(get("route_id"), {
      mode: mode?.key ?? "bus",
      name: get("route_short_name") || get("route_long_name"),
      color: `#${get("route_color") || "888888"}`,
    });
  });

  interface Trip {
    routeId: string;
    serviceId: string;
    shapeId: string;
  }
  const trips = new Map<string, Trip>();
  const serviceIds = new Set<string>();
  await streamZipCsv(ZIP_PATH, "trips.txt", (get) => {
    const routeId = get("route_id");
    if (!routes.has(routeId)) return;
    trips.set(get("trip_id"), {
      routeId,
      serviceId: get("service_id"),
      shapeId: get("shape_id"),
    });
    serviceIds.add(get("service_id"));
  });

  const serviceDates = await loadServiceDates(ZIP_PATH, serviceIds);
  // per-day active trip sets + their union (one stop_times pass for all days)
  const activeByDay = new Map<string, Set<string>>();
  const activeTripUnion = new Set<string>();
  for (const { key, date } of DAYS) {
    const dayTs = parseGtfsDate(date);
    const set = new Set<string>();
    for (const [id, trip] of trips) {
      if (serviceDates.get(trip.serviceId)?.has(dayTs)) {
        set.add(id);
        activeTripUnion.add(id);
      }
    }
    activeByDay.set(key, set);
    console.log(`${key} (${fmtDate(dayTs)}): ${set.size} active trips`);
    if (set.size === 0) {
      throw new Error(`No active trips for ${key} - date outside feed window?`);
    }
  }
  console.log(`Union across days: ${activeTripUnion.size} trips`);

  // --- stop_times for the union (single pass) ---------------------------------
  const tripStops = new Map<string, [number, string][]>();
  const stopIds = new Set<string>();
  await streamZipCsv(ZIP_PATH, "stop_times.txt", (get) => {
    const tripId = get("trip_id");
    if (!activeTripUnion.has(tripId)) return;
    const time = get("departure_time") || get("arrival_time");
    if (!time) return;
    let arr = tripStops.get(tripId);
    if (!arr) tripStops.set(tripId, (arr = []));
    arr.push([parseGtfsTime(time), get("stop_id")]);
    stopIds.add(get("stop_id"));
  });
  console.log(`stop_times: ${tripStops.size} trips with stops`);

  const stopPos = new Map<string, [number, number]>(); // [lon, lat]
  await streamZipCsv(ZIP_PATH, "stops.txt", (get) => {
    const id = get("stop_id");
    if (stopIds.has(id)) stopPos.set(id, [+get("stop_lon"), +get("stop_lat")]);
  });

  // --- shapes for RAIL trips in the union (buses draw stop-to-stop) ----------
  const wantedShapes = new Set<string>();
  for (const id of activeTripUnion) {
    const trip = trips.get(id)!;
    if (routes.get(trip.routeId)!.mode !== "bus" && trip.shapeId)
      wantedShapes.add(trip.shapeId);
  }
  const shapeRaw = new Map<string, [number, number, number][]>();
  await streamZipCsv(ZIP_PATH, "shapes.txt", (get) => {
    const id = get("shape_id");
    if (!wantedShapes.has(id)) return;
    let pts = shapeRaw.get(id);
    if (!pts) shapeRaw.set(id, (pts = []));
    pts.push([+get("shape_pt_lon"), +get("shape_pt_lat"), +get("shape_pt_sequence")]);
  });
  const shapes = new Map<string, { pts: [number, number][]; cumDist: number[] }>();
  for (const [id, raw] of shapeRaw) {
    raw.sort((a, b) => a[2] - b[2]);
    const pts = raw.map(([lon, lat]) => [lon, lat] as [number, number]);
    const cumDist = [0];
    for (let i = 1; i < pts.length; i++) {
      cumDist.push(
        cumDist[i - 1] +
          haversineMeters(pts[i - 1][1], pts[i - 1][0], pts[i][1], pts[i][0]),
      );
    }
    shapes.set(id, { pts, cumDist });
  }
  console.log(`Shapes: ${shapes.size} used by rail trips`);

  /** Waypoints for one rail trip following its shape; falls back to
   * stop-to-stop straight lines when there is no usable shape. */
  function tripWaypoints(
    stopsArr: [number, string][],
    shapeId: string,
  ): [number, number, number][] {
    const straight = () =>
      stopsArr
        .filter(([, stopId]) => stopPos.has(stopId))
        .map(([t, stopId]) => {
          const [lon, lat] = stopPos.get(stopId)!;
          return [lon, lat, t] as [number, number, number];
        });
    const shape = shapes.get(shapeId);
    if (!shape || shape.pts.length < 2) return straight();
    const { pts, cumDist } = shape;

    const projections: [number, number][] = []; // [shapeIndex, tSeconds]
    let searchStart = 0;
    for (const [t, stopId] of stopsArr) {
      const pos = stopPos.get(stopId);
      if (!pos) continue;
      let bestIdx = searchStart;
      let bestDist = Infinity;
      for (let i = searchStart; i < Math.min(pts.length, searchStart + 400); i++) {
        const d = Math.hypot(pts[i][0] - pos[0], pts[i][1] - pos[1]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestDist > 0.006) return straight();
      projections.push([bestIdx, t]);
      searchStart = bestIdx;
    }
    if (projections.length < 2) return straight();

    const out: [number, number, number][] = [];
    for (let s = 0; s < projections.length - 1; s++) {
      const [i0, t0] = projections[s];
      const [i1, t1] = projections[s + 1];
      if (i1 <= i0) continue;
      const seg = simplifyPath(
        pts.slice(i0, i1 + 1).map(([lon, lat]) => [lat, lon] as [number, number]),
        SIMPLIFY_TOL,
      );
      const span = cumDist[i1] - cumDist[i0] || 1;
      let k = i0;
      for (let j = 0; j < seg.length; j++) {
        if (s > 0 && j === 0) continue;
        while (k < i1 && (pts[k][1] !== seg[j][0] || pts[k][0] !== seg[j][1])) k++;
        const frac = (cumDist[k] - cumDist[i0]) / span;
        out.push([seg[j][1], seg[j][0], t0 + frac * (t1 - t0)]);
      }
    }
    return out.length >= 2 ? out : straight();
  }

  // --- emit one full artifact set per day ------------------------------------
  for (const { key: dayKey, date } of DAYS) {
    const dayTs = parseGtfsDate(date);
    const active = activeByDay.get(dayKey)!;
    const dayDir = path.join(OUT_DIR, dayKey);
    mkdirSync(dayDir, { recursive: true });
    console.log(`\n=== ${dayKey} (${fmtDate(dayTs)}) ===`);

    // rail modes: float32 waypoints
    for (const { key, name } of Object.values(MODES)) {
      const lineIndex = new Map<string, number>();
      const lines: { name: string; color: string }[] = [];
      const counts: number[] = [];
      const lineIdx: number[] = [];
      const floats: number[] = [];
      const stationKeys = new Set<string>();
      const stations: [number, number][] = [];
      let minT = Infinity;
      let maxT = -Infinity;

      for (const tripId of active) {
        const trip = trips.get(tripId)!;
        const route = routes.get(trip.routeId)!;
        if (route.mode !== key) continue;
        const stopsArr = tripStops.get(tripId);
        if (!stopsArr || stopsArr.length < 2) continue;
        stopsArr.sort((a, b) => a[0] - b[0]);
        for (const [, stopId] of stopsArr) {
          const pos = stopPos.get(stopId);
          if (!pos) continue;
          const stationKey = `${pos[0].toFixed(4)},${pos[1].toFixed(4)}`;
          if (!stationKeys.has(stationKey)) {
            stationKeys.add(stationKey);
            stations.push([+pos[0].toFixed(5), +pos[1].toFixed(5)]);
          }
        }
        const waypoints = tripWaypoints(stopsArr, trip.shapeId);
        if (waypoints.length < 2) continue;
        let idx = lineIndex.get(route.name);
        if (idx === undefined) {
          idx = lines.length;
          lineIndex.set(route.name, idx);
          lines.push({ name: route.name, color: route.color });
        }
        counts.push(waypoints.length);
        lineIdx.push(idx);
        for (const [lon, lat, t] of waypoints) {
          floats.push(lon, lat, t);
          if (t < minT) minT = t;
          if (t > maxT) maxT = t;
        }
      }

      const bin = new Float32Array(floats);
      writeFileSync(path.join(dayDir, `${key}.bin`), Buffer.from(bin.buffer));
      writeFileSync(
        path.join(dayDir, `${key}.json`),
        JSON.stringify({
          name,
          date: fmtDate(dayTs),
          minT,
          maxT,
          lines,
          counts,
          lineIdx,
          stations,
        }),
      );
      console.log(
        `${name.padEnd(18)} ${String(counts.length).padStart(6)} trips  ` +
          `${String(floats.length / 3).padStart(8)} wp  ` +
          `${Math.round(bin.byteLength / 1024)} KB`,
      );
    }

    // buses: quantized hourly chunks
    {
      const T0 = 3 * 3600;
      const lineIndex = new Map<string, number>();
      const lines: { name: string; color: string }[] = [];
      interface BusTrip {
        lineIdx: number;
        waypoints: [number, number, number][];
        hour: number;
      }
      const busTrips: BusTrip[] = [];
      let minLon = 180,
        maxLon = -180,
        minLat = 90,
        maxLat = -90;
      for (const tripId of active) {
        const trip = trips.get(tripId)!;
        const route = routes.get(trip.routeId)!;
        if (route.mode !== "bus") continue;
        const stopsArr = tripStops.get(tripId);
        if (!stopsArr || stopsArr.length < 2) continue;
        stopsArr.sort((a, b) => a[0] - b[0]);
        const waypoints: [number, number, number][] = [];
        for (const [t, stopId] of stopsArr) {
          const pos = stopPos.get(stopId);
          if (pos) waypoints.push([pos[0], pos[1], t]);
        }
        if (waypoints.length < 2) continue;
        for (const [lon, lat] of waypoints) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        let idx = lineIndex.get(route.name);
        if (idx === undefined) {
          idx = lines.length;
          lineIndex.set(route.name, idx);
          lines.push({ name: route.name, color: route.color });
        }
        const hour = Math.max(3, Math.min(27, Math.floor(waypoints[0][2] / 3600)));
        busTrips.push({ lineIdx: idx, waypoints, hour });
      }

      const chunks = new Map<number, BusTrip[]>();
      for (const busTrip of busTrips) {
        let list = chunks.get(busTrip.hour);
        if (!list) chunks.set(busTrip.hour, (list = []));
        list.push(busTrip);
      }
      const quantizeLon = (lon: number) =>
        Math.round(((lon - minLon) / (maxLon - minLon)) * 65535);
      const quantizeLat = (lat: number) =>
        Math.round(((lat - minLat) / (maxLat - minLat)) * 65535);
      const quantizeTime = (t: number) =>
        Math.max(0, Math.min(65535, Math.round((t - T0) / 2)));

      let totalBytes = 0;
      const hours = [...chunks.keys()].sort((a, b) => a - b);
      for (const hour of hours) {
        const list = chunks.get(hour)!;
        const waypointCount = list.reduce((sum, busTrip) => sum + busTrip.waypoints.length, 0);
        const buf = Buffer.alloc(4 + list.length * 4 + waypointCount * 6);
        let offset = 0;
        offset = buf.writeUInt32LE(list.length, offset);
        for (const busTrip of list) {
          offset = buf.writeUInt16LE(busTrip.waypoints.length, offset);
          offset = buf.writeUInt16LE(busTrip.lineIdx, offset);
        }
        for (const busTrip of list) {
          for (const [lon, lat, t] of busTrip.waypoints) {
            offset = buf.writeUInt16LE(quantizeLon(lon), offset);
            offset = buf.writeUInt16LE(quantizeLat(lat), offset);
            offset = buf.writeUInt16LE(quantizeTime(t), offset);
          }
        }
        writeFileSync(path.join(dayDir, `bus-${hour}.bin`), buf);
        totalBytes += buf.byteLength;
      }
      writeFileSync(
        path.join(dayDir, "bus.json"),
        JSON.stringify({
          name: "Bus",
          date: fmtDate(dayTs),
          lines,
          bbox: [minLon, minLat, maxLon, maxLat],
          t0: T0,
          hours,
        }),
      );
      console.log(
        `Bus                ${String(busTrips.length).padStart(6)} trips  ` +
          `${lines.length} lines  ${hours.length} chunks  ` +
          `${Math.round(totalBytes / 1024)} KB`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
