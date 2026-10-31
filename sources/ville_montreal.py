"""Adapter for the Ville de Montréal "Événements publics" open dataset.

Two steps, both specific to this source:

1. load()   downloads the daily GeoJSON and turns each feature into our common
            event schema (see README). Civic events (council meetings, public
            consultations...) are dropped here because they aren't "activities".
2. enrich() the GeoJSON has dates but no times, and almost never a venue name.
            Each event's official page on montreal.ca embeds schema.org JSON-LD
            with exact times, venue and address, so we read it from there.
            Pages are cached on disk so a daily run only fetches new events.

Data: Ville de Montréal, CC BY 4.0.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .common import clean, extract_links, http_get, http_get_retry

SOURCE_ID = "ville-de-montreal"
GEOJSON_URL = (
    "https://donnees.montreal.ca/dataset/6a4cbf2c-c9b7-413a-86b1-e8f7081e2578"
    "/resource/35307457-a00f-4912-9941-8095ead51f6e/download/evenements.geojson"
)

# Source "type_evenement" -> our category slug. The UI translates slugs to FR/EN.
# None means "not a public activity": the event is dropped.
CATEGORIES = {
    "Art et artisanat": "art-craft",
    "Art de la parole": "spoken-word",
    "Bien-être": "wellness",
    "Cinéma": "film",
    "Cirque": "circus",
    "Club de lecture et littérature": "books",
    "Cuisine": "cooking",
    "Danse": "dance",
    "Exposition": "exhibition",
    "Fête et marché": "festival-market",
    "Heure du conte": "storytime",
    "Humour": "comedy",
    "Informatique": "computers",
    "Initiation à la musique": "music-intro",
    "Jardinage": "gardening",
    "Jeux": "games",
    "Langues": "languages",
    "Musique": "music",
    "Science et techno": "science-tech",
    "Société et histoire": "society-history",
    "Soutien et échange": "support",
    "Sport et plein air": "sport-outdoors",
    "Théâtre": "theatre",
    # Civic / governance: not activities.
    "Conseil et comité": None,
    "Consultation publique": None,
    "Assemblée publique": None,
    "Rencontre avec personne élue": None,
}
OTHER_CATEGORY = "other"

AUDIENCES = {
    "Pour tous": "all",
    "Adultes": "adults",
    "Enfants": "kids",
    "Enfants d'âge préscolaire": "preschool",
    "Famille": "family",
    "Personnes aînées": "seniors",
    "Adolescents": "teens",
}
FORMATS = {"En salle": "indoor", "À l'extérieur": "outdoor", "En ligne": "online"}
REGISTRATION = {
    "Sur inscription": "required",
    "Entrée libre": "drop-in",
    "Avec billet": "ticket",
}

# Rough bounding box around the island, to reject obviously broken coordinates.
LAT_RANGE = (45.3, 45.8)
LNG_RANGE = (-74.1, -73.4)


# --------------------------------------------------------------------------- helpers

def to_float(value) -> float | None:
    s = clean(value)
    try:
        return float(s) if s is not None else None
    except ValueError:
        return None


def strip_html(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</p>", "\n\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text).replace("\xa0", " ")
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def event_id(url: str | None, title: str, start: str) -> str:
    """Stable id: the numeric id at the end of the montreal.ca URL, else a hash."""
    m = re.search(r"-(\d+)/?$", url or "")
    if m:
        return f"mtl-{m.group(1)}"
    digest = hashlib.sha1(f"{title}|{start}".encode()).hexdigest()[:12]
    return f"mtl-h{digest}"


# --------------------------------------------------------------------------- step 1

def fetch_geojson() -> dict:
    """Download the dataset (with retries). Raises if it never works."""
    data = json.loads(http_get_retry(GEOJSON_URL))
    if not isinstance(data.get("features"), list):
        raise ValueError("GeoJSON has no 'features' list")
    return data


def normalize(feature: dict) -> dict | None:
    """One GeoJSON feature -> one event in our schema, or None to drop it."""
    p = feature.get("properties") or {}
    title = clean(p.get("titre"))
    start = clean(p.get("date_debut"))
    if not title or not start:
        return None

    type_label = clean(p.get("type_evenement"))
    category = CATEGORIES.get(type_label, OTHER_CATEGORY) if type_label else OTHER_CATEGORY
    if category is None:
        return None

    cost = clean(p.get("cout"))
    is_free = cost == "Gratuit"

    # Coordinates are in the properties and in the geometry; a few records have
    # broken values (e.g. lat == long), so take the first pair that's in Montréal.
    coords = ((feature.get("geometry") or {}).get("coordinates")) or [None, None]
    lat = lng = None
    for la, ln in ((p.get("lat"), p.get("long")), (coords[1], coords[0])):
        la, ln = to_float(la), to_float(ln)
        if (la is not None and ln is not None and LAT_RANGE[0] <= la <= LAT_RANGE[1]
                and LNG_RANGE[0] <= ln <= LNG_RANGE[1]):
            lat, lng = la, ln
            break

    address = clean(p.get("adresse_principale"))
    postal = clean(p.get("code_postal"))
    if address and postal:
        address = f"{address}, Montréal {postal[:3]} {postal[3:]}"

    url = clean(p.get("url_fiche"))
    end = clean(p.get("date_fin")) or start
    return {
        "id": event_id(url, title, start),
        "title": title,
        "description": clean(p.get("description")) or "",
        "start": start,              # "YYYY-MM-DD" until enrich() adds a time
        "end": end,
        "all_day": True,
        "price_min": 0 if is_free else None,  # "Payant" never says how much
        "price_max": 0 if is_free else None,
        "price_label": cost or "",
        "is_free": is_free,
        "category": category,
        "audience": AUDIENCES.get(clean(p.get("public_cible"))),
        "format": FORMATS.get(clean(p.get("emplacement"))),
        "registration": REGISTRATION.get(clean(p.get("inscription"))),
        "venue": clean(p.get("titre_adresse")),
        "address": address,
        "borough": clean(p.get("arrondissement")),
        "lat": lat,
        "lng": lng,
        "url": url,
        "links": extract_links(clean(p.get("description")) or ""),
        "image": None,
        "status": "scheduled",
        "source": SOURCE_ID,
        "language": "fr",
    }


def load(cache_dir: Path | None = None) -> list[dict]:
    data = fetch_geojson()
    events = [normalize(f) for f in data["features"]]
    return [e for e in events if e is not None]


# --------------------------------------------------------------------------- step 2

def parse_page(page_html: str) -> dict | None:
    """Extract the schema.org Event JSON-LD block from a montreal.ca event page."""
    for block in re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', page_html, re.S
    ):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        for item in data if isinstance(data, list) else [data]:
            if isinstance(item, dict) and item.get("@type") == "Event":
                return _details_from_jsonld(item)
    return None


def _details_from_jsonld(ev: dict) -> dict:
    loc = ev.get("location") if isinstance(ev.get("location"), dict) else {}
    addr = loc.get("address") if isinstance(loc.get("address"), dict) else {}
    street = clean(addr.get("streetAddress"))
    postal = clean(addr.get("postalCode"))
    address = None
    if street:
        locality = clean(addr.get("addressLocality")) or "Montréal"
        address = f"{street}, {locality}"
        if postal and len(postal) == 6:
            address += f" {postal[:3]} {postal[3:]}"
    status = str(ev.get("eventStatus") or "")
    return {
        "start": clean(ev.get("startDate")),
        "end": clean(ev.get("endDate")),
        "venue": clean(loc.get("name")) if loc.get("@type") == "Place" else None,
        "address": address,
        "description": strip_html(ev.get("description") or ""),
        "image": clean(ev.get("image")) if isinstance(ev.get("image"), str) else None,
        "status": "cancelled" if "Cancelled" in status else
                  "postponed" if "Postponed" in status else "scheduled",
    }


def apply_details(event: dict, details: dict | None) -> dict:
    """Merge page details into an event. Fields the page lacks are left as-is."""
    if not details:
        return event
    e = dict(event)
    if details.get("start") and "T" in details["start"]:
        e["start"] = details["start"]
        e["end"] = details["end"] if details.get("end") and "T" in details["end"] else None
        e["all_day"] = False
    for key in ("venue", "address", "image"):
        if details.get(key):
            e[key] = details[key]
    # Prefer the page's description when it's longer (the GeoJSON one is a short summary).
    if len(details.get("description") or "") > len(e["description"]):
        e["description"] = details["description"]
        e["links"] = extract_links(e["description"])
    e["status"] = details.get("status") or e["status"]
    return e


def enrich(events: list[dict], cache_path: Path, max_age_days: int = 7,
           max_fetches: int = 4000, workers: int = 4) -> list[dict]:
    """Add times/venues from montreal.ca pages, using (and updating) a disk cache.

    A failed page fetch is not fatal: the event keeps its date-only info and the
    page is retried on the next run.
    """
    try:
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        cache = {}

    now = datetime.now(timezone.utc)
    stale_before = (now - timedelta(days=max_age_days)).isoformat()
    todo = [e for e in events if e.get("url") and
            (e["id"] not in cache or cache[e["id"]]["fetched"] < stale_before)][:max_fetches]
    print(f"  pages cached: {len(events) - len(todo)}, to fetch: {len(todo)}")

    def fetch(e):
        try:
            return e["id"], parse_page(http_get(e["url"], timeout=30).decode("utf-8", "replace"))
        except Exception as err:
            return e["id"], err

    def save():
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = cache_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        tmp.replace(cache_path)

    failed = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for i, (eid, result) in enumerate(pool.map(fetch, todo), 1):
            if isinstance(result, Exception):
                failed += 1
            else:
                cache[eid] = {"fetched": now.isoformat(), "details": result}
            if i % 250 == 0:
                print(f"  ... {i}/{len(todo)}", flush=True)
                save()  # so an interrupted run doesn't lose its progress
    if failed:
        print(f"  {failed} page(s) failed; they'll be retried next run")

    # Keep the cache small: forget events that are no longer in the dataset.
    wanted = {e["id"] for e in events}
    cache = {k: v for k, v in cache.items() if k in wanted}
    save()

    return [apply_details(e, (cache.get(e["id"]) or {}).get("details")) for e in events]
