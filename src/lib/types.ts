/** Frequency stats for one night type at one stop. */
export interface NightStats {
  /** Average Noctilien departures per night (any line, any direction). */
  dep: number;
  /** Average minutes between consecutive buses, null if fewer than 2 buses/night. */
  headway: number | null;
}

export interface Stop {
  name: string;
  lat: number;
  lon: number;
  /** Route short names serving this stop, e.g. ["N01", "N12"]. */
  lines: string[];
  /** Sunday–Thursday nights. */
  week: NightStats;
  /** Friday and Saturday nights. */
  weekend: NightStats;
}

export interface Route {
  name: string;
  color: string;
  /** One simplified polyline per direction: [[lat, lon], ...]. */
  paths: [number, number][][];
}

export interface NoctilienData {
  generatedAt: string;
  /** Feed validity window, YYYY-MM-DD. */
  feedWindow: { start: string; end: string };
  /** Number of nights of each type in the window (denominators for averages). */
  nights: { week: number; weekend: number };
  stops: Stop[];
  routes: Route[];
}
