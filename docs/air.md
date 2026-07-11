# `/air` - a year of Paris air, hour by hour

Live: [parisviz.com/air](https://parisviz.com/air)

![NO2 veil over Île-de-France on a December evening](images/air-veil.png)

Hourly air quality (NO2 and PM2.5) from 44 Airparif monitoring stations,
2019-2025, breathing over the map as an interpolated veil that fades away
from the stations: winter evenings glow, windy days wash the map clean, and
a one-click story replays the March 2020 lockdown clearing the sky in a week.

## Using it

- Year and pollutant selectors; a scrubbable time slider over the whole year.
- Playback speeds average over widening windows (6 h/s shows raw hourly
  values; 1, 3 and 7 day/s show running means) so every speed reads at about
  one value per real second.
- Hover a station dot for its name, current value, and whether it is a
  traffic or background station.
- URL params: `?year=2025&poll=no2&t=499&paused=1` (`t` in hours since
  Jan 1 of the selected year).

## How it is built

`pnpm build:air` (`apps/site/scripts/build-air-data.ts`) downloads Airparif's
hourly station CSVs (one ArcGIS hub item per pollutant-year, no auth) and
joins station coordinates from the national LCSQA referential by normalized
station name. The client renders the veil by inverse-distance-weighting the
station values onto a coarse grid each frame, with a confidence term that
fades the veil where no station is close.

## Data artifacts

`public/air/`:

- `meta.json` - stations (name, position, traffic/background flag) and the
  available years per pollutant.
- `<poll>-<year>.bin` - one byte per station per hour: uint8 µg/m³, values
  capped at 250, 255 = missing. ~350 KB per pollutant-year.
---

[← All visualizations](../README.md) · See also: [Flux](flux.md) · [Horizon](horizon.md) · [Vertige](vertige.md) · [Strates](strates.md) · [Mirage](mirage.md) · [Crue](crue.md) · [Canicule](canicule.md) · [Relief](relief.md) · [Noctilien](noctilien.md)
