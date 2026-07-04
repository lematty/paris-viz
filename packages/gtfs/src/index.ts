/**
 * Shared utilities for working with the IDFM (Île-de-France Mobilités) GTFS
 * feed. Consumed by per-visualization build scripts run with tsx — never by
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

export function parseCsvLine(line: string): string[] {
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
// Dates & times (GTFS dates are YYYYMMDD calendar dates; times may be >24:00)
// ---------------------------------------------------------------------------

export const parseGtfsDate = (s: string) =>
  Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));

export const fmtDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** "25:30:00" → 91800 (seconds since midnight of the service day). */
export const parseGtfsTime = (s: string) =>
  +s.slice(0, 2) * 3600 + +s.slice(3, 5) * 60 + +s.slice(6, 8);

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
  const ensure = (id: string) => {
    let s = serviceDates.get(id);
    if (!s) serviceDates.set(id, (s = new Set()));
    return s;
  };
  await streamZipCsv(zipPath, "calendar.txt", (get) => {
    const id = get("service_id");
    if (!serviceIds.has(id)) return;
    const dates = ensure(id);
    const end = parseGtfsDate(get("end_date"));
    for (let ts = parseGtfsDate(get("start_date")); ts <= end; ts += DAY_MS) {
      if (get(WEEKDAY_COLS[new Date(ts).getUTCDay()]) === "1") dates.add(ts);
    }
  });
  await streamZipCsv(zipPath, "calendar_dates.txt", (get) => {
    const id = get("service_id");
    if (!serviceIds.has(id)) return;
    const ts = parseGtfsDate(get("date"));
    if (get("exception_type") === "1") ensure(id).add(ts);
    else serviceDates.get(id)?.delete(ts);
  });
  return serviceDates;
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

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
