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
  story: "✦ The last métro has left",
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
  highlightLine: (line: string) => `Highlight line ${line}`,
  nearTitle: (query: string) => `Noctilien near “${query}”`,
  clearSearch: "Clear search result",
  noStop:
    "No Noctilien stop within 1.5 km - this area is not covered by the night-bus network.",
  minWalk: "min walk",
  busEvery: (minutes: number) => `a bus every ~${minutes} min`,
  busesPerNight: (count: number) => `${count} bus${count >= 2 ? "es" : ""}/night`,
  footer: (start: string, end: string) =>
    `Schedules: Île-de-France Mobilités open data, ${start} → ${end} · Geocoding: adresse.data.gouv.fr`,
  popupWeek: "Sun–Thu",
  popupWeekend: "Fri–Sat",
  popupPerNight: "/night",
  popupEvery: (minutes: number) => `every ~${minutes} min`,
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
    story: "✦ Le dernier métro est parti",
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
    highlightLine: (line: string) => `Surligner la ligne ${line}`,
    nearTitle: (query: string) => `Noctilien près de « ${query} »`,
    clearSearch: "Effacer la recherche",
    noStop:
      "Aucun arrêt Noctilien à moins de 1,5 km - cette zone n'est pas desservie par le réseau de nuit.",
    minWalk: "min à pied",
    busEvery: (minutes: number) => `un bus toutes les ~${minutes} min`,
    busesPerNight: (count: number) => `${count} bus/nuit`,
    footer: (start: string, end: string) =>
      `Horaires : données ouvertes Île-de-France Mobilités, ${start} → ${end} · Géocodage : adresse.data.gouv.fr`,
    popupWeek: "dim–jeu",
    popupWeekend: "ven–sam",
    popupPerNight: "/nuit",
    popupEvery: (minutes: number) => `toutes les ~${minutes} min`,
    popupOccasional: "occasionnel",
  },
};

