"""Adapter for University of Ottawa events (uottawa.ca/en/events-all).

No feed or structured data, but every event page has the same sidebar: "Date and
time", "Format and location", "Language", "Audience", "Organized by". We read the
listing (?page=0, 1…) and each event page, cached for a few days, 1 second apart
(robots.txt allows these pages and sets no crawl delay).

Most uOttawa events are for students or staff (career drop-ins, mentoring, info
sessions for applicants). Only events whose audience includes the **general
public** are kept.

Price: the pages have no price field, so the description must say it's free
(common.stated_price). Others are skipped.

Dates: "Nov 2, 2026" + "11:30 a.m. to 12:50 p.m." is one session; a date range
with "Every Tuesday" is weekly; a range with times and no rule is every day (a run
of shows); a range with "All day" is one multi-day listing (an exhibition).
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .common import category_for, extract_links, http_get, http_get_retry, local_iso, stated_price, strip_html

SOURCE_ID = "uottawa"
CITY = "ottawa"
BASE = "https://www.uottawa.ca"
LISTING = f"{BASE}/en/events-all"
HORIZON_DAYS = 60
CACHE_DAYS = 4
MAX_PAGES = 30
DELAY = 1.0
CAMPUS = {"lat": 45.4231, "lng": -75.6831}  # main campus, for "In person" on campus
CAMPUS_ADDRESS = "75 Laurier Ave. East, Ottawa"

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
WEEKDAYS = {d: i for i, d in enumerate(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])}


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).replace("\xa0", " ").strip()


# --------------------------------------------------------------------------- listing

def parse_listing(page: str) -> list[str]:
    paths = re.findall(r'href="(/en/events-all/[a-z0-9-]+)"', page)
    return [BASE + p for p in dict.fromkeys(paths) if p != "/en/events-all/all"]


# --------------------------------------------------------------------------- event page

def sidebar(page: str) -> dict[str, list[str]]:
    """{"Date and time": ["Sep 22, 2026 to Dec 23, 2026", "1:30 p.m. to 2:30 p.m.", "Every Tuesday"], …}"""
    out = {}
    parts = re.split(r'<span class="eyebrow">(.*?)</span>', page)
    for label, body in zip(parts[1::2], parts[2::2]):
        body = body.split('<div class="grid__col grid__col-m--6')[0]
        # Innermost divs only (the date and time lines are nested in a wrapper).
        lines = [_text(x) for x in re.findall(r'<div class="[^"]*(?:headline--4|sidebar--item-text)[^"]*">((?:(?!<div).)*?)</div>', body, re.S)]
        lines = [x for x in lines if x and not x.startswith(("Find on Google Maps", "Map"))]
        out[_text(label)] = lines
    return out


def parse_page(page: str) -> dict:
    side = sidebar(page)
    title = re.search(r'<h1 class="event-hero__heading">(.*?)</h1>', page, re.S)
    # The whole main column (description, then blocks like "This is a free event…"),
    # without the sidebar.
    content = re.search(r'event-detail__content">(.*?)<div class="grid__col grid__col-lw--4 event-detail__sidebar', page, re.S)
    intro = re.search(r'field--name-field-event-hero-intro-copy[^>]*>(.*?)</div>', page, re.S)
    text = re.sub(r"\s*\n\s*", "\n", " ".join(strip_html(m.group(1)) for m in (intro, content) if m)).strip()
    image = re.search(r'<img[^>]+src="(/sites/[^"]+\.(?:jpe?g|png|webp)[^"]*)"', page)
    return {
        "title": _text(title.group(1)) if title else "",
        "when": side.get("Date and time", []),
        "where": side.get("Format and location", []),
        "language": " ".join(side.get("Language", [])),
        "audience": " ".join(side.get("Audience", [])),
        "organizer": " ".join(side.get("Organized by", [])),
        "description": text[:1200],
        # Checked on the full text: "This is a free event" is often at the end.
        "price": stated_price("", text),
        "image": BASE + html.unescape(image.group(1)) if image else None,
    }


_DATE = re.compile(r"([A-Z][a-z]{2})[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})")
_TIME = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?", re.I)


def _date(m: re.Match) -> date | None:
    month = MONTHS.get(m.group(1).lower())
    return date(int(m.group(3)), month, int(m.group(2))) if month else None


def _hhmm(m: re.Match) -> str:
    h = int(m.group(1)) % 12 + (12 if m.group(3).lower() == "p" else 0)
    return f"{h:02d}:{m.group(2) or '00'}"


def sessions(when: list[str]) -> tuple[list[tuple[date, str | None, str | None]], date | None]:
    """Sidebar date lines -> ([(day, start "HH:MM" or None, end or None)], last day of an all-day run)."""
    text = " ".join(when)
    days = [d for d in (_date(m) for m in _DATE.finditer(text)) if d]
    if not days:
        return [], None
    first, last = days[0], days[-1]
    times = [_hhmm(m) for m in _TIME.finditer(_DATE.sub(" ", text))]
    if not times or re.search(r"all day|toute la journ", text, re.I):
        return [(first, None, None)], (last if last != first else None)
    start, end = times[0], (times[1] if len(times) > 1 else None)
    weekly = {WEEKDAYS[d] for d in re.findall(r"monday|tuesday|wednesday|thursday|friday|saturday|sunday", text.lower())}
    out, d = [], first
    while d <= last:
        if not weekly or d.weekday() in weekly:
            out.append((d, start, end))
        d += timedelta(days=1)
    return out, None


def to_events(url: str, f: dict, today: date) -> list[dict]:
    if not f.get("title") or "general public" not in f.get("audience", "").lower():
        return []
    if f.get("price") != [0.0, 0.0] and f.get("price") != (0.0, 0.0):
        return []  # not stated as free (a price list like "$10 / $20" is skipped too)
    where = f.get("where") or []
    mode = where[0].lower() if where else ""
    online = "virtual" in mode or "online" in mode
    off_campus = any("off campus" in w.lower() for w in where)
    place = [w for w in where[1:] if w.lower() not in ("off campus",)]
    venue = None if online else ", ".join(["University of Ottawa", *place[:2]]) if not off_campus else (place[0] if place else None)
    address = None if online else (place[1] if off_campus and len(place) > 1 else CAMPUS_ADDRESS if not off_campus else None)
    coords = CAMPUS if (not online and not off_campus) else {}
    lang = f.get("language", "").lower()
    base = {
        "title": f["title"],
        "description": f.get("description", ""),
        "price_min": 0.0, "price_max": 0.0, "price_label": "Gratuit", "is_free": True,
        "category": category_for(f["title"], f.get("description", "")),
        "audience": "all",
        "format": "online" if online else "indoor",
        "registration": "required" if re.search(r"\bregist|rsvp|inscri|r[ée]serv", f.get("description", ""), re.I) else None,
        "venue": venue,
        "address": address,
        "borough": "University of Ottawa",
        "lat": coords.get("lat"),
        "lng": coords.get("lng"),
        "url": url,
        "links": extract_links(f.get("description", "")),
        "image": f.get("image"),
        "status": "scheduled",
        "source": SOURCE_ID,
        "city": CITY,
        "language": "fr" if lang.startswith("french") else "en",
        "organizer": f.get("organizer") or "University of Ottawa",
    }
    key = hashlib.sha1(url.encode()).hexdigest()[:12]
    days, run_end = sessions(f.get("when") or [])
    last_day = today + timedelta(days=HORIZON_DAYS)
    out = []
    for day, start, end in days:
        if (run_end or day) < today or day > last_day:
            continue
        if start is None:
            ev = {"start": day.isoformat(), "end": run_end.isoformat() if run_end else None, "all_day": True}
        else:
            s = local_iso(day, start)
            e = local_iso(day, end) if end and end > start else None
            ev = {"start": s, "end": e, "all_day": False}
        out.append({**base, **ev, "id": f"uo-{key}-{day.isoformat()}"})
    return out


# --------------------------------------------------------------------------- main

def load(cache_dir: Path, today: date | None = None) -> list[dict]:
    today = today or date.today()
    urls: list[str] = []
    for n in range(MAX_PAGES):
        if n:
            time.sleep(DELAY)
        new = [u for u in parse_listing(http_get_retry(f"{LISTING}?page={n}").decode("utf-8", "replace")) if u not in urls]
        if not new:
            break
        urls += new

    cache_path = cache_dir / f"{SOURCE_ID}.json"
    try:
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        cache = {}
    now = datetime.now(timezone.utc)
    stale = (now - timedelta(days=CACHE_DAYS)).isoformat()
    todo = [u for u in urls if u not in cache or cache[u]["fetched"] < stale]
    print(f"  {len(urls)} events listed, {len(todo)} pages to fetch")
    failed = 0
    for url in todo:
        time.sleep(DELAY)
        try:
            cache[url] = {"fetched": now.isoformat(), "fields": parse_page(http_get(url, timeout=30).decode("utf-8", "replace"))}
        except Exception:
            failed += 1
    if failed:
        print(f"  {failed} page(s) failed; they'll be retried next run")
    cache = {u: v for u, v in cache.items() if u in set(urls)}
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return [e for u in urls if u in cache for e in to_events(u, cache[u]["fields"], today)]
