// All UI text lives here, in French (default) and English.
// Event content itself (titles, descriptions) comes from the city in French.

export type Lang = "fr" | "en";

const STORAGE_KEY = "tg-lang";

export function getLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "fr" || saved === "en") return saved;
  } catch {
    // storage blocked (private mode…): fall back to French
  }
  return "fr";
}

export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

export const lang: Lang = getLang();
document.documentElement.lang = lang;

// French uses the singular for 0 and 1 ("0 activité"); English only for 1.

const fr = {
  "nav.views": "Vues",
  "nav.list": "Liste",
  "nav.calendar": "Calendrier",
  "nav.map": "Carte",
  "lang.switch": "Switch to English",
  "hero.title": "Des choses gratuites ou presque à faire à Montréal.",
  "hero.sub":
    "Tout ici est gratuit ou coûte 10 $ et moins. Nouvelles activités chaque matin, tirées des données ouvertes de la Ville de Montréal.",
  "search.label": "Rechercher des activités",
  "search.placeholder": "Concerts, parcs, ateliers…",
  "filters": "Filtres",
  "when": "Quand",
  "when.today": "Aujourd'hui",
  "when.weekend": "Cette fin de semaine",
  "when.week": "Cette semaine",
  "when.custom": "Choisir des dates",
  "when.from": "Du",
  "when.to": "Au",
  "access": "Accès",
  "dropin": "Sans inscription",
  "free": "Gratuit seulement",
  "category": "Catégorie",
  "category.all": "Toutes",
  "borough": "Arrondissement",
  "borough.all": "Tous",
  "tag.free": "GRATUIT",
  "tag.required": "INSCRIPTION",
  "tag.ticket": "BILLET",
  "tag.required.long": "Inscription requise",
  "tag.ticket.long": "Billet gratuit requis",
  "day.today": "Aujourd'hui",
  "day.tomorrow": "Demain",
  "until": "Jusqu'au",
  "online": "En ligne",
  "allDay": "Toute la journée",
  "empty.day": "Rien à l'horaire pour l'instant. Belle journée pour une marche sur la montagne.",
  "empty.filters": "Aucune activité ne correspond à ces filtres.",
  "clearFilters": "Effacer les filtres",
  "loading": "Chargement…",
  "loadError": "Impossible de charger les activités. Réessayez plus tard.",
  "detail": "Détails de l'activité",
  "detail.when": "Quand",
  "detail.where": "Où",
  "detail.borough": "Arrondissement",
  "detail.for": "Pour qui",
  "detail.access": "Accès",
  "detail.price": "Prix",
  "detail.dropin": "Entrée libre",
  "detail.accessUnknown": "Voir la page officielle",
  "detail.more": "En savoir plus",
  "detail.maps": "Itinéraire (Google Maps)",
  "detail.search": "Rechercher sur Google",
  "detail.source": "Source",
  "detail.priceNote": "Tarif indiqué par l'organisateur ; il peut varier selon l'âge ou la résidence.",
  "detail.official": "Page officielle",
  "detail.officialLoisirs": "Voir sur Loisirs Montréal",
  "detail.ics": "Ajouter au calendrier (.ics)",
  "detail.icsShort": "Ajouter (.ics)",
  "detail.google": "Google Agenda",
  "detail.close": "Fermer",
  "detail.mapLabel": "Petite carte du lieu",
  "cal.today": "Aujourd'hui",
  "cal.prev": "Mois précédent",
  "cal.next": "Mois suivant",
  "cal.grid": "Grille du mois",
  "cal.dayPanel": "Activités du jour sélectionné",
  "map.label": "Carte des activités",
  "map.noCoords": "sans lieu sur la carte (en ligne ou adresse inconnue)",
  "footer.data": "Données : Ville de Montréal, CC BY 4.0",
  "footer.updated": "Mis à jour",
  "footer.about": "À propos",
  "about.title": "À propos",
  "part.morning": "Matin",
  "part.afternoon": "Après-midi",
  "part.evening": "Soir",
  "part.allday": "Toute la journée et en cours",
  "detail.otherDates": "Autres dates",
  "detail.showAllDates": "Voir toutes les dates",
};

type Key = keyof typeof fr;

const en: Record<Key, string> = {
  "nav.views": "Views",
  "nav.list": "List",
  "nav.calendar": "Calendar",
  "nav.map": "Map",
  "lang.switch": "Passer en français",
  "hero.title": "Free & almost-free things to do in Montréal.",
  "hero.sub":
    "Everything here is free or $10 and under. Fresh listings every morning from the City of Montréal's open data.",
  "search.label": "Search events",
  "search.placeholder": "Concerts, parks, workshops…",
  "filters": "Filters",
  "when": "When",
  "when.today": "Today",
  "when.weekend": "This weekend",
  "when.week": "This week",
  "when.custom": "Pick dates",
  "when.from": "From",
  "when.to": "To",
  "access": "Access",
  "dropin": "Drop-in only",
  "free": "Free only",
  "category": "Category",
  "category.all": "All",
  "borough": "Borough",
  "borough.all": "All",
  "tag.free": "FREE",
  "tag.required": "REGISTER",
  "tag.ticket": "TICKET",
  "tag.required.long": "Registration required",
  "tag.ticket.long": "Free ticket required",
  "day.today": "Today",
  "day.tomorrow": "Tomorrow",
  "until": "Until",
  "online": "Online",
  "allDay": "All day",
  "empty.day": "Nothing listed yet. Good day for a walk on the mountain.",
  "empty.filters": "No events match these filters.",
  "clearFilters": "Clear filters",
  "loading": "Loading…",
  "loadError": "Couldn't load events. Please try again later.",
  "detail": "Event details",
  "detail.when": "When",
  "detail.where": "Where",
  "detail.borough": "Borough",
  "detail.for": "For",
  "detail.access": "Access",
  "detail.price": "Price",
  "detail.dropin": "Drop-in, no registration",
  "detail.accessUnknown": "See the official page",
  "detail.more": "Learn more",
  "detail.maps": "Directions (Google Maps)",
  "detail.search": "Search on Google",
  "detail.source": "Source",
  "detail.priceNote": "Price as given by the organizer; it may vary by age or residency.",
  "detail.official": "Official page",
  "detail.officialLoisirs": "See on Loisirs Montréal",
  "detail.ics": "Add to calendar (.ics)",
  "detail.icsShort": "Add (.ics)",
  "detail.google": "Google Calendar",
  "detail.close": "Close",
  "detail.mapLabel": "Small map of the venue",
  "cal.today": "Today",
  "cal.prev": "Previous month",
  "cal.next": "Next month",
  "cal.grid": "Month grid",
  "cal.dayPanel": "Events on selected day",
  "map.label": "Map of events",
  "map.noCoords": "not on the map (online or unknown address)",
  "footer.data": "Data: Ville de Montréal, CC BY 4.0",
  "footer.updated": "Updated",
  "footer.about": "About",
  "about.title": "About",
  "part.morning": "Morning",
  "part.afternoon": "Afternoon",
  "part.evening": "Evening",
  "part.allday": "All day and ongoing",
  "detail.otherDates": "Other dates",
  "detail.showAllDates": "Show all dates",
};

const strings: Record<Lang, Record<Key, string>> = { fr, en };

export function t(key: Key): string {
  return strings[lang][key];
}

export function countLabel(n: number): string {
  return lang === "fr" ? `${n} ${n <= 1 ? "activité" : "activités"}` : `${n} ${n === 1 ? "event" : "events"}`;
}

export function moreLabel(n: number): string {
  return lang === "fr" ? `+${n} autre${n > 1 ? "s" : ""}` : `+${n} more`;
}

/** "+11 autres dates · 3 lieux" / "+11 more dates · 3 places" */
export function seriesLabel(moreDates: number, places: number): string {
  const dates = lang === "fr"
    ? `+${moreDates} autre${moreDates > 1 ? "s" : ""} date${moreDates > 1 ? "s" : ""}`
    : `+${moreDates} more date${moreDates > 1 ? "s" : ""}`;
  if (places < 2) return dates;
  return `${dates} · ${places} ${lang === "fr" ? "lieux" : "places"}`;
}

export function showMoreLabel(n: number): string {
  return lang === "fr" ? `Afficher plus (${n} restantes)` : `Show more (${n} left)`;
}

// Category slugs come from the pipeline (sources/ville_montreal.py).
const CATEGORIES: Record<string, [string, string]> = {
  "art-craft": ["Art et artisanat", "Arts & crafts"],
  "books": ["Lecture et littérature", "Books & reading"],
  "circus": ["Cirque", "Circus"],
  "comedy": ["Humour", "Comedy"],
  "computers": ["Informatique", "Computers"],
  "cooking": ["Cuisine", "Cooking"],
  "dance": ["Danse", "Dance"],
  "exhibition": ["Exposition", "Exhibitions"],
  "festival-market": ["Fête et marché", "Festivals & markets"],
  "film": ["Cinéma", "Film"],
  "games": ["Jeux", "Games"],
  "gardening": ["Jardinage", "Gardening"],
  "languages": ["Langues", "Languages"],
  "music": ["Musique", "Music"],
  "music-intro": ["Initiation à la musique", "Music for beginners"],
  "science-tech": ["Science et techno", "Science & tech"],
  "society-history": ["Société et histoire", "Society & history"],
  "spoken-word": ["Art de la parole", "Spoken word"],
  "sport-outdoors": ["Sport et plein air", "Sports & outdoors"],
  "storytime": ["Heure du conte", "Storytime"],
  "support": ["Soutien et échange", "Support & community"],
  "theatre": ["Théâtre", "Theatre"],
  "wellness": ["Bien-être", "Wellness"],
  "other": ["Autre", "Other"],
};

/** 6.5 -> "6,50 $" (fr) / "$6.50" (en); whole dollars without decimals. */
export function money(x: number): string {
  const n = x % 1 ? x.toFixed(2) : String(x);
  return lang === "fr" ? `${n.replace(".", ",")} $` : `$${n}`;
}

/** Text for the price tag: "GRATUIT", "6,50 $", "3,25–8 $" / "$3.25–$8". */
export function priceTag(min: number, max: number): string {
  if (max === 0) return t("tag.free");
  if (min === max) return money(min);
  if (lang === "fr") return `${money(min).replace(" $", "")}–${money(max)}`;
  return `${money(min)}–${money(max)}`;
}

export const SOURCE_NAMES: Record<string, string> = {
  "ville-de-montreal": "Ville de Montréal — Événements publics",
  "loisirs-montreal": "Ville de Montréal — Loisirs Montréal",
  "concordia": "Concordia University — Events",
  "uqam": "UQAM — Événements",
  "udem": "Université de Montréal — Calendrier",
};

export function categoryLabel(slug: string, l: Lang = lang): string {
  const pair = CATEGORIES[slug];
  return pair ? pair[l === "fr" ? 0 : 1] : slug;
}

export const categorySlugs = Object.keys(CATEGORIES);

const AUDIENCES: Record<string, [string, string]> = {
  all: ["Pour tous", "Everyone"],
  adults: ["Adultes", "Adults"],
  kids: ["Enfants", "Kids"],
  preschool: ["Enfants d'âge préscolaire", "Preschoolers"],
  family: ["Famille", "Families"],
  seniors: ["Personnes aînées", "Seniors"],
  teens: ["Adolescents", "Teens"],
};

export function audienceLabel(slug: string | null): string {
  const pair = slug ? AUDIENCES[slug] : null;
  return pair ? pair[lang === "fr" ? 0 : 1] : "—";
}
