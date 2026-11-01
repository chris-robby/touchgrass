"""Adapter for Université de Montréal's calendar (calendrier.umontreal.ca).

1. The official RSS feed (/activites/export.rss, 100 items per page, future
   events only) lists activities with their start date and topic tags.
2. Each activity page has the details in named HTML blocks: date/time, format
   (in person / online), price, place, status (full, cancelled...). Pages are
   cached; robots.txt asks for 1 second between requests, which we respect.

Exhibitions appear once per opening day ("Curiosa" x 12): those are merged into
one multi-day event, and only one page per exhibition is fetched.
"""
from __future__ import annotations

import html
import json
import re
import time
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

from .common import extract_links, find_borough, guess_category, http_get, http_get_retry, local_iso, strip_html

SOURCE_ID = "udem"
BASE = "https://calendrier.umontreal.ca"
HORIZON_DAYS = 60
CACHE_DAYS = 4
MAX_FEED_PAGES = 12

MONTHS = {m: i for i, m in enumerate(
    ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
     "septembre", "octobre", "novembre", "décembre"], start=1)}

# No coordinates on the pages: known campus addresses get a campus pin.
CAMPUSES = [
    (r"[ée]douard-montpetit|c[ôo]te-sainte-catherine|vincent-d.indy|louis-colin|chemin de la tour|"
     r"decelles|jean-brillant|marie-victorin|roger-gaudry|lionel-groulx|cepsum|wilderton|2900",
     {"lat": 45.5048, "lng": -73.6132, "borough": "Côte-des-Neiges–Notre-Dame-de-Grâce"}),
    (r"campus mil|th[ée]r[èe]se-lavoie-roux", {"lat": 45.5234, "lng": -73.6152, "borough": "Outremont"}),
]


# --------------------------------------------------------------------------- feed

def feed_url(today: date, page: int) -> str:
    params = {"tx_solr[filter][0]": f"date:{today:%Y/%m/%d}-2100/01/01", "tx_solr[page]": str(page)}
    return f"{BASE}/activites/export.rss?" + urllib.parse.urlencode(params)


def parse_feed(xml: str) -> list[dict]:
    items = []
    for item in re.findall(r"<item>(.*?)</item>", xml, re.S):
        link = re.search(r"<link>(.*?)</link>", item)
        when = re.search(r"<pubDate>(.*?)</pubDate>", item)
        if not link or not when:
            continue
        items.append({
            "url": html.unescape(link.group(1).strip()),
            "title": html.unescape(re.sub(r"\s+", " ", (re.search(r"<title>(.*?)</title>", item, re.S) or [0, ""])[1])).strip(),
            "start": parsedate_to_datetime(when.group(1).strip()),
            "tags": [html.unescape(re.sub(r"\s+", " ", c)).strip()
                     for c in re.findall(r"<category>(.*?)</category>", item, re.S)],
        })
    return items


def series_key(url: str) -> str:
    """".../activite/curiosa-fantasmer-le-passe-12" -> ".../activite/curiosa-fantasmer-le-passe"."""
    return re.sub(r"-\d+$", "", url.rstrip("/"))


# --------------------------------------------------------------------------- page

def _clean_text(fragment: str) -> str:
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()
    return re.sub(r"\s+,", ",", re.sub(r",(\s*,)+", ",", text))


def _block(page: str, cls: str) -> str:
    m = re.search(rf'class="{cls}"[^>]*>(.*?)</(?:span|div)>', page, re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", m.group(1)))).strip() if m else ""


def parse_page(page: str) -> dict:
    prix = re.search(r'class="event-header-prix"[^>]*>(.*?)</div>', page, re.S)
    prix_html = prix.group(1) if prix else ""
    ticket = re.search(r'<a href="([^"]+)"', prix_html)
    loc = re.search(r'class="event-location-presentiel-infos"[^>]*>(.*?)</div>', page, re.S)
    loc_html = loc.group(1) if loc else ""
    coords = re.search(r"sll=(-?\d+\.\d+),(-?\d+\.\d+)", loc_html)
    room = re.search(r'class="event-room"[^>]*>(.*?)</span>', loc_html, re.S)
    addr = re.search(r'class="event-location-address"[^>]*>(.*)', loc_html, re.S)
    addr_html = re.sub(r'<span class="event-room".*?</span>', "", addr.group(1), flags=re.S) if addr else ""
    desc = re.search(r'class="event-description[^"]*".*?<div class="rte">(.*?)</div>\s*</div>', page, re.S)
    status = re.search(r'udem-statut-([a-z-]+)', page)
    title = re.search(r"<h1>(.*?)</h1>", page, re.S)
    image = re.search(r'class="event-header-image">\s*<img src="([^"]+)"', page)
    return {
        "title": html.unescape(re.sub(r"\s+", " ", title.group(1))).strip() if title else "",
        "when": _block(page, "event-date"),
        "mode": _block(page, "event-mode"),
        # Price text without the "Billets" (tickets) button.
        "price": re.sub(r"\s*\b(Billets|Tickets|R[ée]server|Inscription)\b\s*", " ",
                        _clean_text(re.sub(r"<a\b.*?</a>", "", prix_html, flags=re.S))).strip(),
        "ticket": html.unescape(ticket.group(1)) if ticket else None,
        "venue": _block(page, "event-location-title"),
        "room": _clean_text(room.group(1)) if room else "",
        "address": _clean_text(re.sub(r"<br\s*/?>", ", ", addr_html)).strip(" ,") if addr_html else "",
        "lat": float(coords.group(1)) if coords else None,
        "lng": float(coords.group(2)) if coords else None,
        "description": strip_html(desc.group(1)) if desc else "",
        "status": status.group(1) if status else "",
        "image": BASE + image.group(1) if image and image.group(1).startswith("/") else (image.group(1) if image else None),
    }


_DATE = re.compile(r"(\d{1,2})\s*(?:er)?\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|"
                   r"octobre|novembre|décembre)\s+(\d{4})", re.I)
_TIME = re.compile(r"(\d{1,2}):(\d{2})")


def parse_when(text: str) -> tuple[str, str | None, bool] | None:
    """"mardi 3 novembre 2026, 18:00 à 21:00" / "Du lundi 2 novembre 2026, 09:00 au
    mercredi 2 décembre 2026, 17:00" -> (start, end, all_day)."""
    text = text.replace("\xa0", " ")
    dates = [date(int(y), MONTHS[m.lower()], int(d)) for d, m, y in _DATE.findall(text)]
    if not dates:
        return None
    times = _TIME.findall(text)
    if not times:
        return dates[0].isoformat(), dates[-1].isoformat(), True
    start = local_iso(dates[0], f"{times[0][0]}:{times[0][1]}")
    end = local_iso(dates[-1], f"{times[-1][0]}:{times[-1][1]}") if len(times) > 1 else None
    return start, end, False


_AMOUNT = re.compile(r"(\d+(?:[.,]\d{1,2})?)\s?\$")


def parse_price(text: str) -> tuple[float, float] | None:
    """"Gratuit" -> (0, 0); "6,25 $ à 8,75 $" -> (6.25, 8.75); "" -> None."""
    if re.search(r"gratuit|entr[ée]e libre", text or "", re.I):
        return 0.0, 0.0
    amounts = [float(a.replace(",", ".")) for a in _AMOUNT.findall(text or "")]
    # "0 $ à 33 $" means free for some (students), $33 for the public.
    paid = [a for a in amounts if a > 0]
    if paid:
        return min(paid), max(paid)
    return (0.0, 0.0) if amounts else None


def campus_for(*texts: str) -> dict | None:
    text = " ".join(t for t in texts if t)
    for pattern, campus in CAMPUSES:
        if re.search(pattern, text, re.I):
            return campus
    return None


def to_event(url: str, details: dict, tags: list[str], series_end: datetime | None = None) -> dict | None:
    if details.get("status") in ("annule", "complet", "reporte"):
        return None
    when = parse_when(details.get("when", ""))
    price = parse_price(details.get("price", ""))
    title = details.get("title")
    if not when or price is None or not title:
        return None
    start, end, all_day = when
    if series_end and not all_day:
        # Merged exhibition: same daily hours, until the last opening day.
        end_time = (end or start)[11:16]
        end = local_iso(series_end.date(), end_time)
    lo, hi = price
    mode = details.get("mode", "").lower()
    online = "en ligne" in mode
    campus = None if online else campus_for(details.get("venue", ""), details.get("address", ""))
    address = details.get("address") or None
    lat, lng = details.get("lat"), details.get("lng")
    if lat is None and campus:
        lat, lng = campus["lat"], campus["lng"]
    venue = details.get("venue") or None
    if venue and details.get("room"):
        venue = f"{venue}, {details['room']}"
    return {
        "id": "udem-" + re.sub(r"[^a-z0-9]+", "-", series_key(url).rsplit("/", 1)[-1])[:60]
              + ("" if series_end else "-" + re.sub(r"\D", "", start[:16])),
        "title": title,
        "description": details.get("description", "")[:1200],
        "start": start,
        "end": end,
        "all_day": all_day,
        "price_min": lo,
        "price_max": hi,
        "price_label": "Gratuit" if hi == 0 else details.get("price", ""),
        "is_free": hi == 0,
        "category": guess_category(" ".join(tags), title),
        "audience": "all",
        "format": "online" if online else "indoor",
        "registration": "ticket" if details.get("ticket") and hi == 0 else None,
        "venue": venue,
        "address": address,
        "borough": campus["borough"] if campus else find_borough(address),
        "lat": None if online else lat,
        "lng": None if online else lng,
        "url": series_key(url) if series_end else url,
        "links": extract_links(details.get("description", "")),
        "image": details.get("image"),
        "status": "scheduled",
        "source": SOURCE_ID,
        "language": "fr",
        "organizer": "Université de Montréal",
    }


def load(cache_dir: Path, today: date | None = None) -> list[dict]:
    today = today or date.today()
    last_day = today + timedelta(days=HORIZON_DAYS)

    items = []
    for page in range(1, MAX_FEED_PAGES + 1):
        batch = parse_feed(http_get_retry(feed_url(today, page)).decode("utf-8", "replace"))
        items += [i for i in batch if i["start"].date() <= last_day]
        if not batch or batch[-1]["start"].date() > last_day:
            break
        time.sleep(1)

    # Group occurrences of the same activity (exhibitions open day after day).
    series: dict[str, list[dict]] = {}
    for item in items:
        series.setdefault(series_key(item["url"]), []).append(item)

    cache_path = cache_dir / f"{SOURCE_ID}.json"
    try:
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        cache = {}
    now = datetime.now(timezone.utc)
    stale = (now - timedelta(days=CACHE_DAYS)).isoformat()

    # One page per occurrence, except exhibitions open day after day: one page, one event.
    def merged(occ: list[dict]) -> bool:
        return len(occ) >= 3 and any(re.search(r"exposition", t, re.I) for o in occ for t in o["tags"])

    wanted = []
    for key, occ in series.items():
        wanted += [occ[0]["url"]] if merged(occ) else [o["url"] for o in occ]
    todo = [u for u in wanted if u not in cache or cache[u]["fetched"] < stale]
    print(f"  {len(items)} feed items, {len(series)} activities, {len(todo)} pages to fetch")
    failed = 0
    for url in todo:
        try:
            cache[url] = {"fetched": now.isoformat(), "details": parse_page(http_get(url, timeout=30).decode("utf-8", "replace"))}
        except Exception:
            failed += 1
        time.sleep(1)  # robots.txt: Crawl-delay: 1
    if failed:
        print(f"  {failed} page(s) failed; they'll be retried next run")
    cache = {u: v for u, v in cache.items() if u in set(wanted)}
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    events = []
    for key, occ in series.items():
        if merged(occ):
            first = occ[0]["url"]
            if first in cache:
                events.append(to_event(first, cache[first]["details"], occ[0]["tags"], series_end=max(o["start"] for o in occ)))
        else:
            events += [to_event(o["url"], cache[o["url"]]["details"], o["tags"]) for o in occ if o["url"] in cache]
    return [e for e in events if e]
