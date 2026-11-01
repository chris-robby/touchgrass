"""Adapter for Concordia University's public events (concordia.ca/events).

Lectures, talks, exhibitions, concerts and workshops; almost all are free and
open to the public. There is no feed, but every event page has the same labelled
fields ("Date & time", "Where", "Format", "Cost"...), so we read those.

The listing page links to each event page; pages are cached on disk (like the
montreal.ca pages) so a daily run only fetches new ones. robots.txt allows
current event pages (/cuevents/<year>/...); requests are spaced out.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .common import guess_category, http_get, http_get_retry, local_iso

SOURCE_ID = "concordia"
BASE = "https://www.concordia.ca"
LISTING_URL = f"{BASE}/events.html"
CACHE_DAYS = 2  # event details can change (room, time): re-read pages every 2 days

MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], start=1)}

# Two campuses: pins go on the campus (rooms don't have coordinates).
SGW = {"lat": 45.4972, "lng": -73.5790, "borough": "Ville-Marie"}
LOYOLA = {"lat": 45.4582, "lng": -73.6404, "borough": "Côte-des-Neiges–Notre-Dame-de-Grâce"}


# --------------------------------------------------------------------------- parsing

def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def parse_fields(page: str) -> dict:
    """The labelled fields of an event page, plus title and description."""
    fields = {}
    for label, value in re.findall(
        r"<h6[^>]*>(.*?)</h6>\s*(.*?)(?=<h6|</section|<div class=\"(?:c-|row))", page, re.S
    ):
        fields[_text(label)] = _text(value)
    title = re.search(r'<meta property="og:title" content="([^"]*)"', page)
    desc = re.search(r'<meta (?:property="og:description"|name="description") content="([^"]*)"', page)
    fields["_title"] = re.sub(r"\s*\|\s*Events - Concordia University$", "",
                              html.unescape(title.group(1)) if title else "").strip()
    fields["_description"] = html.unescape(desc.group(1)).strip() if desc else ""
    return fields


_DATE = re.compile(r"(january|february|march|april|may|june|july|august|september|october|"
                   r"november|december) (\d{1,2}), (\d{4})", re.I)
_TIME = re.compile(r"(\d{1,2})(?::(\d\d))? ([ap])\.m\.", re.I)


def parse_when(text: str) -> tuple[str, str | None, bool] | None:
    """"Monday, November 2, 2026 12 p.m. – 1 p.m." -> (start, end, all_day) in ISO."""
    dates = [date(int(y), MONTHS[m.lower()], int(d)) for m, d, y in _DATE.findall(text)]
    if not dates:
        return None
    first, last = dates[0], dates[-1]
    times = [(int(h) % 12 + (12 if ap.lower() == "p" else 0), int(mm or 0)) for h, mm, ap in _TIME.findall(text)]
    if "(all day)" in text.lower() or not times:
        return first.isoformat(), last.isoformat(), True
    start = local_iso(first, f"{times[0][0]}:{times[0][1]:02d}")
    end = local_iso(last, f"{times[-1][0]}:{times[-1][1]:02d}") if len(times) > 1 else None
    return start, end, False


_AMOUNT = re.compile(r"\$\s?(\d+(?:\.\d\d)?)|(\d+(?:[.,]\d\d)?)\s?\$")


def parse_cost(text: str) -> tuple[float, float] | None:
    """"This event is free." -> (0, 0); "Donate to enter: $2-cash $3-card" -> (2, 3)."""
    text = (text or "").strip()
    if not text:
        return None
    if re.search(r"\bfree\b|gratuit", text, re.I) or text in ("0", "$0"):
        return 0.0, 0.0
    amounts = [float((a or b).replace(",", ".")) for a, b in _AMOUNT.findall(text)]
    return (min(amounts), max(amounts)) if amounts else None


def parse_where(text: str) -> tuple[str | None, str | None]:
    """"J.W. McConnell Building 1400 De Maisonneuve Blvd. W. Room 921-4"
    -> ("J.W. McConnell Building, Room 921-4", "1400 De Maisonneuve Blvd. W., Montréal")."""
    text = (text or "").strip()
    if not text or text.lower() == "online":
        return None, None
    m = re.match(r"^(.*?)\s(\d{2,5}(?:-\d+)? [^|]*?)(?:\s\|.*?)?(?:\s((?:Room|Rm\.?|Local|Studio)\s.*))?$", text)
    if not m:
        return text, None
    venue, address, room = m.group(1).strip(), m.group(2).strip(), m.group(3)
    if room:
        venue = f"{venue}, {room.strip()}"
    return venue or None, f"{address}, Montréal"


def campus_for(where: str) -> dict | None:
    if not where or where.strip().lower() == "online":
        return None
    # Loyola campus addresses are on the 7000 block of Sherbrooke St. W.
    if re.search(r"loyola|\b7[0-4]\d\d sherbrooke", where, re.I):
        return LOYOLA
    return SGW


def to_event(path: str, fields: dict) -> dict | None:
    title = fields.get("_title")
    when = parse_when(fields.get("Date & time", ""))
    cost = parse_cost(fields.get("Cost", ""))
    if not title or not when or cost is None:
        return None  # no date, or price not stated: skip rather than guess
    start, end, all_day = when
    lo, hi = cost
    where = fields.get("Where", "")
    fmt = fields.get("Format", "").lower()
    venue, address = parse_where(where)
    online = "online" in fmt or where.strip().lower() == "online"
    campus = None if online and not venue else campus_for(where)
    organizer = fields.get("Organization") or None
    return {
        "id": "cu-" + hashlib.sha1(path.encode()).hexdigest()[:12],
        "title": title,
        "description": fields.get("_description", "")[:1200],
        "start": start,
        "end": end,
        "all_day": all_day,
        "price_min": lo,
        "price_max": hi,
        "price_label": "Gratuit" if hi == 0 else f"{lo:g} $ – {hi:g} $" if lo != hi else f"{lo:g} $",
        "is_free": hi == 0,
        "category": guess_category(title, organizer),
        "audience": "all",
        "format": "online" if online else "indoor",
        "registration": "required" if "register" in fields.get("Date & time", "").lower() else None,
        "venue": venue or ("Concordia University" if campus else None),
        "address": address,
        "borough": campus["borough"] if campus else None,
        "lat": campus["lat"] if campus else None,
        "lng": campus["lng"] if campus else None,
        "url": BASE + path,
        "links": [],
        "image": None,
        "status": "scheduled",
        "source": SOURCE_ID,
        "language": "en",
        "organizer": f"Concordia University — {organizer}" if organizer else "Concordia University",
    }


# --------------------------------------------------------------------------- main

def event_paths(listing: str, today: date) -> list[str]:
    """Current event pages linked from the listing (robots.txt disallows old years)."""
    paths = set(re.findall(r'href="(/cuevents/[^"]+?/(\d{4})/[^"]+\.html)"', listing))
    return sorted(p for p, year in paths if int(year) >= today.year - 1)


def load(cache_dir: Path, today: date | None = None) -> list[dict]:
    today = today or date.today()
    listing = http_get_retry(LISTING_URL).decode("utf-8", "replace")
    paths = event_paths(listing, today)

    cache_path = cache_dir / f"{SOURCE_ID}.json"
    try:
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        cache = {}
    now = datetime.now(timezone.utc)
    stale = (now - timedelta(days=CACHE_DAYS)).isoformat()
    todo = [p for p in paths if p not in cache or cache[p]["fetched"] < stale]
    print(f"  {len(paths)} event pages, {len(todo)} to fetch")

    def fetch(path):
        time.sleep(0.5)  # be gentle: 2 workers x 2 requests/second at most
        try:
            return path, parse_fields(http_get(BASE + path, timeout=30).decode("utf-8", "replace"))
        except Exception as err:
            return path, err

    failed = 0
    with ThreadPoolExecutor(max_workers=2) as pool:
        for path, result in pool.map(fetch, todo):
            if isinstance(result, Exception):
                failed += 1
            else:
                cache[path] = {"fetched": now.isoformat(), "fields": result}
    if failed:
        print(f"  {failed} page(s) failed; they'll be retried next run")

    cache = {p: v for p, v in cache.items() if p in set(paths)}
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    events = [to_event(p, cache[p]["fields"]) for p in paths if p in cache]
    return [e for e in events if e]
