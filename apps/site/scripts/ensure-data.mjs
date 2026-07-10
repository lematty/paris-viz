/**
 * Prebuild step: generate the data artifacts if they are missing.
 *
 * Generated data is NOT committed (it would grow the repo by tens of MB
 * twice a month). Locally the artifacts persist between builds so this is a
 * no-op. On Vercel every build starts from a clean checkout and regenerates
 * everything - but the DOWNLOADS (IDFM GTFS ~160 MB, Airparif CSVs ~100 MB)
 * are cached in .next/cache, which Vercel persists between builds. That
 * makes deploys resilient to upstream outages and much faster. Cached
 * sources older than MAX_AGE_DAYS are pruned so the twice-monthly refresh
 * deploy actually fetches new data instead of reusing a stale cache.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(site, "public");

const MAX_AGE_DAYS = 5;

// explicit override > Vercel build cache > repo-root data/ (local default)
const dataCache =
  process.env.DATA_CACHE_DIR ??
  (process.env.VERCEL
    ? path.join(site, ".next", "cache", "idf-data")
    : path.join(site, "..", "..", "data"));

function pruneStale(dir) {
  if (!existsSync(dir)) return;
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pruneStale(full);
    } else if (statSync(full).mtimeMs < cutoff) {
      console.log(`[ensure-data] pruning stale cache: ${entry.name}`);
      unlinkSync(full);
    }
  }
}

const needed = [
  ...["weekday", "saturday", "sunday"].flatMap((day) => [
    `flow/${day}/metro.json`,
    `flow/${day}/rail.json`,
    `flow/${day}/tram.json`,
    `flow/${day}/bus.json`,
  ]),
  "noctilien.json",
  "air/meta.json",
  "horizon/stations.json",
  "vertige/meta.json",
  "strates/meta.json",
];
const missing = needed.filter((f) => !existsSync(path.join(pub, f)));

if (missing.length === 0) {
  console.log("[ensure-data] artifacts present - skipping generation");
} else {
  console.log(
    `[ensure-data] missing: ${missing.join(", ")} - generating (cache: ${dataCache})`,
  );
  // only the ephemeral Vercel cache is pruned; a local data/ dir is the
  // developer's own cache to manage
  if (process.env.VERCEL) pruneStale(dataCache);
  const env = { ...process.env, DATA_CACHE_DIR: dataCache };
  execSync("pnpm run build:flow", { stdio: "inherit", cwd: site, env });
  execSync("pnpm run build:noctilien", { stdio: "inherit", cwd: site, env });
  execSync("pnpm run build:air", { stdio: "inherit", cwd: site, env });
  execSync("pnpm run build:horizon", { stdio: "inherit", cwd: site, env });
  execSync("pnpm run build:vertige", { stdio: "inherit", cwd: site, env });
  execSync("pnpm run build:strates", { stdio: "inherit", cwd: site, env });
}
