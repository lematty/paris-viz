"use client";

import type { Lang } from "@/lib/lang";

const PAGES = [
  { key: "flux", href: "/flux", label: "Flux" },
  { key: "air", href: "/air", label: "Respire" },
  { key: "horizon", href: "/horizon", label: "Horizon" },
  { key: "noctilien", href: "/noctilien", label: "Noctilien" },
] as const;

export type VizKey = (typeof PAGES)[number]["key"];

/** Cross-links between the visualizations, shown above each panel footer. */
export default function VizLinks({
  current,
  lang,
}: {
  current: VizKey;
  lang: Lang;
}) {
  return (
    <p className="viz-links sheet-hide">
      {lang === "fr" ? "Voir aussi : " : "See also: "}
      {PAGES.filter((p) => p.key !== current).map((p, i) => (
        <span key={p.key}>
          {i > 0 && " · "}
          <a href={p.href}>{p.label}</a>
        </span>
      ))}
    </p>
  );
}
