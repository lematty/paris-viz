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
    aboutTitle: string;
    aboutBody: string;
    aboutRefresh: string;
  }
> = {
  en: {
    tagline:
      "Interactive visualizations of open data from Paris and Île-de-France.",
    fluxTitle: "Flux - the transit network in motion",
    fluxDesc:
      "Every scheduled trip of a full day moves across the map: 20,000 métro, RER and tram runs, plus 90,000 buses one checkbox away.",
    pulseTitle: "Relief - the ridership landscape",
    pulseDesc:
      "Île-de-France as a living mountain range: every station is a peak rising and falling with its hourly ticket validations, drawn as pure lines.",
    noctTitle: "Noctilien - night buses",
    noctDesc:
      "Heatmap of night-bus frequency: which neighbourhoods are served after midnight, and which are not.",
    aboutTitle: "About the data",
    aboutBody:
      "Everything on this site is built from open data: scheduled timetables (GTFS) and ticket validation counts published by Île-de-France Mobilités, station and stop locations from the same portal, and the national address base for geocoding. Nothing is tracked and there is no backend: each visualization is precomputed into a static file, and each page shows the exact period its data covers.",
    aboutRefresh:
      "Data is regenerated automatically twice a month, since published timetables only cover about 30 days ahead.",
  },
  fr: {
    tagline:
      "Visualisations interactives des données ouvertes de Paris et d'Île-de-France.",
    fluxTitle: "Flux - le réseau en mouvement",
    fluxDesc:
      "Tous les trajets d'une journée se déplacent sur la carte : 20 000 courses de métro, RER et tramway, et 90 000 bus en option.",
    pulseTitle: "Relief - le paysage de l'affluence",
    pulseDesc:
      "L'Île-de-France en chaîne de montagnes vivante : chaque gare est un pic qui monte et descend au rythme de ses validations horaires, en lignes pures.",
    noctTitle: "Noctilien - bus de nuit",
    noctDesc:
      "Carte de chaleur de la fréquence des bus de nuit : quels quartiers sont desservis après minuit, et lesquels ne le sont pas.",
    aboutTitle: "À propos des données",
    aboutBody:
      "Tout ce site repose sur des données ouvertes : les horaires théoriques (GTFS) et les comptages de validations publiés par Île-de-France Mobilités, les emplacements des gares et arrêts du même portail, et la Base Adresse Nationale pour le géocodage. Aucun suivi, aucun backend : chaque visualisation est précalculée dans un fichier statique, et chaque page affiche la période exacte couverte par ses données.",
    aboutRefresh:
      "Les données sont régénérées automatiquement deux fois par mois, car les horaires publiés ne couvrent qu'environ 30 jours.",
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
    title: "Flux - the transit network, replayed",
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
    title: "Flux - le réseau en direct différé",
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
  legend: string;
  footer: string;
}

export const PULSE: Record<Lang, PulseStrings> = {
  en: {
    title: "Relief - the ridership landscape",
    loading: "loading ridership data…",
    subtitle: (n, start, end) =>
      `${n} rail stations · ticket validations ${start} → ${end}`,
    perHour: (n) => `≈ ${n} validations/h`,
    legend:
      "Each line is a west-east slice of the region, north at the back. Every peak is a station rising with its validations per hour: a calm sea at 3am, mountain ranges along the RER lines at 8:30, La Défense towering alone at 6pm.",
    footer: "Validations: Île-de-France Mobilités open data",
  },
  fr: {
    title: "Relief - le paysage de l'affluence",
    loading: "chargement des validations…",
    subtitle: (n, start, end) =>
      `${n} gares et stations · validations ${start} → ${end}`,
    perHour: (n) => `≈ ${n} validations/h`,
    legend:
      "Chaque ligne est une tranche ouest-est de la région, le nord au fond. Chaque pic est une gare qui monte avec ses validations par heure : mer calme à 3h, chaînes de montagnes le long des RER à 8h30, La Défense en sommet solitaire à 18h.",
    footer: "Validations : données ouvertes Île-de-France Mobilités",
  },
};
