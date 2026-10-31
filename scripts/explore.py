"""Phase 0: download the Ville de Montréal events GeoJSON and describe what's in it.

Usage:  python scripts/explore.py [--refresh]

The raw file is cached in data/raw/evenements.geojson so repeated runs are fast.
Pass --refresh to download it again.
"""
import json
import sys
import urllib.request
from collections import Counter
from pathlib import Path

URL = (
    "https://donnees.montreal.ca/dataset/6a4cbf2c-c9b7-413a-86b1-e8f7081e2578"
    "/resource/35307457-a00f-4912-9941-8095ead51f6e/download/evenements.geojson"
)
CACHE = Path(__file__).resolve().parent.parent / "data" / "raw" / "evenements.geojson"

# Fields with few distinct values: print every value with its count.
# Fields with many distinct values: print a few examples only.
MAX_DISTINCT_TO_LIST = 60


def load(refresh: bool) -> dict:
    if refresh or not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {URL} ...")
        with urllib.request.urlopen(URL, timeout=60) as resp:
            CACHE.write_bytes(resp.read())
    return json.loads(CACHE.read_text(encoding="utf-8"))


def short(value, n=80) -> str:
    s = repr(value)
    return s if len(s) <= n else s[: n - 3] + "..."


def section(title: str) -> None:
    print("\n" + "=" * 70 + f"\n{title}\n" + "=" * 70)


def main() -> None:
    data = load("--refresh" in sys.argv)
    features = data.get("features", [])
    props = [f.get("properties") or {} for f in features]

    section("1. Overview")
    print(f"Top-level keys: {list(data.keys())}")
    print(f"Number of features: {len(features)}")

    section("2. Property names (with fill rate, distinct count, examples)")
    keys = Counter(k for p in props for k in p)
    for key, present in keys.most_common():
        values = [p.get(key) for p in props]
        filled = [v for v in values if v not in (None, "")]
        distinct = Counter(map(str, filled))
        print(f"\n- {key}: present in {present}, non-empty in {len(filled)}, "
              f"{len(distinct)} distinct")
        if len(distinct) <= MAX_DISTINCT_TO_LIST:
            for val, count in distinct.most_common():
                print(f"    {count:5d}  {short(val)}")
        else:
            for val, _ in distinct.most_common(5):
                print(f"    e.g. {short(val, 120)}")

    section("3. Geometry")
    geom_types = Counter((f.get("geometry") or {}).get("type") for f in features)
    print(f"Geometry types: {dict(geom_types)}")
    missing = sum(1 for f in features if not (f.get("geometry") or {}).get("coordinates"))
    print(f"Features without coordinates: {missing}")
    if features:
        print(f"Example geometry: {features[0].get('geometry')}")

    section("4. One full example record")
    if props:
        print(json.dumps(props[0], ensure_ascii=False, indent=2))

    deep_dive(props)


def is_blank(v) -> bool:
    return v is None or str(v).strip() in ("", "nan", "None")


def deep_dive(props: list) -> None:
    import re
    from datetime import date

    today = date.today().isoformat()

    section("5. Dates")
    starts = sorted(p["date_debut"] for p in props if not is_blank(p.get("date_debut")))
    ends = sorted(p["date_fin"] for p in props if not is_blank(p.get("date_fin")))
    print(f"date_debut range: {starts[0]} -> {starts[-1]}")
    print(f"date_fin range:   {ends[0]} -> {ends[-1]}")
    print(f"Date format examples: {starts[:3]}  (any with a time? "
          f"{any('T' in s or ':' in s for s in starts + ends)})")
    past = sum(1 for p in props if p["date_fin"] < today)
    print(f"Already ended (date_fin < {today}): {past}")
    print(f"Upcoming or ongoing: {len(props) - past}")
    multi = [p for p in props if p["date_fin"] != p["date_debut"]]
    print(f"Multi-day (date_fin != date_debut): {len(multi)}")
    for p in multi[:5]:
        print(f"    {p['date_debut']} -> {p['date_fin']}  {short(p['titre'], 60)}")
    upcoming = sorted(p["date_debut"] for p in props if p["date_debut"] >= today)
    by_month = Counter(s[:7] for s in upcoming)
    print(f"Upcoming events by start month: {dict(sorted(by_month.items()))}")

    section("6. Duplicates and recurring events")
    url_ids = [re.search(r"-(\d+)$", p["url_fiche"]) for p in props]
    print(f"url_fiche ends with a numeric id: {sum(1 for m in url_ids if m)} / {len(props)}")
    print(f"Distinct url_fiche: {len(set(p['url_fiche'] for p in props))}")
    full_dupes = Counter(json.dumps(p, sort_keys=True, ensure_ascii=False) for p in props)
    print(f"Exact duplicate records: {sum(c - 1 for c in full_dupes.values() if c > 1)}")
    key = Counter((p["titre"], p["date_debut"], p["arrondissement"], p["adresse_principale"])
                  for p in props)
    print(f"Same title+date+borough+address but different record: "
          f"{sum(c - 1 for c in key.values() if c > 1)}")
    for k, c in [kv for kv in key.most_common(5) if kv[1] > 1]:
        print(f"    x{c}  {k}")
    titles = Counter(p["titre"] for p in props)
    print("Most repeated titles (recurring = one record per occurrence?):")
    for t, c in titles.most_common(8):
        print(f"    x{c:3d}  {short(t, 70)}")

    section("7. Cost details")
    payant = [p for p in props if p["cout"] == "Payant"]
    print(f"Payant records: {len(payant)}. Do descriptions mention a price?")
    money = re.compile(r"\d+(?:[.,]\d{2})?\s?\$|\$\s?\d+")
    with_amount = [p for p in payant if money.search(p["description"] + " " + p["titre"])]
    print(f"  Payant with a $ amount in title/description: {len(with_amount)}")
    for p in with_amount[:8]:
        found = money.findall(p["description"] + " " + p["titre"])
        print(f"    {found}  {short(p['titre'], 60)}")
    print("  Payant examples without amount:")
    for p in [p for p in payant if p not in with_amount][:5]:
        print(f"    {short(p['titre'], 50)} | {short(p['description'], 90)}")
    print("Cost x inscription:")
    for (c, i), n in Counter((p["cout"], p["inscription"]) for p in props).most_common():
        print(f"    {n:5d}  {c} / {i}")

    section("8. Non-activity types")
    civic = ["Conseil et comité", "Consultation publique", "Assemblée publique",
             "Rencontre avec personne élue"]
    for t in civic:
        sample = [p["titre"] for p in props if p["type_evenement"] == t][:4]
        print(f"- {t}: {sum(1 for p in props if p['type_evenement'] == t)}")
        for s in sample:
            print(f"    e.g. {short(s, 90)}")
    print("Titles containing 'séance' or 'conseil' outside these types:")
    for p in props:
        if p["type_evenement"] not in civic and re.search(r"séance|conseil d", p["titre"], re.I):
            print(f"    [{p['type_evenement']}] {short(p['titre'], 80)}")
    print("Records with type 'nan':")
    for p in props:
        if is_blank(p["type_evenement"]):
            print(f"    {short(p['titre'], 80)}")

    section("9. Location quality")
    print(f"titre_adresse blank: {sum(is_blank(p['titre_adresse']) for p in props)}")
    print(f"adresse_principale blank: {sum(is_blank(p['adresse_principale']) for p in props)}")
    print(f"lat/long blank: {sum(is_blank(p.get('lat')) for p in props)}")
    print("Emplacement for records without coordinates:",
          dict(Counter(p["emplacement"] for p in props if is_blank(p.get("lat")))))
    print("Most common lat/long (venue reuse):")
    for ll, c in Counter((p.get("lat"), p.get("long")) for p in props).most_common(4):
        print(f"    x{c}  {ll}")

    section("10. Language")
    en_words = re.compile(r"\b(the|and|with|for|your|join|free)\b", re.I)
    fr_words = re.compile(r"\b(le|la|les|et|avec|pour|des|vous)\b", re.I)
    en = sum(1 for p in props if len(en_words.findall(p["description"]))
             > len(fr_words.findall(p["description"])))
    print(f"Descriptions that look English: {en} / {len(props)}")
    for p in [p for p in props if len(en_words.findall(p["description"]))
              > len(fr_words.findall(p["description"]))][:5]:
        print(f"    {short(p['titre'], 50)} | {short(p['description'], 70)}")
    lengths = sorted(len(p["description"]) for p in props)
    print(f"Description length: min {lengths[0]}, median {lengths[len(lengths)//2]}, "
          f"max {lengths[-1]}")


if __name__ == "__main__":
    main()
