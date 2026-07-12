/** The atlas catalog: every visualization with its theme, in display order.
 * Single source of truth for the landing-page sections and the cross-links
 * under each visualization panel (VizLinks). Titles and descriptions stay
 * in siteStrings; labels here are the route names, identical in both
 * languages. Thumbnails live at /thumbs/<key>.png. */

export const THEMES = [
  {
    key: "mouvement",
    label: "Mouvement",
    vizzes: [
      { key: "flux", href: "/flux", label: "Flux" },
      { key: "horizon", href: "/horizon", label: "Horizon" },
      { key: "relief", href: "/relief", label: "Relief" },
      { key: "noctilien", href: "/noctilien", label: "Noctilien" },
    ],
  },
  {
    key: "matiere",
    label: "Matière",
    vizzes: [
      { key: "vertige", href: "/vertige", label: "Vertige" },
      { key: "strates", href: "/strates", label: "Strates" },
      { key: "mirage", href: "/mirage", label: "Mirage" },
    ],
  },
  {
    key: "elements",
    label: "Éléments",
    vizzes: [
      { key: "air", href: "/air", label: "Respire" },
      { key: "crue", href: "/crue", label: "Crue" },
      { key: "canicule", href: "/canicule", label: "Canicule" },
    ],
  },
  {
    key: "societe",
    label: "Société",
    vizzes: [{ key: "logis", href: "/logis", label: "Logis" }],
  },
] as const;

export type ThemeKey = (typeof THEMES)[number]["key"];
export type VizKey = (typeof THEMES)[number]["vizzes"][number]["key"];
