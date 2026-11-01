// "For you" UI: the first-visit question, the preferences panel (opened from the
// filter button in the search bar), and the bar above results that says what's
// being filtered, with "Edit" / "See everything".
import type { Ev, Filters } from "./data";
import { countLabel, lang, t } from "./i18n";
import {
  AUDIENCES, getPrefs, INTERESTS, label, matchesPrefs, Prefs, prefsCount, prefsSeen, prefsSummary, savePrefs,
} from "./prefs";
import { esc, icons } from "./ui";

const fr = lang === "fr";
const T = {
  welcome: fr ? "Bienvenue" : "Welcome",
  yourPrefs: fr ? "Vos préférences" : "Your preferences",
  question: fr ? "Qu'est-ce qui vous intéresse?" : "What are you into?",
  intro: fr
    ? "Choisissez autant d'options que vous voulez. Vous pourrez changer d'avis avec le bouton de filtre dans la barre de recherche."
    : "Pick as many as you like. You can change your mind with the filter button in the search bar.",
  interests: fr ? "Intérêts" : "Interests",
  forWhom: fr ? "Pour qui?" : "Who's it for?",
  where: fr ? "Où?" : "Where?",
  whereHint: fr ? "Laissez vide pour tout Montréal." : "Leave empty for all of Montréal.",
  price: fr ? "Prix" : "Price",
  freeOnly: fr ? "Gratuit seulement" : "Free only",
  see: (n: number) => (fr ? `Voir ${countLabel(n)}` : `See ${countLabel(n)}`),
  skip: fr ? "Passer — tout voir" : "Skip — see everything",
  clear: fr ? "Tout effacer" : "Clear all",
  close: fr ? "Fermer" : "Close",
  forYou: fr ? "Pour vous" : "For you",
  edit: fr ? "Modifier" : "Edit",
  seeAll: fr ? "Tout voir" : "See everything",
  seeingAll: fr ? "Vous voyez toutes les activités." : "You're seeing every event.",
  backToMine: fr ? "Revenir à mes préférences" : "Back to my preferences",
};

interface Options {
  events: Ev[];
  boroughs: string[];
  getFilters: () => Filters;
  /** Re-renders the page with these filter changes (also called with {} after saving prefs). */
  onPatch: (patch: Partial<Filters>) => void;
}

let opts: Options;
let dialog: HTMLDialogElement | null = null;
let bar: HTMLElement;

/** Call once per page, after the events are loaded and the filter bar exists. */
export function setupForYou(options: Options): void {
  opts = options;
  bar = document.createElement("div");
  bar.className = "foryou-bar";
  bar.setAttribute("aria-live", "polite");
  document.querySelector(".filters-slot")!.before(bar);

  // Delegated: search fields get re-rendered (e.g. "Clear filters").
  document.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement;
    if (target.closest(".search-filter-btn") || target.closest("[data-foryou='edit']")) openPrefs(false);
    else if (target.closest("[data-foryou='all']")) opts.onPatch({ all: true });
    else if (target.closest("[data-foryou='mine']")) opts.onPatch({ all: false });
  });

  refreshForYou();
  if (!prefsSeen()) openPrefs(true);
}

/** Update the bar and the search-bar badges (call after every render). */
export function refreshForYou(): void {
  if (!bar) return;
  const n = prefsCount();
  const all = opts.getFilters().all;
  document.querySelectorAll<HTMLElement>(".filter-badge").forEach((b) => {
    b.hidden = n === 0 || all;
    b.textContent = String(n);
  });
  // No preferences: no bar (the filter button in the search field invites them).
  bar.hidden = n === 0;
  if (n && !all) {
    bar.innerHTML = `<div class="wrap foryou-inner"><span class="kicker foryou-kicker">${T.forYou}</span>
      <span class="foryou-summary">${esc(prefsSummary())}</span>
      <button type="button" class="link-btn" data-foryou="edit">${T.edit}</button>
      <button type="button" class="link-btn" data-foryou="all">${T.seeAll}</button></div>`;
  } else if (n && all) {
    bar.innerHTML = `<div class="wrap foryou-inner"><span class="foryou-summary">${T.seeingAll}</span>
      <button type="button" class="link-btn" data-foryou="mine">${T.backToMine}</button></div>`;
  }
}

/** "No results" message; offers "See everything" when preferences are what's hiding events. */
export function emptyHtml(f: Filters): string {
  const prefsHiding = prefsCount() > 0 && !f.all;
  return `<p class="empty">${t("empty.filters")}${prefsHiding
    ? ` <button type="button" class="link-btn" data-foryou="all">${T.seeAll}</button>` : ""}</p>`;
}

function chip(group: string, value: string, text: string, on: boolean): string {
  return `<button type="button" class="chip-btn" data-group="${group}" data-value="${esc(value)}" aria-pressed="${on}">${esc(text)}</button>`;
}

function openPrefs(onboarding: boolean): void {
  const draft: Prefs = structuredClone(getPrefs());
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "prefs";
    dialog.setAttribute("aria-labelledby", "prefs-title");
    document.body.append(dialog);
    // Closing without choosing on the first visit counts as "see everything".
    dialog.addEventListener("close", () => {
      if (!prefsSeen()) {
        savePrefs(getPrefs());
        refreshForYou();
      }
    });
    dialog.addEventListener("click", (ev) => {
      if (ev.target === dialog) dialog!.close();
    });
  }
  const d = dialog;
  d.innerHTML = `
    <div class="prefs-inner">
      <span class="sheet-handle" aria-hidden="true"></span>
      <div class="prefs-head">
        <div>
          <p class="kicker prefs-kicker">${onboarding ? T.welcome : T.yourPrefs}</p>
          <h2 id="prefs-title">${T.question}</h2>
        </div>
        <button type="button" class="icon-btn" data-act="close" aria-label="${T.close}">${icons.close}</button>
      </div>
      <p class="prefs-intro">${T.intro}</p>
      <fieldset><legend>${T.interests}</legend>
        <div class="chips-wrap">${INTERESTS.map((i) => chip("interests", i.id, label(i.label), draft.interests.includes(i.id))).join("")}</div>
      </fieldset>
      <fieldset><legend>${T.forWhom}</legend>
        <div class="chips-wrap">${AUDIENCES.map((a) => chip("audiences", a.id, label(a.label), draft.audiences.includes(a.id))).join("")}</div>
      </fieldset>
      <fieldset><legend>${T.where}</legend>
        <p class="prefs-hint">${T.whereHint}</p>
        <div class="chips-wrap">${opts.boroughs.map((b) => chip("boroughs", b, b, draft.boroughs.includes(b))).join("")}</div>
      </fieldset>
      <fieldset><legend>${T.price}</legend>
        <div class="chips-wrap">${chip("freeOnly", "1", T.freeOnly, draft.freeOnly)}</div>
      </fieldset>
      <div class="prefs-actions">
        <button type="button" class="btn btn-primary" data-act="save"></button>
        <button type="button" class="btn btn-outline" data-act="${onboarding ? "skip" : "clear"}">${onboarding ? T.skip : T.clear}</button>
      </div>
    </div>`;

  const saveBtn = d.querySelector<HTMLButtonElement>("[data-act='save']")!;
  const now = Date.now();
  const upcoming = opts.events.filter((e) => e.endMs >= now);
  const updateCount = () => {
    saveBtn.textContent = T.see(upcoming.filter((e) => matchesPrefs(e, draft)).length);
  };
  updateCount();

  d.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const group = btn.dataset.group as keyof Prefs;
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(on));
      if (group === "freeOnly") draft.freeOnly = on;
      else {
        const list = draft[group] as string[];
        draft[group] = (on ? [...list, btn.dataset.value!] : list.filter((v) => v !== btn.dataset.value)) as never;
      }
      updateCount();
    }));

  const finish = (p: Prefs) => {
    savePrefs(p);
    d.close();
    opts.onPatch({ all: false });
    refreshForYou();
  };
  saveBtn.addEventListener("click", () => finish(draft));
  d.querySelector("[data-act='skip']")?.addEventListener("click", () =>
    finish({ interests: [], audiences: [], boroughs: [], freeOnly: false }));
  d.querySelector("[data-act='clear']")?.addEventListener("click", () =>
    finish({ interests: [], audiences: [], boroughs: [], freeOnly: false }));
  d.querySelector("[data-act='close']")!.addEventListener("click", () => d.close());

  if (!d.open) d.showModal();
  d.scrollTop = 0;
}
