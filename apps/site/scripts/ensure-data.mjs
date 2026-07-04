/**
 * Prebuild step: generate the data artifacts if they are missing.
 *
 * Generated data is NOT committed (it would grow the repo by ~28 MB twice a
 * month). Locally the artifacts persist between builds so this is a no-op;
 * on Vercel every build starts from a clean checkout, downloads the IDFM
 * GTFS (~160 MB) and regenerates everything (~3–5 min). The scheduled
 * refresh workflow simply triggers a redeploy.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(site, "public");

const needed = [
  ...["weekday", "saturday", "sunday"].flatMap((day) => [
    `flow/${day}/metro.json`,
    `flow/${day}/rail.json`,
    `flow/${day}/tram.json`,
    `flow/${day}/bus.json`,
  ]),
  "noctilien.json",
];
const missing = needed.filter((f) => !existsSync(path.join(pub, f)));

if (missing.length === 0) {
  console.log("[ensure-data] artifacts present — skipping generation");
} else {
  console.log(
    `[ensure-data] missing: ${missing.join(", ")} — generating (this downloads the IDFM GTFS)…`,
  );
  execSync("pnpm run build:flow", { stdio: "inherit", cwd: site });
  execSync("pnpm run build:noctilien", { stdio: "inherit", cwd: site });
}
