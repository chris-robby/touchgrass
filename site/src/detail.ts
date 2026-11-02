// Event detail: a <dialog> (centered on desktop, bottom sheet on mobile), with
// "Learn more" links (official page, organizer's site/socials, phone, Google Maps,
// Google search), "Add to calendar" (.ics download) and a Google Calendar link.
// The open event is kept in the URL (?e=<id>) so it can be shared and the
// back button closes it.
import type L from "leaflet";
import { Ev, param, setParams } from "./data";
import { chipTime, fmtShortDate, whenText } from "./format";
import { audienceLabel, categoryLabel, lang, money, SOURCE_NAMES, t } from "./i18n";
import { city, cityLabel } from "./city";
import { addPin, createMap } from "./map";
import { esc, icons, likeButtonHtml, tagsHtml } from "./ui";

/** A wide version of the event photo for the top of the detail view. */
export function bannerUrl(url: string): string {
  if (url.includes("res.cloudinary.com/")) {
    return url.replace(/\/upload\/[^/]*c_l?fill[^/]*\//, "/upload/w_1200,h_500,c_fill,g_auto/");
  }
  return url;
}

let dialog: HTMLDialogElement;
let miniMap: L.Map | null = null;
let pushedByUs = false;
let current: Ev | null = null;
let seriesOf: (e: Ev) => Ev[] = () => [];
const OTHER_DATES_SHOWN = 6;

/** Pages tell the detail view how to find an activity's other dates. */
export function setSeriesLookup(fn: (e: Ev) => Ev[]): void {
  seriesOf = fn;
}

function ensureDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.className = "detail";
  dialog.setAttribute("aria-labelledby", "detail-title");
  document.body.append(dialog);

  dialog.addEventListener("close", () => {
    miniMap?.remove();
    miniMap = null;
    current = null;
    if (!param("e")) return; // closed because the URL already changed (back button)
    if (pushedByUs) {
      pushedByUs = false;
      history.back();
    } else {
      setParams({ e: "" });
    }
  });
  // Click on the dimmed backdrop closes the dialog.
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  return dialog;
}

function accessText(e: Ev): string {
  if (e.registration === "required") return t("tag.required.long");
  if (e.registration === "ticket") return t("tag.ticket.long");
  if (e.registration === "drop-in") return t("detail.dropin");
  return t("detail.accessUnknown");
}

/** "Other dates" of a repeating activity, each opening that session. */
function otherDatesHtml(e: Ev): string {
  const others = seriesOf(e).filter((o) => o.id !== e.id);
  if (!others.length) return "";
  const item = (o: Ev, hidden: boolean) => `
    <li${hidden ? " hidden" : ""}><button type="button" data-other="${o.id}">
      <span class="other-when">${esc(fmtShortDate(o.startDay))} · ${esc(chipTime(o.startMs))}</span>
      <span class="other-where">${esc(o.venue ?? o.borough ?? "")}</span>
    </button></li>`;
  return `
    <section class="other-dates" aria-labelledby="other-dates-title">
      <h3 id="other-dates-title">${t("detail.otherDates")} (${others.length})</h3>
      <ul>${others.map((o, i) => item(o, i >= OTHER_DATES_SHOWN)).join("")}</ul>
      ${others.length > OTHER_DATES_SHOWN ? `<button type="button" class="link-btn show-all-dates">${t("detail.showAllDates")}</button>` : ""}
    </section>`;
}

function priceText(e: Ev): string {
  if (e.is_free) return t("tag.free").charAt(0) + t("tag.free").slice(1).toLowerCase();
  const range = e.price_min === e.price_max ? money(e.price_min) : `${money(e.price_min)} – ${money(e.price_max)}`;
  return `${range}. ${t("detail.priceNote")}`;
}

function linkLabel(url: string, type: string): string {
  if (type === "facebook") return "Facebook";
  if (type === "instagram") return "Instagram";
  if (type === "phone") {
    const d = url.replace(/\D/g, "").slice(-10);
    return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "Learn more": organizer links from the data, then Google Maps and Google search. */
function learnMoreHtml(e: Ev): string {
  const items: { href: string; label: string; kind: string }[] = e.links.map((l) => ({
    href: l.url, label: linkLabel(l.url, l.type), kind: l.type,
  }));
  const place = [e.venue, e.address].filter(Boolean).join(", ");
  if (place || e.lat != null) {
    const query = place ? `${place}, ${city.name}` : `${e.lat},${e.lng}`;
    items.push({ href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, label: t("detail.maps"), kind: "maps" });
  }
  const q = [e.title, e.venue ?? "", city.name].filter(Boolean).join(" ");
  items.push({ href: `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: t("detail.search"), kind: "search" });

  return `
    <section class="learn-more" aria-labelledby="learn-more-title">
      <h3 id="learn-more-title">${t("detail.more")}</h3>
      <ul>
        ${items.map((i) => `<li><a href="${esc(i.href)}"${i.kind === "phone" ? "" : ' target="_blank" rel="noopener"'} data-kind="${i.kind}">${esc(i.label)}</a></li>`).join("")}
      </ul>
      <p class="source-line">${t("detail.source")}${lang === "fr" ? " : " : ": "}${esc(SOURCE_NAMES[e.source] ?? e.source)}${e.organizer ? ` · ${esc(e.organizer)}` : ""}</p>
    </section>`;
}

export function openDetail(e: Ev, push = true): void {
  const d = ensureDialog();
  miniMap?.remove(); // when switching events while the dialog is open
  miniMap = null;
  current = e;
  if (push) {
    setParams({ e: e.id }, true);
    pushedByUs = true;
  }
  const where = e.venue ?? (e.format === "online" ? t("online") : "—");
  d.innerHTML = `
    ${e.image ? `<img class="detail-photo" src="${esc(bannerUrl(e.image))}" alt="">` : ""}
    <div class="detail-inner">
      <span class="sheet-handle" aria-hidden="true"></span>
      <div class="detail-head">
        <div class="detail-head-text">
          <div class="detail-tags">${tagsHtml(e)}<span class="ev-cat">${esc(categoryLabel(e.category))}</span></div>
          <h2 id="detail-title">${esc(e.title)}</h2>
        </div>
        ${likeButtonHtml(e, "icon-btn")}
        <button type="button" class="icon-btn close-btn" aria-label="${t("detail.close")}">${icons.close}</button>
      </div>
      <dl class="facts">
        <dt>${t("detail.when")}</dt><dd class="strong">${esc(whenText(e))}</dd>
        <dt>${t("detail.where")}</dt><dd><span class="strong">${esc(where)}</span>${e.address ? `<br><span class="muted">${esc(e.address)}</span>` : ""}</dd>
        <dt>${esc(cityLabel(city.area))}</dt><dd>${esc(e.borough ?? "—")}</dd>
        <dt>${t("detail.for")}</dt><dd>${esc(audienceLabel(e.audience))}</dd>
        <dt>${t("detail.price")}</dt><dd>${esc(priceText(e))}</dd>
        <dt>${t("detail.access")}</dt><dd>${esc(accessText(e))}</dd>
      </dl>
      ${otherDatesHtml(e)}
      ${e.lat != null ? `<div class="detail-map" role="img" aria-label="${t("detail.mapLabel")}"></div>` : ""}
      ${learnMoreHtml(e)}
      <div class="detail-actions">
        ${e.url ? `<a class="btn btn-primary" href="${esc(e.url)}" target="_blank" rel="noopener">${t(e.source === "loisirs-montreal" ? "detail.officialLoisirs" : "detail.official")}</a>` : ""}
        <div class="detail-actions-row">
          <button type="button" class="btn btn-outline ics-btn"><span class="wide-only">${t("detail.ics")}</span><span class="narrow-only">${t("detail.icsShort")}</span></button>
          <a class="btn btn-outline" href="${esc(googleCalendarUrl(e))}" target="_blank" rel="noopener">${t("detail.google")}</a>
        </div>
      </div>
    </div>`;

  d.querySelector(".close-btn")!.addEventListener("click", () => d.close());
  d.querySelector(".ics-btn")!.addEventListener("click", () => downloadIcs(e));
  d.querySelector(".show-all-dates")?.addEventListener("click", (ev) => {
    d.querySelectorAll<HTMLElement>(".other-dates li[hidden]").forEach((li) => (li.hidden = false));
    (ev.currentTarget as HTMLElement).remove();
  });
  d.querySelectorAll<HTMLButtonElement>("[data-other]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const other = seriesOf(e).find((o) => o.id === btn.dataset.other);
      if (!other) return;
      setParams({ e: other.id }); // same history entry: back still closes the dialog
      openDetail(other, false);
    }));

  if (!d.open) d.showModal();
  d.scrollTop = 0;

  const mapEl = d.querySelector<HTMLElement>(".detail-map");
  if (mapEl && e.lat != null && e.lng != null) {
    miniMap = createMap(mapEl, { scrollWheelZoom: false });
    miniMap.setView([e.lat, e.lng], 15);
    addPin(miniMap, e.lat, e.lng);
  }
}

/** Open/close the dialog to match ?e= in the URL (after back/forward). */
export function syncDetail(byId: Map<string, Ev>): void {
  const id = param("e");
  const e = id ? byId.get(id) : undefined;
  if (e && current?.id !== e.id) {
    pushedByUs = false;
    openDetail(e, false);
  } else if (!e && dialog?.open) {
    dialog.close();
  }
}

// ---------------------------------------------------------------- calendar files

function utcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** iCalendar lines must be at most 75 characters; longer ones continue with a space. */
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 73) out.push((i ? " " : "") + line.slice(i, i + 73));
  return out.join("\r\n");
}

function placeText(e: Ev): string {
  return [e.venue, e.address].filter(Boolean).join(", ");
}

function downloadIcs(e: Ev): void {
  const end = e.end ? e.endMs : e.startMs + 60 * 60 * 1000;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//touchgrass//events//FR", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.id}@touchgrass`,
    `DTSTAMP:${utcStamp(Date.now())}`,
    e.all_day ? `DTSTART;VALUE=DATE:${e.startDay.replace(/-/g, "")}` : `DTSTART:${utcStamp(e.startMs)}`,
    e.all_day ? `DTEND;VALUE=DATE:${addOneDay(e.endDay)}` : `DTEND:${utcStamp(end)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(`${e.description}\n\n${e.url ?? ""}`.trim())}`,
    `LOCATION:${icsText(placeText(e))}`,
    e.url ? `URL:${e.url}` : "",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).map(fold);
  const blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${e.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function addOneDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function googleCalendarUrl(e: Ev): string {
  const end = e.end ? e.endMs : e.startMs + 60 * 60 * 1000;
  const dates = e.all_day
    ? `${e.startDay.replace(/-/g, "")}/${addOneDay(e.endDay)}`
    : `${utcStamp(e.startMs)}/${utcStamp(end)}`;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates,
    details: `${e.description}\n\n${e.url ?? ""}`.trim(),
    location: placeText(e),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
