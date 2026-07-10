"use client";

import type { Lang } from "@/lib/lang";

const PAGES = [
  { key: "flux", href: "/flux", label: "Flux" },
  { key: "air", href: "/air", label: "Respire" },
  { key: "horizon", href: "/horizon", label: "Horizon" },
  { key: "vertige", href: "/vertige", label: "Vertige" },
  { key: "strates", href: "/strates", label: "Strates" },
  { key: "canicule", href: "/canicule", label: "Canicule" },
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
      {PAGES.filter((page) => page.key !== current).map((page, i) => (
        <span key={page.key}>
          {i > 0 && " · "}
          <a href={page.href}>{page.label}</a>
        </span>
      ))}
    </p>
  );
}
