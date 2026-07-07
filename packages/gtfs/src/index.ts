/**
 * Shared utilities for working with the IDFM (Île-de-France Mobilités) GTFS
 * feed. Consumed by per-visualization build scripts run with tsx - never by
 * the web app at runtime.
 *
 * Streaming is non-negotiable: stop_times.txt is >1 GB uncompressed, so
 * files are piped out of the zip with the `unzip` CLI and parsed line by
 * line.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import path from "node:path";

export const GTFS_URL = "https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip";

export const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function parseCsvLine(line: string, delimiter = ","): string[] {
  if (!line.includes('"')) return line.split(delimiter);
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

/** Streams one CSV member of the GTFS zip, invoking onRow with a
 * header-keyed getter for each record. */
export async function streamZipCsv(
  zipPath: string,
  member: string,
  onRow: (get: (col: string) => string) => void,
): Promise<void> {
  const child = spawn("unzip", ["-p", zipPath, member], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const lineReader = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let header: Map<string, number> | null = null;
  let row: string[] = [];
  const get = (col: string) => row[header!.get(col) ?? -1] ?? "";
  for await (const line of lineReader) {
    if (!line) continue;
    if (!header) {
      header = new Map(
        parseCsvLine(line.replace(/^﻿/, "")).map((name, i) => [name.trim(), i]),
      );
      continue;
    }
    row = parseCsvLine(line);
    onRow(get);
  }
  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));
  if (exitCode !== 0) throw new Error(`unzip -p ${member} exited with code ${exitCode}`);
}

// ---------------------------------------------------------------------------
// Dates & times (GTFS dates are YYYYMMDD calendar dates; times may be >24:00)
// ---------------------------------------------------------------------------

export const parseGtfsDate = (dateStr: string) =>
  Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(4, 6) - 1, +dateStr.slice(6, 8));

export const fmtDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** "25:30:00" → 91800 (seconds since midnight of the service day). */
export const parseGtfsTime = (timeStr: string) =>
  +timeStr.slice(0, 2) * 3600 + +timeStr.slice(3, 5) * 60 + +timeStr.slice(6, 8);

export const WEEKDAY_COLS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Resolves the set of active service dates per service_id (calendar.txt +
 * calendar_dates.txt), restricted to the given service ids. */
export async function loadServiceDates(
  zipPath: string,
  serviceIds: ReadonlySet<string>,
): Promise<Map<string, Set<number>>> {
  const serviceDates = new Map<string, Set<number>>();
  const getOrCreateDates = (id: string) => {
    let dates = serviceDates.get(id);
    if (!dates) serviceDates.set(id, (dates = new Set()));
    return dates;
  };
  await streamZipCsv(zipPath, "calendar.txt", (get) => {
    const id = get("service_id");
    if (!serviceIds.has(id)) return;
    const dates = getOrCreateDates(id);
    const end = parseGtfsDate(get("end_date"));
    for (let ts = parseGtfsDate(get("start_date")); ts <= end; ts += DAY_MS) {
      if (get(WEEKDAY_COLS[new Date(ts).getUTCDay()]) === "1") dates.add(ts);
    }
  });
  await streamZipCsv(zipPath, "calendar_dates.txt", (get) => {
    const id = get("service_id");
    if (!serviceIds.has(id)) return;
    const ts = parseGtfsDate(get("date"));
    if (get("exception_type") === "1") getOrCreateDates(id).add(ts);
    else serviceDates.get(id)?.delete(ts);
  });
  return serviceDates;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const EARTH_R = 6_371_000;

export function haversineMeters(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(haversine));
}

/** Douglas-Peucker in degree space ([lat, lon] pairs); tolerance in degrees
 * (~1e-4 ≈ 11 m). Endpoints are always kept. */
export function simplifyPath(
  points: [number, number][],
  tolerance: number,
): [number, number][] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = start;
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    for (let i = start + 1; i < end; i++) {
      const t = Math.max(
        0,
        Math.min(1, ((points[i][0] - ax) * dx + (points[i][1] - ay) * dy) / len2),
      );
      const dist = Math.hypot(points[i][0] - (ax + t * dx), points[i][1] - (ay + t * dy));
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxDist > tolerance) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export async function downloadFile(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) {
    console.log(`Using cached ${dest}`);
    return;
  }
  console.log(`Downloading ${url} …`);
  mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  await finished(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream).pipe(
      createWriteStream(dest),
    ),
  );
}

export async function downloadGtfs(zipPath: string): Promise<void> {
  if (existsSync(zipPath)) {
    console.log(`Using cached ${zipPath}`);
    return;
  }
  console.log(`Downloading ${GTFS_URL} …`);
  mkdirSync(path.dirname(zipPath), { recursive: true });
  const res = await fetch(GTFS_URL);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  await finished(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream).pipe(
      createWriteStream(zipPath),
    ),
  );
}
