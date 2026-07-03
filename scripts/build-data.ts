/**
 * Builds src/data/noctilien.json from the IDFM (Île-de-France Mobilités) GTFS feed.
 *
 * Downloads the full-region GTFS (~150 MB zip, schedules for the next ~30 days),
 * filters it down to the Noctilien night-bus network, and computes per-stop
 * service frequency, split into weeknights (Sun–Thu) and weekend nights (Fri–Sat).
 *
 * Requires the `unzip` CLI (used to stream the 1.2 GB stop_times.txt without
 * extracting it). Run with: pnpm build:data
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { NoctilienData, Route, Stop } from "../src/lib/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const ZIP_PATH = path.join(DATA_DIR, "IDFM-gtfs.zip");
const OUT_PATH = path.join(ROOT, "src", "data", "noctilien.json");
const GTFS_URL = "https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip";

// Noctilien lines are named N01…N162 (two/three digits). Single-digit N1/N2
// also exist in the feed but belong to the ADP airport shuttle network.
const NOCTILIEN_NAME = /^N\d{2,3}$/;
const BUS_ROUTE_TYPE = "3";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Small CSV helpers (GTFS fields may be quoted and contain commas)
// ---------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  out.push(field);
  return out;
}

/** Streams a file inside the zip line-by-line as records keyed by header name. */
async function streamZipCsv(
  member: string,
  onRow: (get: (col: string) => string) => void,
): Promise<void> {
  const child = spawn("unzip", ["-p", ZIP_PATH, member], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let header: Map<string, number> | null = null;
  let row: string[] = [];
  const get = (col: string) => row[header!.get(col) ?? -1] ?? "";
  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = new Map(
        parseCsvLine(line.replace(/^﻿/, "")).map((h, i) => [h.trim(), i]),
      );
      continue;
    }
    row = parseCsvLine(line);
    onRow(get);
  }
  const code = await new Promise<number | null>((res) => child.on("close", res));
  if (code !== 0) throw new Error(`unzip -p ${member} exited with code ${code}`);
}

// ---------------------------------------------------------------------------
// Date helpers (all UTC; GTFS dates are calendar dates, YYYYMMDD)
// ---------------------------------------------------------------------------

const parseGtfsDate = (s: string) =>
  Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));

const fmtDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** A "weekend night" is the evening of a Friday or Saturday. */
const isWeekendNight = (nightTs: number) => {
  const dow = new Date(nightTs).getUTCDay();
  return dow === 5 || dow === 6;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function download() {
  if (existsSync(ZIP_PATH)) {
    console.log(`Using cached ${path.relative(ROOT, ZIP_PATH)}`);
    return;
  }
  console.log(`Downloading ${GTFS_URL} …`);
  mkdirSync(DATA_DIR, { recursive: true });
  const res = await fetch(GTFS_URL);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  await finished(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream).pipe(
      createWriteStream(ZIP_PATH),
    ),
  );
}

async function main() {
  await download();

  // --- Routes: pick out the Noctilien lines ---------------------------------
  const routes = new Map<string, { name: string; color: string }>();
  await streamZipCsv("routes.txt", (get) => {
    const name = get("route_short_name");
    if (get("route_type") === BUS_ROUTE_TYPE && NOCTILIEN_NAME.test(name)) {
      routes.set(get("route_id"), {
        name,
        color: get("route_color") || "3F2A7E",
      });
    }
  });
  const lineNames = [...routes.values()].map((r) => r.name).sort();
  console.log(`Noctilien lines (${routes.size}): ${lineNames.join(" ")}`);

  // --- Trips of those routes -------------------------------------------------
  interface Trip {
    routeId: string;
    serviceId: string;
    shapeId: string;
    directionId: string;
  }
  const trips = new Map<string, Trip>();
  const serviceIds = new Set<string>();
  await streamZipCsv("trips.txt", (get) => {
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
  console.log(`Noctilien trips: ${trips.size} (services: ${serviceIds.size})`);

  // --- Calendars → active dates per service ----------------------------------
  const serviceDates = new Map<string, Set<number>>();
  const ensureDates = (id: string) => {
    let s = serviceDates.get(id);
    if (!s) serviceDates.set(id, (s = new Set()));
    return s;
  };
  const WEEKDAY_COLS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  await streamZipCsv("calendar.txt", (get) => {
    const id = get("service_id");
    if (!serviceIds.has(id)) return;
    const dates = ensureDates(id);
    const end = parseGtfsDate(get("end_date"));
    for (let ts = parseGtfsDate(get("start_date")); ts <= end; ts += DAY_MS) {
      if (get(WEEKDAY_COLS[new Date(ts).getUTCDay()]) === "1") dates.add(ts);
    }
  });
  await streamZipCsv("calendar_dates.txt", (get) => {
    const id = get("service_id");
    if (!serviceIds.has(id)) return;
    const ts = parseGtfsDate(get("date"));
    if (get("exception_type") === "1") ensureDates(id).add(ts);
    else ensureDates(id).delete(ts);
  });

  // A departure belongs to "the night of day X". GTFS encodes an after-midnight
  // trip either on the previous service day with times >24:00 or on the same
  // calendar day with small times — so times before noon count toward the
  // previous day's night, times after noon (incl. 24:xx+) toward the same day.
  // Per service, precompute how many of its nights are week vs weekend for
  // both encodings, so each stop_time is a dictionary lookup instead of a loop.
  interface NightCounts {
    eveWeek: number;
    eveWeekend: number;
    mornWeek: number;
    mornWeekend: number;
  }
  // The window of nights is [first service date, last service date]. A trip
  // coded with morning times on the first feed date belongs to the night
  // *before* the window — only half of that night is visible, so it is
  // excluded from both counts to avoid skewing averages.
  let minDate = Infinity;
  let maxDate = -Infinity;
  for (const dates of serviceDates.values()) {
    for (const ts of dates) {
      if (ts < minDate) minDate = ts;
      if (ts > maxDate) maxDate = ts;
    }
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
    weekDep: number; // total departures over all week nights
    weekendDep: number;
    minMinute: number; // normalized minutes since midnight of the night
    maxMinute: number;
    lines: Set<string>;
  }
  const stopAcc = new Map<string, StopAcc>();
  let stopTimeRows = 0;
  await streamZipCsv("stop_times.txt", (get) => {
    const trip = trips.get(get("trip_id"));
    if (!trip) return;
    const time = get("departure_time") || get("arrival_time");
    if (!time) return;
    stopTimeRows++;
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
  console.log(`Noctilien stop_times: ${stopTimeRows} across ${stopAcc.size} stop poles`);

  // --- Stop coordinates & pole merging ----------------------------------------
  const poles = new Map<string, { name: string; lat: number; lon: number }>();
  await streamZipCsv("stops.txt", (get) => {
    const id = get("stop_id");
    if (!stopAcc.has(id)) return;
    poles.set(id, {
      name: get("stop_name"),
      lat: +get("stop_lat"),
      lon: +get("stop_lon"),
    });
  });

  // Merge same-named poles within ~150 m (one per direction/branch in GTFS)
  // into a single logical stop; departures add up (a bus passing in either
  // direction is a Noctilien passing by).
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
      // running centroid
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
  const shapeVotes = new Map<string, Map<string, number>>(); // routeId|dir → shapeId → votes
  for (const t of trips.values()) {
    if (!t.shapeId) continue;
    const key = `${t.routeId}|${t.directionId}`;
    const votes = shapeVotes.get(key) ?? new Map();
    votes.set(t.shapeId, (votes.get(t.shapeId) ?? 0) + 1);
    shapeVotes.set(key, votes);
  }
  const wantedShapes = new Map<string, string>(); // shapeId → routeId
  for (const [key, votes] of shapeVotes) {
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    wantedShapes.set(best, key.split("|")[0]);
  }
  const shapePts = new Map<string, [number, number, number][]>();
  await streamZipCsv("shapes.txt", (get) => {
    const id = get("shape_id");
    if (!wantedShapes.has(id)) return;
    let pts = shapePts.get(id);
    if (!pts) shapePts.set(id, (pts = []));
    pts.push([+get("shape_pt_lat"), +get("shape_pt_lon"), +get("shape_pt_sequence")]);
  });

  // Douglas-Peucker in degree space; ~0.0002° ≈ 20 m keeps shapes accurate
  // at city zoom while cutting the JSON size drastically.
  function simplify(pts: [number, number][], tol = 2e-4): [number, number][] {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack: [number, number][] = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      let maxD = 0;
      let maxI = a;
      const [ax, ay] = pts[a];
      const [bx, by] = pts[b];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1e-12;
      for (let i = a + 1; i < b; i++) {
        const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len2));
        const d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy));
        if (d > maxD) {
          maxD = d;
          maxI = i;
        }
      }
      if (maxD > tol) {
        keep[maxI] = 1;
        stack.push([a, maxI], [maxI, b]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  }

  const routeMap = new Map<string, Route>();
  for (const [rid, r] of routes) {
    routeMap.set(rid, { name: r.name, color: `#${r.color}`, paths: [] });
  }
  for (const [shapeId, routeId] of wantedShapes) {
    const pts = shapePts.get(shapeId);
    if (!pts) continue;
    pts.sort((a, b) => a[2] - b[2]);
    const path = simplify(pts.map(([la, lo]) => [la, lo] as [number, number]));
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
  const kb = Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024);
  console.log(`\nWrote ${path.relative(ROOT, OUT_PATH)} (${kb} KB)`);
  console.log("\nBusiest stops (weeknight departures/night):");
  for (const s of stops.slice(0, 10)) {
    console.log(
      `  ${s.name.padEnd(30)} ${String(s.week.dep).padStart(6)}/night  ` +
        `headway ~${s.week.headway ?? "—"} min  [${s.lines.join(" ")}]`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
