"""Adapter for UQAM's public events calendar (evenements.uqam.ca).

The calendar runs on Caligram, which exposes a public JSON API:
  /api/events?page=N   list of upcoming events (20 per page)
  /api/events/<id>     one event, with its price type, prices and every date
Details are cached for a day so a daily run makes few requests.

Price: "FREE" -> free; "FIXED" -> the listed prices, using the general-public
rates (a $5 rate "for UQAM students" isn't what most visitors pay). Events with
no price information are skipped.
"""
from __future__ import annotations

import json
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .common import extract_links, find_borough, guess_category, http_get, http_get_retry, local_iso, strip_html

SOURCE_ID = "uqam"
API = "https://evenements.uqam.ca/api/events"
HORIZON_DAYS = 60
CACHE_HOURS = 20
# Price lines reserved for some people, not the general public.
RESTRICTED_RATE = re.compile(r"[ée]tudiant|employ[ée]|membre|uqam|personnel|enfant|a[iî]n[ée]|65|r[ée]duit", re.I)


def parse_price(event: dict) -> tuple[float, float] | None:
    kind = (event.get("price_type") or "").upper()
    if kind == "FREE":
        return 0.0, 0.0
    if kind == "FIXED":
        prices = []
        for p in event.get("prices") or []:
            try:
                prices.append((float(p.get("value")), p.get("description") or ""))
            except (TypeError, ValueError):
                continue
        public = [v for v, desc in prices if not RESTRICTED_RATE.search(desc)] or [v for v, _ in prices]
        if public:
            return min(public), max(public)
    notes = event.get("price_notes") or ""
    if re.search(r"gratuit|entr[ée]e libre", notes, re.I):
        return 0.0, 0.0
    return None


def borough_for(venue: dict) -> str | None:
    found = find_borough(venue.get("address"), venue.get("city"), venue.get("name"))
    if found:
        return found
    # UQAM's pavilions are all downtown, in Ville-Marie.
    return "Ville-Marie" if "uqam" in (venue.get("name") or "").lower() else None


def to_events(event: dict, today: date) -> list[dict]:
    if not event.get("public", True) or event.get("status") not in (None, "published"):
        return []
    price = parse_price(event)
    title = (event.get("title") or "").strip()
    if price is None or not title:
        return []
    lo, hi = price
    description = strip_html(event.get("description") or "")[:1200]
    tags = " ".join(t.get("name", "") for t in (event.get("types") or []) + (event.get("tags") or []))
    links = extract_links(description)
    for url in (event.get("facebook_url"), event.get("contact_url")):
        if url and url.startswith("http") and all(l["url"] != url for l in links):
            links.append({"type": "facebook" if "facebook.com" in url else "website", "url": url})
    organization = (event.get("organization") or {}).get("name")
    base = {
        "title": title,
        "description": description,
        "all_day": False,
        "price_min": lo,
        "price_max": hi,
        "price_label": "Gratuit" if hi == 0 else (f"{lo:g} $" if lo == hi else f"{lo:g} $ – {hi:g} $"),
        "is_free": hi == 0,
        "category": guess_category(" ".join(t.get("name", "") for t in event.get("types") or []), title, tags),
        "audience": "all",
        "registration": "ticket" if event.get("ticket_url") and hi == 0 else None,
        "url": event.get("url"),
        "image": event.get("display_image_url"),
        "status": "scheduled",
        "source": SOURCE_ID,
        "language": event.get("lang") or "fr",
        "organizer": f"UQAM — {organization}" if organization else "UQAM",
    }
    last_day = today + timedelta(days=HORIZON_DAYS)
    out = []
    for d in event.get("dates") or []:
        try:
            start = datetime.strptime(d["start_date"], "%Y-%m-%d %H:%M:%S")
        except (KeyError, TypeError, ValueError):
            continue
        if not today <= start.date() <= last_day:
            continue
        end = start + timedelta(seconds=int(d.get("duration") or 0)) if d.get("duration") else None
        venue = d.get("venue") or event.get("venue") or {}
        room = (event.get("room") or {}).get("name")
        address = ", ".join(x.strip(" ,") for x in (venue.get("address"), venue.get("city")) if x and x.strip(" ,")) or None
        # Starting at midnight means "all day" in this calendar.
        all_day = start.hour == 0 and start.minute == 0
        lat, lng = venue.get("latitude"), venue.get("longitude")
        out.append({
            **base,
            "id": f"uq-{event.get('id')}-{d.get('id')}",
            "all_day": all_day,
            "start": start.date().isoformat() if all_day else local_iso(start.date(), start.strftime("%H:%M")),
            "end": (start.date().isoformat() if all_day
                    else local_iso(end.date(), end.strftime("%H:%M")) if end and end > start else None),
            "format": "online" if re.search(r"en ligne|virtuel|zoom|teams", venue.get("name") or "", re.I) else "indoor",
            "venue": (f"{venue['name']}, local {room}" if room and venue.get("name") else venue.get("name")) or None,
            "address": address,
            "borough": borough_for(venue),
            "lat": float(lat) if lat not in (None, "") else None,
            "lng": float(lng) if lng not in (None, "") else None,
            "links": links + ([{"type": "website", "url": venue["website_url"]}]
                              if venue.get("website_url") and all(l["url"] != venue["website_url"] for l in links) else []),
        })
    return out


def load(cache_dir: Path, today: date | None = None) -> list[dict]:
    today = today or date.today()
    ids, page = [], 1
    while page <= 20:
        data = json.loads(http_get_retry(f"{API}?page={page}"))
        ids += [str(e["id"]) for e in data.get("data", [])]
        if not data.get("meta", {}).get("pagination", {}).get("links", {}).get("next"):
            break
        page += 1

    cache_path = cache_dir / f"{SOURCE_ID}.json"
    try:
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        cache = {}
    now = datetime.now(timezone.utc)
    stale = (now - timedelta(hours=CACHE_HOURS)).isoformat()
    todo = [i for i in ids if i not in cache or cache[i]["fetched"] < stale]
    print(f"  {len(ids)} events listed, {len(todo)} to fetch")
    failed = 0
    for i in todo:
        try:
            body = json.loads(http_get(f"{API}/{i}", timeout=30))
            cache[i] = {"fetched": now.isoformat(), "event": body.get("data", body)}
        except Exception:
            failed += 1
        time.sleep(0.25)
    if failed:
        print(f"  {failed} event(s) failed; they'll be retried next run")
    cache = {i: v for i, v in cache.items() if i in set(ids)}
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return [e for i in ids if i in cache for e in to_events(cache[i]["event"], today)]
