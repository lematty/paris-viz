# `/vertige` - how tall is Paris?

Live: [paris-viz.vercel.app/vertige](https://paris-viz.vercel.app/vertige)

![Every building inside the périphérique extruded to its measured height](../apps/site/public/vertige-og.png)

Every building inside the périphérique (~110,000) extruded in 3D to its
IGN-measured rooftop height, colored on an amber ramp from dark bronze sheds
to golden towers. Press play and a ceiling rises through the city: courtyard
sheds first, the Haussmann wave between 15 and 21 m, then the towers climbing
alone - Montparnasse, the Duo towers, the Tribunal, the Eiffel Tower.

## Using it

- Play/pause and a slider sweep the ceiling; the timeline is piecewise
  (0-30 m gets two thirds of it, since that is where the whole city lives).
- A mode select flips between "below the ceiling" (the city assembles) and
  "above the ceiling" (the city strips away); a direction toggle sweeps the
  ceiling back down instead, so the city appears from the towers downward.
- The story button pins "above" at 37 m: the height limit imposed on central
  Paris in 1977, leaving only churches, the grands ensembles and the towers.
- Hover a building for its height, floor count, usage, and construction year
  where known. Right-drag or two fingers to tilt and turn.
- URL params: `?t=60&mode=above&dir=down&paused=1` (`t` in clock units,
  0-90).

## How it is built

`pnpm build:vertige` (`apps/site/scripts/build-vertige-data.ts`) pages
through the Géoplateforme WFS for IGN BD TOPO buildings in the Paris
bounding box (~258,000 features), keeps in-service buildings with a measured
height (photogrammetric gutter height; a floor-count estimate fills the few
unmeasured ones), and clips them to the 20 arrondissements so the map ends
at the city limit. Footprints are quantized to a ~0.3 m grid and lightly
simplified (Douglas-Peucker), keeping courtyard holes.

On the client the whole city is one deck.gl SolidPolygonLayer; the ceiling
sweep is a `DataFilterExtension` range, i.e. a GPU uniform, so the 1.1
M-vertex geometry is tessellated and uploaded exactly once and the animation
runs at full frame rate.

## Data artifacts

`public/vertige/`:

- `meta.json` - fetch date, building count, max height, usage label table.
- `buildings.bin` (~5.5 MB), little-endian:
  - header: magic `VERT`, building/ring/vertex counts, float64 bbox
  - per building: uint16 height (decimeters), uint16 construction year
    (0 = unknown), uint8 floor count (255 = unknown), uint8 usage index,
    uint8 ring count
  - per ring: uint16 vertex count; then all vertices as uint16 x,y quantized
    to the bbox
---

[← All visualizations](../README.md) · See also: [Flux](flux.md) · [Respire](air.md) · [Horizon](horizon.md) · [Strates](strates.md) · [Canicule](canicule.md) · [Relief](relief.md) · [Noctilien](noctilien.md)
