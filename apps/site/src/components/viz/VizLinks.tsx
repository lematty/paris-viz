"use client";

import type { Lang } from "@/lib/lang";
import { THEMES, type VizKey } from "@/lib/vizCatalog";

export type { VizKey };

/** Cross-links between the visualizations, grouped by theme like the
 * landing page, shown above each panel footer. */
export default function VizLinks({
  current,
  lang,
}: {
  current: VizKey;
  lang: Lang;
}) {
  return (
    <div className="viz-links sheet-hide">
      <p className="viz-links-head">
        {lang === "fr" ? "Voir aussi" : "See also"}
      </p>
      {THEMES.map((theme) => {
        const others = theme.vizzes.filter((viz) => viz.key !== current);
        if (others.length === 0) return null;
        return (
          <p className="viz-links-row" key={theme.key}>
            <span className="viz-links-theme">{theme.label}</span>
            <span>
              {others.map((viz, i) => (
                <span key={viz.key}>
                  {i > 0 && " · "}
                  <a href={viz.href}>{viz.label}</a>
                </span>
              ))}
            </span>
          </p>
        );
      })}
    </div>
  );
}
