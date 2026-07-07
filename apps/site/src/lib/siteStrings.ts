import type { Lang } from "./lang";

/** Strings for the landing page and the flux visualization. The noctilien
 * page keeps its own richer dictionary in lib/noctilien/i18n.ts. */

export const SITE: Record<
  Lang,
  {
    tagline: string;
    fluxTitle: string;
    fluxDesc: string;
    airTitle: string;
    airDesc: string;
    noctTitle: string;
    noctDesc: string;
    horizonTitle: string;
    horizonDesc: string;
    vertigeTitle: string;
    vertigeDesc: string;
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
    airTitle: "Respire - the air you breathe",
    airDesc:
      "Seven years of hourly air quality breathing over the map: winter smog, clean windy days, and the 2020 lockdown clearing the sky in a week.",
    noctTitle: "Noctilien - night buses",
    noctDesc:
      "Heatmap of night-bus frequency: which neighbourhoods are served after midnight, and which are not.",
    horizonTitle: "Horizon - how far can you get?",
    horizonDesc:
      "Pick any station and watch 75 minutes ripple across the region: everywhere the rail network can take you, walking included.",
    vertigeTitle: "Vertige - how tall is Paris?",
    vertigeDesc:
      "Every building inside the périphérique in 3D, appearing floor by floor: the whole city tops out at the Haussmann roofline, then a handful of towers keep climbing alone.",
    aboutTitle: "About the data",
    aboutBody:
      "Everything on this site is built from open data: scheduled timetables (GTFS) published by Île-de-France Mobilités, hourly air quality measurements from Airparif, building heights from the IGN topographic database (BD TOPO), and the national address base for geocoding. No cookies and no backend, only anonymous aggregate page counts: each visualization is precomputed into a static file, and each page shows the exact period its data covers.",
    aboutRefresh:
      "Data is regenerated automatically twice a month, since published timetables only cover about 30 days ahead.",
  },
  fr: {
    tagline:
      "Visualisations interactives des données ouvertes de Paris et d'Île-de-France.",
    fluxTitle: "Flux - le réseau en mouvement",
    fluxDesc:
      "Tous les trajets d'une journée se déplacent sur la carte : 20 000 courses de métro, RER et tramway, et 90 000 bus en option.",
    airTitle: "Respire - l'air que vous respirez",
    airDesc:
      "Sept ans de qualité de l'air horaire qui respirent sur la carte : smog d'hiver, journées de vent, et le confinement 2020 qui purifie le ciel en une semaine.",
    noctTitle: "Noctilien - bus de nuit",
    noctDesc:
      "Carte de chaleur de la fréquence des bus de nuit : quels quartiers sont desservis après minuit, et lesquels ne le sont pas.",
    horizonTitle: "Horizon - jusqu'où pouvez-vous aller ?",
    horizonDesc:
      "Choisissez une station et regardez 75 minutes se propager sur la région : partout où le réseau ferré peut vous emmener, marche comprise.",
    vertigeTitle: "Vertige - quelle hauteur fait Paris ?",
    vertigeDesc:
      "Tous les bâtiments intra-muros en 3D, apparaissant étage par étage : toute la ville s'arrête à la corniche haussmannienne, puis quelques tours continuent de grimper seules.",
    aboutTitle: "À propos des données",
    aboutBody:
      "Tout ce site repose sur des données ouvertes : les horaires théoriques (GTFS) publiés par Île-de-France Mobilités, les mesures horaires de qualité de l'air d'Airparif, les hauteurs de bâtiments de la BD TOPO de l'IGN, et la Base Adresse Nationale pour le géocodage. Pas de cookies, pas de backend, seulement des comptages de pages anonymes et agrégés : chaque visualisation est précalculée dans un fichier statique, et chaque page affiche la période exacte couverte par ses données.",
    aboutRefresh:
      "Les données sont régénérées automatiquement deux fois par mois, car les horaires publiés ne couvrent qu'environ 30 jours.",
  },
};

export interface FluxStrings {
  title: string;
  loading: string;
  subtitle: (count: string, date: string) => string;
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
    subtitle: (count, date) => `${count} trips from the ${date} timetable`,
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
    subtitle: (count, date) => `${count} trajets d'après l'horaire du ${date}`,
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

export interface HorizonStrings {
  title: string;
  loading: string;
  subtitle: (count: string, date: string) => string;
  clockNote: (origin: string) => string;
  searchPlaceholder: string;
  searchAria: string;
  legend: string;
  minutes: (min: number) => string;
  beyond: string;
  clickHint: string;
  story: string;
  footer: string;
}

export const HORIZON: Record<Lang, HorizonStrings> = {
  en: {
    title: "Horizon - how far can you get?",
    loading: "loading travel times…",
    subtitle: (count, date) => `${count} rail stations · timetable of ${date}`,
    clockNote: (origin) => `from ${origin} · métro, RER, tram + walking`,
    searchPlaceholder: "Start from… (station name)",
    searchAria: "Origin station",
    legend:
      "Each color band is 15 minutes of travel from the origin: scheduled métro, RER, Transilien and tram rides, average daytime waits, transfers, and up to 15 minutes of walking at the end. Click any station to start from there.",
    minutes: (min) => `${min} min`,
    beyond: "beyond 75 min",
    clickHint: "Click a station to change the origin",
    story: "✦ The same 75 minutes, from Torcy",
    footer: "Timetables: Île-de-France Mobilités · Basemap © OpenStreetMap © CARTO",
  },
  fr: {
    title: "Horizon - jusqu'où pouvez-vous aller ?",
    loading: "chargement des temps de trajet…",
    subtitle: (count, date) => `${count} gares et stations · horaires du ${date}`,
    clockNote: (origin) => `depuis ${origin} · métro, RER, tram + marche`,
    searchPlaceholder: "Partir de… (nom de station)",
    searchAria: "Station de départ",
    legend:
      "Chaque bande de couleur représente 15 minutes de trajet depuis le départ : métro, RER, Transilien et tramway aux horaires théoriques, attentes moyennes de journée, correspondances, et jusqu'à 15 minutes de marche à l'arrivée. Cliquez une station pour en repartir.",
    minutes: (min) => `${min} min`,
    beyond: "à plus de 75 min",
    clickHint: "Cliquez une station pour changer de départ",
    story: "✦ Les mêmes 75 minutes, depuis Torcy",
    footer:
      "Horaires : Île-de-France Mobilités · Fond de carte © OpenStreetMap © CARTO",
  },
};

export interface VertigeStrings {
  title: string;
  loading: string;
  subtitle: (count: string) => string;
  noteBelow: string;
  noteAbove: string;
  modeAria: string;
  modeBelow: string;
  modeAbove: string;
  legend: string;
  story: string;
  floors: (count: number) => string;
  built: (year: number) => string;
  usages: Record<string, string>;
  footer: string;
}

export const VERTIGE: Record<Lang, VertigeStrings> = {
  en: {
    title: "Vertige - how tall is Paris?",
    loading: "loading buildings…",
    subtitle: (count) =>
      `${count} buildings inside the périphérique · measured by IGN (BD TOPO)`,
    noteBelow: "ceiling: everything built below it",
    noteAbove: "ceiling: only what rises above it",
    modeAria: "Ceiling mode",
    modeBelow: "below the ceiling",
    modeAbove: "above the ceiling",
    legend:
      "Every building inside the périphérique, extruded to its measured rooftop height and colored by band: dark bronze sheds to golden towers. Press play to raise the ceiling and watch the city assemble: courtyard sheds first, the Haussmann wave between 15 and 21 m, then the towers climbing alone. Drag with the right mouse button or two fingers to tilt and turn.",
    story: "✦ Above 37 m, the height limit of 1977",
    floors: (count) => `${count} floors`,
    built: (year) => `built around ${year}`,
    usages: {
      Indifférencié: "unclassified",
      Résidentiel: "residential",
      Industriel: "industrial",
      "Commercial et services": "commercial and services",
      Sportif: "sports",
      Annexe: "outbuilding",
      Religieux: "religious",
      Agricole: "agricultural",
    },
    footer: "Buildings: IGN BD TOPO · Basemap © OpenStreetMap © CARTO",
  },
  fr: {
    title: "Vertige - quelle hauteur fait Paris ?",
    loading: "chargement des bâtiments…",
    subtitle: (count) => `${count} bâtiments intra-muros · mesures IGN (BD TOPO)`,
    noteBelow: "plafond : tout ce qui est construit dessous",
    noteAbove: "plafond : seulement ce qui dépasse",
    modeAria: "Mode du plafond",
    modeBelow: "sous le plafond",
    modeAbove: "au-dessus",
    legend:
      "Chaque bâtiment intra-muros, extrudé à sa hauteur de toit mesurée et coloré par tranche : bronze sombre pour les appentis, or pour les tours. Lancez la lecture pour élever le plafond et voir la ville s'assembler : les appentis d'abord, la vague haussmannienne entre 15 et 21 m, puis les tours qui grimpent seules. Bouton droit ou deux doigts pour incliner et pivoter.",
    story: "✦ Au-dessus de 37 m, le plafond de 1977",
    floors: (count) => `${count} étages`,
    built: (year) => `construit vers ${year}`,
    usages: {
      Indifférencié: "indifférencié",
      Résidentiel: "résidentiel",
      Industriel: "industriel",
      "Commercial et services": "commerces et services",
      Sportif: "sportif",
      Annexe: "annexe",
      Religieux: "religieux",
      Agricole: "agricole",
    },
    footer: "Bâtiments : IGN BD TOPO · Fond de carte © OpenStreetMap © CARTO",
  },
};

export interface PulseStrings {
  title: string;
  loading: string;
  subtitle: (count: string, start: string, end: string) => string;
  perHour: (count: string) => string;
  legend: string;
  footer: string;
}

export const PULSE: Record<Lang, PulseStrings> = {
  en: {
    title: "Relief - the ridership landscape",
    loading: "loading ridership data…",
    subtitle: (count, start, end) =>
      `${count} rail stations · ticket validations ${start} → ${end}`,
    perHour: (count) => `≈ ${count} validations/h`,
    legend:
      "Each line is a west-east slice of the region, north at the back. Every peak is a station rising with its validations per hour: a calm sea at 3am, mountain ranges along the RER lines at 8:30, La Défense towering alone at 6pm.",
    footer: "Validations: Île-de-France Mobilités open data",
  },
  fr: {
    title: "Relief - le paysage de l'affluence",
    loading: "chargement des validations…",
    subtitle: (count, start, end) =>
      `${count} gares et stations · validations ${start} → ${end}`,
    perHour: (count) => `≈ ${count} validations/h`,
    legend:
      "Chaque ligne est une tranche ouest-est de la région, le nord au fond. Chaque pic est une gare qui monte avec ses validations par heure : mer calme à 3h, chaînes de montagnes le long des RER à 8h30, La Défense en sommet solitaire à 18h.",
    footer: "Validations : données ouvertes Île-de-France Mobilités",
  },
};

export interface AirStrings {
  title: string;
  loading: string;
  subtitle: (count: string) => string;
  legend: string;
  lockdown: string;
  yearAria: string;
  traffic: string;
  background: string;
  noData: string;
  hourly: string;
  mean: (window: string) => string;
  footer: string;
}

export const AIR: Record<Lang, AirStrings> = {
  en: {
    title: "Respire - a year of Paris air, hour by hour",
    loading: "loading measurements…",
    subtitle: (count) => `${count} Airparif monitoring stations, hourly measurements`,
    legend:
      "The veil interpolates between stations and fades where none are close. Traffic stations run hotter than the neighbourhoods around them; winter evenings glow, windy days wash the map clean.",
    lockdown: "✦ Watch the 2020 lockdown clear the sky",
    yearAria: "Year",
    traffic: "traffic station",
    background: "background station",
    noData: "no data at this hour",
    hourly: "hourly values",
    mean: (window) => `${window} mean`,
    footer: "Measurements: Airparif open data · Basemap © OpenStreetMap © CARTO",
  },
  fr: {
    title: "Respire - une année d'air parisien, heure par heure",
    loading: "chargement des mesures…",
    subtitle: (count) => `${count} stations Airparif, mesures horaires`,
    legend:
      "Le voile interpole entre les stations et s'estompe loin d'elles. Les stations trafic chauffent plus que leurs quartiers ; les soirs d'hiver rougeoient, les jours de vent lavent la carte.",
    lockdown: "✦ Voir le confinement 2020 purifier le ciel",
    yearAria: "Année",
    traffic: "station trafic",
    background: "station de fond",
    noData: "pas de donnée à cette heure",
    hourly: "valeurs horaires",
    mean: (window) => `moyenne ${window}`,
    footer: "Mesures : données ouvertes Airparif · Fond de carte © OpenStreetMap © CARTO",
  },
};
