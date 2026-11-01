"""Adapter for Ottawa Public Library programs (booking.biblioottawalibrary.ca).

The City of Ottawa publishes the library's programs and events feed as open data
("Library Programs and Events Feed", Open Government Licence – City of Ottawa):
an RSS feed of the next ~100 sessions (about two days). Each item links to the
program's page, which lists every session ("View full schedule"), its age group,
category, branch and whether it's drop-in or needs registration. So:

  RSS (today's sessions) -> each program's page, once -> every session in the
  next 60 days.

The feed only reaches two days ahead, so programs are kept in the cache until
their last session has passed: after a week of daily runs, every weekly program
is known. Pages are cached for a week; robots.txt asks for 10 seconds between
requests, which we respect.

Library programs are free. A page that mentions a dollar amount is treated as
paid and skipped (rare: e.g. a fundraiser).

Map pins: the branch's coordinates from the city's "Ottawa Public Library
Locations" open dataset, matched by branch name.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import time
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .common import extract_links, guess_category, http_get, http_get_retry, local_iso, strip_html

SOURCE_ID = "ottawa-library"
CITY = "ottawa"
FEED_URL = "https://booking.biblioottawalibrary.ca/en/rss-events"
BRANCHES_URL = "https://open.ottawa.ca/api/download/v1/items/a5649df290ce476db96fef45f7df77ab/geojson?layers=0"
HORIZON_DAYS = 60
CACHE_DAYS = 7
BRANCHES_CACHE_DAYS = 30
DELAY = 10.0  # robots.txt: Crawl-delay: 10
MAX_NEW_PAGES = 150  # per run, so a first run stays under ~25 minutes; the rest come next run

MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], start=1)}


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).replace("\xa0", " ").strip()


def _field(page: str, name: str) -> str:
    """Inner HTML of a Drupal field ("field-name-<name>")."""
    m = re.search(r'field-name-' + name + r'\b[^>]*>\s*<div class="field-items">\s*<div class="field-item even">(.*?)</div>\s*</div>\s*</div>',
                  page, re.S)
    return m.group(1) if m else ""


# --------------------------------------------------------------------------- feed

def parse_feed(xml: str) -> list[str]:
    """Program page URLs in the RSS feed (each appears once)."""
    urls = []
    for link in re.findall(r"<item>.*?<link>([^<]+)</link>", xml, re.S):
        url = html.unescape(link.strip())
        if url not in urls:
            urls.append(url)
    return urls


# --------------------------------------------------------------------------- program page

_SESSION = re.compile(r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),\s+([a-z]+)\s+(\d{1,2}),\s+(\d{4})\s*-\s*(\d{1,2}):(\d{2})\s*([ap]m)", re.I)
_MINUTES = re.compile(r"(\d+)\s*min", re.I)


def _session(text: str) -> dict | None:
    """"Monday, November 2, 2026 - 9:30am Branch Open Space 30 mins." -> {"day", "time", "minutes"}."""
    m = _SESSION.search(text)
    if not m or m.group(1).lower() not in MONTHS:
        return None
    month, day, year, hour, minute, ampm = m.groups()
    h = int(hour) % 12 + (12 if ampm.lower() == "pm" else 0)
    mins = _MINUTES.search(text[m.end():])
    return {"day": date(int(year), MONTHS[month.lower()], int(day)).isoformat(),
            "time": f"{h:02d}:{minute}", "minutes": int(mins.group(1)) if mins else None}


def _single_session(card: str) -> dict | None:
    """One-off programs have no schedule list: "Sunday, Nov 08, 2026<br/>2:00pm<br/>60 minutes"."""
    m = re.search(r"([A-Z][a-z]{2})[a-z]*\s+(\d{1,2}),\s+(\d{4})\s*<br\s*/?>\s*(\d{1,2}):(\d{2})\s*([ap]m)", card, re.I)
    if not m:
        return None
    month = next((k for k in MONTHS if k.startswith(m.group(1).lower())), None)
    if not month:
        return None
    return _session(f"Monday, {month} {m.group(2)}, {m.group(3)} - {m.group(4)}:{m.group(5)}{m.group(6)} {_text(card[m.end():])}")


def parse_page(page: str) -> dict:
    """The fields we need from a program page (small enough to cache)."""
    title = re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S)
    branch = _field(page, "field-event-branch")
    schedule = re.search(r'<ul id="dates"[^>]*>(.*?)</ul>', page, re.S)
    sessions = [s for s in (_session(_text(li)) for li in re.findall(r"<li>(.*?)</li>", schedule.group(1), re.S))
                if s] if schedule else []
    if not sessions:
        card = re.search(r'<p class="card-date">(.*?)</p>', page, re.S)
        one = _single_session(card.group(1)) if card else None
        sessions = [one] if one else []
    image = re.search(r'<img[^>]+src="([^"]+)"', _field(page, "field-banner"))
    branch_name = re.search(r"<a[^>]*>(.*?)</a>", branch, re.S)
    street = re.search(r'<div class="street-address">(.*?)</div>', branch, re.S)
    room = re.search(r'<div class="event-room">(.*?)(?:</div>|$)', branch, re.S)
    return {
        "title": _text(title.group(1)) if title else "",
        "age_group": _text(_field(page, "field-age-group")),
        "category": _text(_field(page, "field-category")),
        "branch": _text(branch_name.group(1)) if branch_name else _text(branch) or None,
        "street": _text(street.group(1)) if street else None,
        "room": _text(room.group(1)) if room else None,
        "registration": _text(_field(page, "field-registration-required")),
        "language": _text(_field(page, "field-event-language")),
        "description": strip_html(_field(page, "body"))[:1200],
        "image": html.unescape(image.group(1)) if image else None,
        "sessions": sessions,
    }


# --------------------------------------------------------------------------- normalize

CATEGORY_MAP = [
    (r"storytime|rhyme|baby|toddler", "storytime"),
    (r"game", "games"),
    (r"book club|reading|author|writ", "books"),
    (r"language|conversation|esl|french|english", "languages"),
    (r"computer|digital|tech|coding|maker|robot|3d", "computers"),
    (r"science|stem", "science-tech"),
    (r"art|craft", "art-craft"),
    (r"music|concert", "music"),
    (r"film|movie", "film"),
    (r"health|wellness|yoga|meditat|mindful", "wellness"),
    (r"garden|seed", "gardening"),
    (r"newcomer|job|career|tax|legal|settlement|financ|support", "support"),
    (r"history|heritage|indigenous|lecture|talk|discussion", "society-history"),
]


def category_for(fields: dict) -> str:
    for pattern, slug in CATEGORY_MAP:
        if re.search(pattern, fields.get("category") or "", re.I):
            return slug
    return guess_category(fields.get("title"), fields.get("category"))


def audience_for(age_group: str) -> str:
    a = (age_group or "").lower()
    if re.search(r"baby|babies|toddler|preschool", a):
        return "preschool"
    if re.search(r"famil", a):
        return "family"
    if re.search(r"child|kid|school age", a):
        return "kids"
    if re.search(r"teen|youth", a):
        return "teens"
    if re.search(r"senior|older", a):
        return "seniors"
    if re.search(r"adult", a):
        return "adults"
    return "all"


def language_for(fields: dict) -> str:
    lang = (fields.get("language") or "").lower()
    return "fr" if lang.startswith(("fr", "fra")) and "english" not in lang else "en"


_PAID = re.compile(r"\$\s*\d|\d\s*\$")


def to_events(url: str, fields: dict, branches: dict, today: date) -> list[dict]:
    if not fields.get("title") or not fields.get("sessions") or _PAID.search(fields.get("description", "")):
        return []
    reg = (fields.get("registration") or "").lower()
    coords = branches.get(_branch_key(fields.get("branch") or "")) or {}
    branch = fields.get("branch")
    base = {
        "title": fields["title"],
        "description": fields.get("description", ""),
        "price_min": 0.0,
        "price_max": 0.0,
        "price_label": "Gratuit",
        "is_free": True,
        "category": category_for(fields),
        "audience": audience_for(fields.get("age_group", "")),
        "format": "online" if re.search(r"online|virtual|en ligne", f"{branch} {fields.get('room')}", re.I) else "indoor",
        "registration": "drop-in" if "drop-in" in reg else "required" if "regist" in reg else None,
        "venue": "Ottawa Public Library",  # the branch is in "borough", shown next to it
        "address": f"{fields['street']}, Ottawa" if fields.get("street") else None,
        "borough": branch,  # the branch's neighbourhood ("Rockcliffe Park", "Cumberland"…)
        "lat": coords.get("lat"),
        "lng": coords.get("lng"),
        "url": url,
        "links": extract_links(fields.get("description", "")),
        "image": fields.get("image"),
        "status": "scheduled",
        "source": SOURCE_ID,
        "city": CITY,
        "language": language_for(fields),
        "organizer": "Ottawa Public Library / Bibliothèque publique d'Ottawa",
    }
    last_day = today + timedelta(days=HORIZON_DAYS)
    key = hashlib.sha1(url.encode()).hexdigest()[:12]
    out = []
    for s in fields["sessions"]:
        day = date.fromisoformat(s["day"])
        if not today <= day <= last_day:
            continue
        start = local_iso(day, s["time"])
        end = None
        if s.get("minutes"):
            end_dt = datetime.fromisoformat(start) + timedelta(minutes=s["minutes"])
            end = local_iso(end_dt.date(), end_dt.strftime("%H:%M")) if end_dt.date() == day else None
        out.append({**base, "id": f"opl-{key}-{s['day']}-{s['time'].replace(':', '')}",
                    "start": start, "end": end, "all_day": False})
    return out


# --------------------------------------------------------------------------- branches

def _branch_key(name: str) -> str:
    """"Orléans" / "Orleans", "St-Laurent" / "Saint Laurent" -> the same key."""
    folded = unicodedata.normalize("NFD", name or "")
    folded = "".join(c for c in folded if unicodedata.category(c) != "Mn").lower()
    key = re.sub(r"[^a-z0-9]+", " ", folded).replace(" branch", "").strip()
    return re.sub(r"^st ", "saint ", key)


def load_branches(cache_dir: Path) -> dict:
    """{branch key: {"lat", "lng"}} from the city's library locations dataset."""
    path = cache_dir / f"{SOURCE_ID}-branches.json"
    try:
        cached = json.loads(path.read_text(encoding="utf-8"))
        if cached["fetched"] > (datetime.now(timezone.utc) - timedelta(days=BRANCHES_CACHE_DAYS)).isoformat():
            return cached["branches"]
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        cached = None
    try:
        data = json.loads(http_get_retry(BRANCHES_URL))
        branches = {_branch_key(f["properties"]["Name"]): {"lat": f["geometry"]["coordinates"][1],
                                                          "lng": f["geometry"]["coordinates"][0]}
                    for f in data["features"] if f.get("geometry") and f["properties"].get("Name")}
    except Exception as err:
        print(f"  branch locations unavailable ({err}); events will have no map pins")
        return cached["branches"] if cached else {}
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"fetched": datetime.now(timezone.utc).isoformat(), "branches": branches},
                               ensure_ascii=False), encoding="utf-8")
    return branches


# --------------------------------------------------------------------------- main

def load(cache_dir: Path, today: date | None = None) -> list[dict]:
    today = today or date.today()
    feed = parse_feed(http_get_retry(FEED_URL).decode("utf-8", "replace"))

    cache_path = cache_dir / f"{SOURCE_ID}.json"
    try:
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        cache = {}
    now = datetime.now(timezone.utc)
    stale = (now - timedelta(days=CACHE_DAYS)).isoformat()
    # Programs in today's feed, plus every known program that still has sessions
    # coming (the feed only shows the next two days).
    known = [u for u, v in cache.items() if any(s["day"] >= today.isoformat() for s in v["fields"]["sessions"])]
    urls = feed + [u for u in known if u not in feed]
    todo = [u for u in urls if u not in cache or cache[u]["fetched"] < stale]
    new = [u for u in todo if u not in cache][:MAX_NEW_PAGES]
    todo = new + [u for u in todo if u in cache][:max(0, MAX_NEW_PAGES - len(new))]
    print(f"  {len(feed)} programs in the feed, {len(urls)} known, {len(todo)} pages to fetch")
    failed = 0
    for n, url in enumerate(todo):
        if n:
            time.sleep(DELAY)
        try:
            cache[url] = {"fetched": now.isoformat(), "fields": parse_page(http_get(url, timeout=30).decode("utf-8", "replace"))}
        except Exception:
            failed += 1
    if failed:
        print(f"  {failed} page(s) failed; they'll be retried next run")
    cache = {u: v for u, v in cache.items() if u in urls and any(s["day"] >= today.isoformat() for s in v["fields"]["sessions"])}
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    branches = load_branches(cache_dir)
    return [e for u, v in cache.items() for e in to_events(u, v["fields"], branches, today)]
