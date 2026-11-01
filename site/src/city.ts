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
