// Loading events.json, date helpers (all in Montréal time), filters and URL state.
import { categoryLabel } from "./i18n";
import { matchesPrefs } from "./prefs";

export const TZ = "America/Toronto";

/** One event as written by scripts/build_data.py. */
export interface RawEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string | null;
  all_day: boolean;
  price_min: number;
  price_max: number;
  price_label: string;
  is_free: boolean;
  category: string;
  audience: string | null;
  format: "indoor" | "outdoor" | "online" | null;
  registration: "required" | "drop-in" | "ticket" | null;
  venue: string | null;
  address: string | null;
  borough: string | null;
  lat: number | null;
  lng: number | null;
  url: string | null;
  links: Link[];
  image: string | null;
  status: string;
  source: string;
  organizer?: string | null;
}

/** Extra "learn more" links found in the source data. */
export interface Link {
  type: "website" | "facebook" | "instagram" | "phone";
  url: string;
}

/** RawEvent plus fields computed once in the browser. */
export interface Ev extends RawEvent {
  startMs: number;
  endMs: number;
  startDay: string; // "YYYY-MM-DD" in Montréal time
  endDay: string;
  multiDay: boolean;
  haystack: string; // lowercase, accent-free text for search
}

export interface Meta {
  built_at: string;
  count: number;
}

// ---------------------------------------------------------------- dates
// Days are handled as "YYYY-MM-DD" strings in Montréal time; that avoids most
// timezone bugs (the visitor's computer may be in another timezone).

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});

export function dayOf(ms: number): string {
  return dayFormat.format(ms); // en-CA formats as YYYY-MM-DD
}

export function today(): string {
  return dayOf(Date.now());
}

/** Noon UTC on that day: safe for weekday/month arithmetic. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

export function addDays(day: string, n: number): string {
  const d = dayToDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday (weeks start on Monday, as in Québec calendars). */
export function weekdayIndex(day: string): number {
  return (dayToDate(day).getUTCDay() + 6) % 7;
}

// ---------------------------------------------------------------- loading

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function prepare(e: RawEvent): Ev {
  // Date-only values (rare: page details missing) are treated as all day.
  const startMs = e.all_day ? Date.parse(`${e.start}T00:00:00-05:00`) : Date.parse(e.start);
  const endRaw = e.end ?? e.start;
  const endMs = e.all_day ? Date.parse(`${endRaw}T23:59:00-05:00`) : Date.parse(endRaw);
  const startDay = e.all_day ? e.start.slice(0, 10) : dayOf(startMs);
  const endDay = e.all_day ? endRaw.slice(0, 10) : dayOf(endMs);
  return {
    ...e,
    startMs,
    endMs,
    startDay,
    endDay: endDay < startDay ? startDay : endDay,
    multiDay: endDay > startDay,
    haystack: normalize(
      [e.title, e.description, e.venue, e.borough, e.organizer, categoryLabel(e.category, "fr"),
        categoryLabel(e.category, "en")].join(" "),
    ),
  };
}

export async function loadEvents(): Promise<Ev[]> {
  const res = await fetch("data/events.json");
  if (!res.ok) throw new Error(`events.json: HTTP ${res.status}`);
  const raw: RawEvent[] = await res.json();
  return raw.map(prepare).sort((a, b) => a.startMs - b.startMs);
}

export async function loadMeta(): Promise<Meta | null> {
  try {
    const res = await fetch("data/meta.json");
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Single-day events by start time, then multi-day ones by end date. */
export function byDisplayOrder(a: Ev, b: Ev): number {
  if (a.multiDay !== b.multiDay) return a.multiDay ? 1 : -1;
  return a.multiDay ? a.endMs - b.endMs : a.startMs - b.startMs || a.title.localeCompare(b.title);
}

// ---------------------------------------------------------------- filters

export type When = "" | "today" | "weekend" | "week" | "custom";

export interface Filters {
  q: string;
  when: When;
  from: string;
  to: string;
  cat: string;
  boro: string;
  dropin: boolean;
  free: boolean;
  all: boolean; // true = ignore the visitor's saved preferences ("Tout voir")
}

/** The [first, last] day the "When" filter covers, or null for "any time". */
export function dateRange(f: Filters, now = today()): [string, string] | null {
  const dow = weekdayIndex(now);
  switch (f.when) {
    case "today":
      return [now, now];
    case "weekend": {
      if (dow === 6) return [now, now]; // Sunday: just today
      const sat = addDays(now, 5 - dow);
      return [sat < now ? now : sat, addDays(sat, 1)];
    }
    case "week":
      return [now, addDays(now, 6 - dow)]; // through Sunday
    case "custom": {
      const from = f.from || now;
      const to = f.to && f.to >= from ? f.to : from;
      return [from, to];
    }
    default:
      return null;
  }
}

export function matches(e: Ev, f: Filters, range: [string, string] | null): boolean {
  if (range && (e.endDay < range[0] || e.startDay > range[1])) return false;
  if (f.cat && e.category !== f.cat) return false;
  if (f.boro && e.borough !== f.boro) return false;
  if (f.dropin && e.registration !== "drop-in") return false;
  if (f.free && !e.is_free) return false;
  if (!f.all && !matchesPrefs(e)) return false;
  if (f.q) {
    for (const word of normalize(f.q).split(/\s+/)) {
      if (word && !e.haystack.includes(word)) return false;
    }
  }
  return true;
}

export function hasActiveFilters(f: Filters): boolean {
  return Boolean(f.q || f.when || f.cat || f.boro || f.dropin || f.free);
}

// ---------------------------------------------------------------- URL state
// Filters, the open event, and the calendar's month/day live in the query
// string, so any view can be shared as a link and the back button works.

const WHENS: When[] = ["", "today", "weekend", "week", "custom"];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function readFilters(): Filters {
  const p = new URLSearchParams(location.search);
  const when = p.get("when") as When;
  const day = (k: string) => (DAY_RE.test(p.get(k) ?? "") ? p.get(k)! : "");
  return {
    q: p.get("q") ?? "",
    when: WHENS.includes(when) ? when : "",
    from: day("from"),
    to: day("to"),
    cat: p.get("cat") ?? "",
    boro: p.get("boro") ?? "",
    dropin: p.get("dropin") === "1",
    free: p.get("free") === "1",
    all: p.get("all") === "1",
  };
}

export function param(name: string): string {
  return new URLSearchParams(location.search).get(name) ?? "";
}

/** Merge values into the query string. Empty values are removed. */
export function setParams(values: Record<string, string | boolean>, push = false): void {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(values)) {
    if (v === "" || v === false) p.delete(k);
    else p.set(k, v === true ? "1" : v);
  }
  const qs = p.toString();
  const url = location.pathname + (qs ? `?${qs}` : "") + location.hash;
  if (url === location.pathname + location.search + location.hash) return;
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

export function filtersToParams(f: Filters): Record<string, string | boolean> {
  const custom = f.when === "custom";
  return {
    q: f.q, when: f.when, from: custom ? f.from : "", to: custom ? f.to : "",
    cat: f.cat, boro: f.boro, dropin: f.dropin, free: f.free, all: f.all,
  };
}

/** Query string with only the filters, for links between pages. */
export function filterQuery(f: Filters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtersToParams(f))) {
    if (v !== "" && v !== false) p.set(k, v === true ? "1" : v);
  }
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}
