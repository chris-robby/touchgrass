// Home page: hero + search, filters, events grouped by day. (The map has its own page.)
import "../styles.css";
import {
  byDisplayOrder, dateRange, Ev, Filters, filtersToParams, groupSeries, hasActiveFilters, loadEvents, matches,
  readFilters, seriesKey, setParams,
} from "../data";
import { openDetail, setSeriesLookup, syncDetail } from "../detail";
import { emptyHtml, refreshForYou, setupForYou } from "../forYou";
import { dayGroupLabel, fmtLongDate, fmtShortDate, hourOf } from "../format";
import { countLabel, showMoreLabel, t } from "../i18n";
import {
  bindSearch, esc, eventRowHtml, onEventClick, renderFilterBar, renderShell, searchFieldHtml, updateNavLinks,
} from "../ui";

const PAGE_SIZE = 60;
const PARTS_MIN_ROWS = 12; // only busy days get Morning/Afternoon/Evening

const shell = renderShell("list");
let f: Filters = readFilters();
updateNavLinks(f);

shell.headerExtra.innerHTML = `
  <div class="wrap hero">
    <div class="hero-text">
      <h1>${esc(t("hero.title"))}</h1>
      <p>${esc(t("hero.sub"))}</p>
    </div>
    ${searchFieldHtml(f.q, "search-hero")}
  </div>`;
shell.main.innerHTML = `<p class="status">${t("loading")}</p>`;

try {
  const events = await loadEvents();
  start(events);
} catch (err) {
  console.error(err);
  shell.main.innerHTML = `<p class="status">${t("loadError")}</p>`;
}

function start(events: Ev[]): void {
  const byId = new Map(events.map((e) => [e.id, e]));
  const boroughs = [...new Set(events.map((e) => e.borough).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fr"));
  let limit = PAGE_SIZE;

  shell.main.innerHTML = `
    <div class="list-layout">
      <div class="list-col">
        <p class="result-count" aria-live="polite"></p>
        <div class="groups"></div>
        <button type="button" class="btn btn-outline show-more" hidden></button>
      </div>
    </div>`;
  const groupsEl = shell.main.querySelector<HTMLElement>(".groups")!;
  const countEl = shell.main.querySelector<HTMLElement>(".result-count")!;
  const moreBtn = shell.main.querySelector<HTMLButtonElement>(".show-more")!;


  const heroSearch = shell.headerExtra.querySelector<HTMLInputElement>('input[name="q"]')!;
  const onPatch = (patch: Partial<Filters>) => {
    f = { ...f, ...patch };
    if (patch.q !== undefined && heroSearch.value.trim() !== patch.q) heroSearch.value = patch.q;
    limit = PAGE_SIZE;
    shell.filtersSlot.querySelector<HTMLElement>(".clear-btn")!.hidden = !hasActiveFilters(f);
    setParams(filtersToParams(f));
    updateNavLinks(f);
    render();
  };
  renderFilterBar(shell.filtersSlot, () => f, { when: true, search: false, boroughs }, onPatch);
  bindSearch(heroSearch, onPatch);
  setupForYou({ events, boroughs, getFilters: () => f, onPatch });

  moreBtn.addEventListener("click", () => {
    limit += PAGE_SIZE;
    render();
  });
  onEventClick(groupsEl, (id) => openDetail(byId.get(id)!));

  function render(): void {
    const now = Date.now();
    const range = dateRange(f);
    const filtered = events.filter((e) => e.endMs >= now && matches(e, f, range));
    refreshForYou();

    // A repeating activity (same title) is shown once, at its next date, with
    // "+N more dates"; the detail view lists the others.
    const series = groupSeries(filtered);
    const rows = filtered.filter((e) => e.multiDay || series.get(seriesKey(e))![0] === e);

    // Each row appears once. Multi-day events go on their last day
    // ("until Dec 6" = last chance), or the last day shown when a date filter
    // is on. Putting them on their first day would bury today's events under
    // dozens of months-long exhibitions.
    const groups = new Map<string, Ev[]>();
    for (const e of rows) {
      let day = e.multiDay ? e.endDay : e.startDay;
      if (range && day > range[1]) day = range[1];
      (groups.get(day) ?? groups.set(day, []).get(day)!).push(e);
    }
    const days = [...groups.keys()].sort();

    countEl.textContent = countLabel(filtered.length);
    let shown = 0;
    let html = "";
    for (const day of days) {
      if (shown >= limit) break;
      const list = groups.get(day)!.sort(byDisplayOrder).slice(0, limit - shown);
      shown += list.length;
      const label = dayGroupLabel(day);
      const isNamed = label === t("day.today") || label === t("day.tomorrow");
      html += `
        <section class="day-group">
          <h2 class="day-heading">${esc(label)} <span class="kicker">${esc(isNamed ? fmtLongDate(day) : fmtShortDate(day))}</span></h2>
          ${dayRowsHtml(list, series)}
        </section>`;
    }
    groupsEl.innerHTML = html || emptyHtml(f);
    const left = rows.length - shown;
    moreBtn.hidden = left <= 0;
    moreBtn.textContent = showMoreLabel(left);
  }

  /** Rows of one day; long days get Morning / Afternoon / Evening sub-headings. */
  function dayRowsHtml(list: Ev[], series: Map<string, Ev[]>): string {
    const row = (e: Ev) => eventRowHtml(e, { series: e.multiDay ? undefined : series.get(seriesKey(e)) });
    if (list.length < PARTS_MIN_ROWS) return list.map(row).join("");
    const part = (e: Ev) => {
      if (e.multiDay || e.all_day) return "part.allday";
      const h = hourOf(e.startMs);
      return h < 12 ? "part.morning" : h < 17 ? "part.afternoon" : "part.evening";
    };
    let html = "";
    let current = "";
    for (const e of list) {
      const p = part(e);
      if (p !== current) {
        html += `<h3 class="part-heading">${t(p as Parameters<typeof t>[0])}</h3>`;
        current = p;
      }
      html += row(e);
    }
    return html;
  }

  render();
  const allSeries = groupSeries(events.filter((x) => x.endMs >= Date.now()));
  setSeriesLookup((e) => allSeries.get(seriesKey(e)) ?? []);
  syncDetail(byId);
  window.addEventListener("popstate", () => syncDetail(byId));
}
