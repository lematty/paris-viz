"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { NoctilienData, Stop } from "@/lib/noctilien/types";
import { STRINGS, type Lang, type Strings } from "@/lib/noctilien/i18n";
import type { MapView } from "@/lib/noctilien/urlState";
import type { LayerToggles, NightType, SearchResult } from "./App";

interface Props {
  data: NoctilienData;
  night: NightType;
  layers: LayerToggles;
  target: SearchResult | null;
  selectedLine: string | null;
  onSelectLine: (line: string | null) => void;
  lang: Lang;
  initialView: MapView | null;
  /** True when the URL restored an explicit view - the initial target pin
   * should then not steal the camera. */
  skipInitialFly: boolean;
  onViewChange: (view: MapView) => void;
}

// Perceptually-ordered "night glow" ramp (inferno-like): one ordered scale for
// one magnitude - buses per night. Low end fades into the dark basemap.
const HEAT_GRADIENT = {
  0.1: "#160b39",
  0.3: "#56106e",
  0.5: "#a52c60",
  0.7: "#e55c30",
  0.85: "#f98e09",
  1.0: "#fcffa4",
};

// Geographic glow radius per stop - roughly comfortable walking range.
const HEAT_RADIUS_M = 600;

/** 256-entry RGBA lookup table interpolated from HEAT_GRADIENT. */
function buildHeatLut(): Uint8ClampedArray {
  const stops = Object.entries(HEAT_GRADIENT)
    .map(([k, v]) => [parseFloat(k), v] as const)
    .sort((a, b) => a[0] - b[0]);
  const rgb = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let lo = stops[0];
    let hi = stops[stops.length - 1];
    for (let j = 0; j < stops.length - 1; j++) {
      if (t >= stops[j][0] && t <= stops[j + 1][0]) {
        lo = stops[j];
        hi = stops[j + 1];
        break;
      }
    }
    const frac =
      hi[0] === lo[0] ? 0 : Math.max(0, Math.min(1, (t - lo[0]) / (hi[0] - lo[0])));
    const loRgb = rgb(lo[1]);
    const hiRgb = rgb(hi[1]);
    lut[i * 4] = loRgb[0] + (hiRgb[0] - loRgb[0]) * frac;
    lut[i * 4 + 1] = loRgb[1] + (hiRgb[1] - loRgb[1]) * frac;
    lut[i * 4 + 2] = loRgb[2] + (hiRgb[2] - loRgb[2]) * frac;
    // accumulated intensity doubles as opacity, slightly boosted so the low
    // glow reads against the dark basemap
    lut[i * 4 + 3] = Math.min(255, i * 1.4);
  }
  return lut;
}

/**
 * Renders the whole heatmap once into a Web-Mercator-aligned image overlay.
 * Panning/zooming then only transforms a texture on the GPU - unlike a
 * live heat layer, which re-stamps every point and runs a per-pixel colorize
 * loop on the main thread after every map movement.
 */
function buildHeatOverlay(
  stops: Stop[],
  night: NightType,
  capDep: number,
  lut: Uint8ClampedArray,
): L.ImageOverlay {
  const activeStops = stops.filter((stop) => stop[night].dep > 0);
  let minLat = 90,
    maxLat = -90,
    minLon = 180,
    maxLon = -180;
  for (const stop of activeStops) {
    if (stop.lat < minLat) minLat = stop.lat;
    if (stop.lat > maxLat) maxLat = stop.lat;
    if (stop.lon < minLon) minLon = stop.lon;
    if (stop.lon > maxLon) maxLon = stop.lon;
  }
  const pad = 0.06; // degrees, so edge glows aren't clipped
  minLat -= pad;
  maxLat += pad;
  minLon -= pad;
  maxLon += pad;

  const mercatorY = (lat: number) =>
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const yTop = mercatorY(maxLat);
  const yBot = mercatorY(minLat);
  const width = 2048;
  const height = Math.max(
    256,
    Math.round((width * (yTop - yBot)) / (((maxLon - minLon) * Math.PI) / 180)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const mPerDegLon = 111_320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const radiusPx = (HEAT_RADIUS_M / mPerDegLon) * (width / (maxLon - minLon));
  for (const stop of activeStops) {
    // sqrt compresses the hub/branch dynamic range (~365 vs ~5 dep/night)
    // so suburban service stays visible next to the big hubs; the 0.55
    // factor leaves headroom for overlapping neighbours to accumulate
    // (alpha compositing saturates slower than additive heat stacking).
    const intensity = 0.55 * Math.min(1, Math.sqrt(stop[night].dep / capDep));
    const x = ((stop.lon - minLon) / (maxLon - minLon)) * width;
    const y = ((yTop - mercatorY(stop.lat)) / (yTop - yBot)) * height;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radiusPx);
    gradient.addColorStop(0, `rgba(0,0,0,${intensity})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radiusPx, y - radiusPx, 2 * radiusPx, 2 * radiusPx);
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const lutOffset = pixels[i + 3] * 4;
    pixels[i] = lut[lutOffset];
    pixels[i + 1] = lut[lutOffset + 1];
    pixels[i + 2] = lut[lutOffset + 2];
    pixels[i + 3] = lut[lutOffset + 3];
  }
  ctx.putImageData(imageData, 0, 0);

  return L.imageOverlay(
    canvas.toDataURL(),
    [
      [minLat, minLon],
      [maxLat, maxLon],
    ],
    { opacity: heatOpacity(12), interactive: false, pane: "heat" },
  );
}

// The heat wash is a district-level signal; as the user zooms to street
// level it would drown the basemap and the stop markers, so it fades.
function heatOpacity(zoom: number): number {
  if (zoom <= 12) return 0.9;
  if (zoom >= 16) return 0.25;
  return 0.9 - ((zoom - 12) / 4) * 0.65;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function popupHtml(
  stop: Stop,
  lineColors: Map<string, string>,
  strings: Strings,
): string {
  const badges = stop.lines
    .map(
      (line) =>
        `<button class="line-badge" data-line="${escapeHtml(line)}" title="${escapeHtml(strings.highlightLine(line))}" style="background:${lineColors.get(line) ?? "#3F2A7E"}">${escapeHtml(line)}</button>`,
    )
    .join("");
  const row = (label: string, stats: Stop["week"]) =>
    `<tr><td>${label}</td><td><strong>${stats.dep}</strong>${strings.popupPerNight}</td>` +
    `<td>${stats.headway ? strings.popupEvery(stats.headway) : strings.popupOccasional}</td></tr>`;
  return (
    `<div class="stop-popup"><strong>${escapeHtml(stop.name)}</strong>` +
    `<div class="badge-row">${badges}</div>` +
    `<table>${row(strings.popupWeek, stop.week)}${row(strings.popupWeekend, stop.weekend)}</table></div>`
  );
}

export default function NoctilienMap({
  data,
  night,
  layers,
  target,
  selectedLine,
  onSelectLine,
  lang,
  initialView,
  skipInitialFly,
  onViewChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerSetsRef = useRef<{
    week: { heat: L.ImageOverlay; stops: L.LayerGroup };
    weekend: { heat: L.ImageOverlay; stops: L.LayerGroup };
    routeLines: Map<string, L.Polyline[]>;
  } | null>(null);
  const targetRef = useRef<L.Marker | null>(null);
  // Popup badge clicks are wired through Leaflet's popupopen event (the popup
  // body is an HTML string, not React); the ref keeps the handler current.
  const onSelectLineRef = useRef(onSelectLine);
  onSelectLineRef.current = onSelectLine;
  const selectedLineRef = useRef(selectedLine);
  selectedLineRef.current = selectedLine;
  const langRef = useRef(lang);
  langRef.current = lang;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  // Consumed by the first run of the target effect (see skipInitialFly).
  const skipFlyRef = useRef(skipInitialFly);

  const lineColors = useMemo(
    () => new Map(data.routes.map((route) => [route.name, route.color])),
    [data],
  );
  // Normalize heat against the 95th-percentile stop rather than the extreme
  // hub maximum (Gare de l'Est peaks ~10× a typical stop, which would push
  // everything else into the invisible bottom of the ramp). One shared cap
  // across both night types, so toggling to weekend visibly brightens the map
  // instead of being re-normalized away.
  const capDep = useMemo(() => {
    const depCounts = data.stops
      .flatMap((stop) => [stop.week.dep, stop.weekend.dep])
      .filter((dep) => dep > 0)
      .sort((a, b) => a - b);
    return depCounts[Math.floor(depCounts.length * 0.95)] ?? 1;
  }, [data]);

  // Map and every layer variant, built once. Toggling night type or layer
  // checkboxes then only swaps prebuilt layers in and out of the map -
  // rebuilding 1637 markers on each toggle made the UI feel sluggish.
  useEffect(() => {
    const map = L.map(containerRef.current!, {
      center: initialView ? [initialView.lat, initialView.lon] : [48.859, 2.347],
      zoom: initialView?.zoom ?? 12,
      zoomControl: false,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    map.on("moveend zoomend", () => {
      const center = map.getCenter();
      onViewChangeRef.current({ zoom: map.getZoom(), lat: center.lat, lon: center.lng });
    });
    // Heat sits above tiles (200) but below vector overlays (400).
    map.createPane("heat").style.zIndex = "350";
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> · Schedules <a href="https://prim.iledefrance-mobilites.fr/">Île-de-France Mobilités</a>',
        subdomains: "abcd",
        maxZoom: 19,
      },
    ).addTo(map);

    // One shared canvas renderer: routes + both stop sets on a single
    // <canvas> instead of hundreds of SVG nodes.
    const canvas = L.canvas({ padding: 0.5 });

    const routeLines = new Map<string, L.Polyline[]>();
    for (const route of data.routes) {
      routeLines.set(
        route.name,
        route.paths.map((path) =>
          L.polyline(path, {
            renderer: canvas,
            color: route.color,
            weight: 2,
            opacity: 0.55,
            interactive: false,
          }),
        ),
      );
    }

    // Clicking a route line on the map selects it. Hit-testing happens here,
    // on click only, instead of making the polylines interactive - Leaflet's
    // canvas hover hit-testing would walk all ~10k path points on every
    // mousemove, the kind of per-frame work that made the map feel slow.
    const distToSegment = (p: L.Point, a: L.Point, b: L.Point) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };
    map.on("click", (e) => {
      let bestLine: string | null = null;
      let bestDist = 10; // px tolerance
      for (const [name, lines] of routeLines) {
        for (const line of lines) {
          if (!map.hasLayer(line)) continue;
          const points = (line.getLatLngs() as L.LatLng[]).map((latLng) =>
            map.latLngToContainerPoint(latLng),
          );
          for (let i = 0; i + 1 < points.length; i++) {
            const dist = distToSegment(e.containerPoint, points[i], points[i + 1]);
            if (dist < bestDist) {
              bestDist = dist;
              bestLine = name;
            }
          }
        }
      }
      if (bestLine) {
        onSelectLineRef.current(bestLine === selectedLineRef.current ? null : bestLine);
      }
    });

    // Clicking a line badge inside a stop popup highlights that line
    // (clicking the already-highlighted line clears it).
    map.on("popupopen", (e) => {
      e.popup
        .getElement()
        ?.querySelectorAll<HTMLElement>(".line-badge")
        .forEach((el) => {
          el.onclick = () => {
            const line = el.dataset.line ?? null;
            onSelectLineRef.current(
              line === selectedLineRef.current ? null : line,
            );
          };
        });
    });

    const lut = buildHeatLut();
    const buildNight = (night: NightType) => {
      const heat = buildHeatOverlay(data.stops, night, capDep, lut);
      const stops = L.layerGroup();
      for (const stop of data.stops) {
        if (stop[night].dep <= 0) continue;
        L.circleMarker([stop.lat, stop.lon], {
          renderer: canvas,
          radius: 2.5 + 4 * Math.min(1, Math.sqrt(stop[night].dep / capDep)),
          color: "#9fd8ff",
          weight: 1,
          opacity: 0.7,
          fillColor: "#9fd8ff",
          fillOpacity: 0.25,
          // stop clicks open the popup only - without this they'd bubble to
          // the map handler above and also toggle the line under the stop
          bubblingMouseEvents: false,
        })
          // content is a function so it renders in the current language
          .bindPopup(() => popupHtml(stop, lineColors, STRINGS[langRef.current]), {
            className: "night-popup",
          })
          .addTo(stops);
      }
      return { heat, stops };
    };

    const sets = {
      week: buildNight("week"),
      weekend: buildNight("weekend"),
      routeLines,
    };
    map.on("zoomend", () => {
      const opacity = heatOpacity(map.getZoom());
      sets.week.heat.setOpacity(opacity);
      sets.weekend.heat.setOpacity(opacity);
    });
    layerSetsRef.current = sets;
    mapRef.current = map;
    // debugging/automation handle
    (window as unknown as Record<string, unknown>).__noctilienMap = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerSetsRef.current = null;
      targetRef.current = null;
    };
    // initialView is read once at module load, so it never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, capDep, lineColors]);

  // Layer visibility and line highlighting: pure add/remove and restyling of
  // the prebuilt layers.
  useEffect(() => {
    const map = mapRef.current;
    const sets = layerSetsRef.current;
    if (!map || !sets) return;
    const sync = (layer: L.Layer, on: boolean) => {
      if (on && !map.hasLayer(layer)) layer.addTo(map);
      if (!on && map.hasLayer(layer)) layer.remove();
    };
    for (const nightType of ["week", "weekend"] as const) {
      sync(sets[nightType].heat, layers.heat && night === nightType);
      sync(sets[nightType].stops, layers.stops && night === nightType);
    }
    // A selected line is always shown, even with the Lines layer unchecked;
    // with it checked, the other lines dim so the selection stands out.
    for (const [name, lines] of sets.routeLines) {
      const isSelected = name === selectedLine;
      for (const line of lines) {
        line.setStyle({
          weight: isSelected ? 4.5 : 2,
          opacity: selectedLine ? (isSelected ? 0.95 : 0.12) : 0.55,
        });
        sync(line, layers.routes || isSelected);
        if (isSelected) line.bringToFront();
      }
    }
  });

  // Selecting a line frames it.
  useEffect(() => {
    const map = mapRef.current;
    const sets = layerSetsRef.current;
    if (!map || !sets || !selectedLine) return;
    const lines = sets.routeLines.get(selectedLine);
    if (!lines?.length) return;
    const bounds = lines[0].getBounds();
    for (const line of lines.slice(1)) bounds.extend(line.getBounds());
    map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 14, duration: 0.8 });
  }, [selectedLine]);

  // Search target: pin + fly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // On the very first run only: a target restored from the URL must not
    // fly the camera away from the URL's explicit map view.
    const skipFly = skipFlyRef.current;
    skipFlyRef.current = false;
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
    if (!skipFly) {
      map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 15), {
        duration: 1.2,
      });
    }
  }, [target]);

  return <div ref={containerRef} className="map" />;
}
