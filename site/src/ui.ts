// Shared page pieces: header, footer, mobile bottom nav, filter bar, event rows.
import { Ev, Filters, filterQuery, hasActiveFilters, loadMeta } from "./data";
import { fmtUpdated, timeColumn } from "./format";
import { categoryLabel, categorySlugs, lang, priceTag, seriesLabel, setLang, t } from "./i18n";
import { aboutHref, CITIES, city, cityHref, cityLabel, rememberCity, rootPath } from "./city";
import { isLiked, likeKey, toggleLike } from "./likes";

export type Page = "list" | "calendar" | "map" | "swipe" | "about";

export function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export const icons = {
  logo: `<svg width="30" height="26" viewBox="0 0 26 22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 21C4 14 2 9 1 6"/><path d="M9 21C9 13 9 6 11 1"/><path d="M14 21C14 15 16 10 20 7"/><path d="M19 21C20 17 22 14 25 13"/></svg>`,
  search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`,
  prev: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>`,
  next: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`,
  close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  list: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>`,
  calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  sliders: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>`,
  heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-9.2-9.4C1.7 7.4 3.9 4 7.3 4c2 0 3.6 1.1 4.7 2.7C13.1 5.1 14.7 4 16.7 4c3.4 0 5.6 3.4 4.5 6.6C19.5 15.4 12 20 12 20z"/></svg>`,
  cards: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3" width="12" height="16" rx="2" transform="rotate(12 13 11)"/><rect x="4" y="5" width="12" height="16" rx="2" fill="var(--ink)"/></svg>`,
  pin: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
};

const PAGES: { page: Page; file: string; label: () => string; icon: string }[] = [
  { page: "list", file: "index.html", label: () => t("nav.list"), icon: icons.list },
  { page: "calendar", file: "calendar.html", label: () => t("nav.calendar"), icon: icons.calendar },
  { page: "map", file: "map.html", label: () => t("nav.map"), icon: icons.pin },
  { page: "swipe", file: "swipe.html", label: () => t("nav.swipe"), icon: icons.cards },
];

export interface Shell {
  headerExtra: HTMLElement; // inside the dark band, under the top bar
  filtersSlot: HTMLElement;
  main: HTMLElement;
}

/** Builds the page frame. The language button reloads the page in the other language. */
export function renderShell(page: Page): Shell {
  rememberCity();
  const navLinks = (cls: string, withIcons: boolean) =>
    PAGES.map((p) => `<a class="${cls}" data-nav="${cityHref(city, p.file)}" href="${cityHref(city, p.file)}"${p.page === page ? ' aria-current="page"' : ""}>${withIcons ? p.icon : ""}${esc(p.label())}</a>`).join("");
  // City switcher: each city's list page (filters don't carry over: boroughs differ).
  const cityLinks = CITIES.map((c) =>
    `<a class="city-link" href="${cityHref(c, "index.html")}" aria-label="${esc(c.name)}"${c.id === city.id ? ' aria-current="true"' : ""}><span class="wide-only">${esc(c.name)}</span><span class="narrow-only">${esc(c.short)}</span></a>`).join("");

  document.body.innerHTML = `
    <a class="skip-link" href="#main">${lang === "fr" ? "Aller au contenu" : "Skip to content"}</a>
    <header class="site-header">
      <div class="wrap topbar">
        <a class="logo" href="${cityHref(city, "index.html")}" data-nav="${cityHref(city, "index.html")}">${icons.logo}<span>touchgrass</span></a>
        <nav class="views" aria-label="${t("nav.views")}">${navLinks("view-link", false)}</nav>
        <div class="topbar-end">
          <nav class="city-switch" aria-label="${lang === "fr" ? "Ville" : "City"}">${cityLinks}</nav>
          <button type="button" class="btn-dark lang-btn" aria-label="${t("lang.switch")}">
            <span${lang === "fr" ? ' class="on"' : ""}>FR</span> / <span${lang === "en" ? ' class="on"' : ""}>EN</span>
          </button>
        </div>
      </div>
      <div class="header-extra"></div>
    </header>
    <div class="filters-slot"></div>
    <main id="main" class="wrap" tabindex="-1"></main>
    <footer class="site-footer">
      <div class="wrap footer-inner">
        <span class="footer-logo">touchgrass</span>
        <span>${esc(cityLabel(city.dataCredit))}</span>
        <span class="footer-updated"></span>
        <a href="${aboutHref()}">${esc(t("footer.about"))}</a>
      </div>
    </footer>
    <nav class="bottom-nav" aria-label="${t("nav.views")}">${navLinks("bottom-link", true)}</nav>
  `;
  document.body.dataset.page = page;
  // The HTML files carry French titles; set them in the visitor's language.
  const titles: Record<Page, string> = {
    list: t("hero.title").replace(/\.$/, ""), calendar: t("nav.calendar"), map: t("nav.map"), swipe: t("nav.swipe"), about: t("about.title"),
  };
  document.title = page === "about" ? `${titles[page]} — touchgrass` : `${titles[page]} · ${city.name} — touchgrass`;

  document.querySelector(".lang-btn")!.addEventListener("click", () => {
    setLang(lang === "fr" ? "en" : "fr");
    location.reload();
  });

  registerServiceWorker();
  showOfflineNotice();

  loadMeta().then((meta) => {
    if (meta) document.querySelector(".footer-updated")!.textContent =
      `${t("footer.updated")}${lang === "fr" ? " : " : ": "}${fmtUpdated(meta.built_at)}`;
  });

  return {
    headerExtra: document.querySelector(".header-extra")!,
    filtersSlot: document.querySelector(".filters-slot")!,
    main: document.querySelector("main")!,
  };
}

/** Makes the site installable and usable offline (production build only). */
function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  // One worker at the site root serves every city's pages (ottawa/ included).
  navigator.serviceWorker.register(`${rootPath}sw.js`).catch((err) => console.warn("Service worker:", err));
}

/** A small band under the header while the phone is offline. */
function showOfflineNotice(): void {
  const band = document.createElement("p");
  band.className = "offline-band";
  band.setAttribute("role", "status");
  band.textContent = lang === "fr"
    ? "Hors ligne : affichage des dernières activités enregistrées."
    : "Offline: showing the last saved listings.";
  const update = () => { band.hidden = navigator.onLine; };
  update();
  document.querySelector(".site-header")!.after(band);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
}

/** Keep the List/Calendar/Map links carrying the current filters. */
export function updateNavLinks(f: Filters): void {
  const qs = filterQuery(f);
  document.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((a) => {
    a.href = a.dataset.nav + qs;
  });
}

/** Search field with the "my preferences" filter button inside it (see forYou.ts). */
export function searchFieldHtml(value: string, cls: string): string {
  const prefsLabel = lang === "fr" ? "Mes préférences" : "My preferences";
  return `
    <div class="search ${cls}">
      <label class="search-field">${icons.search}
        <span class="sr-only">${t("search.label")}</span>
        <input type="search" name="q" value="${esc(value)}" placeholder="${esc(t("search.placeholder"))}">
      </label>
      <button type="button" class="search-filter-btn" aria-haspopup="dialog" aria-label="${prefsLabel}" title="${prefsLabel}">${icons.sliders}<span class="filter-badge" hidden></span></button>
    </div>`;
}

// ---------------------------------------------------------------- filter bar

export interface FilterBarOptions {
  when: boolean;
  search: boolean;
  boroughs: string[];
}

export const NO_FILTERS: Filters = {
  q: "", when: "", from: "", to: "", cat: "", boro: "", dropin: false, free: false, liked: false,
};

/**
 * Renders the filter controls into `slot`. The page owns the filter state:
 * `get` reads it, and `onPatch` receives only what changed.
 */
export function renderFilterBar(
  slot: HTMLElement, get: () => Filters, opts: FilterBarOptions,
  onPatch: (patch: Partial<Filters>) => void,
): void {
  const f = get();
  const whenBtn = (value: string, key: Parameters<typeof t>[0]) =>
    `<button type="button" class="chip-btn" data-when="${value}" aria-pressed="${f.when === value}">${esc(t(key))}</button>`;
  const cats = [...categorySlugs].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), lang));

  slot.innerHTML = `
    <section class="filters" aria-label="${t("filters")}">
      <div class="wrap filters-inner">
        ${opts.search ? searchFieldHtml(f.q, "search-inline") : ""}
        ${opts.when ? `
          <div class="btn-group" role="group" aria-label="${t("when")}">
            ${whenBtn("today", "when.today")}${whenBtn("weekend", "when.weekend")}
            ${whenBtn("week", "when.week")}${whenBtn("custom", "when.custom")}
          </div>
          <div class="date-range"${f.when === "custom" ? "" : " hidden"}>
            <label>${t("when.from")} <input type="date" name="from" value="${f.from}"></label>
            <label>${t("when.to")} <input type="date" name="to" value="${f.to}"></label>
          </div>
          <span class="divider" aria-hidden="true"></span>` : ""}
        <div class="btn-group" role="group" aria-label="${t("access")}">
          <button type="button" class="chip-btn" data-toggle="free" aria-pressed="${f.free}">${esc(t("free"))}</button>
          <button type="button" class="chip-btn" data-toggle="dropin" aria-pressed="${f.dropin}">${esc(t("dropin"))}</button>
          <button type="button" class="chip-btn liked-chip" data-toggle="liked" aria-pressed="${f.liked}">${icons.heart}${esc(t("liked"))}</button>
        </div>
        <span class="divider" aria-hidden="true"></span>
        <label class="select-label"><span class="sr-only">${t("category")}</span>
          <select name="cat">
            <option value="">${t("category.allLong")}</option>
            ${cats.map((c) => `<option value="${c}"${c === f.cat ? " selected" : ""}>${esc(categoryLabel(c))}</option>`).join("")}
          </select>
        </label>
        <label class="select-label"><span class="sr-only">${esc(cityLabel(city.area))}</span>
          <select name="boro">
            <option value="">${esc(cityLabel(city.areaAll))}</option>
            ${opts.boroughs.map((b) => `<option${b === f.boro ? " selected" : ""}>${esc(b)}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="link-btn clear-btn"${hasActiveFilters(f) ? "" : " hidden"}>${t("clearFilters")}</button>
      </div>
    </section>`;

  const root = slot.querySelector(".filters")!;
  const emit = (patch: Partial<Filters>) => {
    onPatch(patch);
    root.querySelector<HTMLElement>(".clear-btn")!.hidden = !hasActiveFilters(get());
  };

  root.querySelectorAll<HTMLButtonElement>("[data-when]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const when = (get().when === btn.dataset.when ? "" : btn.dataset.when) as Filters["when"];
      root.querySelectorAll<HTMLButtonElement>("[data-when]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.when === when)));
      root.querySelector<HTMLElement>(".date-range")!.hidden = when !== "custom";
      emit({ when });
    }));

  root.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach((input) =>
    input.addEventListener("change", () => emit({ [input.name]: input.value })));

  root.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.toggle as "free" | "dropin" | "liked";
      const on = !get()[key];
      btn.setAttribute("aria-pressed", String(on));
      emit({ [key]: on });
    }));

  root.querySelectorAll<HTMLSelectElement>("select").forEach((sel) =>
    sel.addEventListener("change", () => emit({ [sel.name]: sel.value })));

  const search = root.querySelector<HTMLInputElement>('input[name="q"]');
  if (search) bindSearch(search, emit);

  root.querySelector(".clear-btn")!.addEventListener("click", () => {
    onPatch(NO_FILTERS);
    renderFilterBar(slot, get, opts, onPatch);
  });
}

/** Debounced search input, so the list doesn't re-render on every keystroke. */
export function bindSearch(input: HTMLInputElement, emit: (patch: Partial<Filters>) => void): void {
  let timer = 0;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => emit({ q: input.value.trim() }), 150);
  });
}

// ---------------------------------------------------------------- event rows

/** Price + registration tags. In lists `showFree` is off: almost everything is
 *  free, so a FREE tag on every row says nothing; only prices stand out. */
export function tagsHtml(e: Ev, showFree = true): string {
  let html = e.is_free
    ? (showFree ? `<span class="tag tag-free">${t("tag.free")}</span>` : "")
    : `<span class="tag tag-outline tag-price">${esc(priceTag(e.price_min, e.price_max))}</span>`;
  if (e.registration === "required") {
    html += `<span class="tag tag-outline" title="${t("tag.required.long")}"><span aria-hidden="true">${t("tag.required")}</span><span class="sr-only">${t("tag.required.long")}</span></span>`;
  } else if (e.registration === "ticket") {
    html += `<span class="tag tag-outline" title="${t("tag.ticket.long")}"><span aria-hidden="true">${t("tag.ticket")}</span><span class="sr-only">${t("tag.ticket.long")}</span></span>`;
  }
  return html;
}

export function venueLine(e: Ev, withBorough: boolean): string {
  const parts = [e.venue ?? (e.format === "online" ? t("online") : null)];
  if (e.format === "online" && e.venue) parts.push(t("online"));
  if (withBorough) parts.push(e.borough);
  return parts.filter(Boolean).map(esc).join(" · ");
}

/** Link to this page with the event open (so rows work with middle-click / share). */
export function eventHref(id: string): string {
  const p = new URLSearchParams(location.search);
  p.set("e", id);
  return `?${p.toString()}`;
}

/** A small version of the event photo, when the image host can resize it. */
export function thumbUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("res.cloudinary.com/")) {
    return url.replace(/\/upload\/[^/]*c_l?fill[^/]*\//, "/upload/w_256,h_144,c_fill,g_auto/");
  }
  if (url.includes("cdn.caligram.com/")) return url.replace(/\/(medium|xlarge|large)\//, "/thumbnail/");
  return url;
}

export interface RowOptions {
  compact?: boolean;
  /** Every date of this activity (including this one), when it repeats. */
  series?: Ev[];
}

/**
 * One event in a list: kept deliberately quiet — the start time, the title, a
 * single grey line (place · borough · access · other dates), a small photo and
 * a heart. Category, end time and the full price details are in the event's
 * detail view.
 */
export function eventRowHtml(e: Ev, opts: RowOptions = {}): string {
  const tc = timeColumn(e);
  const bits: string[] = [venueLine(e, !opts.compact)];
  if (e.registration === "required") bits.push(esc(t("meta.required")));
  else if (e.registration === "ticket") bits.push(esc(t("meta.ticket")));
  if (opts.series && opts.series.length > 1) bits.push(esc(seriesLabel(opts.series.length - 1)));
  const price = e.is_free ? "" : `<span class="ev-price">${esc(priceTag(e.price_min, e.price_max))}</span> `;
  const thumb = thumbUrl(e.image);
  // The title is the link, stretched over the whole row (CSS), so the heart
  // beside it can be a real button (a button can't sit inside a link).
  return `
    <div class="ev-row${opts.compact ? " compact" : ""}${thumb ? "" : " no-thumb"}" data-id="${e.id}">
      <span class="ev-time">
        ${tc.kicker ? `<span class="ev-time-kicker">${esc(tc.kicker)}</span>` : ""}
        ${e.all_day && !e.multiDay
          ? `<span class="ev-time-kicker">${esc(t("allDay"))}</span>`
          : `<span class="ev-time-main">${esc(tc.main)}</span>`}
      </span>
      <span class="ev-body">
        <span class="ev-title-line">
          <a class="ev-title" href="${eventHref(e.id)}">${esc(e.title)}</a>
          ${likeButtonHtml(e)}
        </span>
        <span class="ev-venue">${price}${bits.filter(Boolean).join(" · ")}</span>
      </span>
      ${thumb ? `<img class="ev-thumb" src="${esc(thumb)}" alt="" loading="lazy" decoding="async">` : ""}
    </div>`;
}

// ---------------------------------------------------------------- likes

/** Events that have a heart on the page, by like key (to toggle from a click). */
const likeable = new Map<string, Ev>();

/** The heart button (on a row's title line, or in the event detail's header). */
export function likeButtonHtml(e: Ev, extraClass = ""): string {
  const key = likeKey(e);
  likeable.set(key, e);
  const on = isLiked(e);
  return `<button type="button" class="like-btn${extraClass ? ` ${extraClass}` : ""}" data-like="${esc(key)}" aria-pressed="${on}"
    aria-label="${esc(`${t(on ? "unlike" : "like")} — ${e.title}`)}">${icons.heart}</button>`;
}

// One handler for every heart on the page, including ones rendered later. The
// list isn't re-sorted right away (rows jumping under the finger); the new order
// shows on the next filter change or visit.
document.addEventListener("click", (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-like]");
  const e = btn && likeable.get(btn.dataset.like!);
  if (!btn || !e) return;
  const on = toggleLike(e);
  document.querySelectorAll<HTMLButtonElement>("[data-like]").forEach((b) => {
    if (b.dataset.like !== btn.dataset.like) return;
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", `${t(on ? "unlike" : "like")} — ${e.title}`);
  });
});

/** Clicking any [data-id] inside root opens that event (keeps normal link behaviour for modifier keys). */
export function onEventClick(root: HTMLElement, open: (id: string) => void): void {
  root.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("[data-like]")) return; // the heart, not the event
    const target = (ev.target as HTMLElement).closest<HTMLElement>("[data-id]");
    if (!target || !root.contains(target)) return;
    const me = ev as MouseEvent;
    if (me.ctrlKey || me.metaKey || me.shiftKey || me.button === 1) return;
    ev.preventDefault();
    open(target.dataset.id!);
  });
}
