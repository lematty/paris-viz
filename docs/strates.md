# `/strates` - how old is Paris?

Live: [paris-viz.vercel.app/strates](https://paris-viz.vercel.app/strates)

![Every building inside the périphérique colored by construction period](../apps/site/public/strates-og.png)

Every built footprint inside the périphérique (~128,000) extruded in 3D and
colored by construction period, on a rose ramp from dark wine (before 1800)
to pale rose (since 2000). Press play and the city assembles year by year:
the medieval core along the Seine, the faubourgs, the 1851-1914 explosion
that built almost half of today's Paris, then the concrete century filling
the edges.

## Using it

- Play/pause and a slider sweep the year from 1600 to today; the timeline is
  piecewise (1850-1914 gets more than a third of it, since that is when half
  the city was built).
- A mode select flips between "already built" (the city assembles) and
  "built after" (only what came later remains); a direction toggle rewinds
  the sweep, stripping the city back to its oldest layers.
- The story button pins 1914: the Belle Époque city, half of today's Paris
  already standing. Frozen there, it flips to offer everything built after.
- Hover a building for its construction year (or period, when only the
  period is known) and its height. Undated buildings (~6%) stay slate gray
  and are visible from the start. Right-drag or two fingers to tilt and
  turn.
- URL params: `?t=60&mode=after&dir=back&paused=1` (`t` in clock units,
  0-90; 24 = 1850, 60 = 1914).

## How it is built

`pnpm build:strates` (`apps/site/scripts/build-strates-data.ts`) pages
through the Apur ArcGIS server for the "emprise bâtie décomposée" layer of
Paris (~128,000 footprints, ODbL), keeps every footprint with a measured
height (the median MNE height, `h_med`), and packs the construction year
(`an_const`, known for 63%) plus the Apur period band (`c_perconst`, 11
bands, known for 94%). The dating merges the Loyer facade survey for
pre-1940 buildings, DGFiP fiscal files, building permits and Apur field
surveys. Footprints are quantized to a ~0.3 m grid and lightly simplified
(Douglas-Peucker), keeping courtyard holes.

On the client the whole city is one deck.gl SolidPolygonLayer; the year
sweep is a `DataFilterExtension` range, i.e. a GPU uniform, so the 1.2
M-vertex geometry is tessellated and uploaded exactly once. Buildings with
only a period band get a deterministic year spread inside their band, so
they trickle in during the sweep instead of popping at band edges; tooltips
only ever show the real attribute. The 11 Apur bands are merged into 7
display colors along their own edges.

## Data artifacts

`public/strates/`:

- `meta.json` - fetch date, footprint count, undated count, period band
  table, year maximum.
- `buildings.bin` (~5.9 MB), little-endian:
  - header: magic `STRA`, building/ring/vertex counts, float64 bbox
  - per building: uint16 construction year (0 = unknown), uint16 height
    (decimeters), uint8 period band index (255 = undated), uint8 ring count
  - per ring: uint16 vertex count; then all vertices as uint16 x,y quantized
    to the bbox
---

[← All visualizations](../README.md) · See also: [Flux](flux.md) · [Respire](air.md) · [Horizon](horizon.md) · [Vertige](vertige.md) · [Noctilien](noctilien.md)
