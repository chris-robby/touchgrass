# Project spec: Montréal free & cheap events site

## Goal

Build a free, public website that lists **free or very cheap (≤ $10) events happening in Montréal**, filterable by date, price, neighbourhood (borough) and category, with a list view and a map view. The site must be cheap to run (ideally $0), update itself automatically every day, and be easy to maintain.

## Guiding principles

- **Inspect real data before writing logic.** Don't guess field names or value formats — download the source and look.
- **Static first.** No server, no database server, no user accounts in v1.
- **Automate freshness.** A daily job rebuilds the data and the site. Stale listings are the #1 way event sites die.
- **Bilingual-ready.** Montréal is French/English. Source data is mostly French; the UI should support FR and EN (FR default is fine for v1, but structure strings for i18n from the start).
- **Credit the source.** The city data is CC BY 4.0 — attribution to the Ville de Montréal is required (footer + about page).

## Data source (v1)

**Ville de Montréal — "Événements publics" open dataset**

- Dataset page: https://donnees.montreal.ca/dataset/evenements-publics
- GeoJSON download: https://donnees.montreal.ca/dataset/6a4cbf2c-c9b7-413a-86b1-e8f7081e2578/resource/35307457-a00f-4912-9941-8095ead51f6e/download/evenements.geojson
- Also available on Données Québec: https://www.donneesquebec.ca/recherche/dataset/vmtl-evenements-publics
- License: Creative Commons Attribution 4.0
- The portal runs CKAN, so there may also be a CKAN API (`/api/3/action/...`) — check whether it's useful, but the GeoJSON download is enough for v1.
- According to the dataset description, records include date, event type (show, public meeting, exhibition…), target audience, cost and location.

## Phase 0 — Data exploration (do this first, report back before building)

Write a small script (`scripts/explore.py` or `.ts`) that downloads the GeoJSON and prints:

1. Total number of events, and the range of dates covered (how far ahead events are listed).
2. The full list of property names on each feature, with a few example values for each.
3. **How cost is represented** — numeric? text like "Gratuit"? ranges? blank? Show the distinct values and their counts.
4. Distinct values for event type, audience, and borough/location fields.
5. Whether every event has coordinates.
6. Whether there are past events, duplicates, or multi-day / recurring events, and how they're represented.
7. Which language(s) the text fields are in.

**Stop and summarize findings for the user before Phase 1.** Propose the price-parsing rules based on what you actually found.

Also check the official non-public event types — exclude things like city council meetings ("séances du conseil") if they're in the data, since they're not "activities".

## Phase 1 — Pipeline

A script (`scripts/build_data.*`) that:

1. **Fetches** the GeoJSON (with a retry and a clear error if the download fails — if it fails, keep yesterday's data rather than publishing an empty site).
2. **Normalizes** each feature to a common schema, e.g.:

   ```
   id            string   (stable; from source id, or hash of title+start+location)
   title         string
   description   string
   start         ISO 8601 datetime (America/Toronto)
   end           ISO 8601 datetime | null
   price_min     number | null   (0 = free)
   price_label   string          (original text, for display)
   is_free       boolean
   category      string
   audience      string | null
   venue         string | null
   address       string | null
   borough       string | null
   lat, lng      number | null
   url           string | null   (link to official page)
   source        "ville-de-montreal"
   language      "fr" | "en" | null
   ```

3. **Filters**: keep events where `price_min` ≤ 10 (configurable) and that haven't ended yet. Exclude non-activity types (to be decided in Phase 0).
4. **Dedupes** on `id`.
5. **Writes** `data/events.json` (and maybe `data/meta.json` with build time + counts).

Design the normalizer as **one adapter per source** (`sources/ville_montreal.*`) so more sources can be added later without touching the rest.

Include unit tests for the price parser and the normalizer using real sample records saved as fixtures.

## Phase 2 — Website

A static site generated from `data/events.json`. Suggested stack (alternatives fine if justified): **Astro** or plain Vite + vanilla JS/TS, with **Leaflet + OpenStreetMap** tiles for the map (free, no API key).

Features for v1:

- **List view** grouped by day (Today, Tomorrow, This weekend, Later).
- **Filters**: date range (today / this weekend / this week / custom), Free only vs ≤ $10, category, borough. Filters should be reflected in the URL so they're shareable.
- **Map view** with markers; clicking a marker shows the event card.
- **Calendar view** (its own page, styled like Google Calendar's month view):
  - Month grid (Mon–Sun or Sun–Sat, pick one and be consistent), today highlighted, previous/next month buttons and a "Today" button.
  - Each day cell shows the first few event titles as small chips (color-coded by category, with a free/≤ $10 marker) plus a "+N more" link when they don't fit.
  - **Clicking a day** opens that day's full list of events (a side panel on desktop, a full-screen sheet on mobile), sorted by start time.
  - **Clicking an event** (from the day list or a chip) opens an event detail view with all relevant info: title, full date/time and duration, price label, venue and address, borough, category, audience, full description, a small map of the location, a link to the official page, and an "Add to my calendar" button (download a .ics file, plus a Google Calendar link).
  - The same filters (price, category, borough, search) apply to the calendar.
  - Multi-day events show on every day they run (or as a spanning bar, if simple to do).
  - The selected month, day and event are reflected in the URL so they can be shared and the back button works.
  - On small screens, offer a simpler agenda/day view, since a 7-column grid gets cramped.
  - Use a library if it saves real effort (e.g. FullCalendar, MIT-licensed core) or build it by hand if lighter — explain the choice.
- **Event card**: title, date/time, price label, venue, borough, short description, link to the official page.
- **Search** box (client-side text search is fine).
- **Mobile-first**, fast, accessible (keyboard, contrast, alt text).
- Footer: data attribution ("Données : Ville de Montréal, CC BY 4.0"), last updated time, link to an About page.
- FR/EN toggle for UI strings.

Not in v1: accounts, comments, event submission form, ads.

## Phase 3 — Automation & hosting

- **GitHub Actions** workflow that runs daily (early morning Montréal time): fetch → build data → build site → deploy.
- Host on **GitHub Pages**, **Netlify** or **Cloudflare Pages** (free tier). Pick one and document why.
- Workflow should fail loudly (and not deploy) if the event count drops to zero or falls drastically versus the previous build.

## Later phases (do not build yet — just keep the architecture open for them)

- More sources via adapters: iCal/RSS feeds from libraries, universities (e.g. McGill, UdeM, Concordia concerts), maisons de la culture, festivals.
- Organizer submission form with moderation.
- Weekly email or RSS feed of free events.
- Scraping venue sites (only where terms of use allow it).

## Repo layout (suggested)

```
/scripts        explore + build_data
/sources        one adapter per data source
/data           generated events.json (gitignored or committed — decide and explain)
/site           frontend
/tests          parser/normalizer tests with fixtures
/.github/workflows/daily.yml
README.md       how to run locally, how data flows, how to add a source
```

## Definition of done for v1

- `README.md` explains setup in a few commands.
- Running the build locally produces a working site with real, current Montréal events.
- Only free / ≤ $10, upcoming, public-activity events appear.
- The calendar page works: month grid → click a day to see its events → click an event to see its details.
- Daily automatic rebuild and deploy works.
- Attribution to Ville de Montréal is visible.

## Working style

- Work phase by phase; check in with the user at the end of Phase 0 and before choosing hosting.
- Keep dependencies minimal.
- Explain decisions briefly in commit messages and the README — the owner is learning the technical side.
