# `/horizon` - how far can you get?

Live: [paris-viz.vercel.app/horizon](https://paris-viz.vercel.app/horizon)

![75 minutes of travel from Châtelet - Les Halles, in 15-minute bands](../apps/site/public/horizon-og.png)

Animated isochrones over the rail network: pick any of ~940 stations and
watch 75 minutes of travel ripple outward in 15-minute color bands - métro,
RER, Transilien and tram, walking included. A story button replays the same
75 minutes from Torcy, at the edge of the network, for contrast.

## Using it

- Click any station (or search by name) to re-root the wave there.
- Play/pause, speed, and a budget slider from 0 to 75 minutes.
- URL params: `?from=Nation&t=45&paused=1` (`t` in minutes of travel budget).

## The travel-time model

The build models average conditions rather than a single departure, which is
what an isochrone should show:

- Riding time between consecutive stops is the **median scheduled run time**.
- Boarding a line costs **half its daytime headway** (07:00-20:00 departure
  counts, capped at 15 minutes for sparse branches).
- Transfers use `transfers.txt` walk times, plus a proximity fallback:
  stations within 500 m are walkable at 1.2 m/s with a 2-minute orientation
  penalty.
- One Dijkstra per station over that graph produces an all-pairs
  station-to-station matrix.

On the client, the selected station's matrix row is splatted as walking
cones (80 m/min, up to 15 minutes at the destination end) onto a
mercator-aligned grid; playback then only recolors that field, so the
animation stays cheap.

## Data artifacts

`public/horizon/` (`pnpm build:horizon`):

- `stations.json` - station names, positions, mode bitmask (1 métro,
  2 RER/Transilien, 4 tram), and the timetable date.
- `matrix.bin` - N×N uint8 minutes from station i to station j, row-major,
  255 = out of reach (~870 KB for 943 stations).
---

[← All visualizations](../README.md) · See also: [Flux](flux.md) · [Respire](air.md) · [Vertige](vertige.md) · [Strates](strates.md) · [Canicule](canicule.md) · [Noctilien](noctilien.md)
