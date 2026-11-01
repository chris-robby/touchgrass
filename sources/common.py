"""Helpers shared by the source adapters."""
from __future__ import annotations

import html
import re
import time
import unicodedata
import urllib.request
from datetime import date, datetime, timedelta

USER_AGENT = "TouchGrass/0.1 (free events listing; https://chris-robby.github.io/touchgrass/)"

# The 19 boroughs, spelled as in the Ville de Montréal events dataset.
BOROUGHS = [
    "Ahuntsic-Cartierville", "Anjou", "Côte-des-Neiges–Notre-Dame-de-Grâce", "Lachine", "LaSalle",
    "Le Plateau-Mont-Royal", "Le Sud-Ouest", "L'Île-Bizard–Sainte-Geneviève",
    "Mercier–Hochelaga-Maisonneuve", "Montréal-Nord", "Outremont", "Pierrefonds-Roxboro",
    "Rivière-des-Prairies–Pointe-aux-Trembles", "Rosemont–La Petite-Patrie", "Saint-Laurent",
    "Saint-Léonard", "Verdun", "Ville-Marie", "Villeray–Saint-Michel–Parc-Extension",
]


def clean(value) -> str | None:
    """Open data often writes missing values as the text "nan" or "None"."""
    if value is None:
        return None
    s = str(value).strip()
    return None if s in ("", "nan", "None", "NaN") else s


def http_get(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def http_get_retry(url: str, retries: int = 3, wait: float = 10.0, timeout: int = 120) -> bytes:
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            return http_get(url, timeout=timeout)
        except Exception as e:
            last_error = e
            print(f"  download attempt {attempt}/{retries} failed: {e}")
            if attempt < retries:
                time.sleep(wait)
    raise RuntimeError(f"Could not download {url}: {last_error}")


def _fold(s: str) -> str:
    """Lowercase, no accents, punctuation turned into spaces: for loose matching."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


_BOROUGH_KEYS = {_fold(b): b for b in BOROUGHS}


def find_borough(*texts: str | None) -> str | None:
    """First official borough name found in any of the texts (e.g. a promoter name)."""
    for text in texts:
        if not text:
            continue
        folded = f" {_fold(text)} "
        # Longest names first, so "Le Plateau-Mont-Royal" wins over shorter overlaps.
        for key in sorted(_BOROUGH_KEYS, key=len, reverse=True):
            if f" {key} " in folded:
                return _BOROUGH_KEYS[key]
        # Accept names without the leading article ("Plateau-Mont-Royal", "Sud-Ouest").
        for key, name in _BOROUGH_KEYS.items():
            if key.startswith(("le ", "l ")) and f" {key.split(' ', 1)[1]} " in folded:
                return name
    return None


def montreal_offset(day: date, hour: int = 12) -> str:
    """UTC offset in Montréal on that day/hour: "-04:00" in summer time, "-05:00" otherwise.

    Daylight time runs from 2 a.m. on the second Sunday of March to 2 a.m. on the
    first Sunday of November. Computed by hand so the pipeline needs no tz package
    (Windows Python has no timezone database by default).
    """
    def nth_sunday(year: int, month: int, n: int) -> date:
        first = date(year, month, 1)
        return first + timedelta(days=(6 - first.weekday()) % 7 + 7 * (n - 1))

    start = nth_sunday(day.year, 3, 2)
    end = nth_sunday(day.year, 11, 1)
    summer = (start < day < end) or (day == start and hour >= 2) or (day == end and hour < 2)
    return "-04:00" if summer else "-05:00"


def local_iso(day: date, hhmm: str) -> str:
    """date + "19:30[:00]" in Montréal -> "2026-11-07T19:30:00-05:00"."""
    h, m = (int(x) for x in hhmm.split(":")[:2])
    return datetime(day.year, day.month, day.day, h, m).isoformat() + montreal_offset(day, h)


_URL_RE = re.compile(r"(?:https?://|www[.:])[^\s,;()<>\"']+", re.I)
_DOMAIN_RE = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}$")


def extract_links(text: str) -> list[dict]:
    """Websites and social pages mentioned in free text, as [{"type", "url"}]."""
    links, seen = [], set()
    for raw in _URL_RE.findall(text or ""):
        url = raw.rstrip(".:!?")
        url = re.sub(r"^www:", "www.", url, flags=re.I)
        if not url.lower().startswith("http"):
            url = "https://" + url
        host = re.sub(r"^https?://", "", url, flags=re.I).split("/")[0].lower()
        if "@" in url or not _DOMAIN_RE.match(host):
            continue  # e-mail addresses or garbled text, not a usable link
        key = url.lower().rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        kind = ("facebook" if "facebook.com" in host else
                "instagram" if "instagram.com" in host else "website")
        links.append({"type": kind, "url": url})
    return links


def strip_html(text: str) -> str:
    """HTML fragment -> plain text with paragraph breaks."""
    import html as _html
    text = re.sub(r"<br\s*/?>", "\n", text or "")
    text = re.sub(r"</p>|</li>|</h\d>", "\n\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = _html.unescape(text).replace("\xa0", " ").replace("\u200b", "")
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


# Keyword -> category slug, French and English. The first match wins, so the
# order matters (e.g. "Faculty of Arts" must not make a math talk "art-craft").
CATEGORY_RULES = [
    (r"exhibit|exposition|\bexpo\b|vernissage|gallery|galerie|biennale", "exhibition"),
    (r"concert|r[ée]cital|music|musique|choir|chorale|orchestr|jazz", "music"),
    (r"\bfilms?\b|screening|projection|cin[ée]", "film"),
    (r"danc|danse", "dance"),
    (r"th[ée][aâ]tre|theater", "theatre"),
    (r"humour|comedy|stand-up", "comedy"),
    (r"cirque|circus", "circus"),
    (r"reading group|\bbooks?\b|livres?\b|po[ée]s|literat|litt[ée]rat|writing|[ée]criture", "books"),
    (r"language|langues?\b|conversation", "languages"),
    (r"yoga|mindful|pleine conscience|pr[ée]sence attentive|m[ée]ditat|wellness|bien-[êe]tre|well-being", "wellness"),
    (r"\bsports?\b|sportive|volley|basket|hockey|soccer|natation|\bv[ée]lo\b|cycling|athl[ée]t|citadins|carabins", "sport-outdoors"),
    (r"workshop|craft|drawing|dessin|paint|peinture|tricot|couture|bricolage", "art-craft"),
    (r"\bia\b|\bai\b|data|donn[ée]es|science|engineer|ing[ée]ni|tech|comput|informatique|math|algorith", "science-tech"),
    (r"histor|politi|society|soci[ée]t[ée]|citizen|citoyen|immigra|indigen|autochtone|climat|environnement|f[ée]minis|droit", "society-history"),
    (r"f[êe]te|festival|march[ée]\b|market|foire|\bfair\b", "festival-market"),
    (r"cuisine|cooking|culinaire", "cooking"),
    (r"\bjeux?\b|\bgames?\b|[ée]checs|chess", "games"),
]


def guess_category(*texts: str | None) -> str:
    text = " ".join(t for t in texts if t)
    for pattern, slug in CATEGORY_RULES:
        if re.search(pattern, text, re.I):
            return slug
    return "other"


def category_for(title: str, description: str) -> str:
    """The title decides when it can; the description only as a fallback (a talk
    described as "a conversation with…" is not a language group)."""
    slug = guess_category(title)
    return slug if slug != "other" else guess_category(description[:300])


# Stated prices (Ottawa universities: no price field, or often empty).
_PRICE_AMOUNT = re.compile(r"\$\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*\$")
_FREE_COST_RE = re.compile(r"^\s*(free|gratuit[e]?|0|\$?\s*0(?:\.00)?|no charge|none)\s*$", re.I)
_FREE_TEXT_RE = re.compile(r"free (?:admission|entry|event|of charge|and open|to attend)|admission is free|"
                        r"(?:is|are) free\b|entr[ée]e (?:libre|gratuite)|\bgratuit", re.I)


def stated_price(cost: str, text: str) -> tuple[float, float] | None:
    """(min, max) from a cost field, else from the description; None if not stated.

    Used where sources have no price field or often leave it empty: only an explicit
    "free" counts, and a dollar amount anywhere in the text (without a cost field)
    is too ambiguous, so the event is skipped rather than guessed.
    """
    cost = html.unescape(cost or "").strip()
    if cost:
        if _FREE_COST_RE.match(cost):
            return (0.0, 0.0)
        amounts = [float((a or b).replace(",", ".")) for a, b in _PRICE_AMOUNT.findall(cost)]
        if amounts:
            return (min(amounts), max(amounts))
        if re.search(r"\bfree\b", cost, re.I):
            return (0.0, 0.0)
        return None
    if _PRICE_AMOUNT.search(text):
        return None  # a price somewhere in the text, but not clearly the admission
    return (0.0, 0.0) if _FREE_TEXT_RE.search(text) else None
