# `/canicule` - the heat island

Live: [parisviz.com/canicule](https://parisviz.com/canicule)

![Night heat hazard over Paris and the petite couronne](../apps/site/public/canicule-og.png)

Every urban morphological block of Paris and the petite couronne (~39,000)
scored for its heat-island behavior by the Institut Paris Region: which
neighbourhoods overheat, which never cool down after dark, and who the heat
endangers. The dense mineral city glows on the night map while the Bois, the
cemeteries and the Seine stay cool; the gaps between blocks are the streets.

## Using it

- A day/night toggle flips the moment: the day map follows sun exposure, the
  night map shows the heat the city fails to release, which is what makes
  heatwaves deadly.
- A variable select flips between the heat hazard (how much the block itself
  overheats: its shape, minerality and masked sky trap the day's heat) and
  vulnerability (how exposed its residents are, from sensitivity and
  incapacity indicators).
- The story button jumps to night vulnerability: not where it is hottest,
  but who cannot escape it. Blocks without a population score stay dark
  gray in vulnerability view.
- Hover a block for its local climate zone (LCZ), its hazard and
  vulnerability notes, and its built/permeable shares.
- URL param: `?vue=alea-nuit` (default), `alea-jour`, `vuln-nuit`,
  `vuln-jour`.

## How it is built

`pnpm build:canicule` (`apps/site/scripts/build-canicule-data.ts`) fetches
the Institut Paris Region ICU dataset (Licence Ouverte v2.0) from the
regional open data portal as tiled GeoJSON exports, keeps the blocks whose
centroid falls inside a petite couronne commune (contours from
geo.api.gouv.fr), and packs per block: the day and night heat-hazard notes,
the day and night vulnerability notes, the local climate zone (LCZ, 17
classes), and the built, permeable and mean-height figures. Footprints are
quantized to a ~0.65 m grid and lightly simplified.

On the client the whole map is one flat deck.gl SolidPolygonLayer; switching
variable or moment only re-evaluates the fill colors, with a short
transition. The hazard scale is a thermal-camera ramp, dark violet through
wine and vermilion to incandescent yellow: monotone in lightness (the
ordering stays readable under color-vision deficiencies, and the hot city
glows on the dark basemap) with the red band that heat iconography expects.

## Data artifacts

`public/canicule/`:

- `meta.json` - fetch date, block count, LCZ table, note range.
- `blocks.bin` (~2.3 MB), little-endian:
  - header: magic `CANI`, block/ring/vertex counts, float64 bbox
  - per block: int8 day hazard note, int8 night hazard note, uint8 day
    vulnerability, uint8 night vulnerability (0 = not scored), uint8 LCZ
    index, uint8 built %, uint8 permeable %, uint8 mean height (m), uint8
    ring count
  - per ring: uint16 vertex count; then all vertices as uint16 x,y quantized
    to the bbox
---

[← All visualizations](../README.md) · See also: [Flux](flux.md) · [Respire](air.md) · [Horizon](horizon.md) · [Vertige](vertige.md) · [Strates](strates.md) · [Mirage](mirage.md) · [Crue](crue.md) · [Relief](relief.md) · [Noctilien](noctilien.md) · [Logis](logis.md)
