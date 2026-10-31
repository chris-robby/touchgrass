// Home page: hero + search, filters, events grouped by day, venue map on wide screens.
import "../styles.css";
import {
  byDisplayOrder, dateRange, Ev, Filters, filtersToParams, hasActiveFilters, loadEvents, matches, readFilters,
  setParams,
} from "../data";
import { openDetail, syncDetail } from "../detail";
import { dayGroupLabel, fmtLongDate, fmtShortDate } from "../format";
import { countLabel, showMoreLabel, t } from "../i18n";
import { venueLayer, createMap } from "../map";
import {
  bindSearch, esc, eventRowHtml, icons, onEventClick, renderFilterBar, renderShell, updateNavLinks,
} from "../ui";

const PAGE_SIZE = 60;
const WIDE = window.matchMedia("(min-width: 1000px)");

const shell = renderShell("list");
let f: Filters = readFilters();
updateNavLinks(f);

shell.headerExtra.innerHTML = `
  <div class="wrap hero">
    <div class="hero-text">
      <h1>${esc(t("hero.title"))}</h1>
      <p>${esc(t("hero.sub"))}</p>
    </div>
    <label class="search search-hero">${icons.search}
      <span class="sr-only">${t("search.label")}</span>
      <input type="search" name="q" value="${esc(f.q)}" placeholder="${esc(t("search.placeholder"))}">
    </label>
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
      <aside class="map-aside" aria-label="${t("map.label")}"><div class="map-box"></div></aside>
    </div>`;
  const groupsEl = shell.main.querySelector<HTMLElement>(".groups")!;
  const countEl = shell.main.querySelector<HTMLElement>(".result-count")!;
  const moreBtn = shell.main.querySelector<HTMLButtonElement>(".show-more")!;

  // The map is only shown (and only loaded) on wide screens.
  let pins: ReturnType<typeof venueLayer> | null = null;
  let lastFiltered: Ev[] = [];
  const ensureMap = () => {
    if (pins || !WIDE.matches) return;
    const map = createMap(shell.main.querySelector<HTMLElement>(".map-box")!, { scrollWheelZoom: false });
    pins = venueLayer(map, (id) => openDetail(byId.get(id)!));
    pins.update(lastFiltered);
  };
  WIDE.addEventListener("change", ensureMap);

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

  moreBtn.addEventListener("click", () => {
    limit += PAGE_SIZE;
    render();
  });
  onEventClick(groupsEl, (id) => openDetail(byId.get(id)!));

  function render(): void {
    const now = Date.now();
    const range = dateRange(f);
    const filtered = events.filter((e) => e.endMs >= now && matches(e, f, range));
    lastFiltered = filtered;
    pins?.update(filtered);
    ensureMap();

    // Each event appears once. Multi-day events go on their last day
    // ("until Dec 6" = last chance), or the last day shown when a date filter
    // is on. Putting them on their first day would bury today's events under
    // dozens of months-long exhibitions.
    const groups = new Map<string, Ev[]>();
    for (const e of filtered) {
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
          ${list.map((e) => eventRowHtml(e)).join("")}
        </section>`;
    }
    groupsEl.innerHTML = html || `<p class="empty">${t("empty.filters")}</p>`;
    const left = filtered.length - shown;
    moreBtn.hidden = left <= 0;
    moreBtn.textContent = showMoreLabel(left);
  }

  render();
  syncDetail(byId);
  window.addEventListener("popstate", () => syncDetail(byId));
}
