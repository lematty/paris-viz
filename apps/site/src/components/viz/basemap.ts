import { TileLayer, type GeoBoundingBox } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";

/** The CARTO dark basemap used by every deck.gl visualization. */
export function createBasemapLayer() {
  return new TileLayer({
    id: "basemap",
    data: [
      "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    ],
    maxZoom: 19,
    tileSize: 256,
    renderSubLayers: (props) => {
      const { west, south, east, north } = props.tile.bbox as GeoBoundingBox;
      return new BitmapLayer(props, {
        data: undefined,
        image: props.data,
        bounds: [west, south, east, north],
      });
    },
  });
}

export const DECK_TOOLTIP_STYLE = {
  background: "#101828",
  color: "#e6e8ee",
  fontSize: "12px",
  borderRadius: "6px",
  padding: "4px 8px",
};
