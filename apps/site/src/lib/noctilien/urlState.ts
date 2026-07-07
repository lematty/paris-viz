import type { NightType, SearchResult } from "@/components/noctilien/App";

export interface MapView {
  zoom: number;
  lat: number;
  lon: number;
}

export interface UrlState {
  view: MapView | null;
  night: NightType;
  line: string | null;
  target: SearchResult | null;
}

/**
 * Everything shareable lives in the hash so a pasted link restores the exact
 * situation: #map=13/48.859/2.347&night=weekend&line=N12&q=label@48.85,2.36
 */
export function parseHash(hash: string): UrlState {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const state: UrlState = {
    view: null,
    night: "week",
    line: null,
    target: null,
  };

  const mapParts = params.get("map")?.split("/");
  if (mapParts?.length === 3) {
    const [zoom, lat, lon] = mapParts.map(Number);
    if ([zoom, lat, lon].every(Number.isFinite)) state.view = { zoom, lat, lon };
  }

  if (params.get("night") === "weekend") state.night = "weekend";

  const line = params.get("line");
  if (line && /^N\d{2,3}$/.test(line)) state.line = line;

  const query = params.get("q");
  const atIndex = query?.lastIndexOf("@") ?? -1;
  if (query && atIndex > 0) {
    const [lat, lon] = query.slice(atIndex + 1).split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      state.target = { label: query.slice(0, atIndex), lat, lon };
    }
  }

  return state;
}

export function buildHash(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.view) {
    const { zoom, lat, lon } = state.view;
    params.set("map", `${zoom}/${lat.toFixed(5)}/${lon.toFixed(5)}`);
  }
  if (state.night === "weekend") params.set("night", "weekend");
  if (state.line) params.set("line", state.line);
  if (state.target) {
    params.set(
      "q",
      `${state.target.label}@${state.target.lat.toFixed(5)},${state.target.lon.toFixed(5)}`,
    );
  }
  const serialized = params.toString();
  return serialized ? `#${serialized}` : "";
}
