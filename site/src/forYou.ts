// "For you" UI: the first-visit question, the preferences panel (opened from the
// filter button in the search bar), and the bar above results that says what is
// shown, with a switch between "only these" (default) and "everything, these first".
import type { Ev, Filters } from "./data";
import { city } from "./city";
import { countLabel, lang, t } from "./i18n";
import {
  AUDIENCES, EMPTY_PREFS, getPrefs, INTERESTS, label, matchesPrefs, Prefs, prefsCount, prefsSeen, prefsSummary,
  savePrefs, setStrict, showOnlyMine,
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
  whereHint: fr ? `Laissez vide pour tout ${city.name}.` : `Leave empty for all of ${city.name}.`,
  price: fr ? "Prix" : "Price",
  freeOnly: fr ? "Gratuit seulement" : "Free only",
  save: fr ? "Voir les activités" : "See events",
  matching: (n: number, strict: boolean) => (fr
    ? `${countLabel(n)} correspondent à vos choix${strict ? "." : " : elles passeront en premier."}`
    : `${countLabel(n)} match your choices${strict ? "." : ": they'll come first."}`),
  show: fr ? "Afficher" : "Show",
  onlyMine: fr ? "Seulement ce qui me correspond" : "Only what matches",
  mineFirst: fr ? "Tout, mes choix en premier" : "Everything, my picks first",
  only: fr ? "seulement" : "only",
  seeAll: fr ? "Tout voir" : "Show everything",
  onlyThese: fr ? "Seulement pour moi" : "Just mine",
  emptyMine: fr
    ? "Rien ne correspond à vos préférences avec ces filtres."
    : "Nothing matches your preferences with these filters.",
  skip: fr ? "Passer" : "Skip",
  clear: fr ? "Tout effacer" : "Clear all",
  close: fr ? "Fermer" : "Close",
  forYou: fr ? "Pour vous" : "For you",
  edit: fr ? "Modifier" : "Edit",
  first: fr ? "en premier" : "first",
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
    const strict = target.closest<HTMLElement>("[data-foryou='strict']");
    if (strict) {
      setStrict(strict.dataset.on === "1");
      opts.onPatch({});
      refreshForYou();
    }
  });

  refreshForYou();
  if (!prefsSeen()) openPrefs(true);
}

/** Update the bar and the search-bar badges (call after every render). */
export function refreshForYou(): void {
  if (!bar) return;
  const n = prefsCount();
  document.querySelectorAll<HTMLElement>(".filter-badge").forEach((b) => {
    b.hidden = n === 0;
    b.textContent = String(n);
  });
  // No preferences: no bar (the filter button in the search field invites them).
  bar.hidden = n === 0;
  if (n) {
    const only = showOnlyMine();
    bar.innerHTML = `<div class="wrap foryou-inner"><span class="kicker foryou-kicker">${T.forYou}</span>
      <span class="foryou-summary">${only ? `${T.only} ` : ""}${esc(prefsSummary())}${only ? "" : ` ${T.first}`}</span>
      <button type="button" class="link-btn" data-foryou="strict" data-on="${only ? "0" : "1"}">${only ? T.seeAll : T.onlyThese}</button>
      <button type="button" class="link-btn" data-foryou="edit">${T.edit}</button></div>`;
  }
}

/** "No results" message (only filters and search can empty the list). */
export function emptyHtml(): string {
  if (showOnlyMine()) {
    return `<p class="empty">${T.emptyMine} <button type="button" class="link-btn" data-foryou="strict" data-on="0">${T.seeAll}</button></p>`;
  }
  return `<p class="empty">${t("empty.filters")}</p>`;
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
      <fieldset><legend>${T.show}</legend>
        <div class="chips-wrap">${chip("strict", "1", T.onlyMine, draft.strict)}${chip("strict", "0", T.mineFirst, !draft.strict)}</div>
      </fieldset>
      <p class="prefs-hint prefs-matching" aria-live="polite"></p>
      <div class="prefs-actions">
        <button type="button" class="btn btn-primary" data-act="save">${T.save}</button>
        <button type="button" class="btn btn-outline" data-act="${onboarding ? "skip" : "clear"}">${onboarding ? T.skip : T.clear}</button>
      </div>
    </div>`;

  const saveBtn = d.querySelector<HTMLButtonElement>("[data-act='save']")!;
  const matchingEl = d.querySelector<HTMLElement>(".prefs-matching")!;
  const now = Date.now();
  const upcoming = opts.events.filter((e) => e.endMs >= now);
  const updateCount = () => {
    matchingEl.hidden = prefsCount(draft) === 0;
    matchingEl.textContent = T.matching(upcoming.filter((e) => matchesPrefs(e, draft)).length, draft.strict);
  };
  updateCount();

  d.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const group = btn.dataset.group as keyof Prefs;
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(on));
      if (group === "strict") {
        draft.strict = btn.dataset.value === "1";
        d.querySelectorAll<HTMLButtonElement>("[data-group='strict']").forEach((b) =>
          b.setAttribute("aria-pressed", String((b.dataset.value === "1") === draft.strict)));
      } else if (group === "freeOnly") draft.freeOnly = on;
      else {
        const list = draft[group] as string[];
        draft[group] = (on ? [...list, btn.dataset.value!] : list.filter((v) => v !== btn.dataset.value)) as never;
      }
      updateCount();
    }));

  const finish = (p: Prefs) => {
    savePrefs(p);
    d.close();
    opts.onPatch({});
    refreshForYou();
  };
  saveBtn.addEventListener("click", () => finish(draft));
  d.querySelector("[data-act='skip']")?.addEventListener("click", () => finish(EMPTY_PREFS));
  d.querySelector("[data-act='clear']")?.addEventListener("click", () => finish(EMPTY_PREFS));
  d.querySelector("[data-act='close']")!.addEventListener("click", () => d.close());

  if (!d.open) d.showModal();
  d.scrollTop = 0;
}
