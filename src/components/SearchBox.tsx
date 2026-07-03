"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "./App";

interface AddressFeature {
  properties: { label: string };
  geometry: { coordinates: [number, number] };
}

export default function SearchBox({
  onSelect,
}: {
  onSelect: (r: SearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  // Choosing a result writes its label back into the input; that change must
  // not trigger a new search that would reopen the dropdown.
  const skipSearchRef = useRef(false);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        // National address base; lat/lon bias ranks Paris-region hits first.
        const url =
          "https://api-adresse.data.gouv.fr/search/?limit=5&autocomplete=1" +
          "&lat=48.86&lon=2.35&q=" +
          encodeURIComponent(query);
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const json: { features: AddressFeature[] } = await res.json();
        // The API can return several rows with an identical label; they are
        // indistinguishable in the dropdown (and would collide as React keys),
        // so keep only the first of each.
        const seen = new Set<string>();
        setResults(
          json.features
            .filter((f) => {
              if (seen.has(f.properties.label)) return false;
              seen.add(f.properties.label);
              return true;
            })
            .map((f) => ({
              label: f.properties.label,
              lon: f.geometry.coordinates[0],
              lat: f.geometry.coordinates[1],
            })),
        );
        setHighlight(0);
        setOpen(true);
      } catch {
        // aborted or offline — keep whatever is shown
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const choose = (r: SearchResult) => {
    skipSearchRef.current = true;
    onSelect(r);
    setQuery(r.label);
    setResults([]);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h + results.length - 1) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="searchbox" ref={boxRef}>
      <input
        type="search"
        placeholder="Search an address… (e.g. 10 rue de Rivoli)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Search an address"
      />
      {open && results.length > 0 && (
        <ul className="search-results" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.label}
              role="option"
              aria-selected={i === highlight}
              className={i === highlight ? "highlighted" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
