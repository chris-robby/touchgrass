// Calendar page: month grid (chips on desktop, dots on mobile) + the selected
// day's events. Month, day and open event are in the URL (?m=, ?d=, ?e=).
import "../styles.css";
import {
  addDays, byDisplayOrder, dayToDate, Ev, Filters, filtersToParams, loadEvents, matches, param,
  readFilters, setParams, today, weekdayIndex,
} from "../data";
import { openDetail, syncDetail } from "../detail";
import { refreshForYou, setupForYou } from "../forYou";
import { chipTime, fmtLongDate, fmtMonth, weekdayShort } from "../format";
import { countLabel, moreLabel, t } from "../i18n";
import {
  esc, eventHref, eventRowHtml, icons, onEventClick, renderFilterBar, renderShell, updateNavLinks,
} from "../ui";

const CHIPS_PER_CELL = 2;
const DOTS_PER_CELL = 3;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const shell = renderShell("calendar");
let f: Filters = readFilters();
updateNavLinks(f);

function readState(): { day: string; month: string } {
  const d = param("d");
  const day = DAY_RE.test(d) ? d : today();
  const m = param("m");
  return { day, month: MONTH_RE.test(m) ? m : day.slice(0, 7) };
}
let { day: selected, month } = readState();

function shiftMonth(m: string, n: number): string {
  const d = dayToDate(`${m}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

shell.headerExtra.innerHTML = `
  <div class="wrap cal-head">
    <h1 class="cal-title"></h1>
    <button type="button" class="btn-dark cal-today">${t("cal.today")}</button>
    <button type="button" class="icon-btn-dark cal-prev" aria-label="${t("cal.prev")}">${icons.prev}</button>
    <button type="button" class="icon-btn-dark cal-next" aria-label="${t("cal.next")}">${icons.next}</button>
  </div>`;
shell.main.innerHTML = `<p class="status">${t("loading")}</p>`;

try {
  start(await loadEvents());
} catch (err) {
  console.error(err);
  shell.main.innerHTML = `<p class="status">${t("loadError")}</p>`;
}

function start(events: Ev[]): void {
  const byId = new Map(events.map((e) => [e.id, e]));
  const boroughs = [...new Set(events.map((e) => e.borough).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fr"));

  shell.main.innerHTML = `
    <div class="cal-layout">
      <section class="cal-grid" aria-label="${t("cal.grid")}">
        <div class="cal-weekdays" aria-hidden="true">
          ${weekdayShort(false).map((w, i) => `<span><span class="wide-only">${esc(w)}</span><span class="narrow-only">${esc(weekdayShort(true)[i])}</span></span>`).join("")}
        </div>
        <div class="cal-cells"></div>
      </section>
      <aside class="day-panel" aria-label="${t("cal.dayPanel")}" aria-live="polite"></aside>
    </div>`;
  const cellsEl = shell.main.querySelector<HTMLElement>(".cal-cells")!;
  const panelEl = shell.main.querySelector<HTMLElement>(".day-panel")!;
  const titleEl = shell.headerExtra.querySelector<HTMLElement>(".cal-title")!;

  const onPatch = (patch: Partial<Filters>) => {
    f = { ...f, ...patch };
    setParams(filtersToParams(f));
    updateNavLinks(f);
    render();
  };
  renderFilterBar(shell.filtersSlot, () => f, { when: false, search: true, boroughs }, onPatch);
  setupForYou({ events, boroughs, getFilters: () => f, onPatch });

  const go = (next: { day?: string; month?: string }) => {
    if (next.day) selected = next.day;
    if (next.month) month = next.month;
    setParams({ d: selected === today() ? "" : selected, m: month === selected.slice(0, 7) ? "" : month }, true);
    render();
  };

  shell.headerExtra.querySelector(".cal-today")!.addEventListener("click", () =>
    go({ day: today(), month: today().slice(0, 7) }));
  shell.headerExtra.querySelector(".cal-prev")!.addEventListener("click", () => go({ month: shiftMonth(month, -1) }));
  shell.headerExtra.querySelector(".cal-next")!.addEventListener("click", () => go({ month: shiftMonth(month, 1) }));

  cellsEl.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-day]");
    if (btn) go({ day: btn.dataset.day! });
  });
  const openEvent = (id: string) => {
    const e = byId.get(id)!;
    if (e.startDay > selected || e.endDay < selected) {
      selected = e.startDay < today() ? today() : e.startDay;
      setParams({ d: selected === today() ? "" : selected });
      render();
    }
    openDetail(e);
  };
  onEventClick(cellsEl, openEvent);
  onEventClick(panelEl, openEvent);

  function render(): void {
    refreshForYou();
    const { name, year } = fmtMonth(month);
    titleEl.innerHTML = `${esc(name)} <span class="cal-year">${year}</span>`;
    document.title = `${name} ${year} — touchgrass`;

    // Grid: from the Monday on or before the 1st, as many weeks as needed.
    const first = `${month}-01`;
    const gridStart = addDays(first, -weekdayIndex(first));
    const daysInMonth = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
    const weeks = Math.ceil((weekdayIndex(first) + daysInMonth) / 7);
    const gridEnd = addDays(gridStart, weeks * 7 - 1);

    // Events per day; multi-day events count on each day they run, from today on
    // (past days stay empty rather than listing exhibitions that were running then).
    const now = Date.now();
    const now0 = today();
    const firstShown = gridStart > now0 ? gridStart : now0;
    const byDay = new Map<string, Ev[]>();
    for (const e of events) {
      if (e.endMs < now || !matches(e, f, null)) continue;
      const from = e.startDay > firstShown ? e.startDay : firstShown;
      const to = e.endDay < gridEnd ? e.endDay : gridEnd;
      for (let d = from; d <= to; d = addDays(d, 1)) {
        (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(e);
      }
    }
    // The selected day may be outside the grid (e.g. after "next month").
    if (!byDay.has(selected) && selected >= now0) {
      const list = events.filter((e) => e.endMs >= now && matches(e, f, [selected, selected]));
      if (list.length) byDay.set(selected, list);
    }
    for (const list of byDay.values()) list.sort(byDisplayOrder);

    let html = "";
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(gridStart, i);
      const list = byDay.get(d) ?? [];
      const classes = ["cal-cell"];
      if (!d.startsWith(month)) classes.push("out");
      if (d === selected) classes.push("selected");
      if (d === now0) classes.push("today");
      if (d < now0) classes.push("past");
      const chips = list.slice(0, CHIPS_PER_CELL).map((e) => `
        <a class="cal-chip${e.multiDay ? " long" : e.is_free ? "" : " paid"}" href="${eventHref(e.id)}" data-id="${e.id}">
          <b>${esc(e.multiDay ? "→" : chipTime(e.startMs))}</b> ${esc(e.title)}
        </a>`).join("");
      const more = list.length - CHIPS_PER_CELL;
      html += `
        <div class="${classes.join(" ")}">
          <button type="button" class="day-num" data-day="${d}" aria-pressed="${d === selected}"
            aria-label="${esc(`${fmtLongDate(d)}, ${countLabel(list.length)}`)}"${d === now0 ? ' aria-current="date"' : ""}>${+d.slice(8)}</button>
          <div class="chips">${chips}${more > 0 ? `<button type="button" class="more-link" data-day="${d}">${moreLabel(more)}</button>` : ""}</div>
          <span class="dots" aria-hidden="true">${"<i></i>".repeat(Math.min(list.length, DOTS_PER_CELL))}</span>
        </div>`;
    }
    cellsEl.innerHTML = html;

    const dayList = byDay.get(selected) ?? [];
    panelEl.innerHTML = `
      <h2 class="panel-heading"><span class="kicker">${esc(countLabel(dayList.length))}</span>${esc(fmtLongDate(selected))}</h2>
      ${dayList.length ? dayList.map((e) => eventRowHtml(e, true)).join("") : `<p class="empty">${t("empty.day")}</p>`}`;
  }

  render();
  syncDetail(byId);
  window.addEventListener("popstate", () => {
    ({ day: selected, month } = readState());
    render();
    syncDetail(byId);
  });
}

