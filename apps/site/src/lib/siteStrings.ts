import type { Lang } from "./lang";
import type { ThemeKey, VizKey } from "./vizCatalog";

/** Strings for the landing page and the flux visualization. The noctilien
 * page keeps its own richer dictionary in lib/noctilien/i18n.ts. Card and
 * theme keys follow lib/vizCatalog.ts. */

export const SITE: Record<
  Lang,
  {
    tagline: string;
    themeNotes: Record<ThemeKey, string>;
    cards: Record<VizKey, { title: string; desc: string }>;
    aboutTitle: string;
    aboutBody: string;
    aboutRefresh: string;
    aboutTeaser: string;
    aboutMore: string;
    aboutLink: string;
  }
> = {
  en: {
    tagline: "A living atlas of Paris and Île-de-France, drawn from open data.",
    themeNotes: {
      mouvement: "the city in motion",
      matiere: "the built city",
      elements: "air, heat and water",
      societe: "who lives where",
    },
    cards: {
      flux: {
        title: "Flux - the transit network in motion",
        desc: "Every scheduled trip of a full day moves across the map: 20,000 métro, RER and tram runs, plus 90,000 buses one checkbox away.",
      },
      horizon: {
        title: "Horizon - how far can you get?",
        desc: "Pick any station and watch 75 minutes ripple across the region: everywhere the rail network can take you, walking included.",
      },
      relief: {
        title: "Relief - the ridership landscape",
        desc: "Every station as a mountain rising with its validations per hour: a calm sea at 3am, ranges along the RER at 8:30, La Défense towering alone at 6pm.",
      },
      noctilien: {
        title: "Noctilien - night buses",
        desc: "Heatmap of night-bus frequency: which neighbourhoods are served after midnight, and which are not.",
      },
      vertige: {
        title: "Vertige - how tall is Paris?",
        desc: "Every building inside the périphérique in 3D, appearing floor by floor: the whole city tops out at the Haussmann roofline, then a handful of towers keep climbing alone.",
      },
      strates: {
        title: "Strates - how old is Paris?",
        desc: "The same city assembled year by year: the medieval core, the 1851-1914 explosion that built half of Paris, then the concrete century filling the edges.",
      },
      mirage: {
        title: "Mirage - the tourist flats",
        desc: "Every Airbnb in Paris colored by registration status: watch today's 78,000 listings arrive year by year, half of them since mid-2023.",
      },
      air: {
        title: "Respire - the air you breathe",
        desc: "Seven years of hourly air quality breathing over the map: winter smog, clean windy days, and the 2020 lockdown clearing the sky in a week.",
      },
      crue: {
        title: "Crue - the Seine rising",
        desc: "Raise the river through the 3D city, centimeter by centimeter over the real terrain: the quays go under at 6 m, and at 8.62 m the flood of 1910 returns.",
      },
      canicule: {
        title: "Canicule - the heat island",
        desc: "39,000 blocks scored for heat: the dense mineral city glows long after dark while parks and rivers stay cool, and the night map shows who cannot escape it.",
      },
      logis: {
        title: "Logis - where social housing is",
        desc: "A quarter-million social dwellings dot by dot: the pink HBM belt on the old fortifications, the post-war estates, and since 2000 a wave of buildings bought and converted.",
      },
    },
    aboutTitle: "About the data",
    aboutBody:
      "Everything on this site is built from open data: scheduled timetables (GTFS) and ticket validation counts published by Île-de-France Mobilités, hourly air quality measurements from Airparif, building heights and terrain from IGN databases (BD TOPO, RGE ALTI), construction periods from the Apur building footprints, heat-island scores from the Institut Paris Region, short-term rental listings from Inside Airbnb, the national register of social housing (RPLS), and the national address base for geocoding. No cookies and no backend, only anonymous aggregate page counts: each visualization is precomputed into a static file, and each page shows the exact period its data covers.",
    aboutRefresh:
      "Data is regenerated automatically twice a month, since published timetables only cover about 30 days ahead.",
    aboutTeaser:
      "Every map on this site is built from open data and precomputed into a static file: no backend, no cookies, and each page shows the exact period its data covers.",
    aboutMore: "Sources and methods, map by map →",
    aboutLink: "About",
  },
  fr: {
    tagline:
      "Un atlas vivant de Paris et d'Île-de-France, dessiné à partir des données ouvertes.",
    themeNotes: {
      mouvement: "la ville en mouvement",
      matiere: "la ville bâtie",
      elements: "l'air, la chaleur et l'eau",
      societe: "qui habite où",
    },
    cards: {
      flux: {
        title: "Flux - le réseau en mouvement",
        desc: "Tous les trajets d'une journée se déplacent sur la carte : 20 000 courses de métro, RER et tramway, et 90 000 bus en option.",
      },
      horizon: {
        title: "Horizon - jusqu'où pouvez-vous aller ?",
        desc: "Choisissez une station et regardez 75 minutes se propager sur la région : partout où le réseau ferré peut vous emmener, marche comprise.",
      },
      relief: {
        title: "Relief - le paysage de l'affluence",
        desc: "Chaque gare est une montagne qui monte avec ses validations par heure : mer calme à 3h, chaînes le long des RER à 8h30, La Défense en sommet solitaire à 18h.",
      },
      noctilien: {
        title: "Noctilien - bus de nuit",
        desc: "Carte de chaleur de la fréquence des bus de nuit : quels quartiers sont desservis après minuit, et lesquels ne le sont pas.",
      },
      vertige: {
        title: "Vertige - quelle hauteur fait Paris ?",
        desc: "Tous les bâtiments intra-muros en 3D, apparaissant étage par étage : toute la ville s'arrête à la corniche haussmannienne, puis quelques tours continuent de grimper seules.",
      },
      strates: {
        title: "Strates - quel âge a Paris ?",
        desc: "La même ville assemblée année après année : le cœur médiéval, l'explosion de 1851-1914 qui bâtit la moitié de Paris, puis le siècle du béton qui remplit les bords.",
      },
      mirage: {
        title: "Mirage - les meublés touristiques",
        desc: "Chaque Airbnb de Paris coloré par statut d'enregistrement : regardez les 78 000 annonces d'aujourd'hui apparaître année après année, la moitié depuis mi-2023.",
      },
      air: {
        title: "Respire - l'air que vous respirez",
        desc: "Sept ans de qualité de l'air horaire qui respirent sur la carte : smog d'hiver, journées de vent, et le confinement 2020 qui purifie le ciel en une semaine.",
      },
      crue: {
        title: "Crue - la Seine qui monte",
        desc: "Faites monter le fleuve dans la ville en 3D, centimètre par centimètre sur le vrai terrain : les quais disparaissent à 6 m, et à 8,62 m la crue de 1910 revient.",
      },
      canicule: {
        title: "Canicule - l'îlot de chaleur",
        desc: "39 000 îlots notés pour la chaleur : la ville dense et minérale rougeoie longtemps après la tombée du soir quand les parcs et la Seine restent frais, et la carte de nuit montre qui ne peut pas y échapper.",
      },
      logis: {
        title: "Logis - où est le logement social",
        desc: "Un quart de million de logements sociaux point par point : la ceinture rose des HBM sur les anciennes fortifications, les ensembles d'après-guerre, et depuis 2000 une vague d'immeubles achetés puis conventionnés.",
      },
    },
    aboutTitle: "À propos des données",
    aboutBody:
      "Tout ce site repose sur des données ouvertes : les horaires théoriques (GTFS) et les comptages de validations publiés par Île-de-France Mobilités, les mesures horaires de qualité de l'air d'Airparif, les hauteurs de bâtiments et le terrain des bases IGN (BD TOPO, RGE ALTI), les périodes de construction des emprises bâties de l'Apur, les notes d'îlot de chaleur de l'Institut Paris Region, les annonces de meublés touristiques d'Inside Airbnb, le répertoire national du logement social (RPLS), et la Base Adresse Nationale pour le géocodage. Pas de cookies, pas de backend, seulement des comptages de pages anonymes et agrégés : chaque visualisation est précalculée dans un fichier statique, et chaque page affiche la période exacte couverte par ses données.",
    aboutRefresh:
      "Les données sont régénérées automatiquement deux fois par mois, car les horaires publiés ne couvrent qu'environ 30 jours.",
    aboutTeaser:
      "Chaque carte de ce site est construite à partir de données ouvertes et précalculée en fichier statique : pas de backend, pas de cookies, et chaque page affiche la période exacte couverte par ses données.",
    aboutMore: "Sources et méthodes, carte par carte →",
    aboutLink: "À propos",
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
  story: (from: string) => string;
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
    story: (from) => `✦ The same 75 minutes, from ${from}`,
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
    story: (from) => `✦ Les mêmes 75 minutes, depuis ${from}`,
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
  dirAria: string;
  dirUp: string;
  dirDown: string;
  legend: string;
  storyAbove: string;
  storyBelow: string;
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
    dirAria: "Sweep direction",
    dirUp: "ceiling rising, click to sweep downward",
    dirDown: "ceiling falling, click to sweep upward",
    legend:
      "Every building inside the périphérique, extruded to its measured rooftop height and colored by band: dark bronze sheds to golden towers. Press play to raise the ceiling and watch the city assemble: courtyard sheds first, the Haussmann wave between 15 and 21 m, then the towers climbing alone. Drag with the right mouse button or two fingers to tilt and turn.",
    storyAbove: "✦ Above 37 m, the height limit of 1977",
    storyBelow: "✦ Below 37 m, the city the 1977 cap built",
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
    dirAria: "Sens du balayage",
    dirUp: "plafond montant, cliquez pour descendre",
    dirDown: "plafond descendant, cliquez pour monter",
    legend:
      "Chaque bâtiment intra-muros, extrudé à sa hauteur de toit mesurée et coloré par tranche : bronze sombre pour les appentis, or pour les tours. Lancez la lecture pour élever le plafond et voir la ville s'assembler : les appentis d'abord, la vague haussmannienne entre 15 et 21 m, puis les tours qui grimpent seules. Bouton droit ou deux doigts pour incliner et pivoter.",
    storyAbove: "✦ Au-dessus de 37 m, le plafond de 1977",
    storyBelow: "✦ Sous 37 m, la ville née du plafond de 1977",
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

export interface StratesStrings {
  title: string;
  loading: string;
  subtitle: (count: string) => string;
  noteBefore: string;
  noteAfter: string;
  modeAria: string;
  modeBefore: string;
  modeAfter: string;
  dirAria: string;
  dirForward: string;
  dirBack: string;
  legend: string;
  legendNew: string;
  undatedNote: (pct: number) => string;
  storyBefore: string;
  storyAfter: string;
  built: (year: number) => string;
  periodBefore: (year: number) => string;
  periodSince: (year: number) => string;
  period: (from: number, to: number) => string;
  undated: string;
  footer: string;
}

export const STRATES: Record<Lang, StratesStrings> = {
  en: {
    title: "Strates - how old is Paris?",
    loading: "loading buildings…",
    subtitle: (count) => `${count} building footprints intra-muros · dated by Apur`,
    noteBefore: "everything standing at this date",
    noteAfter: "only what came after this date",
    modeAria: "Time filter",
    modeBefore: "already built",
    modeAfter: "built after",
    dirAria: "Time direction",
    dirForward: "time flowing forward, click to rewind",
    dirBack: "time rewinding, click to flow forward",
    legend:
      "Every footprint inside the périphérique, extruded to its measured height and colored by construction period: deep red for the oldest, Haussmann's wave in gold, violet for the newest. Buildings the Apur could not date (slate gray) only join once the city is complete. Press play and the city assembles year by year: the medieval core, the faubourgs, the 1851-1914 explosion that built half of Paris, then the concrete century. Drag with the right mouse button or two fingers to tilt and turn.",
    legendNew: "2000+",
    undatedNote: (pct) => `undated: ${pct}% of footprints`,
    storyBefore: "✦ Paris in 1914, half the city already there",
    storyAfter: "✦ Everything built after 1914",
    built: (year) => `built in ${year}`,
    periodBefore: (year) => `before ${year}`,
    periodSince: (year) => `since ${year}`,
    period: (from, to) => `${from}-${to}`,
    undated: "construction date unknown",
    footer: "Footprints and dating: Apur (ODbL) · Basemap © OpenStreetMap © CARTO",
  },
  fr: {
    title: "Strates - quel âge a Paris ?",
    loading: "chargement des bâtiments…",
    subtitle: (count) => `${count} emprises bâties intra-muros · datation Apur`,
    noteBefore: "tout ce qui existe à cette date",
    noteAfter: "seulement ce qui vient après",
    modeAria: "Filtre temporel",
    modeBefore: "déjà construit",
    modeAfter: "construit après",
    dirAria: "Sens du temps",
    dirForward: "le temps avance, cliquez pour remonter",
    dirBack: "le temps remonte, cliquez pour avancer",
    legend:
      "Chaque emprise bâtie intra-muros, extrudée à sa hauteur mesurée et colorée par période de construction : rouge profond pour les plus anciennes, la vague haussmannienne en or, violet pour les plus récentes. Les bâtiments que l'Apur n'a pas pu dater (gris ardoise) n'apparaissent qu'une fois la ville complète. Lancez la lecture et la ville s'assemble année après année : le cœur médiéval, les faubourgs, l'explosion de 1851-1914 qui bâtit la moitié de Paris, puis le siècle du béton. Bouton droit ou deux doigts pour incliner et pivoter.",
    legendNew: "2000+",
    undatedNote: (pct) => `non datées : ${pct} % des emprises`,
    storyBefore: "✦ Paris en 1914, la moitié de la ville déjà là",
    storyAfter: "✦ Tout ce qui s'est construit après 1914",
    built: (year) => `construit en ${year}`,
    periodBefore: (year) => `avant ${year}`,
    periodSince: (year) => `depuis ${year}`,
    period: (from, to) => `${from}-${to}`,
    undated: "date de construction inconnue",
    footer: "Emprises et datation : Apur (ODbL) · Fond de carte © OpenStreetMap © CARTO",
  },
};

export interface MirageStrings {
  title: string;
  loading: string;
  subtitle: (count: string, date: string) => string;
  note: string;
  statutAria: string;
  filterHint: string;
  statuses: { declared: string; none: string; bail: string; exempt: string };
  statusTips: { declared: string; none: string; bail: string; exempt: string };
  rooms: { entire: string; private: string; shared: string; hotel: string };
  since: (month: string) => string;
  never: string;
  reviews: (count: string) => string;
  hostListings: (count: string) => string;
  perNight: (price: string) => string;
  legend: string;
  neverNote: (pct: number) => string;
  storyHalf: (month: string) => string;
  storyBack: (month: string) => string;
  footer: string;
}

export const MIRAGE: Record<Lang, MirageStrings> = {
  en: {
    title: "Mirage - the tourist flats",
    loading: "loading listings…",
    subtitle: (count, date) => `${count} Airbnb listings · Inside Airbnb scrape of ${date}`,
    note: "today's listings already present by this date",
    statutAria: "Registration status",
    filterHint:
      "Click a status to keep only those listings; click it again to show everything.",
    statuses: {
      declared: "registration shown",
      none: "no valid number",
      bail: "mobility lease",
      exempt: "hotel-type, exempt",
    },
    statusTips: {
      declared:
        "Shows a well-formed 13-character city registration number. Well-formed only: the number itself is not verified.",
      none: "Empty or not a real number (fantasy digits, postal codes, obsolete formats). For an ordinary tourist rental, this is the non-compliant category.",
      bail: "Rented only under a bail mobilité: 1 to 10 months for temporary work or study. Housing, not tourist rental, so no number is required.",
      exempt:
        "Hotel rooms, aparthotels and guesthouses: regulated as hotels, so the registration rule does not apply.",
    },
    rooms: {
      entire: "entire home",
      private: "private room",
      shared: "shared room",
      hotel: "hotel room",
    },
    since: (month) => `first reviewed ${month}`,
    never: "never reviewed",
    reviews: (count) => `${count} reviews`,
    hostListings: (count) => `host with ${count} listings`,
    perNight: (price) => `€${price}/night`,
    legend:
      "Every dot is one listing from the snapshot, colored by the registration status its host displays: Paris requires most short-term rentals to show a 13-character city number, mobility leases and hotels are exempt. Press play and today's stock assembles by first review date. The sweep shows when the current listings arrived, not the market's past size: flats delisted since have left the scrape. Airbnb blurs each position by up to 150 m.",
    neverNote: (pct) =>
      `never reviewed: ${pct}% of listings, shown at the snapshot date only`,
    storyHalf: (month) => `✦ ${month}: half of today's listings are not there yet`,
    storyBack: (month) => `✦ Back to ${month}, the full tide`,
    footer: "Listings: Inside Airbnb (CC BY 4.0) · Basemap © OpenStreetMap © CARTO",
  },
  fr: {
    title: "Mirage - les meublés touristiques",
    loading: "chargement des annonces…",
    subtitle: (count, date) => `${count} annonces Airbnb · relevé Inside Airbnb du ${date}`,
    note: "les annonces d'aujourd'hui déjà apparues à cette date",
    statutAria: "Statut d'enregistrement",
    filterHint:
      "Cliquez un statut pour ne garder que ces annonces ; recliquez pour tout réafficher.",
    statuses: {
      declared: "numéro affiché",
      none: "sans numéro valide",
      bail: "bail mobilité",
      exempt: "hôtelier, exempté",
    },
    statusTips: {
      declared:
        "Affiche un numéro d'enregistrement de 13 caractères bien formé. Bien formé seulement : le numéro lui-même n'est pas vérifié.",
      none: "Vide, ou autre chose qu'un vrai numéro (chiffres fantaisistes, code postal, format caduc). Pour un meublé touristique ordinaire, c'est la catégorie hors règle.",
      bail: "Loué uniquement en bail mobilité : 1 à 10 mois pour mission ou études. Du logement, pas du tourisme : aucun numéro requis.",
      exempt:
        "Chambres d'hôtel, apparthôtels et pensions : régulés comme des hôtels, la règle d'enregistrement ne s'applique pas.",
    },
    rooms: {
      entire: "logement entier",
      private: "chambre privée",
      shared: "chambre partagée",
      hotel: "chambre d'hôtel",
    },
    since: (month) => `premier commentaire ${month}`,
    never: "jamais commentée",
    reviews: (count) => `${count} commentaires`,
    hostListings: (count) => `hôte à ${count} annonces`,
    perNight: (price) => `${price} €/nuit`,
    legend:
      "Chaque point est une annonce du relevé, colorée par le statut d'enregistrement que son hôte affiche : Paris impose à la plupart des meublés touristiques un numéro de 13 caractères, les baux mobilité et les hôtels en sont exemptés. Lancez la lecture et le parc actuel s'assemble par date de premier commentaire. Le balayage montre quand les annonces d'aujourd'hui sont apparues, pas la taille passée du marché : les annonces retirées depuis ont quitté le relevé. Airbnb floute chaque position jusqu'à 150 m.",
    neverNote: (pct) =>
      `jamais commentées : ${pct} % des annonces, visibles à la date du relevé seulement`,
    storyHalf: (month) => `✦ ${month} : la moitié du parc n'est pas encore là`,
    storyBack: (month) => `✦ Retour à ${month}, la marée complète`,
    footer:
      "Annonces : Inside Airbnb (CC BY 4.0) · Fond de carte © OpenStreetMap © CARTO",
  },
};

export interface LogisStrings {
  title: string;
  loading: string;
  subtitle: (count: string) => string;
  note: string;
  finanAria: string;
  filterHint: string;
  cats: { hbm: string; avant77: string; plai: string; plus: string; pls: string; autre: string };
  catTips: { hbm: string; avant77: string; plai: string; plus: string; pls: string; autre: string };
  dwellings: (count: string, one: boolean) => string;
  builtIn: (year: number) => string;
  letSince: (year: number) => string;
  avg: (surface: string, rooms: string) => string;
  dpe: (letter: string) => string;
  students: string;
  arrondissement: (n: number) => string;
  legend: string;
  missingNote: (pct: string) => string;
  storyBelt: string;
  storyBack: string;
  footer: string;
}

export const LOGIS: Record<Lang, LogisStrings> = {
  en: {
    title: "Logis - where social housing is",
    loading: "loading dwellings…",
    subtitle: (count) => `${count} social dwellings on January 1st, 2025 · RPLS`,
    note: "today's stock already in service by this date",
    finanAria: "Financing category",
    filterHint:
      "Click a category to keep only those dwellings; click it again to show everything.",
    cats: {
      hbm: "HBM, the pink belt",
      avant77: "pre-1977 HLM",
      plai: "most social (PLAI)",
      plus: "standard social (PLUS)",
      pls: "intermediate (PLS, PLI)",
      autre: "other financing",
    },
    catTips: {
      hbm: "Habitations à bon marché, 1894-1953: the red-brick belt raised mostly on the razed fortifications between the wars.",
      avant77: "Ordinary HLM, ILM, ILN and the other regimes that predate the 1977 financing reform: most of the post-war estates.",
      plai: "PLAI and its predecessors: the lowest rents, reserved for the poorest households.",
      plus: "PLUS and ordinary PLA: the standard social product, the bulk of the stock financed since 1977.",
      pls: "PLS and PLI: rent and income ceilings close to the market, often student or intermediate housing.",
      autre: "Financing not recorded or outside the standard ladder.",
    },
    dwellings: (count, one) => (one ? "1 dwelling" : `${count} dwellings`),
    builtIn: (year) => `built ${year}`,
    letSince: (year) => `social housing since ${year}`,
    avg: (surface, rooms) => `on average ${surface} m², ${rooms} rooms`,
    dpe: (letter) => `DPE ${letter}`,
    students: "student housing",
    arrondissement: (n) => `${n}ᵉ`,
    legend:
      "Every dot is one address of the national social-housing register (RPLS), its area proportional to its dwellings and its color to their financing: the pink HBM belt, pre-1977 HLM in ochre, then a ladder of blues from the most subsidized to near-market. Press play and the stock assembles by the year its dwellings were first let as social housing, so at each date the map shows the stock actually in service. A quarter of the dwellings entered service more than twenty years after construction, buildings bought and converted, most of them since 2000: hover a dot and its construction year tells that story.",
    missingNote: (pct) => `not mapped: ${pct}% of the stock, without coordinates`,
    storyBelt: "✦ 1935: the pink belt closes around Paris",
    storyBack: "✦ Back to today, the whole stock",
    footer: "Dwellings: SDES, RPLS 2025 (licence ouverte) · Basemap © OpenStreetMap © CARTO",
  },
  fr: {
    title: "Logis - où est le logement social",
    loading: "chargement des logements…",
    subtitle: (count) => `${count} logements sociaux au 1ᵉʳ janvier 2025 · RPLS`,
    note: "le parc actuel déjà en service à cette date",
    finanAria: "Catégorie de financement",
    filterHint:
      "Cliquez une catégorie pour ne garder que ces logements ; recliquez pour tout réafficher.",
    cats: {
      hbm: "HBM, la ceinture rose",
      avant77: "HLM d'avant 1977",
      plai: "très social (PLAI)",
      plus: "social (PLUS)",
      pls: "intermédiaire (PLS, PLI)",
      autre: "autre financement",
    },
    catTips: {
      hbm: "Habitations à bon marché, 1894-1953 : la ceinture de briques rouges, bâtie surtout sur l'emprise des fortifications entre les deux guerres.",
      avant77: "HLM ordinaires, ILM, ILN et les autres régimes d'avant la réforme du financement de 1977 : l'essentiel des ensembles d'après-guerre.",
      plai: "Le PLAI et ses ancêtres : les loyers les plus bas, réservés aux ménages les plus modestes.",
      plus: "PLUS et PLA ordinaire : le logement social standard, le cœur du parc financé depuis 1977.",
      pls: "PLS et PLI : plafonds de loyers et de ressources proches du marché, souvent du logement étudiant ou intermédiaire.",
      autre: "Financement non renseigné ou hors nomenclature.",
    },
    dwellings: (count, one) => (one ? "1 logement" : `${count} logements`),
    builtIn: (year) => `construit en ${year}`,
    letSince: (year) => `logement social depuis ${year}`,
    avg: (surface, rooms) => `en moyenne ${surface} m², ${rooms} pièces`,
    dpe: (letter) => `DPE ${letter}`,
    students: "logements étudiants",
    arrondissement: (n) => `${n}ᵉ`,
    legend:
      "Chaque point est une adresse du répertoire national du logement social (RPLS), sa surface proportionnelle à son nombre de logements, sa couleur à leur financement : la ceinture rose des HBM, les HLM d'avant 1977 en ocre, puis une échelle de bleus du plus social au proche du marché. Lancez la lecture et le parc s'assemble par année de première mise en location comme logement social : à chaque date, la carte montre le parc réellement en service. Un quart des logements sont entrés en service plus de vingt ans après leur construction, des immeubles achetés puis conventionnés, pour la plupart depuis 2000 : survolez un point, son année de construction raconte cette histoire.",
    missingNote: (pct) => `non cartographiés : ${pct} % du parc, sans coordonnées`,
    storyBelt: "✦ 1935 : la ceinture rose se referme sur Paris",
    storyBack: "✦ Retour à aujourd'hui, tout le parc",
    footer: "Logements : SDES, RPLS 2025 (licence ouverte) · Fond de carte © OpenStreetMap © CARTO",
  },
};

export interface CaniculeStrings {
  title: string;
  loading: string;
  subtitle: (count: string) => string;
  axisAria: string;
  axisAlea: string;
  axisVuln: string;
  momentAria: string;
  day: string;
  night: string;
  legendCool: string;
  legendHot: string;
  legendVulnLow: string;
  legendVulnHigh: string;
  legend: string;
  storyVuln: string;
  storyAlea: string;
  vulnUnknown: string;
  built: (pct: number) => string;
  permeable: (pct: number) => string;
  lcz: Record<string, string>;
  footer: string;
}

export const CANICULE: Record<Lang, CaniculeStrings> = {
  en: {
    title: "Canicule - the heat island",
    loading: "loading blocks…",
    subtitle: (count) =>
      `${count} blocks, Paris + petite couronne · Institut Paris Region`,
    axisAria: "Map variable",
    axisAlea: "heat hazard",
    axisVuln: "vulnerability",
    momentAria: "Day or night",
    day: "day",
    night: "night",
    legendCool: "cool",
    legendHot: "scorching",
    legendVulnLow: "low",
    legendVulnHigh: "high",
    legend:
      "Each block is scored by the Institut Paris Region for its heat-island behavior: hazard is how much the block itself overheats (its shape, minerality and lack of sky view trap the day's heat), vulnerability is how exposed its residents are. Flip between day and night: the dense city keeps its heat long after dark. Hover a block for its climate class and scores; the gaps between blocks are the streets.",
    storyVuln: "✦ Who the night heat endangers",
    storyAlea: "✦ Back to the heat itself",
    vulnUnknown: "vulnerability not scored",
    built: (pct) => `${pct}% built`,
    permeable: (pct) => `${pct}% permeable`,
    lcz: {
      "1": "LCZ 1 · compact high-rise",
      "2": "LCZ 2 · compact mid-rise",
      "3": "LCZ 3 · compact low-rise",
      "4": "LCZ 4 · open high-rise",
      "5": "LCZ 5 · open mid-rise",
      "6": "LCZ 6 · open low-rise",
      "7": "LCZ 7 · lightweight low-rise",
      "8": "LCZ 8 · large low-rise",
      "9": "LCZ 9 · sparsely built",
      "10": "LCZ 10 · heavy industry",
      A: "dense trees",
      B: "scattered trees",
      C: "bush and scrub",
      D: "low plants",
      E: "bare rock or paved",
      "E.b": "paved, scattered buildings",
      F: "bare soil",
      G: "water",
    },
    footer:
      "Heat blocks: Institut Paris Region (ICU/LCZ) · Basemap © OpenStreetMap © CARTO",
  },
  fr: {
    title: "Canicule - l'îlot de chaleur",
    loading: "chargement des îlots…",
    subtitle: (count) =>
      `${count} îlots, Paris + petite couronne · Institut Paris Region`,
    axisAria: "Variable affichée",
    axisAlea: "aléa chaleur",
    axisVuln: "vulnérabilité",
    momentAria: "Jour ou nuit",
    day: "jour",
    night: "nuit",
    legendCool: "frais",
    legendHot: "surchauffe",
    legendVulnLow: "faible",
    legendVulnHigh: "forte",
    legend:
      "Chaque îlot est noté par l'Institut Paris Region pour son comportement d'îlot de chaleur : l'aléa mesure combien l'îlot lui-même surchauffe (sa forme, sa minéralité et son ciel masqué piègent la chaleur du jour), la vulnérabilité mesure l'exposition de ses habitants. Basculez entre jour et nuit : la ville dense garde sa chaleur longtemps après la tombée du soir. Survolez un îlot pour sa classe climatique et ses notes ; les vides entre les îlots sont les rues.",
    storyVuln: "✦ Qui la chaleur nocturne menace",
    storyAlea: "✦ Retour à la chaleur elle-même",
    vulnUnknown: "vulnérabilité non notée",
    built: (pct) => `${pct} % bâti`,
    permeable: (pct) => `${pct} % perméable`,
    lcz: {
      "1": "LCZ 1 · bâti compact haut",
      "2": "LCZ 2 · bâti compact moyen",
      "3": "LCZ 3 · bâti compact bas",
      "4": "LCZ 4 · bâti ouvert haut",
      "5": "LCZ 5 · bâti ouvert moyen",
      "6": "LCZ 6 · bâti ouvert bas",
      "7": "LCZ 7 · bâti léger",
      "8": "LCZ 8 · grandes halles basses",
      "9": "LCZ 9 · bâti épars",
      "10": "LCZ 10 · industrie lourde",
      A: "arbres denses",
      B: "arbres épars",
      C: "broussailles",
      D: "végétation basse",
      E: "minéral nu",
      "E.b": "minéral, bâti épars",
      F: "sol nu",
      G: "eau",
    },
    footer:
      "Îlots de chaleur : Institut Paris Region (ICU/LCZ) · Fond de carte © OpenStreetMap © CARTO",
  },
};

export interface CrueStrings {
  title: string;
  loading: string;
  subtitle: (count: string) => string;
  noteDefault: string;
  noteMark: (label: string) => string;
  legendDry: string;
  legendFlooded: string;
  legend: string;
  story1910: string;
  story2016: string;
  live: (level: string) => string;
  footer: string;
}

export const CRUE: Record<Lang, CrueStrings> = {
  en: {
    title: "Crue - the Seine rising",
    loading: "loading the terrain…",
    subtitle: (count) =>
      `${count} buildings · IGN terrain · Austerlitz gauge heights`,
    noteDefault: "height on the Austerlitz gauge",
    noteMark: (label) => `the ${label} flood`,
    legendDry: "dry",
    legendFlooded: "flooded",
    legend:
      "The Seine rises through the city over the IGN terrain model: a flood fill from the river computes where each extra centimeter can actually reach, so basins behind higher ground stay dry until the water gets around. Buildings turn steel blue as their street floods. A visualization, not a forecast: the 10 m terrain smooths parapets and ignores protection works and the underground.",
    story1910: "✦ January 1910, 8.62 m, the flood of the century",
    story2016: "✦ June 2016, 6.10 m, the quays go under",
    live: (level) => `✦ The Seine right now: ${level} m`,
    footer:
      "Terrain: IGN RGE ALTI · Levels: Vigicrues / Hub'Eau · Basemap © OpenStreetMap © CARTO",
  },
  fr: {
    title: "Crue - la Seine qui monte",
    loading: "chargement du terrain…",
    subtitle: (count) =>
      `${count} bâtiments · terrain IGN · hauteurs à l'échelle d'Austerlitz`,
    noteDefault: "hauteur à l'échelle d'Austerlitz",
    noteMark: (label) => `la crue de ${label}`,
    legendDry: "au sec",
    legendFlooded: "inondé",
    legend:
      "La Seine monte dans la ville sur le modèle de terrain IGN : un remplissage depuis le fleuve calcule où chaque centimètre supplémentaire peut réellement s'étendre, si bien que les cuvettes derrière un terrain plus haut restent sèches tant que l'eau ne les atteint pas. Les bâtiments passent au bleu acier quand leur rue est inondée. Une visualisation, pas une prévision : le terrain à 10 m lisse les parapets et ignore les protections et le sous-sol.",
    story1910: "✦ Janvier 1910, 8,62 m, la crue du siècle",
    story2016: "✦ Juin 2016, 6,10 m, les quais sous l'eau",
    live: (level) => `✦ La Seine en ce moment : ${level} m`,
    footer:
      "Terrain : IGN RGE ALTI · Niveaux : Vigicrues / Hub'Eau · Fond de carte © OpenStreetMap © CARTO",
  },
};

export interface ReliefStrings {
  title: string;
  loading: string;
  subtitle: (count: string, start: string, end: string) => string;
  note: (day: string, period: string) => string;
  days: { w: string; s: string; d: string };
  perHour: (count: string) => string;
  legend: string;
  story: string;
  footer: string;
}

export const RELIEF: Record<Lang, ReliefStrings> = {
  en: {
    title: "Relief - the ridership landscape",
    loading: "loading ridership data…",
    subtitle: (count, start, end) =>
      `${count} rail stations · ticket validations ${start} → ${end}`,
    note: (day, period) => `${day} · ${period}`,
    days: { w: "a typical weekday", s: "a typical Saturday", d: "a typical Sunday" },
    perHour: (count) => `≈ ${count} validations/h`,
    legend:
      "Every rail station rises from its real place on the map as a golden spike, its height the validations per hour at the current time: a calm sea of dots at 3am, ranges climbing along the RER lines at 8:30, La Défense and Saint-Lazare towering over the west at 6pm. Hover a spike to name it; the brightest spikes are the network's summits.",
    story: "✦ 6pm at La Défense, the evening tide",
    footer: "Validations: Île-de-France Mobilités open data · Basemap © OpenStreetMap © CARTO",
  },
  fr: {
    title: "Relief - le paysage de l'affluence",
    loading: "chargement des validations…",
    subtitle: (count, start, end) =>
      `${count} gares et stations · validations ${start} → ${end}`,
    note: (day, period) => `${day} · ${period}`,
    days: { w: "un jour ouvré type", s: "un samedi type", d: "un dimanche type" },
    perHour: (count) => `≈ ${count} validations/h`,
    legend:
      "Chaque gare s'élève à sa vraie place sur la carte comme un pic doré, sa hauteur donnée par les validations par heure à l'instant affiché : mer de points calme à 3h, chaînes qui grimpent le long des RER à 8h30, La Défense et Saint-Lazare en tours au-dessus de l'ouest à 18h. Survolez un pic pour le nommer ; les plus brillants sont les sommets du réseau.",
    story: "✦ 18h à La Défense, la marée du soir",
    footer:
      "Validations : données ouvertes Île-de-France Mobilités · Fond de carte © OpenStreetMap © CARTO",
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
