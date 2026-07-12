/**
 * Builds the social-housing data for /logis: every RPLS dwelling of Paris
 * intra-muros (the national register of social landlords' rental stock),
 * aggregated into address-level groups carrying a construction year, a
 * first-letting year and a financing category.
 *
 * The register is per dwelling, but dwellings of one program share the same
 * geocoded point, construction year and financing: grouping them turns
 * 250k rows into ~21k dots sized by dwelling count. Two year fields drive
 * the two sweep modes: CONSTRUCT is when the building was built, LOCAT when
 * it was first let as social housing - a quarter of the Paris stock entered
 * service more than 20 years after construction (bought and converted).
 *
 * Source: SDES "Données détaillées au logement du RPLS" via the DiDo API
 * (licence ouverte), row-filtered to DEP_CODE=75 and column-selected, so
 * the download is ~25 MB instead of the 5.4M-row national file. The open
 * file carries no rent and no landlord identity.
 *
 * Output: apps/site/public/logis/
 *   meta.json   millesime, counts per category, year ranges, medians
 *   groups.bin  binary, little-endian:
 *     Uint32 magic "LOGI", Uint32 N groups
 *     Float64[4] bbox (minLon, minLat, maxLon, maxLat)
 *     Uint16[N] x quantized to the bbox (same frame as vertige/strates)
 *     Uint16[N] y quantized
 *     Uint16[N] construction year
 *     Uint16[N] first-letting year
 *     Uint16[N] dwelling count
 *     Uint16[N] mean living surface, m2 x 10
 *     Uint8[N]  mean rooms x 10 (clamped)
 *     Uint8[N]  financing category (see CATEGORIES)
 *     Uint8[N]  arrondissement 0-19
 *     Uint8[N]  modal DPE (0 unknown, 1-7 = A-G)
 *     Uint8[N]  student housing flag (majority of the group)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_ROOT = process.env.DATA_CACHE_DIR
  ? path.resolve(process.env.DATA_CACHE_DIR)
  : path.join(ROOT, "data");
const CACHE_DIR = path.join(DATA_ROOT, "logis");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "logis");

// the RPLS is published once a year (situation on January 1st); bump the
// millesime by hand when the next vintage lands on DiDo
const MILLESIME = "2025-01";
const DATAFILE_RID = "f3c2f2cb-8fb1-40fd-8733-964247744c9a";
const COLUMNS = [
  "X",
  "Y",
  "EPSG",
  "CONSTRUCT",
  "FINAN_CODE",
  "FINAN_LIBELLE",
  "NBPIECE",
  "SURFHAB",
  "DPEENERGIE",
  "DEPCOM",
  "QUALITE_XY",
  "LOCAT",
  "ETAGE",
  "TYPECONST_LIBELLE",
];
const CSV_URL =
  `https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles/${DATAFILE_RID}/csv` +
  `?millesime=${MILLESIME}&withColumnName=true&columns=${COLUMNS.join(",")}&DEP_CODE=eq:75`;

// same fixed quantization frame as vertige/strates/mirage
const MIN_LON = 2.224;
const MAX_LON = 2.47;
const MIN_LAT = 48.813;
const MAX_LAT = 48.906;
const QUANT = 65535;

/** Financing categories, in legend order. The RPLS codes split into the
 * post-1977 (réforme Barre) ladder - PLAI at the most subsidized end, PLUS
 * as the standard product, PLS/PLI near the market - and the pre-1977
 * regimes, of which the HBM (1894-1953, the brick belt on the old
 * fortifications) deserve their own color. An unknown code aborts the
 * build (upstream change). */
const CAT_HBM = 0;
const CAT_PRE77 = 1;
const CAT_PLAI = 2;
const CAT_PLUS = 3;
const CAT_INTER = 4;
const CAT_OTHER = 5;
const CATEGORY_OF_CODE: Record<string, number> = {
  "50": CAT_HBM, // HBM
  "51": CAT_PRE77, // PLR/PSR
  "52": CAT_PRE77, // HLM/O
  "53": CAT_PRE77, // ILM
  "54": CAT_PRE77, // ILN
  "55": CAT_PRE77, // prêts spéciaux du CFF
  "99": CAT_PRE77, // autre financement avant 1977
  "10": CAT_PLAI, // PLA d'intégration
  "11": CAT_PLAI, // PLA LM / PLA TS / PLA insertion
  "12": CAT_PLUS, // PLA ordinaire
  "13": CAT_PLUS, // PLUS
  "14": CAT_INTER, // PLS / PPLS / PCLS / PLA CFF
  "16": CAT_INTER, // PLI
  "17": CAT_INTER, // PCL
  "49": CAT_OTHER, // autre financement
};
const CATEGORY_COUNT = 6;

const DPE_INDEX: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7,
};

async function fetchCached(url: string, file: string): Promise<string> {
  const full = path.join(CACHE_DIR, file);
  if (!existsSync(full)) {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
        writeFileSync(full, Buffer.from(await res.arrayBuffer()));
        break;
      } catch (err) {
        if (attempt >= 4) throw err;
        console.warn(`  retry ${attempt} for ${file}: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  return full;
}

/** Semicolon-separated rows with RFC 4180 quoting (DiDo quotes strings). */
function* csvRows(text: string): Generator<string[]> {
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let sawQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (sawQuote) {
        sawQuote = false;
        if (c === '"') {
          field += '"';
          continue;
        }
        inQuotes = false;
      } else if (c === '"') {
        sawQuote = true;
        continue;
      } else {
        field += c;
        continue;
      }
    }
    if (c === '"' && field === "") inQuotes = true;
    else if (c === ";") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      field = "";
      yield row;
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    yield row;
  }
}

/** Lambert-93 (EPSG:2154, GRS80) to WGS84 degrees. Standard inverse of the
 * secant conformal conic; the WGS84/RGF93 datum gap is millimetric. */
function lambert93ToWgs84(x: number, y: number): [number, number] {
  const e = 0.0818191910428158;
  const n = 0.7256077650532670;
  const C = 11754255.426096;
  const xs = 700000;
  const ys = 12655612.049876;
  const lon0 = (3 * Math.PI) / 180;
  const R = Math.hypot(x - xs, ys - y);
  const gamma = Math.atan2(x - xs, ys - y);
  const lon = lon0 + gamma / n;
  const latIso = -Math.log(R / C) / n;
  let lat = 2 * Math.atan(Math.exp(latIso)) - Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const es = e * Math.sin(lat);
    lat = 2 * Math.atan(Math.exp(latIso + (e / 2) * Math.log((1 + es) / (1 - es)))) - Math.PI / 2;
  }
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

interface Group {
  lon: number;
  lat: number;
  construct: number;
  locat: number;
  count: number;
  surfSum: number;
  roomsSum: number;
  cat: number;
  arr: number;
  dpeHist: number[];
  students: number;
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const file = await fetchCached(CSV_URL, `rpls-75-${MILLESIME}.csv`);
  console.log(`RPLS ${MILLESIME}, dept 75: ${file}`);
  const text = readFileSync(file, "utf8");

  let header: Map<string, number> | null = null;
  const col: Record<string, number> = {};
  const groups = new Map<string, Group>();
  let dwellings = 0;
  let skippedNoXY = 0;
  let skippedOutside = 0;
  let skippedBadYear = 0;

  for (const row of csvRows(text)) {
    if (!header) {
      header = new Map(row.map((name, index) => [name, index]));
      for (const name of COLUMNS) {
        const index = header.get(name);
        if (index === undefined) throw new Error(`column ${name} missing - upstream change?`);
        col[name] = index;
      }
      continue;
    }
    if (row.length < 2) continue; // trailing blank line
    const xText = row[col.X];
    const yText = row[col.Y];
    if (!xText || !yText) {
      skippedNoXY++;
      continue;
    }
    if (row[col.EPSG] !== "2154")
      throw new Error(`unexpected EPSG "${row[col.EPSG]}" - upstream change?`);
    const construct = +row[col.CONSTRUCT];
    const locat = +row[col.LOCAT];
    if (
      !Number.isInteger(construct) || construct < 1500 || construct > 2030 ||
      !Number.isInteger(locat) || locat < 1500 || locat > 2030
    ) {
      skippedBadYear++;
      continue;
    }
    const finan = row[col.FINAN_CODE];
    const cat = CATEGORY_OF_CODE[finan];
    if (cat === undefined)
      throw new Error(`unknown FINAN_CODE "${finan}" (${row[col.FINAN_LIBELLE]})`);
    const depcom = row[col.DEPCOM];
    const arr = +depcom - 75101;
    if (!depcom.startsWith("751") || arr < 0 || arr > 19)
      throw new Error(`unexpected DEPCOM "${depcom}"`);

    const [lon, lat] = lambert93ToWgs84(+xText, +yText);
    if (lon < MIN_LON || lon > MAX_LON || lat < MIN_LAT || lat > MAX_LAT) {
      skippedOutside++;
      continue;
    }

    // one group per geocoded point x program: same point, years and
    // financing means the same operation
    const key = `${xText};${yText};${construct};${locat};${cat}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        lon, lat, construct, locat,
        count: 0, surfSum: 0, roomsSum: 0,
        cat, arr,
        dpeHist: new Array(8).fill(0),
        students: 0,
      };
      groups.set(key, group);
    }
    group.count++;
    group.surfSum += +row[col.SURFHAB] || 0;
    group.roomsSum += +row[col.NBPIECE] || 0;
    group.dpeHist[DPE_INDEX[row[col.DPEENERGIE]] ?? 0]++;
    if (row[col.TYPECONST_LIBELLE] === "logement étudiant") group.students++;
    dwellings++;
  }

  const list = [...groups.values()];
  // big discs first: overlapping same-point programs then draw small on
  // top, so every group stays visible and hoverable; full tie-break keeps
  // the artifact byte-reproducible regardless of CSV row order
  list.sort(
    (a, b) =>
      b.count - a.count ||
      a.lon - b.lon ||
      a.lat - b.lat ||
      a.construct - b.construct ||
      a.locat - b.locat ||
      a.cat - b.cat,
  );
  const count = list.length;
  const catHist = new Array(CATEGORY_COUNT).fill(0);
  let students = 0;
  let minConstruct = 3000, maxConstruct = 0, minLocat = 3000, maxLocat = 0;
  for (const g of list) {
    catHist[g.cat] += g.count;
    if (g.students * 2 > g.count) students += g.count;
    if (g.construct < minConstruct) minConstruct = g.construct;
    if (g.construct > maxConstruct) maxConstruct = g.construct;
    if (g.locat < minLocat) minLocat = g.locat;
    if (g.locat > maxLocat) maxLocat = g.locat;
  }

  /** Dwelling-weighted median of a per-group year. */
  const medianYear = (year: (g: Group) => number): number => {
    const sorted = [...list].sort((a, b) => year(a) - year(b));
    let seen = 0;
    for (const g of sorted) {
      seen += g.count;
      if (seen >= dwellings / 2) return year(g);
    }
    return maxConstruct;
  };
  const medianConstruct = medianYear((g) => g.construct);
  const medianLocat = medianYear((g) => g.locat);
  let since2000 = 0;
  for (const g of list) if (g.locat >= 2000) since2000 += g.count;

  console.log(
    `Dwellings kept: ${dwellings} in ${count} groups · skipped: ${skippedNoXY} without XY, ` +
      `${skippedOutside} outside the frame, ${skippedBadYear} with bad years`,
  );
  console.log(
    `Categories: HBM ${catHist[CAT_HBM]}, pre-1977 ${catHist[CAT_PRE77]}, ` +
      `PLAI ${catHist[CAT_PLAI]}, PLUS ${catHist[CAT_PLUS]}, ` +
      `PLS/PLI ${catHist[CAT_INTER]}, other ${catHist[CAT_OTHER]}`,
  );
  console.log(
    `Years: built ${minConstruct}-${maxConstruct} (median ${medianConstruct}), ` +
      `first let ${minLocat}-${maxLocat} (median ${medianLocat}), ` +
      `${Math.round((since2000 / dwellings) * 100)}% let since 2000 · students ${students}`,
  );

  // sanity: Paris holds a quarter-million social dwellings, the HBM belt
  // is a substantial slice, and the acquisition wave is visible
  if (dwellings < 180_000 || dwellings > 400_000)
    throw new Error(`suspicious dwelling count ${dwellings} - upstream change?`);
  if (count < 8_000 || count > 80_000)
    throw new Error(`suspicious group count ${count} - aggregation broken?`);
  if (catHist[CAT_HBM] / dwellings < 0.03 || catHist[CAT_HBM] / dwellings > 0.25)
    throw new Error("HBM share out of range - categorization broken?");
  if (skippedNoXY / (dwellings + skippedNoXY) > 0.05)
    throw new Error("more than 5% of dwellings without coordinates - upstream change?");

  // --- emit -----------------------------------------------------------------
  const quantizeX = (lon: number) =>
    Math.max(0, Math.min(QUANT, Math.round(((lon - MIN_LON) / (MAX_LON - MIN_LON)) * QUANT)));
  const quantizeY = (lat: number) =>
    Math.max(0, Math.min(QUANT, Math.round(((lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * QUANT)));

  const bytes = 8 + 32 + 12 * count + 5 * count;
  const buf = Buffer.alloc(bytes);
  let offset = 0;
  buf.writeUInt32LE(0x49474f4c, offset); offset += 4; // "LOGI"
  buf.writeUInt32LE(count, offset); offset += 4;
  for (const v of [MIN_LON, MIN_LAT, MAX_LON, MAX_LAT]) {
    buf.writeDoubleLE(v, offset);
    offset += 8;
  }
  const u16 = (value: (g: Group) => number) => {
    for (const g of list) {
      buf.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(value(g)))), offset);
      offset += 2;
    }
  };
  const u8 = (value: (g: Group) => number) => {
    for (const g of list) {
      buf.writeUInt8(Math.max(0, Math.min(255, Math.round(value(g)))), offset);
      offset += 1;
    }
  };
  u16((g) => quantizeX(g.lon));
  u16((g) => quantizeY(g.lat));
  u16((g) => g.construct);
  u16((g) => g.locat);
  u16((g) => g.count);
  u16((g) => (g.surfSum / g.count) * 10);
  u8((g) => (g.roomsSum / g.count) * 10);
  u8((g) => g.cat);
  u8((g) => g.arr);
  u8((g) => g.dpeHist.indexOf(Math.max(...g.dpeHist)));
  u8((g) => (g.students * 2 > g.count ? 1 : 0));
  if (offset !== bytes) throw new Error(`layout mismatch: wrote ${offset} of ${bytes}`);

  writeFileSync(path.join(OUT_DIR, "groups.bin"), buf);
  writeFileSync(
    path.join(OUT_DIR, "meta.json"),
    JSON.stringify({
      millesime: MILLESIME,
      dwellings,
      groups: count,
      skippedNoXY,
      minConstruct,
      maxConstruct,
      minLocat,
      maxLocat,
      medianConstruct,
      medianLocat,
      since2000,
      students,
      categories: catHist,
      source: "SDES, RPLS (licence ouverte)",
    }),
  );
  console.log(`Wrote groups.bin (${(bytes / 1e6).toFixed(1)} MB), meta.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
