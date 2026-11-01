// Times and dates, formatted the way each language expects in Québec:
// French uses 24-hour time ("19h30"), English uses "7:30 PM".
import { addDays, dayToDate, Ev, today, TZ } from "./data";
import { lang, t } from "./i18n";

const locale = lang === "fr" ? "fr-CA" : "en-CA";

const hourMinute = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hour: "numeric", minute: "2-digit", hourCycle: "h23",
});

function hm(ms: number): { h: number; m: string } {
  const parts = hourMinute.formatToParts(ms);
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  const m = parts.find((p) => p.type === "minute")!.value;
  return { h, m };
}

/** Hour of the day (0–23) in Montréal. */
export function hourOf(ms: number): number {
  return hm(ms).h;
}

/** "19h30" / "19h" in French; "7:30 PM" in English. */
export function clock(ms: number): string {
  const { h, m } = hm(ms);
  if (lang === "fr") return m === "00" ? `${h}h` : `${h}h${m}`;
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** Calendar chips: "19h30" / "7:30p" ("7p" on the hour). */
export function chipTime(ms: number): string {
  const { h, m } = hm(ms);
  if (lang === "fr") return m === "00" ? `${h}h` : `${h}h${m}`;
  return `${h % 12 || 12}${m === "00" ? "" : `:${m}`}${h < 12 ? "a" : "p"}`;
}

const shortDate = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short", day: "numeric" });
const longDate = new Intl.DateTimeFormat(locale, {
  timeZone: "UTC", weekday: "long", month: "long", day: "numeric",
});
const weekdayName = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "long" });
const monthOnly = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "long" });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "14 nov." / "Nov 14" */
export function fmtShortDate(day: string): string {
  return shortDate.format(dayToDate(day));
}

/** "Samedi 14 novembre" / "Saturday, November 14" */
export function fmtLongDate(day: string): string {
  return capitalize(longDate.format(dayToDate(day)));
}

/** "2026-11" -> { name: "Novembre", year: "2026" } */
export function fmtMonth(month: string): { name: string; year: string } {
  return { name: capitalize(monthOnly.format(dayToDate(`${month}-01`))), year: month.slice(0, 4) };
}

/** Heading for a day group in the list: "Aujourd'hui", "Demain" or the weekday. */
export function dayGroupLabel(day: string): string {
  const now = today();
  if (day === now) return t("day.today");
  if (day === addDays(now, 1)) return t("day.tomorrow");
  return capitalize(weekdayName.format(dayToDate(day)));
}

export function weekdayShort(lettersOnly: boolean): string[] {
  // Monday first. Mon 2026-11-02 is a known Monday.
  const fmt = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: lettersOnly ? "narrow" : "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(dayToDate(addDays("2026-11-02", i))).replace(".", ""));
}

/** Time column of an event row. Multi-day events show their end date instead. */
export function timeColumn(e: Ev): { kicker?: string; main: string; sub?: string } {
  if (e.multiDay) return { kicker: t("until"), main: fmtShortDate(e.endDay) };
  if (e.all_day) return { main: "—", sub: t("allDay") };
  const start = clock(e.startMs);
  const end = e.end ? clock(e.endMs) : "";
  if (lang === "fr") return { main: start, sub: end ? `– ${end}` : undefined };
  const [num, ampm] = start.split(" ");
  return { main: num, sub: end ? `${ampm} – ${end}` : ampm };
}

function duration(ms: number): string {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (lang === "fr") return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** Full "When" line for the detail view, with duration. */
export function whenText(e: Ev): string {
  if (e.multiDay) {
    const from = `${fmtLongDate(e.startDay)}${e.all_day ? "" : `, ${clock(e.startMs)}`}`;
    const to = `${fmtLongDate(e.endDay)}${e.all_day ? "" : `, ${clock(e.endMs)}`}`;
    return lang === "fr" ? `Du ${from.toLowerCase()} au ${to.toLowerCase()}` : `${from} – ${to}`;
  }
  if (e.all_day) return `${fmtLongDate(e.startDay)} · ${t("allDay")}`;
  const range = e.end ? `${clock(e.startMs)} – ${clock(e.endMs)}` : clock(e.startMs);
  const dur = e.end && e.endMs > e.startMs ? ` (${duration(e.endMs - e.startMs)})` : "";
  return `${fmtLongDate(e.startDay)} · ${range}${dur}`;
}

export function fmtUpdated(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat(locale, { timeZone: TZ, month: "long", day: "numeric" }).format(d);
  return `${date}, ${clock(d.getTime())}`;
}
