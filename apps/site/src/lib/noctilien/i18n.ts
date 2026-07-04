export { loadLang, saveLang } from "../lang";
export type { Lang } from "../lang";
import type { Lang } from "../lang";

const en = {
  subtitle: "night-bus frequency",
  hint: "How often a night bus (~00:30–05:30) passes near each point of Île-de-France. Bright = frequent service; dark = long waits or no coverage.",
  searchPlaceholder: "Search an address… (e.g. 10 rue de Rivoli)",
  searchAria: "Search an address",
  locate: "Use my location",
  myLocation: "My location",
  sheetToggle: "Expand or collapse the panel",
  weekNights: "Sun–Thu nights",
  weekendNights: "Fri–Sat nights",
  nightAria: "Night type",
  heatmap: "Heatmap",
  stops: "Stops",
  lines: "Lines",
  fewBuses: "few buses / night",
  many: "many",
  lineHighlighted: "line highlighted",
  clearLine: "Clear line highlight",
  highlightLine: (l: string) => `Highlight line ${l}`,
  nearTitle: (q: string) => `Noctilien near “${q}”`,
  clearSearch: "Clear search result",
  noStop:
    "No Noctilien stop within 1.5 km - this area is not covered by the night-bus network.",
  minWalk: "min walk",
  busEvery: (n: number) => `a bus every ~${n} min`,
  busesPerNight: (n: number) => `${n} bus${n >= 2 ? "es" : ""}/night`,
  footer: (start: string, end: string) =>
    `Schedules: Île-de-France Mobilités open data, ${start} → ${end} · Geocoding: adresse.data.gouv.fr`,
  popupWeek: "Sun–Thu",
  popupWeekend: "Fri–Sat",
  popupPerNight: "/night",
  popupEvery: (n: number) => `every ~${n} min`,
  popupOccasional: "occasional",
};

export type Strings = typeof en;

export const STRINGS: Record<Lang, Strings> = {
  en,
  fr: {
    subtitle: "fréquence des bus de nuit",
    hint: "À quelle fréquence un Noctilien (~00h30–05h30) passe près de chaque point d'Île-de-France. Lumineux = passages fréquents ; sombre = longue attente ou aucune desserte.",
    searchPlaceholder: "Chercher une adresse… (ex. 10 rue de Rivoli)",
    searchAria: "Chercher une adresse",
    locate: "Utiliser ma position",
    myLocation: "Ma position",
    sheetToggle: "Déplier ou replier le panneau",
    weekNights: "Nuits dim–jeu",
    weekendNights: "Nuits ven–sam",
    nightAria: "Type de nuit",
    heatmap: "Chaleur",
    stops: "Arrêts",
    lines: "Lignes",
    fewBuses: "peu de bus / nuit",
    many: "beaucoup",
    lineHighlighted: "ligne surlignée",
    clearLine: "Retirer le surlignage",
    highlightLine: (l: string) => `Surligner la ligne ${l}`,
    nearTitle: (q: string) => `Noctilien près de « ${q} »`,
    clearSearch: "Effacer la recherche",
    noStop:
      "Aucun arrêt Noctilien à moins de 1,5 km - cette zone n'est pas desservie par le réseau de nuit.",
    minWalk: "min à pied",
    busEvery: (n: number) => `un bus toutes les ~${n} min`,
    busesPerNight: (n: number) => `${n} bus/nuit`,
    footer: (start: string, end: string) =>
      `Horaires : données ouvertes Île-de-France Mobilités, ${start} → ${end} · Géocodage : adresse.data.gouv.fr`,
    popupWeek: "dim–jeu",
    popupWeekend: "ven–sam",
    popupPerNight: "/nuit",
    popupEvery: (n: number) => `toutes les ~${n} min`,
    popupOccasional: "occasionnel",
  },
};

