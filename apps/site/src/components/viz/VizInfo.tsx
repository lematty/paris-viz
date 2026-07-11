"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "@/lib/lang";
import type { VizKey } from "@/lib/vizCatalog";
import { INFO, INFO_LABELS } from "@/lib/infoStrings";

/** The "about this map" affordance of a visualization panel: a small round
 * "i" button that opens a modal card with what the map shows, how the data
 * is computed, and the datasets it is built from. Closes on backdrop click
 * or Escape. */
export default function VizInfo({ viz, lang }: { viz: VizKey; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const labels = INFO_LABELS[lang];
  const info = INFO[viz][lang];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        className="info-btn"
        title={labels.open}
        aria-label={labels.open}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        i
      </button>
      {/* portaled to body: the panel's backdrop-filter makes it a containing
          block for position: fixed, which would trap the backdrop inside it */}
      {open &&
        createPortal(
          <div className="info-backdrop" onClick={() => setOpen(false)}>
            <div
              className="info-card"
              role="dialog"
              aria-modal="true"
              aria-label={labels.heading}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="info-card-head">
                <h2>{labels.heading}</h2>
                <button
                  className="info-close"
                  aria-label={labels.close}
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>
              {info.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
              <h3>{labels.sources}</h3>
              <ul className="info-sources">
                {info.sources.map((source) => (
                  <li key={source.href}>
                    <a href={source.href} target="_blank" rel="noreferrer">
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="info-more">
                <a href="/about">{labels.more}</a>
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
