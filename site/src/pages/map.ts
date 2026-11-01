// Map page: full-size venue map with the same filters as the list.
import "../styles.css";
import {
  dateRange, Ev, Filters, filtersToParams, groupSeries, loadEvents, matches, readFilters, seriesKey, setParams,
} from "../data";
import { openDetail, setSeriesLookup, syncDetail } from "../detail";
import { refreshForYou, setupForYou } from "../forYou";
import { countLabel, t } from "../i18n";
import { createMap, venueLayer } from "../map";
import { renderFilterBar, renderShell, updateNavLinks } from "../ui";

const shell = renderShell("map");
let f: Filters = readFilters();
updateNavLinks(f);
shell.main.innerHTML = `<p class="status">${t("loading")}</p>`;

try {
  start(await loadEvents());
} catch (err) {
  console.error(err);
  shell.main.innerHTML = `<p class="status">${t("loadError")}</p>`;
}

function start(events: Ev[]): void {
  const byId = new Map(events.map((e) => [e.id, e]));
  const allSeries = groupSeries(events.filter((x) => x.endMs >= Date.now()));
  setSeriesLookup((e) => allSeries.get(seriesKey(e)) ?? []);
  const boroughs = [...new Set(events.map((e) => e.borough).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fr"));

  shell.main.classList.add("map-main");
  shell.main.innerHTML = `
    <h1 class="sr-only">${t("map.label")}</h1>
    <p class="result-count map-count" aria-live="polite"></p>
    <div class="map-full" aria-label="${t("map.label")}"></div>`;
  const countEl = shell.main.querySelector<HTMLElement>(".map-count")!;
  const map = createMap(shell.main.querySelector<HTMLElement>(".map-full")!);
  const pins = venueLayer(map, (id) => openDetail(byId.get(id)!));

  const onPatch = (patch: Partial<Filters>) => {
    f = { ...f, ...patch };
    setParams(filtersToParams(f));
    updateNavLinks(f);
    render();
  };
  renderFilterBar(shell.filtersSlot, () => f, { when: true, search: true, boroughs }, onPatch);
  setupForYou({ events, boroughs, getFilters: () => f, onPatch });

  function render(): void {
    refreshForYou();
    const now = Date.now();
    const range = dateRange(f);
    const filtered = events.filter((e) => e.endMs >= now && matches(e, f, range));
    pins.update(filtered);
    const off = filtered.filter((e) => e.lat == null).length;
    countEl.textContent = countLabel(filtered.length) + (off ? ` · ${off} ${t("map.noCoords")}` : "");
  }

  render();
  syncDetail(byId);
  window.addEventListener("popstate", () => syncDetail(byId));
}
