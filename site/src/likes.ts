// Likes: the heart on each event. Saved in this browser only (localStorage), like
// the "For you" preferences. A like covers every date of an activity (same title),
// so the heart stays filled as its next date moves along.
//
// Likes never hide anything: they only move similar events up (see personalScore).
import { city } from "./city";
import { Ev, seriesKey } from "./data";
import { prefsScore } from "./prefs";

/** What we keep about a liked event: enough to find similar ones. */
interface Like {
  key: string; // seriesKey of the event
  category: string;
  audience: string | null;
  borough: string | null;
  venue: string | null;
  words: string[]; // meaningful title words
  at: number; // when it was liked (ms)
  city?: string; // missing on likes saved before cities were tracked (see adoptLikes)
}

const KEY = "tg-likes";
const HALF_LIFE_DAYS = 30; // a like counts half as much after a month
const FULL_WEIGHT_AT = 3; // with fewer likes, they count less (two storytimes shouldn't take over)

const STOP = new Set([
  "avec", "pour", "dans", "les", "des", "une", "sur", "aux", "the", "and", "with", "from", "your",
  "atelier", "activite", "activites", "club", "groupe", "session", "seance", "event", "evenement",
]);

function titleWords(title: string): string[] {
  return [...new Set(seriesKey({ title } as Ev).split(" ").filter((w) => w.length >= 4 && !STOP.has(w)))];
}

function read(): Like[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((l) => l && typeof l.key === "string") : [];
  } catch {
    return [];
  }
}

let likes: Like[] = read();
let keys = new Set(likes.map((l) => l.key));

function save(): void {
  keys = new Set(likes.map((l) => l.key));
  try {
    localStorage.setItem(KEY, JSON.stringify(likes));
  } catch {
    // storage blocked: likes last for this page only
  }
}

export const likeKey = (e: Ev) => seriesKey(e);
export const isLiked = (e: Ev) => keys.has(likeKey(e));
/** Likes for this page's city (each city counts its own). */
export const likeCount = () => likes.filter((l) => l.city === city.id).length;

/** Older likes were saved without a city: tag the ones that match this city's events. */
export function adoptLikes(events: Ev[]): void {
  if (!likes.some((l) => !l.city)) return;
  const here = new Set(events.map(likeKey));
  let changed = false;
  for (const l of likes) {
    if (!l.city && here.has(l.key)) { l.city = city.id; changed = true; }
  }
  if (changed) save();
}

/** Like or unlike; returns the new state. */
export function toggleLike(e: Ev): boolean {
  const key = likeKey(e);
  if (keys.has(key)) {
    likes = likes.filter((l) => l.key !== key);
  } else {
    likes.push({
      key, category: e.category, audience: e.audience, borough: e.borough, venue: e.venue,
      words: titleWords(e.title), at: Date.now(), city: city.id,
    });
  }
  save();
  return keys.has(key);
}

/** How much an event looks like what was liked, about 0–4. */
function likesScore(e: Ev): number {
  if (!likes.length) return 0;
  if (keys.has(likeKey(e))) return 4;
  const now = Date.now();
  const words = new Set(titleWords(e.title));
  let total = 0;
  let weights = 0;
  for (const l of likes) {
    const w = 0.5 ** ((now - l.at) / 86_400_000 / HALF_LIFE_DAYS);
    let s = 0;
    if (l.category === e.category) s += 1;
    if (l.venue && l.venue === e.venue) s += 1.5;
    if (l.borough && l.borough === e.borough) s += 0.5;
    if (l.audience && l.audience !== "all" && l.audience === e.audience) s += 0.5;
    s += Math.min(2, 0.75 * l.words.filter((x) => words.has(x)).length);
    total += w * s;
    weights += w;
  }
  // Average similarity (so 50 music likes don't drown everything), scaled down
  // while there are only a few likes.
  return (2 * total / weights) * Math.min(1, likes.length / FULL_WEIGHT_AT);
}

/** "For you" preferences + likes. 0 = nothing personal about this event. */
export function personalScore(e: Ev): number {
  return prefsScore(e) + likesScore(e);
}

const MIN_SCORE = 1.5; // weaker matches stay in their normal place

/**
 * Splits one day's events (already in display order) into the best personal
 * matches, ranked, and the rest, unchanged. Nothing is dropped. The top is kept
 * short and varied: each pick of a category makes the next one of it rank lower.
 */
export function rankDay(list: Ev[], max: number): [Ev[], Ev[]] {
  const scored = list.map((e) => ({ e, s: personalScore(e) })).filter((x) => x.s >= MIN_SCORE);
  const top: Ev[] = [];
  const perCategory = new Map<string, number>();
  while (top.length < max && scored.length) {
    let best = 0;
    let bestValue = -Infinity;
    scored.forEach((x, i) => {
      const value = x.s - 0.75 * (perCategory.get(x.e.category) ?? 0);
      if (value > bestValue) [best, bestValue] = [i, value];
    });
    const [{ e }] = scored.splice(best, 1);
    top.push(e);
    perCategory.set(e.category, (perCategory.get(e.category) ?? 0) + 1);
  }
  const picked = new Set(top);
  return [top, list.filter((e) => !picked.has(e))];
}
