# Paris Viz

Interactive visualizations of Paris / Île-de-France open data. pnpm monorepo:

```
apps/site/        Next.js site - each visualization is a route
packages/gtfs/    shared IDFM GTFS utilities (streaming parse of the 150 MB feed)
```

Every visualization follows the same pattern: **source → build script →
static artifact → page**. No database, no backend - data is precomputed by
scripts in `apps/site/scripts/` (run with tsx, consuming `@paris-viz/gtfs`)
into small static files under `apps/site/public/`, and rendered client-side.

## Visualizations

### `/flux` - the transit network in motion

![Every métro and tram of Île-de-France moving at 08:45](apps/site/public/og.png)

Every scheduled trip of the Île-de-France network moving on the map over one
service day: ~20,000 métro / RER / Transilien / tram trips as glowing comets
(deck.gl TripsLayer, official line colors, real track geometry from
shapes.txt), plus **90,000 bus trips** as an opt-in fourth mode. Play/pause,
speed, time slider, hover a train for its line, click a line chip to solo it.
URL params: `?modes=metro,tram,bus&t=30600&paused=1&speed=120`.

![90,000 daily buses at morning rush](docs/flux-buses.png)

Data: `public/flow/{metro,rail,tram}.{bin,json}` - float32 timestamped
waypoints, lazy-loaded per mode (~15 MB total). Buses use a tighter format
(`bus.json` + `bus-<hour>.bin`): straight stop-to-stop paths, uint16-quantized
positions (~4 m grid) and 2-second time steps, one chunk per start hour -
12 MB for the whole day, of which the page only ever holds a 3-hour sliding
window (~1.5 MB).

### `/air` - a year of Paris air, hour by hour

Hourly air quality (NO2 and PM2.5) from 44 Airparif monitoring stations,
2019-2025, breathing over the map as an interpolated veil that fades away
from the stations. Year and pollutant selectors, a scrubbable yearly curve,
and a one-click story: watch the March 2020 lockdown clear the sky. Sources:
Airparif hourly station CSVs + the national LCSQA station referential.
Data: `public/air/` - meta + one ~350 KB binary per pollutant-year
(`pnpm build:air`).

### `/noctilien` - night-bus frequency

![Noctilien frequency heatmap](apps/site/public/noctilien-og.png)

Heatmap of Noctilien night-bus service (~00:30–05:30): departures per night
around every stop, weeknight vs Fri–Sat toggle, address search with nearest
stops and walking times, line highlighting. Migrated from the
[standalone repo](https://github.com/lematty/noctilien) with its full git
history. Data: `public/noctilien.json` - 641 KB (`pnpm build:noctilien`).

## Develop

```bash
pnpm install
pnpm build             # generates missing data artifacts, then next build
pnpm dev               # http://localhost:3000 (run `pnpm build:flow` +
                       # `pnpm build:noctilien` once first to create the data)
pnpm test              # Playwright smoke suites (external services mocked)
```

**Data artifacts are not committed.** `apps/site/scripts/ensure-data.mjs`
generates them during the build when missing. On Vercel the source downloads
(IDFM GTFS ~160 MB, Airparif CSVs) are cached in `.next/cache` between
builds, so ordinary deploys skip the downloads and survive upstream outages;
cached sources older than 5 days are re-fetched, which is what makes the
twice-monthly refresh pick up new data. The
scheduled workflow (`.github/workflows/refresh-data.yml`) just pings a Vercel
Deploy Hook on the 1st and 15th - the feed only covers ~30 days. It needs the
`VERCEL_DEPLOY_HOOK` repository secret (Vercel → Settings → Git → Deploy
Hooks). CI caches the GTFS zip per month.

CI runs the smoke suite on every push and pull request. Tests pin `/flux` to
the smallest mode, paused, and assert on DOM state only - CI runners have no
GPU, so painted WebGL pixels are never asserted.

## Data sources

- [IDFM GTFS](https://transport.data.gouv.fr/datasets/reseau-urbain-et-interurbain-dile-de-france-mobilites) - schedules for all Île-de-France transit (~30-day window)
- Basemap: CARTO dark tiles © OpenStreetMap contributors
