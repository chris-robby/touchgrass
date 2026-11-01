# TouchGrass — free & almost-free events in Montréal

A website listing **free and $10-and-under** things to do in Montréal, rebuilt
automatically every day from the city's open data.

> Données : Ville de Montréal ([Événements publics](https://donnees.montreal.ca/dataset/evenements-publics),
> [Programmation de sports et loisirs](https://donnees.montreal.ca/dataset/programmation-sports-loisirs-montreal)), CC BY 4.0;
> [Université Concordia](https://www.concordia.ca/events.html), [UQAM](https://evenements.uqam.ca/),
> [Université de Montréal](https://calendrier.umontreal.ca/).

## Sources

| Source | Link | Used for |
|---|---|---|
| Événements publics (Ville de Montréal, GeoJSON, daily) | [dataset](https://donnees.montreal.ca/dataset/evenements-publics) | Public events: storytimes, shows, workshops, exhibitions… (free ones only — paid ones never state a price) |
| Each event's page on montreal.ca | e.g. [montreal.ca/evenements](https://montreal.ca/evenements) | Exact times, venue, address, cancellations (schema.org JSON-LD) |
| Programmation de sports et loisirs (Loisirs Montréal, JSON, daily) | [dataset](https://donnees.montreal.ca/dataset/programmation-sports-loisirs-montreal) · [loisirs.montreal.ca](https://loisirs.montreal.ca/) | Drop-in sports & leisure (free skating, free swim, drop-in hockey…) whose price is stated and ≤ $10 |
| Concordia University events (event pages) | [concordia.ca/events](https://www.concordia.ca/events.html) | Public talks, exhibitions, workshops, performances; ~90% free. Pages are cached; robots.txt allows current event pages |
| UQAM events (Caligram JSON API) | [evenements.uqam.ca](https://evenements.uqam.ca/) | Public events with a price type (`FREE` / listed prices); general-public rate used; next 60 days |
| Université de Montréal calendar (official RSS + activity pages) | [calendrier.umontreal.ca](https://calendrier.umontreal.ca/) | Talks, concerts, exhibitions, films; price, place and exact coordinates read from each page (1 request/second, as robots.txt asks); daily exhibitions merged into one listing; full/cancelled dropped |

Checked and **not** used (Oct 2026):

| Source | Why not |
|---|---|
| Cyclovias, seasonal activities in large parks, éco-quartier events (city open data) | No 2026 data (last updates 2025, 2016, 2024) |
| BAnQ (Grande Bibliothèque) | Bot protection blocks automated access |
| Quartier des spectacles | Rate-limits automated access (HTTP 429) |
| McGill events, Musée d'art contemporain | Refuse automated access (HTTP 403) |
| Accès culture (accesculture.com) | Pages contain generic filler text with no dates or venues; the domain doesn't look like the real network's anymore |
| Loisirs Montréal's internal API (has prices) | Not part of the open data; undocumented, could change any time |
| Tourisme Montréal, other museums (McCord Stewart, Espace pour la vie…) | No feed or structured event data found |
| Vieux-Port | Possible later: structured data, but mostly large paid events |

## Status

- [x] Phase 0 — data exploration (`scripts/explore.py`)
- [x] Phase 1 — data pipeline (`scripts/build_data.py`, `sources/`)
- [x] Phase 2 — website (`site/`)
- [x] Phase 3 — daily automation & hosting (GitHub Pages)

## Live site & daily updates

**https://chris-robby.github.io/touchgrass/**

`.github/workflows/daily.yml` runs every day at 10:00 UTC (5–6 a.m. in Montréal), on
every push to `main`, and on demand (Actions tab → "Daily build & deploy" → Run workflow):

1. run the Python tests
2. `python scripts/build_data.py` — fetch every source + build `data/events.json`
3. build the site (`site/dist/`)
4. deploy to GitHub Pages

If any step fails — download error, zero events, event count less than half of the
previous build, failing tests — **nothing is deployed**, the live site keeps
yesterday's data, and GitHub emails you about the failed run.

**Why GitHub Pages:** free, and the code, the daily job and the hosting all live in one
place with no extra account. (Cloudflare Pages is the alternative if you ever want a
faster CDN or easier custom-domain setup.)

**Why `data/` isn't committed:** it's regenerated every day, so committing it would add
a 1.5 MB change to the history daily. Instead the workflow keeps the page cache and the
previous `meta.json` in the GitHub Actions cache. Locally, run `build_data.py` once.

## Later (planned, not built yet)

- **Instagram creator source** — a creator regularly posts videos about free activities
  in Montréal. Plan: (1) ask the creator for permission / their list or sources first;
  (2) if they agree, use Meta's official Instagram Graph API ("Business Discovery") —
  no scraping, which Instagram's terms forbid; (3) extract title/date/time/place from
  captions with an AI model, geocode the place, dedupe against city events;
  (4) "suggested → approved → published" moderation step. Would live in
  `sources/instagram_<creator>.py`.
- Other sources: library/university/maison de la culture iCal or RSS feeds, festivals.
- Organizer submission form with moderation; weekly email or RSS of free events.

## Run it locally

Needs Python 3.10+ and Node.js 20+.

```sh
python scripts/build_data.py          # writes data/events.json (first run: ~6 min, then seconds)
cd site
npm install                           # once
npm run dev                           # open http://localhost:5173
npm run build                         # static site in site/dist/
```

Other commands:

```sh
python scripts/build_data.py --no-enrich   # fast, but no times/venues
python -m unittest discover tests          # Python tests
python scripts/explore.py                  # re-run the data exploration report
```

## The website (`site/`)

Plain **Vite + TypeScript**, no framework, plus **Leaflet** for maps (OpenStreetMap
tiles, no API key). Design follows `touchgrass-handoff/DESIGN.md`.

| Page | What it does |
|---|---|
| `index.html` | Hero + search, filters, events grouped by day ("Show more" every 60), venue map on wide screens |
| `calendar.html` | Month grid (chips on desktop, dots on mobile) + selected day's list |
| `map.html` | Full map, one pin per venue with a count; tap → that venue's events |
| `about.html` | What the site is + Ville de Montréal attribution |

- **Less repetitive list**: an activity that repeats (same title — free skating at
  several rinks, a weekly storytime) is shown once, at its next date, with
  "+N autres dates · N lieux"; the event detail lists the other dates (each opens that
  session). Long days get Morning / Afternoon / Evening sub-headings. Rows show a small
  photo (resized by the image host where possible: Cloudinary, Caligram). The FREE tag
  is left out of lists (99% of events are free); prices and INSCRIPTION/BILLET tags stay.
  The calendar still shows every date.
- **"For you" preferences** (`src/prefs.ts`, `src/forYou.ts`): on the first visit a panel
  asks what the visitor is into — 8 interest groups (each covering several of the 24
  categories), who it's for (adults / kids & family / teens / seniors), boroughs, free
  only — with a live count. Answers are saved in the browser (localStorage) and narrow
  the list, calendar and map. A bar above the results shows what's applied, with
  "Edit" and "See everything" (`?all=1`). The filter button inside the search bar
  reopens the panel; its badge shows how many preferences are on. Online events stay
  visible whatever boroughs are chosen.
- **Filters** (date, free only, drop-in only, 24 categories, borough, search) live in the URL, so
  any view can be shared; the List/Calendar/Map links keep them. They stack on top of
  the preferences.
- **Event detail** is a `<dialog>` (bottom sheet on phones) with price, the official page
  link, a **"Learn more"** list (organizer website / Facebook / phone found in the data,
  Google Maps directions, a Google search) and the source, plus a `.ics` download and a
  Google Calendar link. The open event is in the URL (`?e=`), so
  the back button closes it.
- **FR/EN**: all UI text is in `src/i18n.ts`; French is the default (24-hour "19h30"),
  English uses "7:30 PM". Event text stays in French (that's what the city publishes).
- **Long-running events** (exhibitions lasting weeks or months) are listed once, on
  their *last* day ("Until Dec 6"), so they don't bury each day's own events. In the
  calendar they show on every day they run, after the timed events, as dashed chips.
  Free events are lime chips, ≤ $10 ones outlined (as in the design).
- **Installable app (PWA)**: `public/manifest.webmanifest` + `public/sw.js`. On a phone,
  "Add to Home Screen" opens it full screen like an app. The service worker saves the
  site and the latest listings, so it opens instantly and works offline (showing the last
  saved data, with a notice). After each build, `scripts/sw-precache.mjs` writes the list
  of built files and a version id into `dist/sw.js`; a new deploy replaces the old copy.
  Icons are drawn by `scripts/make_icons.py` (needs Pillow).
- Why no calendar library: a month grid with chips is ~150 lines; FullCalendar would
  add far more code than it saves here.
- Map tiles come from openstreetmap.org, which is fine for a small site. If traffic
  grows, switch to a tile provider with a free tier (one line in `src/map.ts`).

## How the data flows

```
Événements publics (GeoJSON)          Loisirs Montréal (JSON)
   │ sources/ville_montreal.py            │ sources/loisirs_montreal.py
   │ civic events dropped                 │ drop-in only; price read from the text;
   │                                      │ weekly sessions -> dated events (next 6 weeks)
   └──────────────┬───────────────────────┘
                  ▼  scripts/build_data.py
        keep price ≤ $10 (known) + not yet ended
                  │  ville_montreal.enrich(): each event's montreal.ca page for
                  │  exact times + venue (cached in data/cache/)
                  ▼
 drop cancelled/ended, dedupe, sanity checks
        ▼
 data/events.json  +  data/meta.json
```

**Safety net:** if the download fails, the result is empty, or the count falls below
half of the previous build, the script exits with an error and **does not overwrite**
the previous `events.json`. (Use `--force` if a big drop is expected.)

## Decisions so far

- **Free or ≤ $10, only when the price is known.** Événements publics only says
  `Gratuit` or `Payant` (never an amount, even on the official pages), so its paid events
  are dropped. Loisirs Montréal writes prices in free text ("Coût : 6,5 $ par personne",
  "Activité gratuite"); `parse_price()` reads them and ignores fees, refunds, hourly
  rentals and discounts. Activities that mention no price are dropped.
- **Loisirs Montréal: drop-in only.** Most of that dataset is registration courses. In
  practice only a dozen activities qualify (Le Sud-Ouest and Verdun write their prices;
  other boroughs don't). Its site has no stable page per activity, so "official page"
  links to a Loisirs Montréal search for the activity name.
- **Times and venues come from the event pages.** The dataset has dates only and is
  missing venue names for ~97% of events. Each montreal.ca event page includes
  structured data (schema.org JSON-LD) with this info; `robots.txt` allows these pages.
- **Civic events are excluded:** types *Conseil et comité*, *Consultation publique*,
  *Assemblée publique*, *Rencontre avec personne élue*.
- **Categories and audiences are stored as English slugs** (`storytime`, `kids`…) so the
  UI can translate them to FR/EN and use them in URLs.
- **"Drop-in only" and "Free only" filters**: ~60% of city events need registration and
  ~16% a free ticket, shown as INSCRIPTION / BILLET tags.
- **All 24 categories** are shown as-is in the category filter.
- Missing values in the source are the text `"nan"`/`"None"`, and a couple of records
  have broken coordinates — both are cleaned up.

## Event schema (`data/events.json`)

| field | type | notes |
|---|---|---|
| `id` | string | `mtl-<montreal.ca id>` or `lm-<activity>-<session>-<date>` |
| `title`, `description` | string | French |
| `start`, `end` | string | `2026-11-14T10:30:00-05:00`, or `2026-11-14` when `all_day` |
| `all_day` | bool | true when no time is known |
| `price_min`, `price_max` | number | dollars, `0` = free (only events ≤ $10 are kept) |
| `price_label` | string | e.g. `"Gratuit"`, `"3,25 $ – 8 $"` |
| `is_free` | bool | |
| `category` | slug | e.g. `storytime`, `music`, `other` |
| `audience` | slug \| null | `all`, `adults`, `kids`, `preschool`, `family`, `seniors`, `teens` |
| `format` | slug \| null | `indoor`, `outdoor`, `online` |
| `registration` | slug \| null | `required`, `drop-in`, `ticket` (free ticket) |
| `venue`, `address`, `borough` | string \| null | |
| `lat`, `lng` | number \| null | |
| `url`, `image` | string \| null | official page, picture |
| `links` | list | `{type: website\|facebook\|instagram\|phone, url}` found in the source text |
| `organizer` | string \| null | Loisirs Montréal only: the promoter (borough or organization) |
| `status` | string | `scheduled` or `postponed` (cancelled ones are dropped) |
| `source`, `language` | string | `ville-de-montreal`, `loisirs-montreal`, `concordia`, `uqam` or `udem`; `fr` or `en` |

## Adding a source

Create `sources/<name>.py` with `SOURCE_ID`, `load(cache_dir)` (returns events in the schema
above) and optionally `enrich(events, cache_path)`, then add it to `ADAPTERS` in
`sources/__init__.py`. Shared helpers (borough names, Montréal time offsets, link
extraction) are in `sources/common.py`. Add fixtures and tests in `tests/`, and the
source's name to `SOURCE_NAMES` in `site/src/i18n.ts`.
