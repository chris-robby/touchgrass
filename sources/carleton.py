"""Adapter for Carleton University events (events.carleton.ca), Ottawa.

The events site is WordPress with a public REST API: the `cu_event` post type
carries the start/end time, whether it's in person or online, the building code
and room, a cost field and a registration link (`acf`). robots.txt allows
everything; we wait 1 second between the few API pages a run needs.

The API can't filter on the event date, only on when the post was published, so
we read posts newest first and stop once a whole page is old (events that ended
more than OLD_DAYS ago).

Price: only a stated price counts. The cost field ("Free", "0", "$150") wins;
when it's empty, the description must say the event is free ("free admission",
"free and open to the public", "gratuit"…). Anything else is skipped rather than
guessed — most entries leave the cost empty.
"""
from __future__ import annotations

import html
import json
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path

from .common import category_for, extract_links, http_get_retry, local_iso, stated_price, strip_html

SOURCE_ID = "carleton"
CITY = "ottawa"
API = "https://events.carleton.ca/wp-json/wp/v2/cu_event"
FIELDS = "id,link,title,content,acf,cu_event_audience,yoast_head_json"
PER_PAGE = 100
MAX_PAGES = 20
OLD_DAYS = 120
HORIZON_DAYS = 60
DELAY = 1.0

# Carleton University, for on-campus events (rooms aren't geocoded individually).
CAMPUS = {"lat": 45.3857, "lng": -75.6960}
CAMPUS_ADDRESS = "1125 Colonel By Drive, Ottawa"
BUILDINGS = {
    "RB": "Richcraft Hall", "DT": "Dunton Tower", "UC": "Nideyinàn (University Centre)",
    "ML": "MacOdrum Library", "TB": "Tory Building", "SA": "Southam Hall", "PA": "Paterson Hall",
    "NB": "Nicol Building", "CB": "Canal Building", "LA": "Loeb Building", "HP": "Herzberg Laboratories",
    "AP": "Azrieli Pavilion", "AT": "Azrieli Theatre", "HS": "Health Sciences Building",
}

def _when(value: str | None) -> datetime | None:
    try:
        return datetime.strptime(value or "", "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def to_event(post: dict, today: date) -> dict | None:
    acf = post.get("acf") or {}
    start, end = _when(acf.get("cu_event_start_date")), _when(acf.get("cu_event_end_date"))
    if not start:
        return None
    last = (end or start).date()
    if last < today or start.date() > today + timedelta(days=HORIZON_DAYS):
        return None
    title = html.unescape(strip_html(post["title"]["rendered"]))
    text = strip_html(post.get("content", {}).get("rendered", ""))
    price = stated_price(acf.get("cu_event_cost") or "", text)
    if price is None:
        return None
    lo, hi = price

    kind = acf.get("cu_event_location_type") or ""
    online = kind == "virtual"
    on_campus = acf.get("cu_event_meeting_address_type") == "on-campus"
    building = BUILDINGS.get((acf.get("cu_building") or "").upper())
    room = (acf.get("cu_event_meeting_room") or "").strip()
    if online:
        venue, address, coords = None, None, {}
    elif on_campus:
        venue = ", ".join(x for x in ["Carleton University", building, room] if x)
        address, coords = CAMPUS_ADDRESS, CAMPUS
    else:
        # Off campus: a Google Maps place {"address", "lat", "lng", "name"…}.
        place = acf.get("cu_event_meeting_address_full")
        place = place if isinstance(place, dict) else {}
        venue = room or place.get("name") or None
        address = place.get("address") or None
        coords = {"lat": place["lat"], "lng": place["lng"]} if place.get("lat") and place.get("lng") else {}

    multi_day = end is not None and end.date() != start.date()
    # Midnight means "no time given" (e.g. a book launch entered with dates only).
    all_day = multi_day or start.strftime("%H:%M") == "00:00"
    image = ((post.get("yoast_head_json") or {}).get("og_image") or [{}])[0].get("url")
    reg = (acf.get("cu_event_registration") or {}) if isinstance(acf.get("cu_event_registration"), dict) else {}
    return {
        "id": f"cu-{post['id']}",
        "title": title,
        "description": text[:1200],
        "start": start.date().isoformat() if all_day else local_iso(start.date(), start.strftime("%H:%M")),
        "end": (end.date().isoformat() if multi_day else None if all_day else
                local_iso(end.date(), end.strftime("%H:%M")) if end and end > start else None),
        "all_day": all_day,
        "price_min": lo,
        "price_max": hi,
        "price_label": "Gratuit" if hi == 0 else (f"{lo:g} $" if lo == hi else f"{lo:g} $ – {hi:g} $"),
        "is_free": hi == 0,
        "category": category_for(title, text),
        "audience": "all",
        "format": "online" if online else "indoor",
        "registration": "required" if reg.get("url") or re.search(r"\bregist|rsvp|inscri", text, re.I) else None,
        "venue": venue,
        "address": address,
        "borough": "Carleton University",
        "lat": coords.get("lat"),
        "lng": coords.get("lng"),
        "url": post["link"],
        "links": extract_links(text),
        "image": image,
        "status": "scheduled",
        "source": SOURCE_ID,
        "city": CITY,
        "language": "en",
        "organizer": "Carleton University",
    }


def load(cache_dir: Path, today: date | None = None) -> list[dict]:
    today = today or date.today()
    old = (today - timedelta(days=OLD_DAYS)).isoformat()
    events = []
    for page in range(1, MAX_PAGES + 1):
        if page > 1:
            time.sleep(DELAY)
        url = f"{API}?per_page={PER_PAGE}&page={page}&orderby=date&order=desc&_fields={FIELDS}"
        try:
            posts = json.loads(http_get_retry(url))
        except RuntimeError:
            if page == 1:
                raise
            break  # past the last page (WordPress answers 400)
        if not posts:
            break
        events += [e for e in (to_event(p, today) for p in posts) if e]
        starts = [(p.get("acf") or {}).get("cu_event_end_date") or (p.get("acf") or {}).get("cu_event_start_date") or ""
                  for p in posts]
        if all(s[:10] < old for s in starts):
            break  # a whole page of long-past events: older posts won't be upcoming
    return events
