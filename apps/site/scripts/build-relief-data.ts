/**
 * Builds the ridership data for /relief: every rail station of Île-de-France
 * with its mean ticket validations per hour, for a weekday, a Saturday and a
 * Sunday, from the IDFM open data validation counts (daily numbers plus
 * hourly profiles per day type) joined to the station registry.
 *
 * Day types use the "hors vacances scolaires" profiles (JOHV, SAHV, DIJFP),
 * and the daily levels are averaged per weekday/Saturday/Sunday over the
 * covered quarter, so a station's curve reads as "a typical day".
 *
 * Output: apps/site/public/relief/
 *   stations.json  { date, start, end, count, maxPerHour, stations: [
 *     { n: name, lon, lat, w: [24], s: [24], d: [24] }  // validations/hour
 *   ] }
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_ROOT = process.env.DATA_CACHE_DIR
  ? path.resolve(process.env.DATA_CACHE_DIR)
  : path.join(ROOT, "data");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "relief");

const PORTAL = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets";
const DAILY = "validations-reseau-ferre-nombre-validations-par-jour-1er-trimestre";
const PROFILES = "validations-reseau-ferre-profils-horaires-par-jour-type-1er-trimestre";
const GARES = "emplacement-des-gares-idf";

// day-type buckets: "hors vacances" profiles, calendar split for the levels
const TYPES = ["w", "s", "d"] as const;
type DayType = (typeof TYPES)[number];
const CAT_JOUR: Record<string, DayType> = { JOHV: "w", SAHV: "s", DIJFP: "d" };

/** Fetch a CSV export with cache; never cache an HTML error body. */
async function fetchCached(dataset: string, expectHeader: string): Promise<string> {
  const full = path.join(DATA_ROOT, `${dataset}.csv`);
  if (existsSync(full)) return readFileSync(full, "utf8");
  const url = `${PORTAL}/${dataset}/exports/csv`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataset}`);
      const text = await res.text();
      if (!text.slice(0, 200).includes(expectHeader))
        throw new Error(`unexpected header for ${dataset}`);
      writeFileSync(full, text);
      return text;
    } catch (err) {
      if (attempt >= 4) throw err;
      console.warn(`  retry ${attempt} for ${dataset}: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

/** Split one CSV line on semicolons, respecting double-quoted fields. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ";" && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function* rows(text: string): Generator<string[]> {
  let start = text.indexOf("\n") + 1; // skip header (and its BOM)
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    const line = text.slice(start, end).trim();
    start = end + 1;
    if (line) yield splitCsv(line);
  }
}

/** Column lookup by header name; the header line is trimmed of its BOM and CR. */
function columnIndex(text: string): (name: string) => number {
  const header = splitCsv(text.slice(0, text.indexOf("\n")).trim());
  return (name) => {
    const index = header.indexOf(name);
    if (index === -1) throw new Error(`missing column ${name} in: ${header.join(";")}`);
    return index;
  };
}

const normalizeIda = (raw: string) => raw.replace(/\.0$/, "");

/** Export date to calendar date; days 1-12 have day and month swapped back
 * when one of them names a month absent from days 13 and up. */
function calendarDates(raw: Iterable<string>): Map<string, string> {
  const dates = [...new Set(raw)];
  const day = (date: string) => +date.slice(8, 10);
  const month = (date: string) => date.slice(0, 7);
  const sureMonths = new Set(dates.filter((date) => day(date) > 12).map(month));
  const swapped =
    sureMonths.size > 0 &&
    dates.some((date) => day(date) <= 12 && !sureMonths.has(month(date)));
  return new Map(
    dates.map((date) => [
      date,
      swapped && day(date) <= 12
        ? `${date.slice(0, 4)}-${date.slice(8, 10)}-${date.slice(5, 7)}`
        : date,
    ]),
  );
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // --- daily levels: mean validations per day type, per stop ------------------
  // A zone (ida) groups several stops (code_stif_arret) whose hourly profiles
  // are published separately, so levels are kept per stop and only the final
  // absolute validations/hour are summed into the zone.
  const dailyText = await fetchCached(DAILY, "jour;");
  const dailyCol = columnIndex(dailyText);
  const DAILY_IDX = {
    date: dailyCol("jour"),
    stop: dailyCol("code_stif_arret"),
    ida: dailyCol("ida"),
    count: dailyCol("nb_vald"),
  };
  const dayTotals = new Map<string, Map<string, number>>(); // ida|arret -> date -> sum
  const zoneOfStop = new Map<string, string>();
  const rawDates = new Set<string>();
  for (const cols of rows(dailyText)) {
    const ida = normalizeIda(cols[DAILY_IDX.ida]);
    if (!ida || ida === "ND") continue;
    const count = +cols[DAILY_IDX.count];
    if (!Number.isFinite(count)) continue;
    const stop = `${ida}|${cols[DAILY_IDX.stop]}`;
    zoneOfStop.set(stop, ida);
    const date = cols[DAILY_IDX.date];
    rawDates.add(date);
    let perDate = dayTotals.get(stop);
    if (!perDate) dayTotals.set(stop, (perDate = new Map()));
    perDate.set(date, (perDate.get(date) ?? 0) + count);
  }
  const calendar = calendarDates(rawDates);
  if ([...calendar].some(([raw, date]) => raw !== date))
    console.log("Daily levels: day and month swapped upstream, dates corrected");
  const dates = [...calendar.values()].sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const spanDays = (Date.parse(maxDate) - Date.parse(minDate)) / 86_400_000;
  if (!(spanDays > 0 && spanDays < 200))
    throw new Error(`Suspicious date span ${minDate} → ${maxDate} - upstream change?`);

  const typeOfDate = (date: string): DayType => {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return weekday === 0 ? "d" : weekday === 6 ? "s" : "w";
  };
  const meanDaily = new Map<string, Record<DayType, number>>();
  for (const [stop, perDate] of dayTotals) {
    const sums: Record<DayType, number> = { w: 0, s: 0, d: 0 };
    const counts: Record<DayType, number> = { w: 0, s: 0, d: 0 };
    for (const [date, total] of perDate) {
      const type = typeOfDate(calendar.get(date) ?? date);
      sums[type] += total;
      counts[type]++;
    }
    meanDaily.set(stop, {
      w: counts.w ? sums.w / counts.w : 0,
      s: counts.s ? sums.s / counts.s : 0,
      d: counts.d ? sums.d / counts.d : 0,
    });
  }
  console.log(`Daily levels: ${meanDaily.size} stops, ${minDate} → ${maxDate}`);

  // --- hourly profiles (percentages per day type) ------------------------------
  const profileText = await fetchCached(PROFILES, "code_stif_trns;");
  const profileCol = columnIndex(profileText);
  const PROFILE_IDX = {
    stop: profileCol("code_stif_arret"),
    ida: profileCol("ida"),
    dayType: profileCol("cat_jour"),
    slot: profileCol("trnc_horr_60"),
    pct: profileCol("pourcentage_validations"),
  };
  const profiles = new Map<string, Record<DayType, Float64Array>>();
  for (const cols of rows(profileText)) {
    const type = CAT_JOUR[cols[PROFILE_IDX.dayType]];
    if (!type) continue;
    const ida = normalizeIda(cols[PROFILE_IDX.ida]);
    const slot = cols[PROFILE_IDX.slot]; // "8H-9H"
    const hour = parseInt(slot, 10);
    if (!ida || ida === "ND" || !Number.isFinite(hour)) continue;
    const pct = +cols[PROFILE_IDX.pct];
    if (!Number.isFinite(pct)) continue;
    const stop = `${ida}|${cols[PROFILE_IDX.stop]}`;
    zoneOfStop.set(stop, ida);
    let perType = profiles.get(stop);
    if (!perType)
      profiles.set(
        stop,
        (perType = {
          w: new Float64Array(24),
          s: new Float64Array(24),
          d: new Float64Array(24),
        }),
      );
    perType[type][hour] += pct;
  }
  console.log(`Hourly profiles: ${profiles.size} stops`);

  // --- station registry: one point and name per zone de correspondance --------
  const garesText = await fetchCached(GARES, "geo_point_2d;");
  const garesCol = columnIndex(garesText);
  const IDX = {
    point: garesCol("geo_point_2d"),
    zdc: garesCol("id_ref_zdc"),
    nom: garesCol("nom_zdc"),
    principal: garesCol("principal"),
  };
  const points = new Map<string, { name: string; lon: number; lat: number; n: number; principal: boolean }>();
  for (const cols of rows(garesText)) {
    const zdc = cols[IDX.zdc];
    const [lat, lon] = cols[IDX.point].split(",").map(Number);
    if (!zdc || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const principal = cols[IDX.principal] === "1";
    const existing = points.get(zdc);
    if (!existing) {
      points.set(zdc, { name: cols[IDX.nom], lon, lat, n: 1, principal });
    } else {
      existing.lon += lon;
      existing.lat += lat;
      existing.n++;
      if (principal && !existing.principal) {
        existing.name = cols[IDX.nom];
        existing.principal = true;
      }
    }
  }
  console.log(`Station registry: ${points.size} zones de correspondance`);

  // --- join and emit ------------------------------------------------------------
  // absolute validations/hour per stop, summed into the zone
  const zoneHours = new Map<string, Record<DayType, Float64Array>>();
  let profileless = 0;
  for (const [stop, levels] of meanDaily) {
    const profile = profiles.get(stop);
    if (!profile) {
      profileless++;
      continue;
    }
    const ida = zoneOfStop.get(stop)!;
    let zone = zoneHours.get(ida);
    if (!zone)
      zoneHours.set(
        ida,
        (zone = {
          w: new Float64Array(24),
          s: new Float64Array(24),
          d: new Float64Array(24),
        }),
      );
    for (const type of TYPES) {
      // a few stops carry duplicated percentage rows upstream (profiles
      // summing to 400%+): normalize by the stop's own sum when it overshoots
      let sum = 0;
      for (let hour = 0; hour < 24; hour++) sum += profile[type][hour];
      const divisor = Math.max(100, sum);
      for (let hour = 0; hour < 24; hour++)
        zone[type][hour] += (levels[type] * profile[type][hour]) / divisor;
    }
  }

  const stations: {
    n: string;
    lon: number;
    lat: number;
    w: number[];
    s: number[];
    d: number[];
  }[] = [];
  let unmatched = 0;
  let silent = 0;
  let maxPerHour = 0;
  for (const [ida, zone] of zoneHours) {
    const point = points.get(ida);
    if (!point) {
      unmatched++;
      continue;
    }
    const perHour: Record<DayType, number[]> = { w: [], s: [], d: [] };
    let peak = 0;
    for (const type of TYPES) {
      for (let hour = 0; hour < 24; hour++) {
        const value = Math.round(zone[type][hour]);
        perHour[type].push(value);
        if (value > peak) peak = value;
      }
    }
    if (peak < 10) {
      silent++;
      continue;
    }
    if (peak > maxPerHour) maxPerHour = peak;
    stations.push({
      n: point.name,
      lon: +(point.lon / point.n).toFixed(5),
      lat: +(point.lat / point.n).toFixed(5),
      ...perHour,
    });
  }
  stations.sort((a, b) => b.lat - a.lat); // north first: back of the landscape
  console.log(
    `Stations kept: ${stations.length} · skipped: ${unmatched} without match, ` +
      `${profileless} stops without profile, ${silent} nearly silent · peak ${maxPerHour} validations/h`,
  );
  if (stations.length < 500)
    throw new Error("Suspiciously few stations - upstream change?");

  writeFileSync(
    path.join(OUT_DIR, "stations.json"),
    JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      start: minDate,
      end: maxDate,
      count: stations.length,
      maxPerHour,
      stations,
    }),
  );
  console.log(`Wrote stations.json (${stations.length} stations)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
