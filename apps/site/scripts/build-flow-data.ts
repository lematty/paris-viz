/**
 * Builds the animated flow-map data: every scheduled trip of the Île-de-France
 * rail network on one service day, as timestamped waypoints for deck.gl's
 * TripsLayer, split by mode so the page can lazy-load each.
 *
 * Output per mode (apps/site/public/flow/<mode>.{bin,json}):
 *   .bin   Float32Array: per trip, count × [lon, lat, tSeconds]
 *   .json  { name, date, minT, maxT, lines: [{name, color}],
 *            counts: number[], lineIdx: number[] }   (parallel per-trip arrays)
 *
 * Paths follow the real track geometry from shapes.txt: stops are projected
 * onto the trip's shape, intermediate shape points get timestamps
 * interpolated by distance along the track, and each inter-stop run is
 * Douglas-Peucker-simplified (~11 m) to keep the files small.
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
const ZIP_PATH = path.join(ROOT, "data", "IDFM-gtfs.zip");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "flow");

// GTFS route_type → mode file
const MODES: Record<string, { key: string; name: string }> = {
  "0": { key: "tram", name: "Tramway" },
  "1": { key: "metro", name: "Métro" },
  "2": { key: "rail", name: "RER & Transilien" },
};

// A representative weekday: the next Monday at least 3 days out, so a fresh
// feed always covers it. FLOW_DATE=YYYYMMDD overrides (e.g. for reproducing
// an old build).
function defaultServiceDate(): string {
  const d = new Date(Date.now() + 3 * DAY_MS);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
const SERVICE_DATE = process.env.FLOW_DATE ?? defaultServiceDate();
const SIMPLIFY_TOL = 1e-4; // ≈11 m

async function main() {
  await downloadGtfs(ZIP_PATH);

  interface RouteInfo {
    mode: string;
    name: string;
    color: string;
  }
  const routes = new Map<string, RouteInfo>();
  await streamZipCsv(ZIP_PATH, "routes.txt", (get) => {
    const mode = MODES[get("route_type")];
    if (!mode) return;
    routes.set(get("route_id"), {
      mode: mode.key,
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
  const dayTs = parseGtfsDate(SERVICE_DATE);
  const activeTrips = new Map(
    [...trips].filter(([, t]) => serviceDates.get(t.serviceId)?.has(dayTs)),
  );
  console.log(`${fmtDate(dayTs)}: ${activeTrips.size} active rail trips`);
  if (activeTrips.size === 0) {
    throw new Error(
      `No active trips on ${fmtDate(dayTs)} — date outside the feed window?`,
    );
  }

  // --- stop_times for active trips ------------------------------------------
  const tripStops = new Map<string, [number, string][]>();
  const stopIds = new Set<string>();
  await streamZipCsv(ZIP_PATH, "stop_times.txt", (get) => {
    const tripId = get("trip_id");
    if (!activeTrips.has(tripId)) return;
    const time = get("departure_time") || get("arrival_time");
    if (!time) return;
    let arr = tripStops.get(tripId);
    if (!arr) tripStops.set(tripId, (arr = []));
    arr.push([parseGtfsTime(time), get("stop_id")]);
    stopIds.add(get("stop_id"));
  });

  const stopPos = new Map<string, [number, number]>(); // [lon, lat]
  await streamZipCsv(ZIP_PATH, "stops.txt", (get) => {
    const id = get("stop_id");
    if (stopIds.has(id)) stopPos.set(id, [+get("stop_lon"), +get("stop_lat")]);
  });

  // --- shapes for active trips ----------------------------------------------
  const wantedShapes = new Set(
    [...activeTrips.values()].map((t) => t.shapeId).filter(Boolean),
  );
  const shapeRaw = new Map<string, [number, number, number][]>(); // lon,lat,seq
  await streamZipCsv(ZIP_PATH, "shapes.txt", (get) => {
    const id = get("shape_id");
    if (!wantedShapes.has(id)) return;
    let pts = shapeRaw.get(id);
    if (!pts) shapeRaw.set(id, (pts = []));
    pts.push([+get("shape_pt_lon"), +get("shape_pt_lat"), +get("shape_pt_sequence")]);
  });
  // per shape: ordered points + cumulative distance (m)
  const shapes = new Map<
    string,
    { pts: [number, number][]; cum: number[] }
  >();
  for (const [id, raw] of shapeRaw) {
    raw.sort((a, b) => a[2] - b[2]);
    const pts = raw.map(([lon, lat]) => [lon, lat] as [number, number]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(
        cum[i - 1] +
          haversineMeters(pts[i - 1][1], pts[i - 1][0], pts[i][1], pts[i][0]),
      );
    }
    shapes.set(id, { pts, cum });
  }
  console.log(`Shapes: ${shapes.size} used by active trips`);

  /** Waypoints for one trip following its shape; falls back to stop-to-stop
   * straight lines when there is no usable shape. */
  function tripWaypoints(
    stopsArr: [number, string][],
    shapeId: string,
  ): [number, number, number][] {
    const straight = () =>
      stopsArr
        .filter(([, sid]) => stopPos.has(sid))
        .map(([t, sid]) => {
          const [lon, lat] = stopPos.get(sid)!;
          return [lon, lat, t] as [number, number, number];
        });
    const shape = shapes.get(shapeId);
    if (!shape || shape.pts.length < 2) return straight();
    const { pts, cum } = shape;

    // project each stop onto the shape, monotonically advancing
    const proj: [number, number][] = []; // [shapeIndex, tSeconds]
    let from = 0;
    for (const [t, sid] of stopsArr) {
      const pos = stopPos.get(sid);
      if (!pos) continue;
      let best = from;
      let bestD = Infinity;
      // bounded look-ahead keeps this O(n) overall and monotonic
      for (let i = from; i < Math.min(pts.length, from + 400); i++) {
        const d = Math.hypot(pts[i][0] - pos[0], pts[i][1] - pos[1]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      // a stop >≈500 m from the shape means the projection went wrong
      if (bestD > 0.006) return straight();
      proj.push([best, t]);
      from = best;
    }
    if (proj.length < 2) return straight();

    const out: [number, number, number][] = [];
    for (let s = 0; s < proj.length - 1; s++) {
      const [i0, t0] = proj[s];
      const [i1, t1] = proj[s + 1];
      if (i1 <= i0) continue;
      // simplify the inter-stop run in [lat, lon] space, then time by distance
      const seg = simplifyPath(
        pts.slice(i0, i1 + 1).map(([lon, lat]) => [lat, lon] as [number, number]),
        SIMPLIFY_TOL,
      );
      const span = cum[i1] - cum[i0] || 1;
      // walk seg against original indices to recover cumulative distances
      let k = i0;
      for (let j = 0; j < seg.length; j++) {
        if (s > 0 && j === 0) continue; // stop point already emitted
        while (k < i1 && (pts[k][1] !== seg[j][0] || pts[k][0] !== seg[j][1])) k++;
        const f = (cum[k] - cum[i0]) / span;
        out.push([seg[j][1], seg[j][0], t0 + f * (t1 - t0)]);
      }
    }
    return out.length >= 2 ? out : straight();
  }

  // --- emit per mode ----------------------------------------------------------
  mkdirSync(OUT_DIR, { recursive: true });
  for (const { key, name } of Object.values(MODES)) {
    const lineIndex = new Map<string, number>(); // route name → idx
    const lines: { name: string; color: string }[] = [];
    const counts: number[] = [];
    const lineIdx: number[] = [];
    const floats: number[] = [];
    // stations served by this mode, deduped on a ~10 m grid
    const stationKeys = new Set<string>();
    const stations: [number, number][] = [];
    let minT = Infinity;
    let maxT = -Infinity;

    for (const [tripId, trip] of activeTrips) {
      const route = routes.get(trip.routeId)!;
      if (route.mode !== key) continue;
      const stopsArr = tripStops.get(tripId);
      if (!stopsArr || stopsArr.length < 2) continue;
      stopsArr.sort((a, b) => a[0] - b[0]);
      for (const [, sid] of stopsArr) {
        const pos = stopPos.get(sid);
        if (!pos) continue;
        const k = `${pos[0].toFixed(4)},${pos[1].toFixed(4)}`;
        if (!stationKeys.has(k)) {
          stationKeys.add(k);
          stations.push([+pos[0].toFixed(5), +pos[1].toFixed(5)]);
        }
      }
      const wps = tripWaypoints(stopsArr, trip.shapeId);
      if (wps.length < 2) continue;
      let idx = lineIndex.get(route.name);
      if (idx === undefined) {
        idx = lines.length;
        lineIndex.set(route.name, idx);
        lines.push({ name: route.name, color: route.color });
      }
      counts.push(wps.length);
      lineIdx.push(idx);
      for (const [lon, lat, t] of wps) {
        floats.push(lon, lat, t);
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
      }
    }

    const bin = new Float32Array(floats);
    writeFileSync(path.join(OUT_DIR, `${key}.bin`), Buffer.from(bin.buffer));
    writeFileSync(
      path.join(OUT_DIR, `${key}.json`),
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
        `${lines.length} lines  ${stations.length} stations  ` +
        `${Math.round(bin.byteLength / 1024)} KB`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
