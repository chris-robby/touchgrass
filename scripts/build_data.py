"""Build data/events.json from every source adapter.

Usage:  python scripts/build_data.py [--no-enrich] [--force]

  --no-enrich  skip fetching montreal.ca pages (faster; events have dates only)
  --force      write the output even if the event count dropped sharply

Steps: load each source -> keep free, upcoming events -> enrich with page
details -> drop cancelled/ended -> dedupe -> sanity checks -> write.

If anything goes wrong (download fails, zero events, big drop), the script
exits with an error and leaves the previous data/events.json untouched, so the
site keeps showing yesterday's listings instead of an empty page.
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
EVENTS_FILE = DATA_DIR / "events.json"
META_FILE = DATA_DIR / "meta.json"
CACHE_DIR = DATA_DIR / "cache"

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


def dedupe(events: list[dict]) -> list[dict]:
    seen, out = set(), []
    for e in events:
        if e["id"] not in seen:
            seen.add(e["id"])
            out.append(e)
    return out


def build(enrich: bool = True) -> list[dict]:
    now = montreal_now()
    all_events = []
    for adapter in ADAPTERS:
        print(f"[{adapter.SOURCE_ID}] loading...", flush=True)
        events = adapter.load()
        print(f"  {len(events)} public activities in source")
        events = [e for e in events if e["is_free"] and end_date(e) >= now.date()]
        print(f"  {len(events)} free and upcoming")
        if enrich and hasattr(adapter, "enrich"):
            events = adapter.enrich(events, CACHE_DIR / f"{adapter.SOURCE_ID}.json")
        events = [e for e in events if e["status"] != "cancelled" and not has_ended(e, now)]
        print(f"  {len(events)} after dropping cancelled/ended")
        all_events.extend(events)

    events = dedupe(all_events)
    events.sort(key=lambda e: (e["start"], e["title"]))
    return events


def previous_count() -> int | None:
    try:
        return json.loads(META_FILE.read_text(encoding="utf-8"))["count"]
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        return None


def write_json(path: Path, data) -> None:
    """Write to a temp file first so a crash never leaves a half-written file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def main() -> int:
    args = set(sys.argv[1:])
    try:
        events = build(enrich="--no-enrich" not in args)
    except Exception as e:
        print(f"ERROR: build failed, keeping previous data. {e}", file=sys.stderr)
        return 1

    if not events:
        print("ERROR: zero events, keeping previous data.", file=sys.stderr)
        return 1
    prev = previous_count()
    if prev and len(events) < prev * MIN_RATIO_VS_PREVIOUS and "--force" not in args:
        print(f"ERROR: only {len(events)} events vs {prev} last build; keeping previous "
              "data. Re-run with --force if this is expected.", file=sys.stderr)
        return 1

    write_json(EVENTS_FILE, events)
    write_json(META_FILE, {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(events),
        "with_time": sum(1 for e in events if not e["all_day"]),
        "with_coordinates": sum(1 for e in events if e["lat"] is not None),
        "sources": sorted({e["source"] for e in events}),
    })
    print(f"Wrote {len(events)} events to {EVENTS_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
