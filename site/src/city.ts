// Which city this page is for. Each city has its own pages (Montréal at the site
// root, Ottawa in ottawa/) and its own data file, fetched relative to the page
// ("data/events.json"), so events from two cities never mix.
//
// Each city's pages say which city they are with <meta name="tg-city" content="…">.
// The about page is shared and has no tag: it gets the city from ?city= (so its
// links lead back to the right city).
import type L from "leaflet";
import { lang } from "./i18n";

type Label = [string, string]; // [fr, en]

interface City {
  id: string;
  name: string;
  /** For the city switcher on phones. */
  short: string;
  /** Folder of the city's pages, relative to the site root ("" for Montréal). */
  dir: string;
  center: L.LatLngTuple;
  zoom: number;
  /** What the "borough" field holds in this city. */
  area: Label;
  areaAll: Label;
  areaPlural: Label;
  dataCredit: Label;
}

export const CITIES: City[] = [
  {
    id: "montreal", name: "Montréal", short: "MTL", dir: "", center: [45.54, -73.66], zoom: 11,
    area: ["Arrondissement", "Borough"],
    areaAll: ["Tous les arrondissements", "All boroughs"],
    areaPlural: ["arrondissements", "boroughs"],
    dataCredit: ["Données : Ville de Montréal, CC BY 4.0", "Data: Ville de Montréal, CC BY 4.0"],
  },
  {
    id: "ottawa", name: "Ottawa", short: "OTT", dir: "ottawa/", center: [45.35, -75.75], zoom: 10,
    area: ["Bibliothèque", "Library branch"],
    areaAll: ["Toutes les bibliothèques", "All branches"],
    areaPlural: ["bibliothèques", "branches"],
    dataCredit: [
      "Données : Bibliothèque publique d'Ottawa (licence de données ouvertes de la Ville d'Ottawa), Carleton, uOttawa",
      "Data: Ottawa Public Library (City of Ottawa Open Data Licence), Carleton, uOttawa",
    ],
  },
];

const id = document.querySelector<HTMLMetaElement>('meta[name="tg-city"]')?.content
  ?? new URLSearchParams(location.search).get("city") ?? "montreal";
export const city: City = CITIES.find((c) => c.id === id) ?? CITIES[0];

/** Path from this page back to the site root ("" or "../"). Only the city pages
 *  live in a city folder; the shared about page is at the root. */
const inCityFolder = Boolean(document.querySelector('meta[name="tg-city"]')) && city.dir !== "";
export const rootPath = inCityFolder ? "../".repeat(city.dir.split("/").filter(Boolean).length) : "";

/** Link to a city's page (e.g. its calendar). */
export function cityHref(other: City, file: string): string {
  return `${rootPath}${other.dir}${file}`;
}

/** The shared about page, keeping track of which city the visitor came from. */
export const aboutHref = () => `${rootPath}about.html${city.id === "montreal" ? "" : `?city=${city.id}`}`;

export const cityLabel = (l: Label) => (lang === "fr" ? l[0] : l[1]);

// --- Which city to open on the home page -----------------------------------------
// The site root is Montréal's list page. A visitor who arrives there from outside the
// site (typed address, bookmark, search, installed app) is sent to their city:
//   1. the last city whose pages they used in this browser, or, the first time,
//   2. the nearest city to their approximate location, looked up once from their IP
//      address (get.geojs.io). Further than MAX_KM from every city: stay on Montréal.
// Arriving from one of the site's own pages (city switcher, logo, a shared ?city=montreal
// link) never redirects, so Montréal stays one click away for everybody.
const SAVED_KEY = "tg-city";
const MAX_KM = 200;
const LOOKUP_TIMEOUT_MS = 2000;

function readSavedCity(): string | null {
  try { return localStorage.getItem(SAVED_KEY); } catch { return null; }
}
/** What was saved before this page saved its own city (see rememberCity). */
const savedAtLoad = readSavedCity();

/** Called by every city page: the next visit to the site root opens this city. */
export function rememberCity(): void {
  if (!document.querySelector('meta[name="tg-city"]')) return; // shared about page
  try { localStorage.setItem(SAVED_KEY, city.id); } catch { /* private mode: no memory */ }
}

function kmBetween([lat1, lon1]: L.LatLngTuple, [lat2, lon2]: L.LatLngTuple): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

async function nearestCityByIp(): Promise<City | null> {
  const res = await fetch("https://get.geojs.io/v1/ip/geo.json", { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
  if (!res.ok) return null;
  const geo = await res.json() as { latitude?: string; longitude?: string };
  const here: L.LatLngTuple = [Number(geo.latitude), Number(geo.longitude)];
  if (!here.every(Number.isFinite)) return null;
  const [best] = CITIES.map((c) => ({ c, km: kmBetween(here, c.center) })).sort((a, b) => a.km - b.km);
  return best.km <= MAX_KM ? best.c : null;
}

/** Home page (site root) only: send a visitor coming from outside the site to their city. */
export function openHomeCity(): void {
  if (city.dir !== "" || new URLSearchParams(location.search).has("city")) return;
  const siteRoot = new URL(rootPath || "./", location.href).href;
  if (document.referrer.startsWith(siteRoot)) return;
  const go = (target: City | undefined | null) => {
    if (target && target.id !== city.id) location.replace(cityHref(target, ""));
  };
  if (savedAtLoad) go(CITIES.find((c) => c.id === savedAtLoad));
  else nearestCityByIp().then(go).catch(() => { /* offline or blocked: stay here */ });
}
