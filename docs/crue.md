# `/crue` - the Seine rising

Live: [parisviz.com/crue](https://parisviz.com/crue)

![The 1910 flood level over the 3D city](../apps/site/public/crue-og.png)

Raise the Seine through the 3D city, centimeter by centimeter, over the real
IGN terrain: the river stays in its bed until the quays go under around 6 m
on the Austerlitz gauge (June 2016), and at 8.62 m the flood of January 1910
returns, one fifth of the frame under water. Buildings turn steel blue as
their street floods.

## Using it

- Play raises the water; the slider is the Austerlitz gauge, from 1 m to
  9 m, and dragging it back drains the city.
- The clock names the historical floods as the water passes them: January
  1910 (8.62 m), January 1955 (7.12 m), December 1982 (6.15 m), June 2016
  (6.10 m), January 2018 (5.85 m). The story button jumps to 1910, then
  offers 2016.
- When the Hub'Eau API answers, a second button shows the Seine's level
  right now, fetched in your browser, and jumps the water there.
- Hover a building for its height and the gauge at which its street floods.
- URL params: `?g=6.1&paused=1` (`g` in gauge meters).

## How it is built

`pnpm build:crue` (`apps/site/scripts/build-crue-data.ts`) fetches the IGN
RGE ALTI terrain as raw 32-bit float tiles from the Geoplateforme WMS (~10 m
grid over the vertige frame), then runs a priority flood seeded in the river:
for every cell, the water level at which it becomes reachable from the Seine,
so basins behind higher ground stay dry until the water can actually get
around. Gauge heights convert through the Austerlitz scale zero (25.92 m NGF
IGN69). Marching squares turn the reachability grid into extent polygons
every 25 cm of gauge (the flood is one connected polygon whose holes are the
dry islands: at 1 m they are literally Île de la Cité and Île Saint-Louis),
simplified and quantized to the shared frame.

The model sanity-checks against history: at 8.62 m it floods 20% of the
frame, the documented fifth of Paris in 1910. It remains a visualization,
not a forecast: the 10 m terrain smooths quay parapets, and protection works
and the underground are ignored.

On the client the water is one translucent extruded polygon per level over
the vertige buildings; buildings sample the reachability grid at their
centroid to know their own flooding gauge, shown in the tooltip.

## Data artifacts

`public/crue/`:

- `meta.json` - frame, gauge zero, historical marks, level table.
- `water.bin` (~0.4 MB) - extent polygons per 0.25 m step, with holes.
- `grid.bin` (~0.5 MB) - per-cell flooding gauge in decimeters, half the DEM
  resolution, for the building tint and the tooltip.
---

[← All visualizations](../README.md) · See also: [Flux](flux.md) · [Respire](air.md) · [Horizon](horizon.md) · [Vertige](vertige.md) · [Strates](strates.md) · [Canicule](canicule.md) · [Relief](relief.md) · [Noctilien](noctilien.md)
