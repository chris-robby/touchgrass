"""Helpers shared by the source adapters."""
from __future__ import annotations

import re
import time
import unicodedata
import urllib.request
from datetime import date, datetime, timedelta

USER_AGENT = "TouchGrass/0.1 (free Montreal events listing; uses montreal.ca open data)"

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
