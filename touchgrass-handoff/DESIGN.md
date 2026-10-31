# Touchgrass — design guide

The visual reference for every screen is in `mockups/`. This file pulls out the rules so the UI can be rebuilt consistently. When the guide and a mockup disagree, the mockup wins; flag the difference.

## Personality

Outdoorsy, local, a bit like a printed park notice or community flyer. Avoid the generic "AI app" look: no rounded cards with thin grey borders, no pastel category pills, no coloured side bars, no gradients, no emoji. Prefer ruled lists, strong type, and a few confident colours.

## Colour tokens

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#13281E` | Main text; header, footer and bottom-nav background; strong borders |
| `--forest` | `#1F5A3A` | Active filters, primary buttons, category labels, calendar dots |
| `--lime` | `#C8F169` | Wordmark, active nav item, selected day, "FREE" tag. Use on `--ink` or as a background behind `--ink` text only — never lime text on the light background |
| `--paper` | `#EEF2E6` | Page background (pale sage); text on dark backgrounds |
| `--paper-raised` | `#F6F8F1` | Calendar grid cells in the current month |
| `--paper-dim` | `#E8EDE0` | Calendar cells outside the current month |
| `--selected` | `#E1EBD3` | Selected calendar cell background |
| `--line` | `#C9D3C1` | Row dividers and grid lines |
| `--muted` | `#4E5F55` | Secondary text (venue, dates, labels) on light background |
| `--muted-on-dark` | `#B9C8B5` | Secondary text and inactive nav on dark background |
| `--outline-on-dark` | `#5E7A6A` | Button borders on dark background |
| Map park / water / land | `#B7D19E` / `#BFD3DC` / `#DCE6D2` | Map placeholder only; real map tiles should be styled toward these if possible |

All text/background pairs above meet WCAG AA (4.5:1) — keep it that way.

## Typography

- **Display: Young Serif** (Google Fonts, weight 400) — wordmark, page titles, section headings, event times, calendar day numbers, event titles in the detail view.
- **Body / UI: Atkinson Hyperlegible** (Google Fonts, 400 and 700) — everything else.
- Small labels (categories, dates in headings, field labels): 11–13px, bold, uppercase, letter-spacing 0.08em.

| Element | Desktop | Mobile |
|---|---|---|
| Hero title (Young Serif) | 64px / 1.02 | 30px / 1.1 |
| Section heading, e.g. "Today" (Young Serif) | 32px | 24px |
| Event time (Young Serif) | 24px | 18px |
| Event title (Atkinson bold) | 21px | 16–17px |
| Body / venue | 15px | 13px |

## Logo

Lowercase "touchgrass" in Young Serif, lime on ink, with a small 4-blade grass-tuft icon (simple stroked SVG paths, lime, round caps) to its left. The SVG is in any mockup header.

## Components

- **Header (dark band):** `--ink` background. Wordmark + nav (List / Calendar / Map) + FR/EN button. Active nav item: lime text with a 3px lime underline; others `--muted-on-dark`. On the home page the band also holds the hero title, the subtitle and a large search field (paper background, 8px radius).
- **Filter buttons:** 44px tall, 8px radius. Active = `--forest` background, paper text, bold. Inactive = transparent with 1.5px `--ink` border. Group them: When / Price / Category / Borough.
- **Event row (the core component):** not a card. A 3-column grid — time column (Young Serif time, small bold AM/PM + end time under it) | content (uppercase forest category label, bold title, muted venue · borough) | price tag. Rows are separated by 1px `--line`; each day group starts with a heading over a 2px `--ink` rule.
- **Price tag:** small rectangle, 4px radius, bold, 0.04em tracking. Free = text "FREE" on `--lime`. Paid = "$5" with a 1.5px `--ink` border, no fill.
- **Calendar month grid (desktop):** 2px `--ink` outer border, 10px radius; 7 columns, Monday first; cells min-height ~122px with 1px `--line` borders. Day number in Young Serif inside a 34px circle: selected = lime fill + 2px ink ring; today = 2px forest ring. Up to 2 event chips per cell (free = lime fill, paid = ink outline; bold short time like "9:30a" + title, ellipsis), then a "+N more" underlined link.
- **Calendar month grid (mobile):** compact 46px cells, day number circle + up to 3 small forest dots for events; the selected day's events are listed underneath the grid.
- **Day panel:** heading with "N events" kicker (forest uppercase) over the date in Young Serif, then event rows.
- **Event detail:** centered dialog on desktop (2px ink border, 12px radius), bottom sheet on mobile (18px top radius, drag handle). Contains price tag + category, title in Young Serif, a ruled When / Where / Borough / For table, description, small map, then actions: "Official page" (forest filled), "Add to calendar (.ics)" and "Google Calendar" (ink outline).
- **Bottom nav (mobile):** `--ink` background, 3 tabs with icon + label; active tab lime with a 3px lime top border.
- **Footer:** `--ink` background, small wordmark, data attribution "Données : Ville de Montréal, CC BY 4.0", last-updated time, About link.
- **Empty day:** "Nothing listed yet. Good day for a walk on the mountain."

## Shape, spacing, touch

- Radii: 4px tags, 8px buttons/inputs, 10–12px large containers. No pill shapes.
- Borders do the work instead of shadows (only the map pins and dialogs may cast a subtle shadow, optional).
- Touch targets at least 44px. Desktop content max-width 1360px with 32px side padding; mobile 16px.
- Icons: simple 2px-stroke line icons (search, chevrons, close, list, calendar, map pin).

## Screens (see mockups/)

| File | Screen | Notes |
|---|---|---|
| `Main.dc.html` | Desktop home | Dark header with hero + search, filter row, day-grouped event rows, map on the right, dark footer |
| `Calendar.dc.html` | Desktop calendar | Month grid + day panel; click day → panel updates; click chip/row → detail dialog; Free only / Up to $10 filter works |
| `MobileHome.dc.html` | Mobile home | Dark header with search, horizontally scrolling filter buttons, event rows, bottom nav |
| `MobileCalendar.dc.html` | Mobile calendar | Compact month grid with dots, selected day's list below, event detail as bottom sheet |
| `Mobile.dc.html` | Mobile week view | Week strip (7 day buttons with event counts) + day agenda |

The event data inside the mockups is sample data for layout only — the real site uses the pipeline's `events.json`.
