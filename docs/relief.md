# `/relief` - the ridership landscape

Live: [paris-viz.vercel.app/relief](https://paris-viz.vercel.app/relief)

![The ridership landscape at 8:30 on a weekday](../apps/site/public/relief-og.png)

Every rail station of Île-de-France (~700) rising from its real place on
the map as a golden spike, its height the station's ticket validations per
hour. Press play and the day breathes over the region: a calm sea of dots
at 3am, the morning tide at 8:30 with ranges climbing along the RER lines,
La Défense and Saint-Lazare towering over the west at 6pm, then the evening
ebb. The dark basemap keeps the geography under the data: the Seine, the
street grid, the suburbs.

## Using it

- Play/pause and a slider sweep the 24 hours of a typical day; the small
  curve above the slider shows the region-wide total and doubles as a
  scrubber (click or drag it).
- A day-type select flips between a typical weekday, Saturday and Sunday
  (hors vacances profiles): weekends flatten the morning ranges and shift
  the sea toward the afternoon.
- The story button pins 6pm on a weekday: the evening tide, La Défense at
  its highest.
- Hover a spike to name it and read its validations per hour at the current
  time; every station keeps a faint dot even when silent. Right-drag or two
  fingers to tilt and turn.
- URL params: `?t=30600&day=saturday&paused=1` (`t` in seconds of day).

## How it is built

`pnpm build:relief` (`apps/site/scripts/build-relief-data.ts`) reads three
IDFM open datasets (cached CSV exports): the daily validation counts per
stop, the hourly percentage profiles per day type, and the station registry.
Daily levels are averaged per weekday/Saturday/Sunday over the covered
quarter, multiplied by each stop's hourly profile (JOHV/SAHV/DIJFP), and the
absolute validations per hour are summed into each zone de correspondance,
joined to its registry point by `ida` = `id_ref_zdc` (97% direct match). A
few stops publish duplicated percentage rows upstream (profiles summing to
400%+), so profiles are normalized by their own sum when they overshoot.

On the client the landscape is a deck.gl spike map over the shared dark
basemap: one column per station at its true coordinates, its height the
square root of validations per hour (so the huge hubs do not crush the
rest), the hour interpolated continuously as the clock advances, and the
hottest spikes brightened. An earlier version drew an abstract ridgeline
(latitude rows, joyplot style); it looked striking but carried no
geography, so it was replaced by the map.

## Data artifacts

`public/relief/`:

- `stations.json` (~700 stations): data period, count, region peak, and per
  station its name, coordinates and three 24-value arrays of mean
  validations per hour (weekday, Saturday, Sunday).
---

[← All visualizations](../README.md) · See also: [Flux](flux.md) · [Respire](air.md) · [Horizon](horizon.md) · [Vertige](vertige.md) · [Strates](strates.md) · [Crue](crue.md) · [Canicule](canicule.md) · [Noctilien](noctilien.md)
