/**
 * Builds the animated flow-map data: every trip of the selected line(s) on
 * one service day, as timestamped waypoints ready for deck.gl's TripsLayer.
 *
 * Output (apps/site/public/flow/):
 *   <key>.bin   Float32Array: per trip, count × [lon, lat, tSeconds]
 *   <key>.json  meta: trip waypoint counts + display info
 *
 * Vertical slice: Métro line 1. Adding lines/modes = adding entries to LINES.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  downloadGtfs,
  fmtDate,
  loadServiceDates,
  parseGtfsDate,
  parseGtfsTime,
  streamZipCsv,
} from "@paris-viz/gtfs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ZIP_PATH = path.join(ROOT, "data", "IDFM-gtfs.zip");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "flow");

const LINES = [{ key: "metro1", routeId: "IDFM:C01371", name: "Métro 1" }];

// A representative weekday inside the feed window (a Monday).
const SERVICE_DATE = "20260706";

async function main() {
  await downloadGtfs(ZIP_PATH);
  const wantedRoutes = new Map(LINES.map((l) => [l.routeId, l]));

  const routeColors = new Map<string, string>();
  await streamZipCsv(ZIP_PATH, "routes.txt", (get) => {
    if (wantedRoutes.has(get("route_id")))
      routeColors.set(get("route_id"), `#${get("route_color") || "888888"}`);
  });

  interface Trip {
    routeId: string;
    serviceId: string;
  }
  const trips = new Map<string, Trip>();
  const serviceIds = new Set<string>();
  await streamZipCsv(ZIP_PATH, "trips.txt", (get) => {
    const routeId = get("route_id");
    if (!wantedRoutes.has(routeId)) return;
    trips.set(get("trip_id"), { routeId, serviceId: get("service_id") });
    serviceIds.add(get("service_id"));
  });

  const serviceDates = await loadServiceDates(ZIP_PATH, serviceIds);
  const dayTs = parseGtfsDate(SERVICE_DATE);
  const activeTrips = new Set(
    [...trips].filter(([, t]) => serviceDates.get(t.serviceId)?.has(dayTs)).map(([id]) => id),
  );
  console.log(
    `${fmtDate(dayTs)}: ${activeTrips.size} active trips (of ${trips.size} total)`,
  );

  // stop_times → waypoints per trip (stop positions resolved afterwards)
  const tripStops = new Map<string, [number, string][]>(); // trip → [t, stopId] (ordered later)
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

  const stopPos = new Map<string, [number, number]>();
  await streamZipCsv(ZIP_PATH, "stops.txt", (get) => {
    const id = get("stop_id");
    if (stopIds.has(id)) stopPos.set(id, [+get("stop_lon"), +get("stop_lat")]);
  });

  mkdirSync(OUT_DIR, { recursive: true });
  for (const line of LINES) {
    const lineTrips = [...tripStops.entries()].filter(
      ([id]) => trips.get(id)!.routeId === line.routeId,
    );
    const counts: number[] = [];
    const floats: number[] = [];
    let minT = Infinity;
    let maxT = -Infinity;
    for (const [, stopsArr] of lineTrips) {
      stopsArr.sort((a, b) => a[0] - b[0]);
      const pts = stopsArr.filter(([, sid]) => stopPos.has(sid));
      if (pts.length < 2) continue;
      counts.push(pts.length);
      for (const [t, sid] of pts) {
        const [lon, lat] = stopPos.get(sid)!;
        floats.push(lon, lat, t);
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
      }
    }
    const bin = new Float32Array(floats);
    writeFileSync(path.join(OUT_DIR, `${line.key}.bin`), Buffer.from(bin.buffer));
    const meta = {
      name: line.name,
      color: routeColors.get(line.routeId) ?? "#888888",
      date: fmtDate(dayTs),
      trips: counts.length,
      minT,
      maxT,
      counts,
    };
    writeFileSync(path.join(OUT_DIR, `${line.key}.json`), JSON.stringify(meta));
    const fmtT = (s: number) =>
      `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
    console.log(
      `${line.name}: ${counts.length} trips, ${floats.length / 3} waypoints, ` +
        `service ${fmtT(minT)}→${fmtT(maxT)}, ${Math.round(bin.byteLength / 1024)} KB`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
