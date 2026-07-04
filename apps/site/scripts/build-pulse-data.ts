/**
 * Builds public/pulse.json: rail-network station ridership through a day.
 *
 * Sources (IDFM open data, no auth):
 *  - validations-reseau-ferre-nombre-validations-par-jour-1er-trimestre
 *      daily validation counts per station (ida) per ticket category
 *  - validations-reseau-ferre-profils-horaires-par-jour-type-1er-trimestre
 *      hourly percentage profiles per station per day type (JOHV/SAHV/DIJFP…)
 *  - emplacement-des-gares-idf
 *      station locations, joined on ida == id_ref_zdc
 *
 * Output per station: average daily validations for weekday/Saturday/Sunday
 * plus a 24-hour per-mille profile for each, ready to animate.
 */
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadFile, parseCsvLine } from "@paris-viz/gtfs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_DIR = path.join(ROOT, "data");
const OUT_PATH = path.resolve(ROOT, "apps", "site", "public", "pulse.json");

const ODS = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets";
const csvExport = (dataset: string) =>
  `${ODS}/${dataset}/exports/csv?delimiter=%3B`;

const SETS = {
  daily: "validations-reseau-ferre-nombre-validations-par-jour-1er-trimestre",
  profiles: "validations-reseau-ferre-profils-horaires-par-jour-type-1er-trimestre",
  stations: "emplacement-des-gares-idf",
};

// day-type keys: IDFM cat_jour → ours ("hors vacances" variants preferred)
const CAT_TO_DAY: Record<string, "w" | "s" | "u"> = {
  JOHV: "w", // jour ouvré hors vacances
  SAHV: "s", // samedi hors vacances
  DIJFP: "u", // dimanche / jour férié
};

async function streamCsv(
  file: string,
  onRow: (get: (col: string) => string) => void,
): Promise<void> {
  const rl = createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  });
  let header: Map<string, number> | null = null;
  let row: string[] = [];
  const get = (col: string) => row[header!.get(col) ?? -1] ?? "";
  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = new Map(
        parseCsvLine(line.replace(/^﻿/, ""), ";").map((h, i) => [
          h.trim().toLowerCase(),
          i,
        ]),
      );
      continue;
    }
    row = parseCsvLine(line, ";");
    onRow(get);
  }
}

async function main() {
  const files = Object.fromEntries(
    await Promise.all(
      Object.entries(SETS).map(async ([key, dataset]) => {
        const dest = path.join(DATA_DIR, `${dataset}.csv`);
        await downloadFile(csvExport(dataset), dest);
        return [key, dest] as const;
      }),
    ),
  );

  // --- station locations: ida (id_ref_zdc) → centroid + name ---------------
  const locAcc = new Map<
    string,
    { name: string; lat: number; lon: number; n: number }
  >();
  await streamCsv(files.stations, (get) => {
    const zdc = get("id_ref_zdc");
    if (!zdc) return;
    // geo_point_2d exports as "lat, lon"
    const [lat, lon] = get("geo_point_2d").split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const cur = locAcc.get(zdc);
    if (cur) {
      cur.lat += lat;
      cur.lon += lon;
      cur.n++;
    } else {
      locAcc.set(zdc, { name: get("nom_zdc") || get("nom_gares"), lat, lon, n: 1 });
    }
  });
  const locations = new Map(
    [...locAcc].map(([zdc, a]) => [
      zdc,
      { name: a.name, lat: a.lat / a.n, lon: a.lon / a.n },
    ]),
  );
  console.log(`Stations with location: ${locations.size}`);

  // --- daily counts: per station per date (summed over ticket types) --------
  const perStationDay = new Map<string, Map<string, number>>();
  const allDates = new Set<string>();
  await streamCsv(files.daily, (get) => {
    const ida = get("ida");
    const jour = get("jour");
    const n = +get("nb_vald");
    if (!ida || !jour || !Number.isFinite(n)) return;
    const key = String(Math.round(+ida));
    allDates.add(jour);
    let days = perStationDay.get(key);
    if (!days) perStationDay.set(key, (days = new Map()));
    days.set(jour, (days.get(jour) ?? 0) + n);
  });
  const dayClass = (jour: string): "w" | "s" | "u" => {
    const dow = new Date(`${jour}T00:00:00Z`).getUTCDay();
    return dow === 0 ? "u" : dow === 6 ? "s" : "w";
  };
  const classCounts = { w: 0, s: 0, u: 0 };
  for (const jour of allDates) classCounts[dayClass(jour)]++;
  const dates = [...allDates].sort();
  console.log(
    `Daily records: ${perStationDay.size} stations over ${allDates.size} days ` +
      `(${dates[0]} → ${dates.at(-1)}; ${classCounts.w} weekdays, ` +
      `${classCounts.s} Saturdays, ${classCounts.u} Sundays/holidays)`,
  );

  // --- hourly profiles ---------------------------------------------------------
  const profiles = new Map<string, Record<"w" | "s" | "u", number[]>>();
  await streamCsv(files.profiles, (get) => {
    const day = CAT_TO_DAY[get("cat_jour")];
    if (!day) return;
    const ida = get("ida");
    const hour = parseInt(get("trnc_horr_60")); // "5H-6H" → 5
    const pct = +get("pourcentage_validations");
    if (!ida || !Number.isFinite(hour) || !Number.isFinite(pct)) return;
    const key = String(Math.round(+ida));
    let p = profiles.get(key);
    if (!p) {
      profiles.set(key, (p = { w: new Array(24).fill(0), s: new Array(24).fill(0), u: new Array(24).fill(0) }));
    }
    if (hour >= 0 && hour < 24) p[day][hour] += pct;
  });
  console.log(`Profiles: ${profiles.size} stations`);

  // --- join & emit --------------------------------------------------------------
  interface PulseStation {
    n: string;
    lat: number;
    lon: number;
    // per day type: [avgDaily, ...24 per-mille hourly shares]
    w: number[];
    s: number[];
    u: number[];
  }
  const stations: PulseStation[] = [];
  let unmatched = 0;
  for (const [ida, days] of perStationDay) {
    const loc = locations.get(ida);
    const prof = profiles.get(ida);
    if (!loc || !prof) {
      unmatched++;
      continue;
    }
    const totals = { w: 0, s: 0, u: 0 };
    for (const [jour, n] of days) totals[dayClass(jour)] += n;
    const pack = (day: "w" | "s" | "u"): number[] => {
      const avg = classCounts[day] ? Math.round(totals[day] / classCounts[day]) : 0;
      const sum = prof[day].reduce((a, b) => a + b, 0) || 1;
      return [avg, ...prof[day].map((p) => Math.round((p / sum) * 1000))];
    };
    stations.push({
      n: loc.name,
      lat: +loc.lat.toFixed(5),
      lon: +loc.lon.toFixed(5),
      w: pack("w"),
      s: pack("s"),
      u: pack("u"),
    });
  }
  stations.sort((a, b) => b.w[0] - a.w[0]);
  console.log(
    `Joined: ${stations.length} stations (${unmatched} without location/profile)`,
  );
  console.log("Top 5 by weekday validations:");
  for (const s of stations.slice(0, 5)) {
    console.log(`  ${s.n.padEnd(30)} ${s.w[0].toLocaleString("en")} /day`);
  }

  const out = {
    period: { start: dates[0], end: dates.at(-1) },
    stations,
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
