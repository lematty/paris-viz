/**
 * Builds public/noctilien.json from the IDFM GTFS feed: per-stop Noctilien
 * night-bus frequency, split into weeknights (Sun–Thu) and weekend nights
 * (Fri–Sat). See the /noctilien visualization.
 *
 * Migrated from the standalone noctilien repo; GTFS plumbing now comes from
 * @paris-viz/gtfs. Run with: pnpm build:noctilien
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DAY_MS,
  downloadGtfs,
  fmtDate,
  loadServiceDates,
  simplifyPath,
  streamZipCsv,
} from "@paris-viz/gtfs";
import type { NoctilienData, Route, Stop } from "../src/lib/noctilien/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ZIP_PATH = path.join(ROOT, "data", "IDFM-gtfs.zip");
const OUT_PATH = path.resolve(ROOT, "apps", "site", "public", "noctilien.json");

// Noctilien lines are named N01…N162 (two/three digits). Single-digit N1/N2
// also exist in the feed but belong to the ADP airport shuttle network.
const NOCTILIEN_NAME = /^N\d{2,3}$/;
const BUS_ROUTE_TYPE = "3";

/** A "weekend night" is the evening of a Friday or Saturday. */
const isWeekendNight = (nightTs: number) => {
  const dow = new Date(nightTs).getUTCDay();
  return dow === 5 || dow === 6;
};

async function main() {
  await downloadGtfs(ZIP_PATH);

  // --- Routes: pick out the Noctilien lines ---------------------------------
  const routes = new Map<string, { name: string; color: string }>();
  await streamZipCsv(ZIP_PATH, "routes.txt", (get) => {
    const name = get("route_short_name");
    if (get("route_type") === BUS_ROUTE_TYPE && NOCTILIEN_NAME.test(name)) {
      routes.set(get("route_id"), {
        name,
        color: get("route_color") || "3F2A7E",
      });
    }
  });
  console.log(`Noctilien lines: ${routes.size}`);

  // --- Trips of those routes -------------------------------------------------
  interface Trip {
    routeId: string;
    serviceId: string;
    shapeId: string;
    directionId: string;
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
      directionId: get("direction_id"),
    });
    serviceIds.add(get("service_id"));
  });
  console.log(`Noctilien trips: ${trips.size}`);

  // --- Calendars → per-service night counts ----------------------------------
  const serviceDates = await loadServiceDates(ZIP_PATH, serviceIds);

  // A departure belongs to "the night of day X". GTFS encodes an
  // after-midnight trip either on the previous service day with times >24:00
  // or on the same calendar day with small times — so times before noon count
  // toward the previous day's night. The window of nights is
  // [first service date, last service date]; the partial night before the
  // window is excluded from both counts.
  let minDate = Infinity;
  let maxDate = -Infinity;
  for (const dates of serviceDates.values()) {
    for (const ts of dates) {
      if (ts < minDate) minDate = ts;
      if (ts > maxDate) maxDate = ts;
    }
  }
  interface NightCounts {
    eveWeek: number;
    eveWeekend: number;
    mornWeek: number;
    mornWeekend: number;
  }
  const serviceNights = new Map<string, NightCounts>();
  for (const [id, dates] of serviceDates) {
    const c: NightCounts = { eveWeek: 0, eveWeekend: 0, mornWeek: 0, mornWeekend: 0 };
    for (const ts of dates) {
      if (isWeekendNight(ts)) c.eveWeekend++;
      else c.eveWeek++;
      const prev = ts - DAY_MS;
      if (prev >= minDate) {
        if (isWeekendNight(prev)) c.mornWeekend++;
        else c.mornWeek++;
      }
    }
    serviceNights.set(id, c);
  }
  let totalWeekNights = 0;
  let totalWeekendNights = 0;
  for (let ts = minDate; ts <= maxDate; ts += DAY_MS) {
    if (isWeekendNight(ts)) totalWeekendNights++;
    else totalWeekNights++;
  }
  console.log(
    `Window ${fmtDate(minDate)} → ${fmtDate(maxDate)}: ` +
      `${totalWeekNights} week nights, ${totalWeekendNights} weekend nights`,
  );

  // --- stop_times: accumulate departures per stop -----------------------------
  interface StopAcc {
    weekDep: number;
    weekendDep: number;
    minMinute: number;
    maxMinute: number;
    lines: Set<string>;
  }
  const stopAcc = new Map<string, StopAcc>();
  await streamZipCsv(ZIP_PATH, "stop_times.txt", (get) => {
    const trip = trips.get(get("trip_id"));
    if (!trip) return;
    const time = get("departure_time") || get("arrival_time");
    if (!time) return;
    const h = +time.slice(0, 2);
    const minute = h * 60 + +time.slice(3, 5) - (h >= 12 ? 1440 : 0);
    const counts = serviceNights.get(trip.serviceId);
    if (!counts) return;
    const stopId = get("stop_id");
    let acc = stopAcc.get(stopId);
    if (!acc) {
      stopAcc.set(stopId, (acc = {
        weekDep: 0,
        weekendDep: 0,
        minMinute: Infinity,
        maxMinute: -Infinity,
        lines: new Set(),
      }));
    }
    if (h >= 12) {
      acc.weekDep += counts.eveWeek;
      acc.weekendDep += counts.eveWeekend;
    } else {
      acc.weekDep += counts.mornWeek;
      acc.weekendDep += counts.mornWeekend;
    }
    acc.minMinute = Math.min(acc.minMinute, minute);
    acc.maxMinute = Math.max(acc.maxMinute, minute);
    acc.lines.add(routes.get(trip.routeId)!.name);
  });
  console.log(`Stop poles with service: ${stopAcc.size}`);

  // --- Stop coordinates & pole merging ----------------------------------------
  const poles = new Map<string, { name: string; lat: number; lon: number }>();
  await streamZipCsv(ZIP_PATH, "stops.txt", (get) => {
    const id = get("stop_id");
    if (!stopAcc.has(id)) return;
    poles.set(id, {
      name: get("stop_name"),
      lat: +get("stop_lat"),
      lon: +get("stop_lon"),
    });
  });

  // Merge same-named poles within ~150 m (one per direction/branch in GTFS).
  interface Cluster {
    name: string;
    ids: string[];
    lat: number;
    lon: number;
  }
  const byName = new Map<string, Cluster[]>();
  for (const [id, p] of poles) {
    const clusters = byName.get(p.name) ?? [];
    const hit = clusters.find(
      (c) => Math.hypot((c.lat - p.lat) * 111_000, (c.lon - p.lon) * 74_000) < 150,
    );
    if (hit) {
      hit.lat = (hit.lat * hit.ids.length + p.lat) / (hit.ids.length + 1);
      hit.lon = (hit.lon * hit.ids.length + p.lon) / (hit.ids.length + 1);
      hit.ids.push(id);
    } else {
      clusters.push({ name: p.name, ids: [id], lat: p.lat, lon: p.lon });
    }
    byName.set(p.name, clusters);
  }

  const round5 = (x: number) => Math.round(x * 1e5) / 1e5;
  const stats = (dep: number, nights: number, span: number) => {
    const perNight = dep / nights;
    return {
      dep: Math.round(perNight * 10) / 10,
      headway:
        perNight > 1.5 ? Math.round(Math.max(span, 30) / (perNight - 1)) : null,
    };
  };
  const stops: Stop[] = [];
  for (const clusters of byName.values()) {
    for (const c of clusters) {
      const accs = c.ids.map((id) => stopAcc.get(id)!);
      const weekDep = accs.reduce((s, a) => s + a.weekDep, 0);
      const weekendDep = accs.reduce((s, a) => s + a.weekendDep, 0);
      const span =
        Math.max(...accs.map((a) => a.maxMinute)) -
        Math.min(...accs.map((a) => a.minMinute));
      stops.push({
        name: c.name,
        lat: round5(c.lat),
        lon: round5(c.lon),
        lines: [...new Set(accs.flatMap((a) => [...a.lines]))].sort(),
        week: stats(weekDep, totalWeekNights, span),
        weekend: stats(weekendDep, totalWeekendNights, span),
      });
    }
  }
  stops.sort((a, b) => b.week.dep - a.week.dep);
  console.log(`Merged into ${stops.length} stops`);

  // --- Route polylines: most-used shape per direction -------------------------
  const shapeVotes = new Map<string, Map<string, number>>();
  for (const t of trips.values()) {
    if (!t.shapeId) continue;
    const key = `${t.routeId}|${t.directionId}`;
    const votes = shapeVotes.get(key) ?? new Map();
    votes.set(t.shapeId, (votes.get(t.shapeId) ?? 0) + 1);
    shapeVotes.set(key, votes);
  }
  const wantedShapes = new Map<string, string>();
  for (const [key, votes] of shapeVotes) {
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    wantedShapes.set(best, key.split("|")[0]);
  }
  const shapePts = new Map<string, [number, number, number][]>();
  await streamZipCsv(ZIP_PATH, "shapes.txt", (get) => {
    const id = get("shape_id");
    if (!wantedShapes.has(id)) return;
    let pts = shapePts.get(id);
    if (!pts) shapePts.set(id, (pts = []));
    pts.push([+get("shape_pt_lat"), +get("shape_pt_lon"), +get("shape_pt_sequence")]);
  });

  const routeMap = new Map<string, Route>();
  for (const [rid, r] of routes) {
    routeMap.set(rid, { name: r.name, color: `#${r.color}`, paths: [] });
  }
  for (const [shapeId, routeId] of wantedShapes) {
    const pts = shapePts.get(shapeId);
    if (!pts) continue;
    pts.sort((a, b) => a[2] - b[2]);
    const path = simplifyPath(
      pts.map(([la, lo]) => [la, lo] as [number, number]),
      5e-5,
    );
    routeMap.get(routeId)!.paths.push(path.map(([la, lo]) => [round5(la), round5(lo)]));
  }

  // --- Emit --------------------------------------------------------------------
  const out: NoctilienData = {
    generatedAt: new Date().toISOString(),
    feedWindow: { start: fmtDate(minDate), end: fmtDate(maxDate) },
    nights: { week: totalWeekNights, weekend: totalWeekendNights },
    stops,
    routes: [...routeMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(
    `Wrote ${path.relative(ROOT, OUT_PATH)} ` +
      `(${Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024)} KB)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
