# TouchGrass — free events in Montréal

A website listing **free** public events in Montréal, rebuilt automatically every day
from the city's open data.

> Données : Ville de Montréal, [Événements publics](https://donnees.montreal.ca/dataset/evenements-publics), CC BY 4.0.

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
2. `python scripts/build_data.py` — fetch + build `data/events.json`
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

- **Filters** (date, drop-in only, 24 categories, borough, search) live in the URL, so
  any view can be shared; the List/Calendar/Map links keep them.
- **Event detail** is a `<dialog>` (bottom sheet on phones) with the official page link,
  a `.ics` download and a Google Calendar link. The open event is in the URL (`?e=`), so
  the back button closes it.
- **FR/EN**: all UI text is in `src/i18n.ts`; French is the default (24-hour "19h30"),
  English uses "7:30 PM". Event text stays in French (that's what the city publishes).
- **Long-running events** (exhibitions lasting weeks or months) are listed once, on
  their *last* day ("Until Dec 6"), so they don't bury each day's own events. In the
  calendar they show on every day they run, after the timed events, as outlined chips.
- Why no calendar library: a month grid with chips is ~150 lines; FullCalendar would
  add far more code than it saves here.
- Map tiles come from openstreetmap.org, which is fine for a small site. If traffic
  grows, switch to a tile provider with a free tier (one line in `src/map.ts`).

## How the data flows

```
donnees.montreal.ca (GeoJSON, updated nightly)
        │  sources/ville_montreal.py  load()
        ▼
 normalized events  ── civic events dropped (council meetings, consultations…)
        │  scripts/build_data.py
        ▼
 keep free + not yet ended
        │  sources/ville_montreal.py  enrich()
        ▼   reads each event's montreal.ca page for exact times + venue
        │   (cached in data/cache/, so daily runs only fetch new events)
        ▼
 drop cancelled/ended, dedupe, sanity checks
        ▼
 data/events.json  +  data/meta.json
```

**Safety net:** if the download fails, the result is empty, or the count falls below
half of the previous build, the script exits with an error and **does not overwrite**
the previous `events.json`. (Use `--force` if a big drop is expected.)

## Decisions so far

- **Free only.** The dataset only says `Gratuit` or `Payant`, never an amount — not even
  on the official pages — so "≤ $10" can't be checked. Paid events are dropped.
- **Times and venues come from the event pages.** The dataset has dates only and is
  missing venue names for ~97% of events. Each montreal.ca event page includes
  structured data (schema.org JSON-LD) with this info; `robots.txt` allows these pages.
- **Civic events are excluded:** types *Conseil et comité*, *Consultation publique*,
  *Assemblée publique*, *Rencontre avec personne élue*.
- **Categories and audiences are stored as English slugs** (`storytime`, `kids`…) so the
  UI can translate them to FR/EN and use them in URLs.
- **"Drop-in only" filter instead of a price filter**: everything is free, but ~60% of
  events need registration and ~16% a free ticket, shown as INSCRIPTION / BILLET tags.
- **All 24 categories** are shown as-is in the category filter.
- Missing values in the source are the text `"nan"`/`"None"`, and a couple of records
  have broken coordinates — both are cleaned up.

## Event schema (`data/events.json`)

| field | type | notes |
|---|---|---|
| `id` | string | `mtl-<id from montreal.ca URL>` |
| `title`, `description` | string | French |
| `start`, `end` | string | `2026-11-14T10:30:00-05:00`, or `2026-11-14` when `all_day` |
| `all_day` | bool | true when no time is known |
| `price_min` / `price_label` / `is_free` | | always `0` / `"Gratuit"` / `true` for now |
| `category` | slug | e.g. `storytime`, `music`, `other` |
| `audience` | slug \| null | `all`, `adults`, `kids`, `preschool`, `family`, `seniors`, `teens` |
| `format` | slug \| null | `indoor`, `outdoor`, `online` |
| `registration` | slug \| null | `required`, `drop-in`, `ticket` (free ticket) |
| `venue`, `address`, `borough` | string \| null | |
| `lat`, `lng` | number \| null | |
| `url`, `image` | string \| null | official page, picture |
| `status` | string | `scheduled` or `postponed` (cancelled ones are dropped) |
| `source`, `language` | string | `ville-de-montreal`, `fr` |

## Adding a source

Create `sources/<name>.py` with `SOURCE_ID`, `load()` (returns events in the schema
above) and optionally `enrich(events, cache_path)`, then add it to `ADAPTERS` in
`sources/__init__.py`. Add fixtures and tests in `tests/`.
