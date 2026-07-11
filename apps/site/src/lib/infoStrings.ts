import type { Lang } from "./lang";
import type { VizKey } from "./vizCatalog";

/** Per-visualization "about this map" content: what the map shows, how the
 * data is computed and its caveats, and the datasets it is built from.
 * Consumed by the VizInfo panel on each map and by the /about page. */

export interface VizInfoContent {
  /** Two short paragraphs: what you are looking at, then method and caveats. */
  body: string[];
  sources: { label: string; href: string }[];
}

export const INFO_LABELS: Record<
  Lang,
  {
    open: string;
    heading: string;
    close: string;
    sources: string;
    more: string;
  }
> = {
  en: {
    open: "About this map",
    heading: "About this map",
    close: "Close",
    sources: "Data",
    more: "All maps: sources and methods",
  },
  fr: {
    open: "À propos de cette carte",
    heading: "À propos de cette carte",
    close: "Fermer",
    sources: "Données",
    more: "Toutes les cartes : sources et méthodes",
  },
};

export const ABOUT: Record<
  Lang,
  {
    title: string;
    perMapTitle: string;
    code: string;
    codeLink: string;
  }
> = {
  en: {
    title: "About the data",
    perMapTitle: "Map by map",
    code: "The whole site is open source:",
    codeLink: "github.com/lematty/paris-viz",
  },
  fr: {
    title: "À propos des données",
    perMapTitle: "Carte par carte",
    code: "Tout le site est open source :",
    codeLink: "github.com/lematty/paris-viz",
  },
};

const IDFM_GTFS = {
  label: "IDFM GTFS (transport.data.gouv.fr)",
  href: "https://transport.data.gouv.fr/datasets/reseau-urbain-et-interurbain-dile-de-france-mobilites",
};

export const INFO: Record<VizKey, Record<Lang, VizInfoContent>> = {
  flux: {
    en: {
      body: [
        "Every scheduled trip of the Île-de-France network over one full day, replayed on the map: métro, RER and Transilien, tram, and optionally the roughly 90,000 daily bus runs. Each dot is one vehicle moving along its real route between its scheduled stops.",
        "The data is the public GTFS timetable published by Île-de-France Mobilités, cut into three representative days: a school-period weekday, a Saturday and a Sunday. It is the theoretical schedule, so no delays, no disruptions, no crowding, and positions between stops are interpolated along the line's path.",
      ],
      sources: [IDFM_GTFS],
    },
    fr: {
      body: [
        "Tous les trajets programmés du réseau francilien sur une journée complète, rejoués sur la carte : métro, RER et Transilien, tramway, et en option les quelque 90 000 courses de bus quotidiennes. Chaque point est un véhicule qui suit son vrai itinéraire entre ses arrêts programmés.",
        "Les données sont l'horaire GTFS public d'Île-de-France Mobilités, découpé en trois journées représentatives : un jour de semaine hors vacances, un samedi et un dimanche. C'est l'horaire théorique : pas de retards, pas de perturbations, et les positions entre arrêts sont interpolées le long du tracé de la ligne.",
      ],
      sources: [IDFM_GTFS],
    },
  },
  horizon: {
    en: {
      body: [
        "Pick a station and the map shows how far the rail network can carry you: each color band is minutes of travel by métro, RER and Transilien or tram, with the final walk away from the arrival station included.",
        "Travel times come from a station-to-station matrix computed from the Île-de-France Mobilités timetable for a typical weekday. The routing is frequency-based rather than tied to one departure: riding time is the median scheduled run, boarding a line costs half its daytime headway, and transfers use the published walking times. The result reads as average conditions, not a race with one specific train.",
      ],
      sources: [IDFM_GTFS],
    },
    fr: {
      body: [
        "Choisissez une station et la carte montre jusqu'où le réseau ferré peut vous emmener : chaque bande de couleur représente des minutes de trajet en métro, RER et Transilien ou tramway, marche finale depuis la station d'arrivée comprise.",
        "Les temps de trajet viennent d'une matrice de station à station calculée à partir de l'horaire d'Île-de-France Mobilités pour un jour de semaine type. L'itinéraire est fondé sur les fréquences plutôt que sur un départ précis : le temps de parcours est la médiane des courses programmées, monter dans une ligne coûte la moitié de son intervalle de journée, et les correspondances utilisent les temps de marche publiés. Le résultat se lit comme des conditions moyennes, pas comme une course avec un train particulier.",
      ],
      sources: [IDFM_GTFS],
    },
  },
  relief: {
    en: {
      body: [
        "Every rail station of Île-de-France rises with its ticket validations per hour: a flat sea at 3am, mountain ranges along the RER lines at 8:30, La Défense towering alone at 6pm.",
        "Counts come from the Île-de-France Mobilités open-data validation datasets: daily totals per station joined to hourly profiles per day type (weekday, Saturday, Sunday, outside school holidays), averaged over the covered quarter so each station's curve reads as a typical day. Validations count entries only: exits and connections inside the network are invisible.",
      ],
      sources: [
        {
          label: "Validations, IDFM open data",
          href: "https://data.iledefrance-mobilites.fr",
        },
      ],
    },
    fr: {
      body: [
        "Chaque gare d'Île-de-France s'élève avec ses validations par heure : une mer plate à 3h du matin, des chaînes de montagnes le long des RER à 8h30, La Défense en sommet solitaire à 18h.",
        "Les comptages viennent des jeux de données de validations en open data d'Île-de-France Mobilités : totaux quotidiens par gare croisés avec les profils horaires par type de jour (semaine, samedi, dimanche, hors vacances scolaires), moyennés sur le trimestre couvert pour que la courbe de chaque gare se lise comme une journée type. Les validations ne comptent que les entrées : les sorties et les correspondances à l'intérieur du réseau sont invisibles.",
      ],
      sources: [
        {
          label: "Validations, open data IDFM",
          href: "https://data.iledefrance-mobilites.fr",
        },
      ],
    },
  },
  noctilien: {
    en: {
      body: [
        "How often a Noctilien night bus passes near every point of Île-de-France between roughly 00:30 and 05:30, split into weeknights and Friday-Saturday nights: bright means frequent service, dark means long waits or no coverage at all.",
        "Frequencies are counted per stop from the scheduled Île-de-France Mobilités timetable over the feed's validity window, and the address search is geocoded through the national address base. As everywhere on this site, it is the theoretical schedule, not live traffic.",
      ],
      sources: [
        IDFM_GTFS,
        { label: "Base Adresse Nationale", href: "https://adresse.data.gouv.fr" },
      ],
    },
    fr: {
      body: [
        "La fréquence de passage des bus de nuit Noctilien près de chaque point d'Île-de-France entre environ 0h30 et 5h30, séparée en nuits de semaine et nuits de vendredi et samedi : clair pour un service fréquent, sombre pour de longues attentes ou aucune desserte.",
        "Les fréquences sont comptées par arrêt à partir de l'horaire théorique d'Île-de-France Mobilités sur la période de validité du fichier, et la recherche d'adresse est géocodée via la Base Adresse Nationale. Comme partout sur ce site, c'est l'horaire théorique, pas le trafic en temps réel.",
      ],
      sources: [
        IDFM_GTFS,
        { label: "Base Adresse Nationale", href: "https://adresse.data.gouv.fr" },
      ],
    },
  },
  vertige: {
    en: {
      body: [
        "Every building of Paris intra-muros in 3D with its measured height, appearing floor by floor: almost the whole city stops at the Haussmann roofline, then a handful of towers keep climbing alone.",
        "Footprints and heights come from IGN BD TOPO, the national topographic database. Heights are photogrammetric measurements (roof gutter above the ground), not estimates from floor counts, and buildings are clipped to the 20 arrondissements using the city's open contours.",
      ],
      sources: [
        { label: "IGN BD TOPO", href: "https://geoservices.ign.fr/bdtopo" },
        { label: "opendata.paris.fr", href: "https://opendata.paris.fr" },
      ],
    },
    fr: {
      body: [
        "Tous les bâtiments de Paris intra-muros en 3D avec leur hauteur mesurée, apparaissant étage par étage : presque toute la ville s'arrête à la corniche haussmannienne, puis une poignée de tours continue de grimper seule.",
        "Les emprises et les hauteurs viennent de la BD TOPO de l'IGN, la base topographique nationale. Les hauteurs sont des mesures photogrammétriques (gouttière au-dessus du sol), pas des estimations d'après le nombre d'étages, et les bâtiments sont découpés aux 20 arrondissements d'après les contours ouverts de la ville.",
      ],
      sources: [
        { label: "IGN BD TOPO", href: "https://geoservices.ign.fr/bdtopo" },
        { label: "opendata.paris.fr", href: "https://opendata.paris.fr" },
      ],
    },
  },
  strates: {
    en: {
      body: [
        "Every built footprint of Paris colored by construction period and assembled year by year: the medieval core, the 1851-1914 explosion that built half of the city, then the concrete century filling the edges.",
        "Footprints and dating come from the Apur's 'emprise bâtie décomposée' layer (ODbL). The dating mixes the Loyer survey for pre-1940 facades, fiscal files, building permits and field surveys; about 6% of footprints could not be dated and are shown as undated bedrock. Heights are the Apur's photogrammetric median heights.",
      ],
      sources: [{ label: "Apur (ODbL)", href: "https://opendata.apur.org" }],
    },
    fr: {
      body: [
        "Chaque emprise bâtie de Paris colorée par période de construction et assemblée année après année : le cœur médiéval, l'explosion de 1851-1914 qui bâtit la moitié de la ville, puis le siècle du béton qui remplit les bords.",
        "Les emprises et leur datation viennent de la couche 'emprise bâtie décomposée' de l'Apur (ODbL). La datation croise l'enquête Loyer pour les façades d'avant 1940, les fichiers fiscaux, les permis de construire et des relevés de terrain ; environ 6 % des emprises n'ont pas pu être datées et apparaissent comme un socle non daté. Les hauteurs sont les hauteurs médianes photogrammétriques de l'Apur.",
      ],
      sources: [{ label: "Apur (ODbL)", href: "https://opendata.apur.org" }],
    },
  },
  mirage: {
    en: {
      body: [
        "Every Airbnb listing of Paris intra-muros, arriving on the map year by year (a listing appears at its first guest review) and colored by its registration status with the city.",
        "Listings come from the Inside Airbnb scrape (CC BY 4.0). Paris requires most short-term rentals to display a 13-character registration number; the status is read from the listing's license field as typed by the host: a well-formed number counts as declared, mobility leases and hotel-type listings are exempt, anything else counts as unregistered. Review dates only approximate a listing's active life.",
      ],
      sources: [
        { label: "Inside Airbnb (CC BY 4.0)", href: "https://insideairbnb.com" },
      ],
    },
    fr: {
      body: [
        "Chaque annonce Airbnb de Paris intra-muros, apparaissant sur la carte année après année (une annonce apparaît à son premier commentaire de voyageur) et colorée selon son statut d'enregistrement auprès de la ville.",
        "Les annonces viennent de la collecte Inside Airbnb (CC BY 4.0). Paris impose à la plupart des meublés touristiques d'afficher un numéro d'enregistrement à 13 caractères ; le statut est lu dans le champ licence tel que saisi par l'hôte : un numéro bien formé compte comme déclaré, les baux mobilité et les annonces de type hôtel sont exemptés, tout le reste compte comme non déclaré. Les dates de commentaires ne font qu'approcher la vie réelle d'une annonce.",
      ],
      sources: [
        { label: "Inside Airbnb (CC BY 4.0)", href: "https://insideairbnb.com" },
      ],
    },
  },
  air: {
    en: {
      body: [
        "Seven years of hourly air quality breathing over the Paris region: NO₂ from traffic and PM₂.₅ fine particles, winter smog episodes, clean windy days, and the 2020 lockdown clearing the sky in a week.",
        "Measurements are the hourly station data published by Airparif, the region's air quality observatory. The colored veil interpolates between monitoring stations (inverse-distance weighting) and fades where no station is nearby, so fine local variations between stations are smoothed away.",
      ],
      sources: [{ label: "Airparif open data", href: "https://www.airparif.fr" }],
    },
    fr: {
      body: [
        "Sept ans de qualité de l'air horaire qui respirent sur la région parisienne : le NO₂ du trafic et les particules fines PM₂.₅, les épisodes de smog d'hiver, les journées de vent, et le confinement de 2020 qui purifie le ciel en une semaine.",
        "Les mesures sont les données horaires des stations publiées par Airparif, l'observatoire de la qualité de l'air de la région. Le voile coloré interpole entre les stations de mesure (pondération inverse à la distance) et s'estompe loin de toute station : les variations locales fines entre stations sont donc lissées.",
      ],
      sources: [
        { label: "Open data Airparif", href: "https://www.airparif.fr" },
      ],
    },
  },
  crue: {
    en: {
      body: [
        "Raise the Seine through the 3D city and watch how far each gauge height spreads over the real terrain. Heights use the Austerlitz gauge scale, where the 1910 flood peaked at 8.62 m, and the page also shows the river's level right now, fetched live from Hub'Eau.",
        "The flood extent is a connectivity-aware fill computed on the IGN RGE ALTI elevation model: a cell floods only when the water can actually reach it from the river, not merely when it lies below the waterline. It is a visualization, not a safety model: the terrain grid smooths parapets and low walls, and protection works and the underground are ignored.",
      ],
      sources: [
        { label: "IGN RGE ALTI", href: "https://geoservices.ign.fr/rgealti" },
        {
          label: "Hub'Eau / Vigicrues",
          href: "https://hubeau.eaufrance.fr",
        },
      ],
    },
    fr: {
      body: [
        "Faites monter la Seine dans la ville en 3D et regardez jusqu'où chaque hauteur d'eau s'étend sur le vrai terrain. Les hauteurs utilisent l'échelle d'Austerlitz, où la crue de 1910 a culminé à 8,62 m, et la page affiche aussi le niveau du fleuve en ce moment, récupéré en direct depuis Hub'Eau.",
        "L'emprise de la crue est un remplissage tenant compte de la connectivité, calculé sur le modèle de terrain RGE ALTI de l'IGN : une maille n'est inondée que si l'eau peut réellement l'atteindre depuis le fleuve, pas seulement si elle est sous la ligne d'eau. C'est une visualisation, pas un modèle de sécurité : la grille de terrain lisse les parapets et les murets, et les ouvrages de protection comme le sous-sol sont ignorés.",
      ],
      sources: [
        { label: "IGN RGE ALTI", href: "https://geoservices.ign.fr/rgealti" },
        {
          label: "Hub'Eau / Vigicrues",
          href: "https://hubeau.eaufrance.fr",
        },
      ],
    },
  },
  canicule: {
    en: {
      body: [
        "39,000 urban blocks of Paris and the petite couronne scored for heat: which neighbourhoods overheat by day, which never cool down at night, and where the heat meets the most vulnerable residents.",
        "Scores come from the Institut Paris Region's heat-island dataset (Licence Ouverte 2.0): each morphological block carries a local climate zone and day and night scores for heat hazard and vulnerability, derived from land cover, built density and population. The map is clipped to Paris and the three petite couronne departments.",
      ],
      sources: [
        {
          label: "Institut Paris Region",
          href: "https://data.iledefrance.fr",
        },
      ],
    },
    fr: {
      body: [
        "39 000 îlots urbains de Paris et de la petite couronne notés pour la chaleur : quels quartiers surchauffent le jour, lesquels ne refroidissent jamais la nuit, et où la chaleur rencontre les habitants les plus vulnérables.",
        "Les notes viennent du jeu de données îlot de chaleur de l'Institut Paris Region (Licence Ouverte 2.0) : chaque îlot morphologique porte une zone climatique locale et des notes de jour et de nuit d'aléa et de vulnérabilité, dérivées de l'occupation du sol, de la densité bâtie et de la population. La carte est découpée à Paris et aux trois départements de la petite couronne.",
      ],
      sources: [
        {
          label: "Institut Paris Region",
          href: "https://data.iledefrance.fr",
        },
      ],
    },
  },
};
