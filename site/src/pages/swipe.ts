// Discover page: one event at a time, as a card. Swipe right (or ♥) to like it,
// left (or ✕) to pass. A like is the same heart as in the list, so it moves similar
// events up everywhere, and the next cards here are picked with it too.
// Passes are remembered for PASS_DAYS so the same cards don't come back right away.
import "../styles.css";
import { dateRange, Ev, Filters, groupSeries, loadEvents, matches, readFilters, seriesKey, setParams, When } from "../data";
import { bannerUrl, openDetail, setSeriesLookup, syncDetail } from "../detail";
import { clock, dayGroupLabel, fmtShortDate } from "../format";
import { categoryLabel, lang, t } from "../i18n";
import { isLiked, likeCount, likeKey, personalScore, toggleLike } from "../likes";
import { cityHref, city } from "../city";
import { esc, icons, renderShell, tagsHtml, venueLine } from "../ui";

const fr = lang === "fr";
const PASS_KEY = "tg-passed";
const PASS_DAYS = 14;
const SWIPE_PX = 110; // drag further than this (or flick) to decide
const RECENT = 4; // cards of a category shown lately make the next one of it rank lower

const shell = renderShell("swipe");
shell.main.classList.add("swipe-main");
shell.main.innerHTML = `<p class="status">${t("loading")}</p>`;

// ---------------------------------------------------------------- passes

function readPasses(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(PASS_KEY) ?? "{}");
    const cutoff = Date.now() - PASS_DAYS * 86_400_000;
    return Object.fromEntries(Object.entries(raw).filter(([, at]) => typeof at === "number" && at > cutoff)) as Record<string, number>;
  } catch {
    return {};
  }
}
let passes = readPasses();
function savePasses(): void {
  try { localStorage.setItem(PASS_KEY, JSON.stringify(passes)); } catch { /* page-only memory */ }
}

// ---------------------------------------------------------------- deck

const WHENS: { id: When; label: string }[] = [
  { id: "today", label: fr ? "Aujourd'hui" : "Today" },
  { id: "weekend", label: fr ? "Week-end" : "Weekend" },
  { id: "week", label: fr ? "7 jours" : "7 days" },
];

let pool: Ev[] = []; // not shown yet
const recent: string[] = []; // categories of the last cards shown
const history: { e: Ev; liked: boolean }[] = [];
let current: Ev | null = null;
let upNext: Ev | null = null;

/** Best remaining card: personal score, some variety, a little chance. */
function draw(): Ev | null {
  if (!pool.length) return null;
  let best = 0;
  let bestValue = -Infinity;
  pool.forEach((e, i) => {
    const sameCat = recent.filter((c) => c === e.category).length;
    const soon = Math.max(0, 1 - (e.startMs - Date.now()) / (7 * 86_400_000)); // sooner first, a bit
    const value = personalScore(e) + 0.6 * soon + (e.image ? 0.4 : 0) - 0.9 * sameCat + Math.random() * 0.8;
    if (value > bestValue) [best, bestValue] = [i, value];
  });
  const [e] = pool.splice(best, 1);
  recent.push(e.category);
  if (recent.length > RECENT) recent.shift();
  return e;
}

function buildPool(events: Ev[], when: When): void {
  const f: Filters = { ...readFilters(), when };
  const range = dateRange(f);
  const now = Date.now();
  // One card per activity: its next date in the window.
  const next = new Map<string, Ev>();
  for (const e of events) {
    if (e.endMs < now || !matches(e, f, range)) continue;
    const k = seriesKey(e);
    const seen = next.get(k);
    if (!seen || e.startMs < seen.startMs) next.set(k, e);
  }
  pool = [...next.values()].filter((e) => !isLiked(e) && !passes[likeKey(e)]);
  history.length = 0;
  recent.length = 0;
  current = draw();
  upNext = draw();
}

// ---------------------------------------------------------------- cards

function whenLine(e: Ev): string {
  if (e.startMs < Date.now() && e.multiDay) return `${fr ? "En cours, jusqu'au" : "On now, until"} ${fmtShortDate(e.endDay)}`;
  const day = dayGroupLabel(e.startDay);
  return e.all_day ? `${day} · ${t("allDay")}` : `${day} · ${clock(e.startMs)}`;
}

function cardHtml(e: Ev, back = false): string {
  const photo = e.image
    ? `<img class="swipe-photo" src="${esc(bannerUrl(e.image))}" alt="" draggable="false">`
    : `<div class="swipe-photo swipe-photo-none" aria-hidden="true">${icons.logo}</div>`;
  return `
    <article class="swipe-card${back ? " is-back" : ""}" data-id="${e.id}" ${back ? 'aria-hidden="true"' : 'tabindex="0"'}
      aria-label="${esc(e.title)}">
      ${photo}
      <span class="swipe-stamp stamp-like" aria-hidden="true">${fr ? "J'AIME" : "LIKE"}</span>
      <span class="swipe-stamp stamp-pass" aria-hidden="true">${fr ? "PASSER" : "PASS"}</span>
      <div class="swipe-info">
        <span class="swipe-cat">${esc(categoryLabel(e.category))}</span>
        <h2 class="swipe-title">${esc(e.title)}</h2>
        <p class="swipe-when">${esc(whenLine(e))}</p>
        <p class="swipe-venue">${venueLine(e, true)}</p>
        <div class="swipe-tags">${tagsHtml(e)}</div>
      </div>
    </article>`;
}

// ---------------------------------------------------------------- page

let events: Ev[] = [];
let when: When = (["today", "weekend", "week"] as When[]).includes(readFilters().when) ? readFilters().when : "week";
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
  const allSeries = groupSeries(events.filter((x) => x.endMs >= Date.now()));
  setSeriesLookup((e) => allSeries.get(seriesKey(e)) ?? []);

  shell.main.innerHTML = `
    <div class="swipe-top">
      <div class="swipe-whens" role="group" aria-label="${fr ? "Quand" : "When"}">
        ${WHENS.map((w) => `<button type="button" class="chip-btn swipe-when-btn" data-when="${w.id}" aria-pressed="${w.id === when}">${esc(w.label)}</button>`).join("")}
      </div>
      <a class="swipe-likes" href="${cityHref(city, "index.html")}">${icons.heart}<span class="swipe-like-count"></span></a>
    </div>
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
    <p class="swipe-hint">${fr
      ? "Glissez à droite pour aimer, à gauche pour passer. Vos coups de cœur passent en premier dans la liste."
      : "Swipe right to like, left to pass. What you like goes first in the list."}</p>`;
  stack = shell.main.querySelector(".swipe-stack")!;

  shell.main.querySelectorAll<HTMLButtonElement>(".swipe-when-btn").forEach((b) => b.addEventListener("click", () => {
    when = b.dataset.when as When;
    setParams({ when });
    shell.main.querySelectorAll(".swipe-when-btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    buildPool(events, when);
    render();
  }));
  shell.main.querySelector(".swipe-pass")!.addEventListener("click", () => decide(false));
  shell.main.querySelector(".swipe-like")!.addEventListener("click", () => decide(true));
  shell.main.querySelector(".swipe-undo")!.addEventListener("click", undo);
  shell.main.querySelector(".swipe-more")!.addEventListener("click", () => current && openDetail(current));
  document.addEventListener("keydown", (ev) => {
    if (document.querySelector("dialog[open]") || (ev.target as HTMLElement).closest("input, select, textarea")) return;
    if (ev.key === "ArrowRight") decide(true);
    else if (ev.key === "ArrowLeft") decide(false);
    else if (ev.key === "Backspace" || ev.key === "z") undo();
    else if ((ev.key === "Enter" || ev.key === " ") && current && (ev.target as HTMLElement).closest(".swipe-card")) {
      ev.preventDefault();
      openDetail(current);
    }
  });

  syncDetail(byId);
  window.addEventListener("popstate", () => syncDetail(byId));

  buildPool(events, when);
  render();
}

function render(): void {
  const count = likeCount();
  shell.main.querySelector(".swipe-like-count")!.textContent = String(count);
  shell.main.querySelector(".swipe-likes")!.setAttribute("aria-label",
    fr ? `${count} coup${count > 1 ? "s" : ""} de cœur — voir la liste` : `${count} liked — see the list`);
  (shell.main.querySelector(".swipe-undo") as HTMLButtonElement).disabled = !history.length;
  for (const sel of [".swipe-pass", ".swipe-like", ".swipe-more"]) {
    (shell.main.querySelector(sel) as HTMLButtonElement).disabled = !current;
  }

  if (!current) {
    stack.innerHTML = `
      <div class="swipe-empty">
        <p class="swipe-empty-title">${fr ? "C'est tout pour l'instant!" : "That's everything for now!"}</p>
        <p>${fr ? "Vous avez vu toutes les activités de cette période." : "You've seen every event in this period."}</p>
        <a class="btn btn-primary" href="${cityHref(city, "index.html")}">${fr ? "Voir la liste" : "See the list"}</a>
        <button type="button" class="btn btn-outline swipe-reset">${fr ? "Revoir les activités passées" : "Show passed events again"}</button>
      </div>`;
    stack.querySelector(".swipe-reset")!.addEventListener("click", () => {
      passes = {};
      savePasses();
      buildPool(events, when);
      render();
    });
    return;
  }
  stack.innerHTML = (upNext ? cardHtml(upNext, true) : "") + cardHtml(current);
  const card = stack.querySelector<HTMLElement>(".swipe-card:not(.is-back)")!;
  bindDrag(card);
  // Load the photo after that while this one is on screen.
  if (pool.length) {
    const peek = pool.find((e) => e.image);
    if (peek) new Image().src = bannerUrl(peek.image!);
  }
}

/** Like or pass the top card, with the card flying out to that side. */
function decide(like: boolean, fromDrag?: { dx: number; dy: number }): void {
  if (!current || busy) return;
  const e = current;
  const card = stack.querySelector<HTMLElement>(".swipe-card:not(.is-back)");
  if (like) { if (!isLiked(e)) toggleLike(e); } else { passes[likeKey(e)] = Date.now(); savePasses(); }
  history.push({ e, liked: like });
  current = upNext;
  upNext = draw();

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!card || reduce) { render(); return; }
  busy = true;
  const dy = fromDrag?.dy ?? 0;
  card.style.transition = "transform 0.28s ease-in, opacity 0.28s ease-in";
  card.style.transform = `translate(${(like ? 1 : -1) * (window.innerWidth + 200)}px, ${dy * 1.5}px) rotate(${like ? 25 : -25}deg)`;
  card.style.opacity = "0.6";
  card.classList.add(like ? "show-like" : "show-pass");
  stack.querySelector(".is-back")?.classList.add("is-rising");
  setTimeout(() => { busy = false; render(); }, 260);
}

function undo(): void {
  const last = history.pop();
  if (!last || busy) return;
  if (last.liked) { if (isLiked(last.e)) toggleLike(last.e); } else { delete passes[likeKey(last.e)]; savePasses(); }
  if (upNext) pool.push(upNext);
  upNext = current;
  current = last.e;
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
      if (current) openDetail(current); // a tap, not a swipe
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
