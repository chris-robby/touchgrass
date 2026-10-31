"""Adapter for "Programmation de sports et loisirs" (Loisirs Montréal) open data.

Every municipal sports & leisure activity: free skating, drop-in hockey,
pickleball, video-game meetups... Most are courses that need registration; we
keep only **drop-in** activities that are **free or ≤ $10**.

The data has no price field: prices are written in free text ("Coût : 6,5 $
par personne", "Activité gratuite"), so parse_price() reads them from there.
Activities with no price mentioned are skipped (we can't promise they're cheap).

Activities are weekly sessions ("Saturdays 14:30–22:30, Aug 31 – Dec 23"), so
each session becomes one event per date, for the next HORIZON_DAYS days. The
daily rebuild keeps that window rolling.

Data: Ville de Montréal, CC BY 4.0.
"""
from __future__ import annotations

import ast
import json
import re
import urllib.parse
from datetime import date, timedelta

from .common import clean, extract_links, find_borough, http_get_retry, local_iso

SOURCE_ID = "loisirs-montreal"
DATA_URL = (
    "https://donnees.montreal.ca/dataset/69282c2b-52da-4e63-97d8-7890cdf5c217"
    "/resource/22e63953-ac46-4965-83b1-456db143d007/download/programmation-de-sports-et-loisirs.json"
)
HORIZON_DAYS = 42

WEEKDAYS = {"lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3, "vendredi": 4, "samedi": 5, "dimanche": 6}

# First matching keyword (in category + sub-category + name) decides our category slug.
CATEGORY_RULES = [
    (r"jeux? vid[ée]o|[ée]checs|jeux de soci", "games"),
    (r"langue|conversation", "languages"),
    (r"danse|zumba", "dance"),
    (r"histoire|g[ée]n[ée]alogie", "society-history"),
    (r"cirque", "circus"),
    (r"musique|chorale", "music"),
    (r"cuisine", "cooking"),
    (r"informatique|num[ée]rique", "computers"),
    (r"yoga|m[ée]ditation|tai.?chi|bien.?[êe]tre", "wellness"),
    (r"art|peinture|dessin|bricolage|tricot|couture", "art-craft"),
    (r"sport|aquatique|natation|baignade|bain|glace|patin|hockey|raquette|badminton|tennis|"
     r"pickleball|basket|soccer|volley|conditionnement|entra[îi]nement|course|v[ée]lo", "sport-outdoors"),
]


# --------------------------------------------------------------------------- parsing helpers

def as_list(value) -> list:
    """`seances` and `directives` are usually lists, but sometimes the text of a
    Python list ("[{'id': ...}]"). Accept both."""
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value.strip().startswith("["):
        try:
            parsed = ast.literal_eval(value)
            return parsed if isinstance(parsed, list) else []
        except (ValueError, SyntaxError):
            return []
    return []


def directive_texts(record: dict) -> list[str]:
    out = []
    for d in as_list(record.get("directives")):
        text = clean(d.get("description") if isinstance(d, dict) else d)
        if text:
            out.append(text)
    return out


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
_FREE = re.compile(r"\bgratuite?s?\b", re.I)
# "gratuit" in these sentences is about something else (parking, the free membership card…).
_FREE_NOT_ACTIVITY = re.compile(r"stationnement|vignette|carte|pr[êe]t de|gratuitement", re.I)
_AMOUNT = re.compile(r"(\d+(?:[.,]\d{1,2})?)\s?\$")
# Amounts in these sentences aren't the activity's price.
_NOT_A_PRICE = re.compile(r"frais|rembours|amende|d[ée]p[ôo]t|annulation|rabais|/\s?h(?:eure)?\b|par heure|location", re.I)


def parse_price(texts: list[str]) -> tuple[float, float] | None:
    """(min, max) price in dollars from free text, 0 meaning free; None if unknown."""
    amounts, free = [], False
    for text in texts:
        for sentence in _SENTENCE_SPLIT.split(text):
            if _FREE.search(sentence) and not _FREE_NOT_ACTIVITY.search(sentence):
                free = True
            if not _NOT_A_PRICE.search(sentence):
                amounts += [float(a.replace(",", ".")) for a in _AMOUNT.findall(sentence)]
    if free:
        return (0.0, max(amounts, default=0.0))
    if amounts:
        return (min(amounts), max(amounts))
    return None


def fmt_dollars(x: float) -> str:
    """6.5 -> "6,50 $", 8.0 -> "8 $" (Québec French style; the site reformats for English)."""
    return f"{x:.2f}".replace(".", ",") + " $" if x % 1 else f"{int(x)} $"


def price_label(lo: float, hi: float) -> str:
    if hi == 0:
        return "Gratuit"
    if lo == hi:
        return fmt_dollars(lo)
    return f"{'Gratuit' if lo == 0 else fmt_dollars(lo)} – {fmt_dollars(hi)}"


def category_for(record: dict) -> str:
    text = " ".join(clean(record.get(k)) or "" for k in ("categorie", "sous_categorie", "nom"))
    for pattern, slug in CATEGORY_RULES:
        if re.search(pattern, text, re.I):
            return slug
    return "other"


def audience_for(record: dict) -> str | None:
    lo, hi = record.get("age_minimum"), record.get("age_maximum")
    lo = lo if isinstance(lo, (int, float)) else None
    hi = hi if isinstance(hi, (int, float)) else None
    if lo is None and hi is None:
        return "all"
    if hi is not None and hi <= 5:
        return "preschool"
    if hi is not None and hi <= 12:
        return "kids"
    if lo is not None and lo >= 12 and hi is not None and hi <= 17:
        return "teens"
    if lo is not None and lo >= 60:
        return "seniors"
    if lo is not None and lo >= 18:
        return "adults"
    return "all"


def clean_address(addr: str | None) -> str | None:
    """"330 80e Avenue , LaSalle, H8R2T3" -> "330 80e Avenue, LaSalle, H8R 2T3"."""
    addr = clean(addr)
    if not addr:
        return None
    addr = re.sub(r"\s+,", ",", addr)
    return re.sub(r"\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b", r"\1 \2", addr)


def search_url(name: str) -> str:
    """Link to Loisirs Montréal's search for this activity (the site has no stable page per activity)."""
    param = json.dumps({"filter": {"isCollapsed": False}, "search": name,
                        "sortable": {"isOrderAsc": True, "column": "description"}},
                       separators=(",", ":"), ensure_ascii=False)
    return "https://loisirs.montreal.ca/IC3/#/U5200/search/?searchParam=" + urllib.parse.quote(param, safe=":,")


def description_for(record: dict, directives: list[str]) -> str:
    """The activity's description plus its practical notes, without refund boilerplate."""
    parts, seen = [], set()
    for text in [clean(record.get("description")) or ""] + directives:
        text = text.strip()
        key = text.lower()
        if not text or key in seen or re.search(r"rembours|loi sur la s[ée]curit", text, re.I):
            continue
        seen.add(key)
        parts.append(text)
    return "\n\n".join(parts)[:1200]


def session_dates(record: dict, session: dict, today: date, horizon: int = HORIZON_DAYS) -> list[date]:
    """Dates this weekly session takes place, from today to today + horizon."""
    try:
        first = date.fromisoformat(record["date_debut"])
        last = date.fromisoformat(record["date_fin"])
    except (KeyError, TypeError, ValueError):
        return []
    weekday = WEEKDAYS.get((clean(session.get("jour_semaine")) or "").lower())
    if weekday is None:
        # No weekday: only usable for a one-day activity.
        return [first] if first == last and first >= today else []
    start = max(first, today)
    end = min(last, today + timedelta(days=horizon))
    d = start + timedelta(days=(weekday - start.weekday()) % 7)
    out = []
    while d <= end:
        out.append(d)
        d += timedelta(days=7)
    return out


# --------------------------------------------------------------------------- main

def to_events(record: dict, today: date) -> list[dict]:
    """One activity record -> its upcoming dated events (empty if it doesn't qualify)."""
    if clean(record.get("est_annulee")) == "Vrai":
        return []
    if clean(record.get("est_inscription_obligatoire")) != "Faux":
        return []  # registration required: not drop-in
    name = clean(record.get("nom"))
    if not name:
        return []
    directives = directive_texts(record)
    price = parse_price([name, clean(record.get("description")) or ""] + directives)
    if price is None:
        return []  # no price written anywhere: can't promise it's free or cheap
    lo, hi = price

    description = description_for(record, directives)
    links = extract_links(description)
    promoter = clean(record.get("promoteur"))
    base = {
        "title": name,
        "description": description,
        "all_day": False,
        "price_min": lo,
        "price_max": hi,
        "price_label": price_label(lo, hi),
        "is_free": hi == 0,
        "category": category_for(record),
        "audience": audience_for(record),
        "format": None,
        "registration": "drop-in",
        "url": search_url(name),
        "image": None,
        "status": "scheduled",
        "source": SOURCE_ID,
        "language": "fr",
        "organizer": promoter,
    }

    events = []
    for session in as_list(record.get("seances")):
        if not isinstance(session, dict):
            continue
        start_t, end_t = clean(session.get("heure_debut")), clean(session.get("heure_fin"))
        if not start_t:
            continue
        address = clean_address(session.get("adresse_site"))
        lat, lng = session.get("latitude"), session.get("longitude")
        phone = re.sub(r"\D", "", str(session.get("telephone_site") or ""))
        session_links = list(links)
        if len(phone) == 10:
            session_links.append({"type": "phone", "url": f"tel:+1{phone}"})
        for d in session_dates(record, session, today):
            events.append({
                **base,
                "id": f"lm-{record.get('id_activite')}-{session.get('id')}-{d.isoformat()}",
                "start": local_iso(d, start_t),
                "end": local_iso(d, end_t) if end_t else None,
                "venue": clean(session.get("site")),
                "address": address,
                "borough": find_borough(promoter, address),
                "lat": lat if isinstance(lat, (int, float)) else None,
                "lng": lng if isinstance(lng, (int, float)) else None,
                "links": session_links,
            })
    return events


def load(cache_dir=None, today: date | None = None) -> list[dict]:
    today = today or date.today()
    records = json.loads(http_get_retry(DATA_URL))
    if not isinstance(records, list):
        raise ValueError("Loisirs Montréal data is not a list")
    return [e for r in records for e in to_events(r, today)]
