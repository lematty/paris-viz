import type { Lang } from "./lang";

/** Strings for the landing page and the flux visualization. The noctilien
 * page keeps its own richer dictionary in lib/noctilien/i18n.ts. */

export const SITE: Record<
  Lang,
  {
    tagline: string;
    fluxTitle: string;
    fluxDesc: string;
    pulseTitle: string;
    pulseDesc: string;
    noctTitle: string;
    noctDesc: string;
  }
> = {
  en: {
    tagline:
      "Interactive visualizations of open data from Paris and Île-de-France.",
    fluxTitle: "Flux — the rail network in motion",
    fluxDesc:
      "The 21,000 daily métro, RER and tram trips move across the map through a full day, straight from the real timetables.",
    pulseTitle: "Pulse — station ridership",
    pulseDesc:
      "Every rail station pulsing with its hourly ticket validations — watch the morning rush flow in and the evening rush flow out.",
    noctTitle: "Noctilien — night buses",
    noctDesc:
      "Heatmap of night-bus frequency: which neighbourhoods are served after midnight, and which are not.",
  },
  fr: {
    tagline:
      "Visualisations interactives des données ouvertes de Paris et d'Île-de-France.",
    fluxTitle: "Flux — le réseau ferré en mouvement",
    fluxDesc:
      "Les 21 000 trajets quotidiens du métro, du RER et du tramway se déplacent sur la carte au fil d'une journée, d'après les horaires réels.",
    pulseTitle: "Pulse — l'affluence des gares",
    pulseDesc:
      "Chaque gare et station pulse au rythme de ses validations horaires — regardez la pointe du matin affluer et celle du soir refluer.",
    noctTitle: "Noctilien — bus de nuit",
    noctDesc:
      "Carte de chaleur de la fréquence des bus de nuit : quels quartiers sont desservis après minuit, et lesquels ne le sont pas.",
  },
};

export interface FluxStrings {
  title: string;
  loading: string;
  subtitle: (n: string, date: string) => string;
  error: (msg: string) => string;
  play: string;
  pause: string;
  speed: string;
  time: string;
  footer: string;
  sheetToggle: string;
  dayAria: string;
  days: { weekday: string; saturday: string; sunday: string };
  modes: { metro: string; rail: string; tram: string; bus: string };
}

export const FLUX: Record<Lang, FluxStrings> = {
  en: {
    title: "Flux — the rail network, replayed",
    loading: "loading timetables…",
    subtitle: (n, date) => `${n} trips from the ${date} timetable`,
    error: (msg) => `Error: ${msg}`,
    play: "Play",
    pause: "Pause",
    speed: "Speed",
    time: "Time",
    footer: "Timetables: Île-de-France Mobilités · Basemap © OpenStreetMap © CARTO",
    sheetToggle: "Expand or collapse the panel",
    dayAria: "Day type",
    days: { weekday: "Weekday", saturday: "Saturday", sunday: "Sunday" },
    modes: { metro: "Métro", rail: "RER & Transilien", tram: "Tram", bus: "Bus" },
  },
  fr: {
    title: "Flux — le réseau ferré en direct différé",
    loading: "chargement des horaires…",
    subtitle: (n, date) => `${n} trajets d'après l'horaire du ${date}`,
    error: (msg) => `Erreur : ${msg}`,
    play: "Lecture",
    pause: "Pause",
    speed: "Vitesse",
    time: "Heure",
    footer:
      "Horaires : Île-de-France Mobilités · Fond de carte © OpenStreetMap © CARTO",
    sheetToggle: "Déplier ou replier le panneau",
    dayAria: "Type de jour",
    days: { weekday: "Semaine", saturday: "Samedi", sunday: "Dimanche" },
    modes: {
      metro: "Métro",
      rail: "RER & Transilien",
      tram: "Tramway",
      bus: "Bus",
    },
  },
};

export interface PulseStrings {
  title: string;
  loading: string;
  subtitle: (n: string, start: string, end: string) => string;
  perHour: (n: string) => string;
  footer: string;
}

export const PULSE: Record<Lang, PulseStrings> = {
  en: {
    title: "Pulse — station ridership through the day",
    loading: "loading ridership data…",
    subtitle: (n, start, end) =>
      `${n} rail stations · ticket validations ${start} → ${end}`,
    perHour: (n) => `≈ ${n} validations/h`,
    footer: "Validations: Île-de-France Mobilités · Basemap © OpenStreetMap © CARTO",
  },
  fr: {
    title: "Pulse — l'affluence des gares heure par heure",
    loading: "chargement des validations…",
    subtitle: (n, start, end) =>
      `${n} gares et stations · validations ${start} → ${end}`,
    perHour: (n) => `≈ ${n} validations/h`,
    footer:
      "Validations : Île-de-France Mobilités · Fond de carte © OpenStreetMap © CARTO",
  },
};
