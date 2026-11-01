// "For you": what the visitor told us they like (interests, who it's for, where,
// free only). Asked once on the first visit, editable from the search bar's
// filter button, saved in this browser only (localStorage).
//
// Preferences never hide anything: matching events move up (prefsScore, used by
// likes.ts's personalScore). matchesPrefs only counts matches for the panel.
import type { Ev } from "./data";
import { city, cityLabel } from "./city";
import { lang } from "./i18n";

export interface Prefs {
  interests: string[]; // ids from INTERESTS
  audiences: string[]; // ids from AUDIENCES
  boroughs: string[];
  freeOnly: boolean;
}

type Label = [string, string]; // [fr, en]

/** Interest groups shown to visitors, each covering some of the 24 categories. */
export const INTERESTS: { id: string; label: Label; categories: string[] }[] = [
  { id: "shows", label: ["Spectacles & musique", "Shows & music"],
    categories: ["music", "music-intro", "theatre", "dance", "circus", "comedy", "film", "spoken-word"] },
  { id: "arts", label: ["Expos & arts", "Exhibitions & arts"], categories: ["exhibition", "art-craft"] },
  { id: "kids", label: ["Heure du conte & jeux", "Storytime & games"], categories: ["storytime", "games"] },
  { id: "books", label: ["Livres & langues", "Books & languages"], categories: ["books", "languages"] },
  { id: "learn", label: ["Conférences & sciences", "Talks & science"],
    categories: ["science-tech", "computers", "society-history", "other"] },
  { id: "sport", label: ["Sport & plein air", "Sports & outdoors"], categories: ["sport-outdoors", "gardening"] },
  { id: "wellness", label: ["Bien-être & cuisine", "Wellness & cooking"], categories: ["wellness", "cooking"] },
  { id: "community", label: ["Fêtes, marchés & entraide", "Festivals, markets & community"],
    categories: ["festival-market", "support"] },
];

/** "Who is it for": each choice accepts events aimed at these audiences ("all" fits everyone). */
export const AUDIENCES: { id: string; label: Label; accepts: string[] }[] = [
  { id: "adults", label: ["Adultes", "Adults"], accepts: ["adults", "all"] },
  { id: "family", label: ["Enfants & famille", "Kids & family"], accepts: ["kids", "preschool", "family", "all"] },
  { id: "teens", label: ["Ados", "Teens"], accepts: ["teens", "all"] },
  { id: "seniors", label: ["Aînés", "Seniors"], accepts: ["seniors", "adults", "all"] },
];

export const label = (l: Label) => (lang === "fr" ? l[0] : l[1]);

// Per city: areas differ from one city to the next.
const KEY = city.id === "montreal" ? "tg-prefs" : `tg-prefs-${city.id}`;
const EMPTY: Prefs = { interests: [], audiences: [], boroughs: [], freeOnly: false };

function read(): Prefs | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return {
      interests: Array.isArray(p.interests) ? p.interests : [],
      audiences: Array.isArray(p.audiences) ? p.audiences : [],
      boroughs: Array.isArray(p.boroughs) ? p.boroughs : [],
      freeOnly: Boolean(p.freeOnly),
    };
  } catch {
    return null;
  }
}

let current: Prefs | null = read();

/** True once the visitor answered (or skipped) the first-visit question. */
export const prefsSeen = () => current !== null;
export const getPrefs = (): Prefs => current ?? EMPTY;

export function savePrefs(p: Prefs): void {
  current = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage blocked: preferences last for this page only
  }
}

/** How many preference groups are set (for the badge on the search bar's button). */
export function prefsCount(p = getPrefs()): number {
  return (p.interests.length ? 1 : 0) + (p.audiences.length ? 1 : 0) + (p.boroughs.length ? 1 : 0) + (p.freeOnly ? 1 : 0);
}

/** Compiled once per change, since matchesPrefs runs for thousands of events.
 *  Keyed on the contents, not the object: the panel edits its draft in place. */
let compiledKey = "";
let cats: Set<string> | null = null;
let auds: Set<string> | null = null;
let boros: Set<string> | null = null;

function compile(p: Prefs): void {
  const key = JSON.stringify(p);
  if (key === compiledKey) return;
  compiledKey = key;
  cats = p.interests.length
    ? new Set(INTERESTS.filter((i) => p.interests.includes(i.id)).flatMap((i) => i.categories)) : null;
  auds = p.audiences.length
    ? new Set(AUDIENCES.filter((a) => p.audiences.includes(a.id)).flatMap((a) => a.accepts)) : null;
  boros = p.boroughs.length ? new Set(p.boroughs) : null;
}

export function matchesPrefs(e: Ev, p: Prefs = getPrefs()): boolean {
  compile(p);
  if (p.freeOnly && !e.is_free) return false;
  if (cats && !cats.has(e.category)) return false;
  if (auds && e.audience && !auds.has(e.audience)) return false;
  // Online events are for everyone, wherever they live.
  if (boros && e.format !== "online" && !(e.borough && boros.has(e.borough))) return false;
  return true;
}

/** Ranking boost for an event: points for each preference group it matches. */
export function prefsScore(e: Ev, p: Prefs = getPrefs()): number {
  compile(p);
  let s = 0;
  if (cats?.has(e.category)) s += 2;
  if (auds && e.audience && e.audience !== "all" && auds.has(e.audience)) s += 1;
  if (boros && e.borough && boros.has(e.borough)) s += 1.5;
  if (p.freeOnly && e.is_free) s += 0.5;
  return s;
}

/** Short summary like "Spectacles & musique, Enfants & famille · Verdun · gratuit". */
export function prefsSummary(p = getPrefs()): string {
  const parts: string[] = [];
  const names = [
    ...INTERESTS.filter((i) => p.interests.includes(i.id)).map((i) => label(i.label)),
    ...AUDIENCES.filter((a) => p.audiences.includes(a.id)).map((a) => label(a.label)),
  ];
  if (names.length) parts.push(names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", "));
  if (p.boroughs.length) parts.push(p.boroughs.length > 2 ? `${p.boroughs.length} ${cityLabel(city.areaPlural)}` : p.boroughs.join(", "));
  if (p.freeOnly) parts.push(lang === "fr" ? "gratuit" : "free");
  return parts.join(" · ");
}
