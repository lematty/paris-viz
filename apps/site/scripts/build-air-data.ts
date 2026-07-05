/**
 * Builds public/air/: hourly air quality measurements for Île-de-France.
 *
 * Sources (Airparif open data, no auth):
 *  - hourly station CSVs per year and pollutant (ArcGIS hub items)
 *  - station locations from the mes_idf_annuel_* FeatureServer layers,
 *    joined by normalized station name
 *
 * Output:
 *  air/meta.json                stations, available years per pollutant
 *  air/<poll>-<year>.bin        uint8 µg/m³ per station per hour
 *                               (255 = missing, values capped at 250)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadFile, parseCsvLine } from "@paris-viz/gtfs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_DIR = path.join(ROOT, "data", "air");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "air");

const ITEM = (id: string) =>
  `https://www.arcgis.com/sharing/rest/content/items/${id}/data`;
// national station referential (Dataset D, resolved via the data.gouv API)
const REFERENTIAL_API =
  "https://www.data.gouv.fr/api/1/datasets/donnees-temps-reel-de-mesure-des-concentrations-de-polluants-atmospheriques-reglementes-1/";

// ArcGIS hub item ids for "YYYY <POLL>" hourly CSVs
const YEARS: Record<string, Record<number, string>> = {
  no2: {
    2019: "6ac940f634c7422999bd3630b7359598",
    2020: "0804fd34322d4ab38092a30632de7262",
    2021: "8e17ad8f58204ea787a3bdfcf37903c3",
    2022: "0da367910c13407288d75b5e2e93d11f",
    2023: "3b7c61c20abf453a81e610e264ed91c0",
    2024: "38aec90fbccb41de8ba7e550cae64097",
    2025: "8625a114f4c644ac9a3168bdbf466686",
  },
  pm25: {
    2019: "af1ff2e7ed614a1998a06e0e92f5239d",
    2020: "d6927524887c4ce39b819ff07e16f90d",
    2021: "2f524a86a81f4b0d86d2088651bb419e",
    2022: "7b7c1bcd091c417b827a5a4224bac04d",
    2023: "b519b8d7cc4141dc8d1c4225227f11f4",
    2024: "3d5f973529814ba49b775fafe9d7662b",
    2025: "b38c847d65d14189a3c9a3259fd6c03f",
  },
};


const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Airparif CSV label → official Dataset D name, where spellings diverge
const ALIASES: Record<string, string> = {
  "avenue des champs elysees": "av champs elysees",
  "zone rurale sud est foret de fontainebleau": "zone rurale se",
  "zone rurale sud ouest foret de rambouillet": "zone rurale so",
  "route nationale 2 pantin": "rn2 pantin",
  "route nationale 6 melun": "rn6 melun",
  "boulevard peripherique est": "bld peripherique est",
  "autoroute a1 saint denis": "auto a1 saint denis",
  "zone rurale nord saint martin du tertre": "zone rurale nord",
  "zone rurale sud bois herpin": "zone rurale sud",
};

// sites absent from the referential, coordinates from Airparif publications
const EXTRA_STATIONS: Station[] = [
  {
    name: "Boulevard Périphérique Auteuil",
    lat: 48.84789,
    lon: 2.25336,
    traffic: true,
  },
];

// measured 300 m above ground; not comparable with street-level stations
const EXCLUDE = /tour eiffel/i;

const TRAFFIC_HINT = /rn\d|auto|periph|boulevard|avenue|place|rue|quai|elysees|bld/i;

interface Station {
  name: string;
  lat: number;
  lon: number;
  traffic: boolean;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // --- station locations (Dataset D referential, cached) ---------------------
  const stationsByNorm = new Map<string, Station>();
  const xlsPath = path.join(DATA_DIR, "stations-d.xls");
  if (!existsSync(xlsPath)) {
    const api = (await (await fetch(REFERENTIAL_API)).json()) as {
      resources: { title: string; url: string }[];
    };
    const res = api.resources.find((r) => r.title.startsWith("Dataset D"));
    if (!res) throw new Error("Dataset D resource not found on data.gouv");
    await downloadFile(res.url, xlsPath);
  }
  const XLSX = (await import("xlsx")).default;
  const wb = XLSX.readFile(xlsPath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["AirQualityStations"], {
    header: 1,
  }) as (string | number)[][];
  for (const r of rows.slice(1)) {
    const name = String(r[5] ?? "");
    const lat = Number(r[10]);
    const lon = Number(r[11]);
    // Île-de-France bounding box
    if (!name || !(lat > 48.1 && lat < 49.3 && lon > 1.4 && lon < 3.6)) continue;
    const key = norm(name);
    if (!stationsByNorm.has(key)) {
      stationsByNorm.set(key, {
        name,
        lat: +lat.toFixed(5),
        lon: +lon.toFixed(5),
        traffic: TRAFFIC_HINT.test(name),
      });
    }
  }
  for (const st of EXTRA_STATIONS) stationsByNorm.set(norm(st.name), st);
  console.log(`Stations in referential (IDF): ${stationsByNorm.size}`);

  const lookup = (label: string): Station | undefined => {
    if (EXCLUDE.test(label)) return undefined;
    const key = norm(label);
    return stationsByNorm.get(ALIASES[key] ?? key);
  };

  // master station list: every located station that appears in any CSV
  const master: Station[] = [];
  const masterIndex = new Map<string, number>(); // norm name → idx

  interface YearFile {
    poll: string;
    year: number;
    hours: number;
    start: number; // epoch ms of the first hourly row (UTC)
    values: Uint8Array; // hours × stations, filled after master is complete
    columns: (number | null)[]; // csv column → master idx
    raw: string[][];
  }
  const files: YearFile[] = [];
  const unmatched = new Set<string>();

  for (const [poll, years] of Object.entries(YEARS)) {
    for (const [yearStr, id] of Object.entries(years)) {
      const year = +yearStr;
      const dest = path.join(DATA_DIR, `${poll}-${year}.csv`);
      await downloadFile(ITEM(id), dest);
      const lines = readFileSync(dest, "utf8").split("\n").filter(Boolean);
      // row 0: codes+poll, row 1: station labels, rows 2,3,4: code/name/unit
      const labels = parseCsvLine(lines[1]).slice(1);
      const dataRows = lines.slice(6).map((l) => parseCsvLine(l));
      const columns = labels.map((label) => {
        const st = lookup(label);
        if (!st) {
          if (label && !EXCLUDE.test(label)) unmatched.add(label);
          return null;
        }
        const key = norm(st.name);
        let idx = masterIndex.get(key);
        if (idx === undefined) {
          idx = master.length;
          masterIndex.set(key, idx);
          master.push(st);
        }
        return idx;
      });
      const matched = columns.filter((c) => c !== null).length;
      console.log(
        `${poll} ${year}: ${dataRows.length} hours, ${matched}/${labels.length} stations matched`,
      );
      if (dataRows.length < 1000 || matched < 10) {
        throw new Error(`${poll} ${year}: implausible data, aborting`);
      }
      const start = Date.parse(String(dataRows[0][0]).replace(" ", "T"));
      if (!Number.isFinite(start)) {
        throw new Error(`${poll} ${year}: unparseable first timestamp`);
      }
      files.push({
        poll,
        year,
        hours: dataRows.length,
        start,
        values: new Uint8Array(0),
        columns,
        raw: dataRows,
      });
    }
  }

  // --- encode: uint8 per station per hour --------------------------------------
  const meta = {
    stations: master,
    pollutants: {} as Record<
      string,
      { years: Record<number, { hours: number; start: number }> }
    >,
  };
  for (const f of files) {
    const n = master.length;
    const out = new Uint8Array(f.hours * n).fill(255);
    for (let h = 0; h < f.hours; h++) {
      const row = f.raw[h];
      for (let c = 0; c < f.columns.length; c++) {
        const idx = f.columns[c];
        if (idx === null) continue;
        const v = parseFloat(row[c + 1]);
        if (Number.isFinite(v))
          out[h * n + idx] = Math.max(0, Math.min(250, Math.round(v)));
      }
    }
    writeFileSync(path.join(OUT_DIR, `${f.poll}-${f.year}.bin`), out);
    meta.pollutants[f.poll] ??= { years: {} };
    meta.pollutants[f.poll].years[f.year] = { hours: f.hours, start: f.start };
  }
  if (unmatched.size) console.log("Unmatched labels:", [...unmatched].join(" | "));
  writeFileSync(path.join(OUT_DIR, "meta.json"), JSON.stringify(meta));
  const totalKb = files.reduce((s, f) => s + (f.hours * master.length) / 1024, 0);
  console.log(
    `Wrote air/meta.json (${master.length} stations) + ${files.length} year files, ` +
      `${Math.round(totalKb)} KB total (uncompressed)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
