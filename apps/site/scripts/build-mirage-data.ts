/**
 * Builds the tourist-rental data for /mirage: every Airbnb listing of Paris
 * intra-muros from the Inside Airbnb scrape (CC BY 4.0), with its city
 * registration status read from the listing's license field and its review
 * lifespan (first and last review month) driving the time sweep.
 *
 * Paris requires most short-term rentals to display a 13-character
 * registration number; mobility leases (30-90 nights, "bail mobilité") and
 * hotel-type listings are exempt. The license field is whatever the host
 * typed: a well-formed number counts as declared, anything else as none.
 *
 * Output: apps/site/public/mirage/
 *   meta.json     snapshot date, counts, status/room/arrondissement tables
 *   listings.bin  binary, little-endian:
 *     Uint32 magic "MIRA", Uint32 N listings
 *     Float64[4] bbox (minLon, minLat, maxLon, maxLat)
 *     Uint16[N] x quantized to the bbox (same frame as vertige/strates)
 *     Uint16[N] y quantized
 *     Uint16[N] first review month (months since 2000-01, 0xFFFF = never)
 *     Uint16[N] last review month (same encoding)
 *     Uint16[N] review count (clamped)
 *     Uint16[N] listings by the same host (clamped)
 *     Uint16[N] price in EUR per night (0 = unknown, clamped)
 *     Uint8[N]  status (0 declared, 1 none, 2 mobility lease, 3 exempt)
 *     Uint8[N]  room type (0 entire home, 1 private, 2 shared, 3 hotel)
 *     Uint8[N]  arrondissement index into meta.neighbourhoods
 */
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_ROOT = process.env.DATA_CACHE_DIR
  ? path.resolve(process.env.DATA_CACHE_DIR)
  : path.join(ROOT, "data");
const CACHE_DIR = path.join(DATA_ROOT, "mirage");
const OUT_DIR = path.resolve(ROOT, "apps", "site", "public", "mirage");

// Inside Airbnb publishes roughly quarterly, at dated URLs that stay live;
// bump the date by hand when adopting a newer scrape
const SNAPSHOT = "2026-06-16";
const LISTINGS_URL = `https://data.insideairbnb.com/france/ile-de-france/paris/${SNAPSHOT}/data/listings.csv.gz`;

// same fixed quantization frame as vertige/strates, so artifacts share precision
const MIN_LON = 2.224;
const MAX_LON = 2.47;
const MIN_LAT = 48.813;
const MAX_LAT = 48.906;
const QUANT = 65535;

const MONTH_EPOCH_YEAR = 2000; // month 0 = January 2000
const NEVER = 0xffff;

const STATUS_DECLARED = 0;
const STATUS_NONE = 1;
const STATUS_MOBILITY = 2;
const STATUS_EXEMPT = 3;

const ROOM_TYPES = ["Entire home/apt", "Private room", "Shared room", "Hotel room"];

// Inside Airbnb's neighbourhood_cleansed carries the official arrondissement
// names; the table pins their display order and number, and any unknown name
// aborts the build (upstream change)
const ARRONDISSEMENTS: [string, number][] = [
  ["Louvre", 1],
  ["Bourse", 2],
  ["Temple", 3],
  ["Hôtel-de-Ville", 4],
  ["Panthéon", 5],
  ["Luxembourg", 6],
  ["Palais-Bourbon", 7],
  ["Élysée", 8],
  ["Opéra", 9],
  ["Entrepôt", 10],
  ["Popincourt", 11],
  ["Reuilly", 12],
  ["Gobelins", 13],
  ["Observatoire", 14],
  ["Vaugirard", 15],
  ["Passy", 16],
  ["Batignolles-Monceau", 17],
  ["Buttes-Montmartre", 18],
  ["Buttes-Chaumont", 19],
  ["Ménilmontant", 20],
];

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

/** RFC 4180 rows out of a text stream: quoted fields may hold commas,
 * doubled quotes, and (in listing descriptions) literal newlines. */
async function* csvRows(stream: Readable): AsyncGenerator<string[]> {
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let sawQuote = false; // previous char was a quote inside a quoted field
  stream.setEncoding("utf8");
  for await (const chunk of stream as AsyncIterable<string>) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (inQuotes) {
        if (sawQuote) {
          sawQuote = false;
          if (c === '"') {
            field += '"';
            continue;
          }
          inQuotes = false; // closing quote, fall through to the delimiter
        } else if (c === '"') {
          sawQuote = true;
          continue;
        } else {
          field += c;
          continue;
        }
      }
      if (c === '"' && field === "") inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
        field = "";
        yield row;
        row = [];
      } else field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    yield row;
  }
}

/** A month index since January 2000, or NEVER for blank/invalid dates. */
function monthOf(date: string): number {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!m) return NEVER;
  const value = (+m[1] - MONTH_EPOCH_YEAR) * 12 + (+m[2] - 1);
  return value >= 0 && value < NEVER ? value : NEVER;
}

/** Classify the free-text license field. Registration numbers are 13
 * alphanumeric characters starting with the commune INSEE code: 75101-75120
 * for the Paris arrondissements, or a petite couronne commune (920xx-940xx)
 * for edge listings whose anonymized dot crossed the boundary. Hosts type
 * them with stray spaces, dots or dashes; anything malformed (fantasy
 * digits, postal codes, obsolete pre-2017 formats) counts as none. */
function statusOf(license: string, roomType: string): number {
  if (roomType === "Hotel room") return STATUS_EXEMPT;
  const text = license.trim();
  if (!text) return STATUS_NONE;
  if (/mobilit/i.test(text)) return STATUS_MOBILITY;
  if (/exempt/i.test(text)) return STATUS_EXEMPT;
  const cleaned = text.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (/^(751(0[1-9]|1[0-9]|20)|9[234]0\d{2})[0-9A-Z]{8}$/.test(cleaned))
    return STATUS_DECLARED;
  return STATUS_NONE;
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const file = await fetchCached(LISTINGS_URL, `listings-${SNAPSHOT}.csv.gz`);
  console.log(`Inside Airbnb scrape of ${SNAPSHOT}: ${file}`);

  const quantizeX = (lon: number) =>
    Math.max(0, Math.min(QUANT, Math.round(((lon - MIN_LON) / (MAX_LON - MIN_LON)) * QUANT)));
  const quantizeY = (lat: number) =>
    Math.max(0, Math.min(QUANT, Math.round(((lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * QUANT)));
  const arrIndex = new Map(ARRONDISSEMENTS.map(([name], index) => [name, index]));

  const xs: number[] = [];
  const ys: number[] = [];
  const firsts: number[] = [];
  const lasts: number[] = [];
  const reviews: number[] = [];
  const hostCounts: number[] = [];
  const prices: number[] = [];
  const statuses: number[] = [];
  const rooms: number[] = [];
  const arrs: number[] = [];

  let header: Map<string, number> | null = null;
  let col: Record<string, number> = {};
  const seen = new Set<string>();
  let skippedOutside = 0;
  let skippedBad = 0;
  const oddLicenses = new Set<string>();
  let minMonth = NEVER;
  let maxMonth = 0;

  const stream = createReadStream(file).pipe(createGunzip());
  for await (const row of csvRows(stream as unknown as Readable)) {
    if (!header) {
      header = new Map(row.map((name, index) => [name, index]));
      for (const name of [
        "id",
        "latitude",
        "longitude",
        "room_type",
        "first_review",
        "last_review",
        "number_of_reviews",
        "license",
        "calculated_host_listings_count",
        "price",
        "price_quote_price_per_night",
        "neighbourhood_cleansed",
      ]) {
        const index = header.get(name);
        if (index === undefined) throw new Error(`column ${name} missing - upstream change?`);
        col[name] = index;
      }
      continue;
    }
    if (row.length < 2) continue; // trailing blank line
    const id = row[col.id];
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const lon = +row[col.longitude];
    const lat = +row[col.latitude];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      skippedBad++;
      continue;
    }
    if (lon < MIN_LON || lon > MAX_LON || lat < MIN_LAT || lat > MAX_LAT) {
      skippedOutside++;
      continue;
    }
    const roomType = ROOM_TYPES.indexOf(row[col.room_type]);
    if (roomType < 0) throw new Error(`unknown room type "${row[col.room_type]}"`);
    const arr = arrIndex.get(row[col.neighbourhood_cleansed]);
    if (arr === undefined)
      throw new Error(`unknown arrondissement "${row[col.neighbourhood_cleansed]}"`);

    const first = monthOf(row[col.first_review]);
    const last = monthOf(row[col.last_review]);
    if (first !== NEVER) {
      if (first < minMonth) minMonth = first;
      if (last !== NEVER && last > maxMonth) maxMonth = last;
    }
    const status = statusOf(row[col.license], row[col.room_type]);
    if (status === STATUS_NONE && row[col.license].trim() && oddLicenses.size < 12)
      oddLicenses.add(row[col.license].trim().slice(0, 60));

    const priceText = row[col.price] || row[col.price_quote_price_per_night] || "";
    const price = Math.round(parseFloat(priceText.replace(/[^0-9.]/g, "")) || 0);

    xs.push(quantizeX(lon));
    ys.push(quantizeY(lat));
    firsts.push(first);
    lasts.push(last === NEVER ? first : Math.max(last, first === NEVER ? 0 : first));
    reviews.push(Math.min(65535, Math.max(0, Math.round(+row[col.number_of_reviews]) || 0)));
    hostCounts.push(
      Math.min(65535, Math.max(0, Math.round(+row[col.calculated_host_listings_count]) || 0)),
    );
    prices.push(Math.min(65535, price));
    statuses.push(status);
    rooms.push(roomType);
    arrs.push(arr);
  }

  const count = xs.length;
  const statusHist = [0, 0, 0, 0];
  for (const s of statuses) statusHist[s]++;
  const roomHist = [0, 0, 0, 0];
  for (const r of rooms) roomHist[r]++;
  const neverReviewed = firsts.filter((f) => f === NEVER).length;

  console.log(
    `Listings kept: ${count} · skipped: ${skippedOutside} outside the frame, ${skippedBad} without coordinates`,
  );
  console.log(
    `Status: declared ${statusHist[0]} (${Math.round((statusHist[0] / count) * 100)}%), ` +
      `none ${statusHist[1]} (${Math.round((statusHist[1] / count) * 100)}%), ` +
      `mobility ${statusHist[2]}, exempt ${statusHist[3]}`,
  );
  console.log(
    `Rooms: entire ${roomHist[0]} (${Math.round((roomHist[0] / count) * 100)}%), ` +
      `private ${roomHist[1]}, shared ${roomHist[2]}, hotel ${roomHist[3]}`,
  );
  console.log(
    `Reviews: never ${neverReviewed} (${Math.round((neverReviewed / count) * 100)}%), ` +
      `months ${minMonth}-${maxMonth} ` +
      `(${MONTH_EPOCH_YEAR + Math.floor(minMonth / 12)}-${(minMonth % 12) + 1} to ` +
      `${MONTH_EPOCH_YEAR + Math.floor(maxMonth / 12)}-${(maxMonth % 12) + 1})`,
  );
  if (oddLicenses.size > 0)
    console.log(`Sample licenses classified as none: ${[...oddLicenses].join(" | ")}`);

  // sanity: a Paris scrape has tens of thousands of listings, mostly entire
  // homes, with a substantial share of well-formed registration numbers
  if (count < 40_000 || count > 200_000)
    throw new Error(`suspicious listing count ${count} - upstream change?`);
  if (roomHist[0] / count < 0.5) throw new Error("entire homes below 50% - upstream change?");
  if (statusHist[0] / count < 0.2 || statusHist[0] / count > 0.95)
    throw new Error("declared share out of range - classification broken?");

  // --- emit -----------------------------------------------------------------
  const bytes = 8 + 32 + 14 * count + 3 * count;
  const buf = Buffer.alloc(bytes);
  let offset = 0;
  buf.writeUInt32LE(0x4d495241, offset); offset += 4; // "MIRA"
  buf.writeUInt32LE(count, offset); offset += 4;
  for (const v of [MIN_LON, MIN_LAT, MAX_LON, MAX_LAT]) {
    buf.writeDoubleLE(v, offset);
    offset += 8;
  }
  for (const arr16 of [xs, ys, firsts, lasts, reviews, hostCounts, prices])
    for (const v of arr16) { buf.writeUInt16LE(v, offset); offset += 2; }
  for (const arr8 of [statuses, rooms, arrs])
    for (const v of arr8) { buf.writeUInt8(v, offset); offset += 1; }
  if (offset !== bytes) throw new Error(`layout mismatch: wrote ${offset} of ${bytes}`);

  writeFileSync(path.join(OUT_DIR, "listings.bin"), buf);
  writeFileSync(
    path.join(OUT_DIR, "meta.json"),
    JSON.stringify({
      snapshot: SNAPSHOT,
      count,
      minMonth,
      maxMonth,
      neverReviewed,
      statuses: {
        declared: statusHist[0],
        none: statusHist[1],
        mobility: statusHist[2],
        exempt: statusHist[3],
      },
      rooms: {
        entire: roomHist[0],
        private: roomHist[1],
        shared: roomHist[2],
        hotel: roomHist[3],
      },
      neighbourhoods: ARRONDISSEMENTS.map(([name, number]) => ({ name, number })),
      source: "Inside Airbnb (CC BY 4.0)",
    }),
  );
  console.log(`Wrote listings.bin (${(bytes / 1e6).toFixed(1)} MB), meta.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
