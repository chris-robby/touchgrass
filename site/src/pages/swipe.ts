// Discover page: one event at a time, as a card. Swipe right (or ♥) to like it,
// left (or ✕) to pass. A like is the same heart as in the list, so it moves similar
// events up everywhere, and the next cards here are picked with it too.
// Passes are remembered for PASS_DAYS so the same cards don't come back right away;
// they don't teach anything (a pass is often "wrong day", not "not my thing").
//
// First visit (per city, nothing liked yet): a short "getting started" deck asks who
// the activities are for, then shows one card per kind of activity. The answers
// become the "For you" preferences used by every page.
import "../styles.css";
import { dateRange, Ev, Filters, groupSeries, loadEvents, matches, readFilters, seriesKey, setParams, today, When } from "../data";
import { bannerUrl, downloadIcs, openDetail, setSeriesLookup, syncDetail } from "../detail";
import { clock, dayGroupLabel, fmtShortDate } from "../format";
import { audienceShort, categoryLabel, lang, t } from "../i18n";
import { isLiked, likeCount, likeKey, personalScore, toggleLike } from "../likes";
import { city, cityHref } from "../city";
import {
  AUDIENCES, getPrefs, INTERESTS, interestOf, label, prefsCount, savePrefs, setStrict, showOnlyMine,
} from "../prefs";
import { esc, icons, NO_FILTERS, renderShell, tagsHtml, venueLine } from "../ui";

const fr = lang === "fr";
const PASS_KEY = "tg-passed";
const PASS_DAYS = 14;
const STARTED_KEY = `tg-started-${city.id}`; // the getting-started deck was done
const TRIED_KEY = "tg-swiped"; // has swiped at least once (no more wiggle hint)
const SWIPE_PX = 110; // drag further than this (or flick) to decide
const RECENT = 4; // cards of a category shown lately make the next one of it rank lower

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* page-only memory */ } },
};

const shell = renderShell("swipe");
shell.main.classList.add("swipe-main");
shell.main.innerHTML = `<p class="status">${t("loading")}</p>`;

// ---------------------------------------------------------------- look of each kind of activity

const GROUP_STYLE: Record<string, { color: string; icon: string }> = {
  shows: { color: "#5b2a86", icon: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' },
  arts: { color: "#a8412a", icon: '<path d="M12 3a9 9 0 100 18c1 0 1.5-.8 1.5-1.5 0-.9-.7-1.2-.7-2 0-.8.7-1.5 1.5-1.5H17a4 4 0 004-4c0-5-4-9-9-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>' },
  kids: { color: "#9a5b00", icon: '<path d="M12 3l2.6 5.6 6 .6-4.5 4 1.3 6L12 16.3 6.6 19.2l1.3-6-4.5-4 6-.6z"/>' },
  books: { color: "#1f5a3a", icon: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/><path d="M8 7h7"/>' },
  learn: { color: "#22577a", icon: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>' },
  sport: { color: "#2d6a4f", icon: '<path d="M3 20l6-10 4 6 3-4 5 8z"/><circle cx="17" cy="6" r="2"/>' },
  wellness: { color: "#556b2f", icon: '<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/>' },
  community: { color: "#8a3b5e", icon: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 14.5c3 0 6 1.8 6 5"/>' },
};
const DEFAULT_STYLE = { color: "#1f5a3a", icon: '<path d="M4 21C4 14 2 9 1 6"/><path d="M9 21C9 13 9 6 11 1"/><path d="M14 21C14 15 16 10 20 7"/><path d="M19 21C20 17 22 14 25 13"/>' };
const styleOf = (e: Ev) => GROUP_STYLE[interestOf(e.category)?.id ?? ""] ?? DEFAULT_STYLE;
const groupIcon = (paths: string) =>
  `<svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

// ---------------------------------------------------------------- passes

function readPasses(): Record<string, number> {
  try {
    const raw = JSON.parse(store.get(PASS_KEY) ?? "{}");
    const cutoff = Date.now() - PASS_DAYS * 86_400_000;
    return Object.fromEntries(Object.entries(raw).filter(([, at]) => typeof at === "number" && at > cutoff)) as Record<string, number>;
  } catch {
    return {};
  }
}
let passes = readPasses();
const savePasses = () => store.set(PASS_KEY, JSON.stringify(passes));

// ---------------------------------------------------------------- deck

type Item =
  | { kind: "ask" } // "Who are the activities for?"
  | { kind: "ev"; e: Ev; starter?: string }; // starter = interest id, during getting started

const WHENS: { id: When; label: string }[] = [
  { id: "today", label: fr ? "Aujourd'hui" : "Today" },
  { id: "weekend", label: fr ? "Week-end" : "Weekend" },
  { id: "week", label: fr ? "7 jours" : "7 days" },
];

let events: Ev[] = [];
let allSeries = new Map<string, Ev[]>();
const url = readFilters();
let when: When = (["today", "weekend", "week"] as When[]).includes(url.when) ? url.when : "week";
let aud = url.aud || (getPrefs().audiences.length === 1 ? getPrefs().audiences[0] : "");
let dropin = url.dropin;

let pool: Ev[] = []; // not shown yet
let queue: Item[] = []; // shown before the pool (getting started)
const recent: string[] = []; // categories of the last cards shown
const history: { item: Item; liked: boolean }[] = [];
let current: Item | null = null;
let upNext: Item | null = null;

let starting = false; // getting-started deck in progress
const starterLikes = new Set<string>();
let starterAudiences: string[] = [];
let starterTotal = 0;

const isStarter = (i: Item | null) => i?.kind === "ev" && Boolean(i.starter);

function filters(): Filters {
  return { ...NO_FILTERS, when, aud, dropin };
}

/** Best remaining card: personal score, some variety, sooner a bit first, a little chance. */
function drawFromPool(): Ev | null {
  if (!pool.length) return null;
  let best = 0;
  let bestValue = -Infinity;
  pool.forEach((e, i) => {
    const sameCat = recent.filter((c) => c === e.category).length;
    const soon = Math.max(0, 1 - (e.startMs - Date.now()) / (7 * 86_400_000));
    const value = personalScore(e) + 0.6 * soon + (e.image ? 0.4 : 0) - 0.9 * sameCat + Math.random() * 0.8;
    if (value > bestValue) [best, bestValue] = [i, value];
  });
  const [e] = pool.splice(best, 1);
  recent.push(e.category);
  if (recent.length > RECENT) recent.shift();
  return e;
}

function draw(): Item | null {
  if (queue.length) return queue.shift()!;
  if (starting) return null; // the pool waits until getting started is over
  const e = drawFromPool();
  return e ? { kind: "ev", e } : null;
}

/** One card per activity: its next date matching the filters. */
function candidates(f: Filters, mine: boolean): Ev[] {
  const range = dateRange(f);
  const now = Date.now();
  const next = new Map<string, Ev>();
  for (const e of events) {
    if (e.endMs < now || !matches(e, f, range, mine)) continue;
    const k = seriesKey(e);
    const seen = next.get(k);
    if (!seen || e.startMs < seen.startMs) next.set(k, e);
  }
  return [...next.values()];
}

function buildPool(): void {
  pool = candidates(filters(), true).filter((e) => !isLiked(e) && !passes[likeKey(e)]);
  recent.length = 0;
}

function restartDeck(): void {
  history.length = 0;
  buildPool();
  current = draw();
  upNext = draw();
}

// ---------------------------------------------------------------- getting started

function startStarter(): void {
  starting = true;
  if (getPrefs().audiences.length) {
    starterAudiences = [...getPrefs().audiences];
    queueStarterCards();
  } else {
    queue = [{ kind: "ask" }];
  }
  if (!starting) return; // nothing to show: finishStarter already built the deck
  current = draw();
  upNext = draw();
}

/** One appealing card per kind of activity in the next two weeks, for whoever the visitor said. */
function queueStarterCards(): void {
  const f: Filters = { ...NO_FILTERS, aud: starterAudiences.length === 1 ? starterAudiences[0] : "" };
  const horizon = Date.now() + 14 * 86_400_000;
  const all = candidates(f, false).filter((e) => e.startMs < horizon);
  queue = [];
  for (const group of INTERESTS) {
    const options = all.filter((e) => group.categories.includes(e.category))
      .sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image)) || a.startMs - b.startMs)
      .slice(0, 6);
    if (!options.length) continue;
    const e = options[Math.floor(Math.random() * options.length)];
    queue.push({ kind: "ev", e, starter: group.id });
  }
  // Mixed order, so it doesn't feel like a form.
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  starterTotal = queue.length;
  if (!starterTotal) finishStarter();
}

function finishStarter(): void {
  starting = false;
  queue = [];
  const before = getPrefs();
  const interests = [...new Set([...before.interests, ...starterLikes])];
  savePrefs({ ...before, interests, audiences: starterAudiences.length ? starterAudiences : before.audiences });
  store.set(STARTED_KEY, "1");
  if (starterAudiences.length === 1) aud = starterAudiences[0];
  const names = INTERESTS.filter((i) => interests.includes(i.id)).map((i) => label(i.label));
  toast(names.length
    ? (fr ? `C'est noté : ${names.join(", ")}. Les pages montrent maintenant ce qui vous correspond.`
      : `Got it: ${names.join(", ")}. Every page now shows what fits you.`)
    : (fr ? "Pas de préférence : on vous montre de tout." : "No favourites yet: you'll see a bit of everything."));
  renderFilters();
  restartDeck();
}

// ---------------------------------------------------------------- cards

/** "In 25 min", "Today · 14h (in 3 h)", "On now, until 16h", "Saturday Nov 8 · 10h". */
function whenLine(e: Ev): string {
  const now = Date.now();
  if (e.startMs <= now && now < e.endMs) {
    return e.multiDay
      ? `${fr ? "En cours, jusqu'au" : "On now, until"} ${fmtShortDate(e.endDay)}`
      : `${fr ? "En ce moment, jusqu'à" : "On now, until"} ${clock(e.endMs)}`;
  }
  const mins = Math.round((e.startMs - now) / 60_000);
  if (!e.all_day && mins > 0 && mins < 60) return fr ? `Dans ${mins} min` : `Starts in ${mins} min`;
  const dayName = dayGroupLabel(e.startDay);
  const named = dayName === t("day.today") || dayName === t("day.tomorrow");
  const dayLabel = named ? dayName : `${dayName} ${fmtShortDate(e.startDay)}`;
  if (e.all_day) return `${dayLabel} · ${t("allDay")}`;
  const hours = Math.round(mins / 60);
  const soon = e.startDay === today() && hours <= 12 ? (fr ? ` (dans ${hours} h)` : ` (in ${hours} h)`) : "";
  return `${dayLabel} · ${clock(e.startMs)}${soon}`;
}

/** "Also Nov 12, 19 +3" for repeating activities. */
function otherDates(e: Ev): string {
  if (e.multiDay) return "";
  const now = Date.now();
  const days = [...new Set((allSeries.get(seriesKey(e)) ?? [])
    .filter((x) => x.endMs >= now && x.startDay !== e.startDay).map((x) => x.startDay))].sort();
  if (!days.length) return "";
  const shown = days.slice(0, 3).map(fmtShortDate).join(", ");
  return `${fr ? "Aussi le" : "Also"} ${shown}${days.length > 3 ? ` +${days.length - 3}` : ""}`;
}

/** Position of a getting-started card ("3/8"). */
function starterStep(back: boolean): number {
  const left = queue.filter(isStarter).length + (isStarter(upNext) ? 1 : 0);
  return starterTotal - left + (back ? 1 : 0);
}

function cardHtml(item: Item, back = false): string {
  if (item.kind === "ask") return askHtml(back);
  const { e } = item;
  const st = styleOf(e);
  // The colour and icon of the kind of activity show while the photo loads, or instead of it.
  const photo = `<div class="swipe-photo" style="background:${st.color}">${groupIcon(st.icon)}${e.image
    ? `<img src="${esc(bannerUrl(e.image))}" alt="" draggable="false" onerror="this.remove()">` : ""}</div>`;
  const who = audienceShort(e.audience);
  const more = otherDates(e);
  const group = item.starter ? INTERESTS.find((i) => i.id === item.starter) : undefined;
  return `
    <article class="swipe-card${back ? " is-back" : ""}" data-id="${e.id}" ${back ? 'aria-hidden="true"' : 'tabindex="0"'}
      aria-label="${esc(e.title)}">
      ${photo}
      ${group ? `<span class="swipe-starter">${fr ? "Ça vous dit?" : "Your kind of thing?"} <strong>${esc(label(group.label))}</strong><span class="swipe-step">${starterStep(back)}/${starterTotal}</span></span>` : ""}
      <span class="swipe-stamp stamp-like" aria-hidden="true">${fr ? "J'AIME" : "LIKE"}</span>
      <span class="swipe-stamp stamp-pass" aria-hidden="true">${fr ? "PASSER" : "PASS"}</span>
      <div class="swipe-info">
        <span class="swipe-cat"><span class="swipe-dot" style="background:${st.color}"></span>${esc(categoryLabel(e.category))}${who ? ` · ${esc(who)}` : ""}</span>
        <h2 class="swipe-title">${esc(e.title)}</h2>
        <p class="swipe-when">${esc(whenLine(e))}</p>
        ${more ? `<p class="swipe-also">${esc(more)}</p>` : ""}
        <p class="swipe-venue">${venueLine(e, true)}</p>
        <div class="swipe-tags">${tagsHtml(e)}</div>
      </div>
    </article>`;
}

function askHtml(back: boolean): string {
  return `
    <article class="swipe-card swipe-ask${back ? " is-back" : ""}" ${back ? 'aria-hidden="true"' : ""}>
      <div class="swipe-ask-inner">
        <p class="kicker swipe-ask-kicker">${fr ? "Pour commencer" : "Let's get started"}</p>
        <h2 class="swipe-ask-title">${fr ? "Vous cherchez des activités pour…" : "You're looking for things to do for…"}</h2>
        <div class="chips-wrap swipe-ask-chips">
          ${AUDIENCES.map((a) => `<button type="button" class="chip-btn" data-aud="${a.id}" aria-pressed="false">${esc(label(a.label))}</button>`).join("")}
        </div>
        <p class="swipe-ask-note">${fr
          ? "Ensuite, quelques activités de tous genres : glissez à droite celles qui vous plaisent, à gauche les autres. On s'en souviendra."
          : "Next, a few events of every kind: swipe right on the ones you like, left on the rest. We'll remember."}</p>
        <button type="button" class="btn btn-primary swipe-ask-go">${fr ? "Continuer" : "Continue"}</button>
        <button type="button" class="link-btn swipe-ask-skip">${fr ? "Passer cette étape" : "Skip this"}</button>
      </div>
    </article>`;
}

// ---------------------------------------------------------------- page

let stack: HTMLElement;
let busy = false;

try {
  events = await loadEvents();
  start();
} catch (err) {
  console.error(err);
  shell.main.innerHTML = `<p class="status">${t("loadError")}</p>`;
}

function start(): void {
  const byId = new Map(events.map((e) => [e.id, e]));
  allSeries = groupSeries(events.filter((x) => x.endMs >= Date.now()));
  setSeriesLookup((e) => allSeries.get(seriesKey(e)) ?? []);

  shell.main.innerHTML = `
    <div class="swipe-top">
      <div class="swipe-whens" role="group" aria-label="${fr ? "Quand" : "When"}">
        ${WHENS.map((w) => `<button type="button" class="chip-btn swipe-when-btn" data-when="${w.id}" aria-pressed="${w.id === when}">${esc(w.label)}</button>`).join("")}
      </div>
      <button type="button" class="swipe-likes">${icons.heart}<span class="swipe-like-count"></span></button>
    </div>
    <div class="swipe-filters"></div>
    <div class="swipe-stack"></div>
    <div class="swipe-actions">
      <button type="button" class="swipe-btn swipe-undo" aria-label="${fr ? "Annuler" : "Undo"}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/></svg>
      </button>
      <button type="button" class="swipe-btn swipe-pass" aria-label="${fr ? "Passer" : "Pass"}">${icons.close}</button>
      <button type="button" class="swipe-btn swipe-like" aria-label="${t("like")}">${icons.heart}</button>
      <button type="button" class="swipe-btn swipe-more" aria-label="${fr ? "Détails" : "Details"}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>
      </button>
    </div>
    <p class="sr-only">${fr
      ? "Glissez une carte à droite ou utilisez le bouton cœur pour aimer; à gauche ou le bouton X pour passer. Touchez la carte pour les détails. Flèches gauche et droite au clavier."
      : "Swipe a card right or use the heart button to like it; left or the X button to pass. Tap the card for details. Left and right arrow keys work too."}</p>`;
  stack = shell.main.querySelector(".swipe-stack")!;

  shell.main.querySelectorAll<HTMLButtonElement>(".swipe-when-btn").forEach((b) => b.addEventListener("click", () => {
    when = b.dataset.when as When;
    setParams({ when });
    shell.main.querySelectorAll(".swipe-when-btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    refilter();
  }));
  shell.main.querySelector(".swipe-pass")!.addEventListener("click", () => decide(false));
  shell.main.querySelector(".swipe-like")!.addEventListener("click", () => decide(true));
  shell.main.querySelector(".swipe-undo")!.addEventListener("click", undo);
  shell.main.querySelector(".swipe-more")!.addEventListener("click", () => { if (current?.kind === "ev") openDetail(current.e); });
  shell.main.querySelector(".swipe-likes")!.addEventListener("click", openLikes);
  document.addEventListener("keydown", (ev) => {
    if (document.querySelector("dialog[open]") || (ev.target as HTMLElement).closest("input, select, textarea, button")) return;
    if (current?.kind !== "ev") return;
    if (ev.key === "ArrowRight") decide(true);
    else if (ev.key === "ArrowLeft") decide(false);
    else if (ev.key === "Backspace" || ev.key === "z") undo();
    else if ((ev.key === "Enter" || ev.key === " ") && (ev.target as HTMLElement).closest(".swipe-card")) {
      ev.preventDefault();
      openDetail(current.e);
    }
  });

  syncDetail(byId);
  window.addEventListener("popstate", () => syncDetail(byId));

  renderFilters();
  if (!store.get(STARTED_KEY) && likeCount() === 0) startStarter();
  else restartDeck();
  render();
}

/** Who's it for, drop-in only, and "For you" (when preferences are set). */
function renderFilters(): void {
  const el = shell.main.querySelector<HTMLElement>(".swipe-filters")!;
  const mine = prefsCount() > 0;
  el.innerHTML = `
    <label class="select-label swipe-aud"><span class="sr-only">${fr ? "Pour qui?" : "Who's it for?"}</span>
      <select name="aud">
        <option value="">${fr ? "Pour tout le monde" : "Everyone"}</option>
        ${AUDIENCES.map((a) => `<option value="${a.id}"${a.id === aud ? " selected" : ""}>${esc(label(a.label))}</option>`).join("")}
      </select>
    </label>
    <button type="button" class="chip-btn" data-f="dropin" aria-pressed="${dropin}">${esc(t("dropin"))}</button>
    ${mine ? `<button type="button" class="chip-btn" data-f="mine" aria-pressed="${showOnlyMine()}">${fr ? "Pour vous" : "For you"}</button>` : ""}`;
  el.querySelector("select")!.addEventListener("change", (ev) => {
    aud = (ev.target as HTMLSelectElement).value;
    setParams({ aud });
    refilter();
  });
  el.querySelectorAll<HTMLButtonElement>("[data-f]").forEach((b) => b.addEventListener("click", () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    if (b.dataset.f === "dropin") { dropin = on; setParams({ dropin }); } else setStrict(on);
    refilter();
  }));
}

/** Filters changed: new deck (getting-started cards stay as they are). */
function refilter(): void {
  if (starting) return;
  restartDeck();
  render();
}

function render(): void {
  const count = likeCount();
  shell.main.querySelector(".swipe-like-count")!.textContent = String(count);
  shell.main.querySelector(".swipe-likes")!.setAttribute("aria-label",
    fr ? `${count} coup${count > 1 ? "s" : ""} de cœur — voir et planifier` : `${count} liked — see and plan`);
  (shell.main.querySelector(".swipe-undo") as HTMLButtonElement).disabled = !history.length;
  const isEvent = current?.kind === "ev";
  for (const sel of [".swipe-pass", ".swipe-like", ".swipe-more"]) {
    (shell.main.querySelector(sel) as HTMLButtonElement).disabled = !isEvent;
  }
  shell.main.querySelector<HTMLElement>(".swipe-filters")!.hidden = starting;

  if (!current) {
    stack.innerHTML = `
      <div class="swipe-empty">
        <p class="swipe-empty-title">${fr ? "C'est tout pour l'instant!" : "That's everything for now!"}</p>
        <p>${fr ? "Vous avez vu toutes les activités qui correspondent." : "You've seen every event that fits."}</p>
        <button type="button" class="btn btn-primary swipe-open-likes">${fr ? "Voir mes coups de cœur" : "See what I liked"}</button>
        <button type="button" class="btn btn-outline swipe-reset">${fr ? "Revoir les activités passées" : "Show passed events again"}</button>
        ${showOnlyMine() ? `<button type="button" class="link-btn swipe-all">${fr ? "Voir aussi le reste" : "Show everything else too"}</button>` : ""}
      </div>`;
    stack.querySelector(".swipe-open-likes")!.addEventListener("click", openLikes);
    stack.querySelector(".swipe-reset")!.addEventListener("click", () => {
      passes = {};
      savePasses();
      refilter();
    });
    stack.querySelector(".swipe-all")?.addEventListener("click", () => {
      setStrict(false);
      renderFilters();
      refilter();
    });
    return;
  }
  stack.innerHTML = (upNext ? cardHtml(upNext, true) : "") + cardHtml(current);
  const card = stack.querySelector<HTMLElement>(".swipe-card:not(.is-back)")!;
  if (current.kind === "ask") {
    bindAsk(card);
    return;
  }
  bindDrag(card);
  if (!store.get(TRIED_KEY) && !matchMedia("(prefers-reduced-motion: reduce)").matches) card.classList.add("wiggle");
  // Load the photo after the next one while this card is on screen.
  const queued = queue.find((i): i is Extract<Item, { kind: "ev" }> => i.kind === "ev" && Boolean(i.e.image));
  const img = queued?.e.image ?? pool.find((e) => e.image)?.image;
  if (img) new Image().src = bannerUrl(img);
}

function bindAsk(card: HTMLElement): void {
  card.querySelectorAll<HTMLButtonElement>("[data-aud]").forEach((b) => b.addEventListener("click", () =>
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"))));
  const go = (skip: boolean) => {
    starterAudiences = skip ? [] : [...card.querySelectorAll<HTMLButtonElement>("[data-aud][aria-pressed='true']")].map((b) => b.dataset.aud!);
    queueStarterCards();
    if (starting) {
      current = draw();
      upNext = draw();
    }
    render();
  };
  card.querySelector(".swipe-ask-go")!.addEventListener("click", () => go(false));
  card.querySelector(".swipe-ask-skip")!.addEventListener("click", () => go(true));
}

/** Like or pass the top card, with the card flying out to that side. */
function decide(like: boolean, fromDrag?: { dx: number; dy: number }): void {
  if (current?.kind !== "ev" || busy) return;
  const item = current;
  const { e } = item;
  const card = stack.querySelector<HTMLElement>(".swipe-card:not(.is-back)");
  if (like) { if (!isLiked(e)) toggleLike(e); } else { passes[likeKey(e)] = Date.now(); savePasses(); }
  if (item.starter && like) starterLikes.add(item.starter);
  history.push({ item, liked: like });
  store.set(TRIED_KEY, "1");
  navigator.vibrate?.(12);
  current = upNext;
  upNext = draw();
  if (starting && !current) finishStarter();

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!card || reduce) { render(); return; }
  busy = true;
  const dy = fromDrag?.dy ?? 0;
  card.classList.remove("wiggle");
  card.style.transition = "transform 0.28s ease-in, opacity 0.28s ease-in";
  card.style.transform = `translate(${(like ? 1 : -1) * (window.innerWidth + 200)}px, ${dy * 1.5}px) rotate(${like ? 25 : -25}deg)`;
  card.style.opacity = "0.6";
  card.classList.add(like ? "show-like" : "show-pass");
  stack.querySelector(".is-back")?.classList.add("is-rising");
  setTimeout(() => { busy = false; render(); }, 260);
}

function undo(): void {
  if (busy) return;
  const last = history.pop();
  if (!last || last.item.kind !== "ev") return;
  const { e, starter } = last.item;
  if (last.liked) { if (isLiked(e)) toggleLike(e); } else { delete passes[likeKey(e)]; savePasses(); }
  if (starter) starterLikes.delete(starter);
  if (upNext) {
    if (upNext.kind === "ev" && !upNext.starter) pool.push(upNext.e);
    else queue.unshift(upNext);
  }
  upNext = current;
  current = last.item;
  render();
}

function bindDrag(card: HTMLElement): void {
  let x0 = 0, y0 = 0, dx = 0, dy = 0, t0 = 0;
  let dragging = false;
  const like = card.querySelector<HTMLElement>(".stamp-like")!;
  const pass = card.querySelector<HTMLElement>(".stamp-pass")!;

  card.addEventListener("pointerdown", (ev) => {
    if (busy || ev.button !== 0) return;
    dragging = true;
    card.classList.remove("wiggle");
    x0 = ev.clientX; y0 = ev.clientY; dx = dy = 0; t0 = performance.now();
    card.setPointerCapture(ev.pointerId);
    card.style.transition = "none";
  });
  card.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    dx = ev.clientX - x0; dy = ev.clientY - y0;
    card.style.transform = `translate(${dx}px, ${dy * 0.4}px) rotate(${dx / 18}deg)`;
    like.style.opacity = String(Math.max(0, Math.min(1, dx / SWIPE_PX)));
    pass.style.opacity = String(Math.max(0, Math.min(1, -dx / SWIPE_PX)));
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - t0); // px per ms
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
      card.style.transform = "";
      if (current?.kind === "ev") openDetail(current.e); // a tap, not a swipe
      return;
    }
    if (Math.abs(dx) > SWIPE_PX || (speed > 0.6 && Math.abs(dx) > 40)) {
      decide(dx > 0, { dx, dy });
      return;
    }
    card.style.transition = "transform 0.2s ease-out";
    card.style.transform = "";
    like.style.opacity = pass.style.opacity = "0";
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}

// ---------------------------------------------------------------- what I liked: plan it

let likesDialog: HTMLDialogElement | null = null;

/** Upcoming liked activities in this city, each at its next date. */
function likedUpcoming(): Ev[] {
  const now = Date.now();
  const next = new Map<string, Ev>();
  for (const e of events) {
    if (e.endMs < now || !isLiked(e)) continue;
    const k = seriesKey(e);
    const seen = next.get(k);
    if (!seen || e.startMs < seen.startMs) next.set(k, e);
  }
  return [...next.values()].sort((a, b) => a.startMs - b.startMs);
}

function openLikes(): void {
  if (!likesDialog) {
    likesDialog = document.createElement("dialog");
    likesDialog.className = "prefs likes-sheet";
    likesDialog.setAttribute("aria-labelledby", "likes-title");
    document.body.append(likesDialog);
    likesDialog.addEventListener("click", (ev) => { if (ev.target === likesDialog) likesDialog!.close(); });
  }
  renderLikes();
  if (!likesDialog.open) likesDialog.showModal();
}

function renderLikes(): void {
  const d = likesDialog!;
  const list = likedUpcoming();
  const listHref = `${cityHref(city, "index.html")}?liked=1`;
  d.innerHTML = `
    <div class="prefs-inner">
      <span class="sheet-handle" aria-hidden="true"></span>
      <div class="prefs-head">
        <div>
          <p class="kicker prefs-kicker">${esc(city.name)}</p>
          <h2 id="likes-title">${fr ? "Mes coups de cœur" : "What I liked"}</h2>
        </div>
        <button type="button" class="icon-btn" data-act="close" aria-label="${fr ? "Fermer" : "Close"}">${icons.close}</button>
      </div>
      ${list.length ? `
        <div class="likes-actions">
          <button type="button" class="btn btn-primary" data-act="ics-all">${icons.calendar}<span>${fr ? "Tout au calendrier" : "Add all to calendar"}</span></button>
          <button type="button" class="btn btn-outline" data-act="share">${fr ? "Partager" : "Share"}</button>
        </div>
        <ul class="likes-list">
          ${list.map((e) => `
            <li class="likes-row" data-id="${e.id}">
              <button type="button" class="likes-open">
                <span class="likes-when">${esc(whenLine(e))}</span>
                <span class="likes-title">${esc(e.title)}</span>
                <span class="likes-venue">${venueLine(e, true)}</span>
              </button>
              <button type="button" class="icon-btn" data-act="ics" aria-label="${fr ? "Ajouter au calendrier" : "Add to calendar"} — ${esc(e.title)}">${icons.calendar}</button>
              <button type="button" class="icon-btn" data-act="unlike" aria-label="${t("unlike")} — ${esc(e.title)}">${icons.close}</button>
            </li>`).join("")}
        </ul>
        <p class="prefs-hint"><a href="${listHref}">${fr ? "Les voir dans la liste" : "See them in the list"}</a></p>`
      : `<p class="prefs-intro">${fr
        ? "Rien pour l'instant. Glissez à droite les activités qui vous plaisent : elles s'ajouteront ici, prêtes à mettre au calendrier ou à partager."
        : "Nothing yet. Swipe right on events you like: they'll show up here, ready to add to your calendar or share."}</p>`}
    </div>`;

  const byId = new Map(list.map((e) => [e.id, e]));
  d.querySelector("[data-act='close']")!.addEventListener("click", () => d.close());
  d.querySelector("[data-act='ics-all']")?.addEventListener("click", () =>
    downloadIcs(list, fr ? `touchgrass-coups-de-coeur-${city.id}` : `touchgrass-liked-${city.id}`));
  d.querySelector("[data-act='share']")?.addEventListener("click", () => shareList(list));
  d.querySelectorAll<HTMLElement>(".likes-row").forEach((row) => {
    const e = byId.get(row.dataset.id!)!;
    row.querySelector(".likes-open")!.addEventListener("click", () => { d.close(); openDetail(e); });
    row.querySelector("[data-act='ics']")!.addEventListener("click", () => downloadIcs(e));
    row.querySelector("[data-act='unlike']")!.addEventListener("click", () => {
      if (isLiked(e)) toggleLike(e);
      renderLikes();
      render();
    });
  });
}

async function shareList(list: Ev[]): Promise<void> {
  const site = new URL(cityHref(city, "index.html"), location.href).href;
  const text = `${fr ? "Mes sorties gratuites" : "My free outings"} — ${city.name}\n\n`
    + list.map((e) => `• ${e.title} — ${whenLine(e)}${e.venue ? ` — ${e.venue}` : ""}`).join("\n")
    + `\n\n${site}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "touchgrass", text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast(fr ? "Liste copiée : collez-la dans un message." : "List copied: paste it in a message.");
  } catch (err) {
    if ((err as Error).name !== "AbortError") toast(fr ? "Impossible de partager." : "Couldn't share.");
  }
}

// ---------------------------------------------------------------- toast

function toast(message: string): void {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("p");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.classList.add("toast-out"), 4500);
  setTimeout(() => el.remove(), 5000);
}
