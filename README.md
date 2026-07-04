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
| `/flux` | Every Métro 1 train moving on the map over a scheduled day (deck.gl TripsLayer, GPU-interpolated). Play/pause, speed, time slider. | `public/flow/metro1.{bin,json}` — 243 KB binary of timestamped waypoints |

Planned: all métro/RER/tram lines on `/flux`; Noctilien night-bus frequency
map (currently a [standalone project](https://github.com/lematty/noctilien)).

## Develop

```bash
pnpm install
pnpm build:flow   # regenerate flow data (downloads the IDFM GTFS on first run)
pnpm dev          # http://localhost:3000
```

## Data sources

- [IDFM GTFS](https://transport.data.gouv.fr/datasets/reseau-urbain-et-interurbain-dile-de-france-mobilites) — schedules for all Île-de-France transit (~30-day window)
- Basemap: CARTO dark tiles © OpenStreetMap contributors
