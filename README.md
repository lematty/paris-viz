# Paris Viz

Interactive visualizations of Paris / Île-de-France open data. pnpm monorepo:

```
apps/site/        Next.js site — each visualization is a route
packages/gtfs/    shared IDFM GTFS utilities (streaming parse of the 150 MB feed)
```

Every visualization follows the same pattern: **source → build script →
static artifact → page**. No database, no backend — data is precomputed by
scripts in `apps/site/scripts/` (run with tsx, consuming `@paris-viz/gtfs`)
into small static files under `apps/site/public/`, and rendered client-side.

## Visualizations

| Route | What | Data |
|---|---|---|
| `/flux` | The ~22,000 daily trains of the Île-de-France rail network (métro, RER/Transilien, tram) moving on the map over a scheduled day — deck.gl TripsLayer, official line colors, real track geometry from shapes.txt. Play/pause, speed, time slider, per-mode toggles. URL params: `?modes=metro,tram&t=30600&paused=1&speed=120`. | `public/flow/{metro,rail,tram}.{bin,json}` — 16 MB of timestamped waypoints total, lazy-loaded per mode |

Planned: buses as a fourth (heavy) mode; Noctilien night-bus frequency map
(currently a [standalone project](https://github.com/lematty/noctilien)).

## Develop

```bash
pnpm install
pnpm build:flow   # regenerate flow data (downloads the IDFM GTFS on first run)
pnpm dev          # http://localhost:3000
pnpm test         # Playwright smoke suite (basemap mocked, software-WebGL safe)
```

CI runs the smoke suite on every push and pull request. Tests pin `/flux` to
the smallest mode, paused, and assert on DOM state only — CI runners have no
GPU, so painted WebGL pixels are never asserted.

## Data sources

- [IDFM GTFS](https://transport.data.gouv.fr/datasets/reseau-urbain-et-interurbain-dile-de-france-mobilites) — schedules for all Île-de-France transit (~30-day window)
- Basemap: CARTO dark tiles © OpenStreetMap contributors
