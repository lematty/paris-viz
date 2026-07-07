import type { Stop } from "./types";

const EARTH_R = 6_371_000;

export function haversineMeters(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(haversine));
}

export interface StopWithDistance extends Stop {
  distanceM: number;
}

export function nearestStops(
  stops: Stop[],
  lat: number,
  lon: number,
  count = 5,
  maxMeters = 1500,
): StopWithDistance[] {
  return stops
    .map((stop) => ({ ...stop, distanceM: haversineMeters(lat, lon, stop.lat, stop.lon) }))
    .filter((stop) => stop.distanceM <= maxMeters)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, count);
}
