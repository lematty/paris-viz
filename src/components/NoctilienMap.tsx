"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet.heat";
import "leaflet/dist/leaflet.css";
import type { NoctilienData, Stop } from "@/lib/types";
import type { LayerToggles, NightType, SearchResult } from "./App";

interface Props {
  data: NoctilienData;
  night: NightType;
  layers: LayerToggles;
  target: SearchResult | null;
}

// Perceptually-ordered "night glow" ramp (inferno-like): one ordered scale for
// one magnitude — buses per night. Low end fades into the dark basemap.
const HEAT_GRADIENT = {
  0.1: "#160b39",
  0.3: "#56106e",
  0.5: "#a52c60",
  0.7: "#e55c30",
  0.85: "#f98e09",
  1.0: "#fcffa4",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function popupHtml(stop: Stop, lineColors: Map<string, string>): string {
  const badges = stop.lines
    .map(
      (l) =>
        `<span class="line-badge" style="background:${lineColors.get(l) ?? "#3F2A7E"}">${esc(l)}</span>`,
    )
    .join("");
  const row = (label: string, s: Stop["week"]) =>
    `<tr><td>${label}</td><td><strong>${s.dep}</strong>/night</td>` +
    `<td>${s.headway ? `every ~${s.headway} min` : "occasional"}</td></tr>`;
  return (
    `<div class="stop-popup"><strong>${esc(stop.name)}</strong>` +
    `<div class="badge-row">${badges}</div>` +
    `<table>${row("Sun–Thu", stop.week)}${row("Fri–Sat", stop.weekend)}</table></div>`
  );
}

export default function NoctilienMap({ data, night, layers, target }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const heatRef = useRef<L.Layer | null>(null);
  const stopsRef = useRef<L.LayerGroup | null>(null);
  const routesRef = useRef<L.LayerGroup | null>(null);
  const targetRef = useRef<L.Marker | null>(null);

  const lineColors = useMemo(
    () => new Map(data.routes.map((r) => [r.name, r.color])),
    [data],
  );
  // Normalize heat against the 95th-percentile stop rather than the extreme
  // hub maximum (Gare de l'Est peaks ~10× a typical stop, which would push
  // everything else into the invisible bottom of the ramp). One shared cap
  // across both night types, so toggling to weekend visibly brightens the map
  // instead of being re-normalized away.
  const capDep = useMemo(() => {
    const deps = data.stops
      .flatMap((s) => [s.week.dep, s.weekend.dep])
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    return deps[Math.floor(deps.length * 0.95)] ?? 1;
  }, [data]);

  // Map + static route layer, once.
  useEffect(() => {
    const map = L.map(containerRef.current!, {
      center: [48.859, 2.347],
      zoom: 12,
      zoomControl: false,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> · Schedules <a href="https://prim.iledefrance-mobilites.fr/">Île-de-France Mobilités</a>',
        subdomains: "abcd",
        maxZoom: 19,
      },
    ).addTo(map);

    const routes = L.layerGroup();
    for (const r of data.routes) {
      for (const path of r.paths) {
        L.polyline(path, {
          color: r.color,
          weight: 2,
          opacity: 0.55,
          interactive: false,
        }).addTo(routes);
      }
    }
    routesRef.current = routes;
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      heatRef.current = null;
      stopsRef.current = null;
      routesRef.current = null;
      targetRef.current = null;
    };
  }, [data]);

  // Heat + stop layers, rebuilt when the night type changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    heatRef.current?.remove();
    stopsRef.current?.remove();

    const points = data.stops
      .filter((s) => s[night].dep > 0)
      // sqrt compresses the hub/branch dynamic range (~365 vs ~5 dep/night)
      // so suburban service stays visible next to the big hubs.
      // The 0.4 factor leaves headroom: neighbouring stops on the same
      // corridor overlap and sum, so only genuinely frequent corridors
      // reach the bright end instead of everything saturating.
      .map(
        (s) =>
          [s.lat, s.lon, 0.4 * Math.min(1, Math.sqrt(s[night].dep / capDep))] as [
            number,
            number,
            number,
          ],
      );
    heatRef.current = L.heatLayer(points, {
      radius: 18,
      blur: 15,
      max: 1,
      // leaflet.heat scales intensity by 2^(zoom - maxZoom); left at the
      // map's maxZoom (19) the layer is ~1/128 strength at city zoom.
      maxZoom: 11,
      gradient: HEAT_GRADIENT,
    });

    const renderer = L.canvas({ padding: 0.5 });
    const stops = L.layerGroup();
    for (const s of data.stops) {
      if (s[night].dep <= 0) continue;
      L.circleMarker([s.lat, s.lon], {
        renderer,
        radius: 2.5 + 4 * Math.min(1, Math.sqrt(s[night].dep / capDep)),
        color: "#9fd8ff",
        weight: 1,
        opacity: 0.7,
        fillColor: "#9fd8ff",
        fillOpacity: 0.25,
      })
        .bindPopup(popupHtml(s, lineColors), { className: "night-popup" })
        .addTo(stops);
    }
    stopsRef.current = stops;
  }, [data, night, capDep, lineColors]);

  // Layer visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sync = (layer: L.Layer | null, on: boolean) => {
      if (!layer) return;
      if (on && !map.hasLayer(layer)) layer.addTo(map);
      if (!on && map.hasLayer(layer)) layer.remove();
    };
    sync(heatRef.current, layers.heat);
    sync(stopsRef.current, layers.stops);
    sync(routesRef.current, layers.routes);
  });

  // Search target: pin + fly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    targetRef.current?.remove();
    targetRef.current = null;
    if (!target) return;
    targetRef.current = L.marker([target.lat, target.lon], {
      icon: L.divIcon({
        className: "target-pin",
        html: '<div class="target-pin-dot"></div><div class="target-pin-pulse"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    })
      .bindTooltip(target.label, { direction: "top", offset: [0, -10] })
      .addTo(map);
    map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 15), {
      duration: 1.2,
    });
  }, [target]);

  return <div ref={containerRef} className="map" />;
}
