"""Build each city's events.json from its source adapters.

Usage:  python scripts/build_data.py [--no-enrich] [--force] [--city ottawa]

  --no-enrich  skip fetching montreal.ca pages (faster; events have dates only)
  --force      write the output even if the event count dropped sharply
  --city X     only build one city

Cities never mix: each adapter names its CITY (default "montreal"), and each city
gets its own files (Montréal: data/events.json, others: data/<city>/events.json),
served on its own pages.

Steps per city: load each source -> keep upcoming events costing <= $10 -> enrich
with page details -> drop cancelled/ended -> dedupe -> sanity checks -> write.

If anything goes wrong for a city (download fails, zero events, big drop), its
previous files are left untouched, so the site keeps showing yesterday's listings
instead of an empty page, and the other cities still update. The script exits
with an error if any city failed (so the daily workflow reports it).
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sources import ADAPTERS  # noqa: E402

DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"

# Each city's output folder and a rough box around it: coordinates outside it are
# data errors (e.g. an online event's "venue" at 0,0) and would drag the map out
# to the whole world.
CITIES = {
    "montreal": {"dir": DATA_DIR, "lat": (45.3, 45.8), "lng": (-74.1, -73.4)},
    "ottawa": {"dir": DATA_DIR / "ottawa", "lat": (44.9, 45.6), "lng": (-76.4, -75.2)},
}

# Keep events costing at most this much (0 = free). Events with an unknown price are dropped.
MAX_PRICE = 10
# Fail if the new build has fewer than this share of the previous build's events.
MIN_RATIO_VS_PREVIOUS = 0.5


def montreal_now() -> datetime:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/Toronto"))
    except Exception:  # Windows without the tzdata package: EST is close enough
        return datetime.now(timezone(timedelta(hours=-5)))


def end_date(event: dict) -> date:
    return date.fromisoformat((event.get("end") or event["start"])[:10])


def has_ended(event: dict, now: datetime) -> bool:
    if event.get("all_day") or not event.get("end"):
        return end_date(event) < now.date()
    return datetime.fromisoformat(event["end"]) < now


def adapter_city(adapter) -> str:
    return getattr(adapter, "CITY", "montreal")


def valid_coordinates(event: dict, city: str) -> dict:
    lat, lng = event.get("lat"), event.get("lng")
    (lat0, lat1), (lng0, lng1) = CITIES[city]["lat"], CITIES[city]["lng"]
    if lat is None or lng is None or not (lat0 <= lat <= lat1 and lng0 <= lng <= lng1):
        event["lat"] = event["lng"] = None
    return event


def affordable(event: dict) -> bool:
    return event.get("price_min") is not None and event["price_min"] <= MAX_PRICE


def dedupe(events: list[dict]) -> list[dict]:
    seen, out = set(), []
    for e in events:
        if e["id"] not in seen:
            seen.add(e["id"])
            out.append(e)
    return out


def build(city: str, enrich: bool = True) -> list[dict]:
    now = montreal_now()  # Ottawa is in the same time zone
    all_events = []
    for adapter in ADAPTERS:
        if adapter_city(adapter) != city:
            continue
        print(f"[{city}/{adapter.SOURCE_ID}] loading...", flush=True)
        events = [{**valid_coordinates(e, city), "city": city} for e in adapter.load(CACHE_DIR)]
        print(f"  {len(events)} public activities in source")
        events = [e for e in events if affordable(e) and end_date(e) >= now.date()]
        print(f"  {len(events)} upcoming, free or <= ${MAX_PRICE}")
        if enrich and hasattr(adapter, "enrich"):
            events = adapter.enrich(events, CACHE_DIR / f"{adapter.SOURCE_ID}.json")
        events = [e for e in events if e["status"] != "cancelled" and not has_ended(e, now)]
        print(f"  {len(events)} after dropping cancelled/ended")
        all_events.extend(events)

    events = dedupe(all_events)
    events.sort(key=lambda e: (e["start"], e["title"]))
    return events


def previous_count(meta_file: Path) -> int | None:
    try:
        return json.loads(meta_file.read_text(encoding="utf-8"))["count"]
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        return None


def write_json(path: Path, data) -> None:
    """Write to a temp file first so a crash never leaves a half-written file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def build_city(city: str, args: list[str]) -> bool:
    """Build and write one city's files. False (and previous files kept) on failure."""
    out = CITIES[city]["dir"]
    events_file, meta_file = out / "events.json", out / "meta.json"
    try:
        events = build(city, enrich="--no-enrich" not in args)
    except Exception as e:
        print(f"ERROR [{city}]: build failed, keeping previous data. {e}", file=sys.stderr)
        return False

    if not events:
        print(f"ERROR [{city}]: zero events, keeping previous data.", file=sys.stderr)
        return False
    prev = previous_count(meta_file)
    if prev and len(events) < prev * MIN_RATIO_VS_PREVIOUS and "--force" not in args:
        print(f"ERROR [{city}]: only {len(events)} events vs {prev} last build; keeping previous "
              "data. Re-run with --force if this is expected.", file=sys.stderr)
        return False

    write_json(events_file, events)
    write_json(meta_file, {
        "city": city,
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(events),
        "with_time": sum(1 for e in events if not e["all_day"]),
        "with_coordinates": sum(1 for e in events if e["lat"] is not None),
        "free": sum(1 for e in events if e["is_free"]),
        "by_source": {s: sum(1 for e in events if e["source"] == s)
                      for s in sorted({e["source"] for e in events})},
    })
    print(f"Wrote {len(events)} events to {events_file.relative_to(ROOT)}")
    return True


def main() -> int:
    args = sys.argv[1:]
    cities = [args[args.index("--city") + 1]] if "--city" in args else list(CITIES)
    failed = [city for city in cities if not build_city(city, args)]
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
