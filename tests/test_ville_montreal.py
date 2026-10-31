"""Tests for the Ville de Montréal adapter and the build filters.

Run:  python -m unittest discover tests

Fixtures are real records from the dataset (tests/fixtures/features.json) and
the JSON-LD part of two real montreal.ca event pages.
"""
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from sources import ville_montreal as vm  # noqa: E402
import build_data  # noqa: E402

FIXTURES = ROOT / "tests" / "fixtures"
FEATURES = json.loads((FIXTURES / "features.json").read_text(encoding="utf-8"))
EST = timezone(timedelta(hours=-5))


class CleanTests(unittest.TestCase):
    def test_nan_and_none_strings_are_blank(self):
        for v in ("nan", "None", "", "  ", None):
            self.assertIsNone(vm.clean(v))
        self.assertEqual(vm.clean(" Verdun "), "Verdun")

    def test_strip_html(self):
        self.assertEqual(vm.strip_html("<p>Un&nbsp;livre</p><p>Deux &amp; trois</p>"),
                         "Un livre\n\nDeux & trois")


class PriceTests(unittest.TestCase):
    def test_gratuit_is_free_with_zero_price(self):
        e = vm.normalize(FEATURES["free_with_coords"])
        self.assertTrue(e["is_free"])
        self.assertEqual(e["price_min"], 0)
        self.assertEqual(e["price_label"], "Gratuit")

    def test_payant_has_unknown_price(self):
        e = vm.normalize(FEATURES["paid"])
        self.assertFalse(e["is_free"])
        self.assertIsNone(e["price_min"])
        self.assertEqual(e["price_label"], "Payant")


class NormalizeTests(unittest.TestCase):
    def test_basic_fields(self):
        e = vm.normalize(FEATURES["free_with_coords"])
        self.assertEqual(e["title"], "Heure du conte")
        self.assertTrue(e["id"].startswith("mtl-"))
        self.assertEqual(e["category"], "storytime")
        self.assertTrue(e["all_day"])
        self.assertEqual(e["source"], "ville-de-montreal")
        self.assertIsNotNone(e["lat"])

    def test_civic_events_are_dropped(self):
        self.assertIsNone(vm.normalize(FEATURES["council"]))

    def test_missing_type_becomes_other(self):
        self.assertEqual(vm.normalize(FEATURES["type_nan"])["category"], "other")

    def test_missing_coordinates(self):
        e = vm.normalize(FEATURES["no_coords"])
        self.assertIsNone(e["lat"])
        self.assertIsNone(e["lng"])

    def test_broken_coordinates_are_rejected(self):
        # This real record has lat == long == -73.567 in both places.
        e = vm.normalize(FEATURES["with_address"])
        self.assertIsNone(e["lat"])

    def test_address_and_venue(self):
        e = vm.normalize(FEATURES["with_address"])
        self.assertEqual(e["venue"], "Église Notre-Dame-des-Sept-Douleurs")
        self.assertEqual(e["address"], "4155, rue Wellington, Montréal H4G 1V7")
        self.assertIsNone(vm.normalize(FEATURES["free_with_coords"])["venue"])

    def test_multi_day(self):
        e = vm.normalize(FEATURES["multi_day"])
        self.assertLess(e["start"], e["end"])

    def test_id_is_stable_without_url(self):
        a = vm.event_id(None, "Titre", "2026-11-01")
        self.assertEqual(a, vm.event_id(None, "Titre", "2026-11-01"))
        self.assertNotEqual(a, vm.event_id(None, "Titre", "2026-11-02"))


class PageTests(unittest.TestCase):
    def test_parse_page(self):
        d = vm.parse_page((FIXTURES / "event_page.html").read_text(encoding="utf-8"))
        self.assertEqual(d["start"], "2026-11-14T10:30:00-05:00")
        self.assertEqual(d["end"], "2026-11-14T11:30:00-05:00")
        self.assertEqual(d["venue"], "Bibliothèque interculturelle")
        self.assertEqual(d["address"], "6767, chemin de la Côte-des-Neiges, Montréal H3S 2T6")
        self.assertEqual(d["status"], "scheduled")

    def test_parse_page_without_street_address(self):
        d = vm.parse_page((FIXTURES / "event_page_multiday.html").read_text(encoding="utf-8"))
        self.assertEqual(d["venue"], "Bibliothèque Saul-Bellow")
        self.assertIsNone(d["address"])

    def test_parse_page_without_jsonld(self):
        self.assertIsNone(vm.parse_page("<html><body>nothing</body></html>"))

    def test_apply_details_adds_times_and_venue(self):
        e = vm.normalize(FEATURES["free_with_coords"])
        d = vm.parse_page((FIXTURES / "event_page.html").read_text(encoding="utf-8"))
        merged = vm.apply_details(e, d)
        self.assertFalse(merged["all_day"])
        self.assertEqual(merged["start"], d["start"])
        self.assertEqual(merged["venue"], "Bibliothèque interculturelle")
        self.assertEqual(merged["lat"], e["lat"])  # untouched fields survive

    def test_apply_details_none_keeps_event(self):
        e = vm.normalize(FEATURES["free_with_coords"])
        self.assertEqual(vm.apply_details(e, None), e)


class BuildFilterTests(unittest.TestCase):
    now = datetime(2026, 11, 14, 12, 0, tzinfo=EST)

    def test_all_day_event_ends_at_end_of_day(self):
        self.assertFalse(build_data.has_ended({"start": "2026-11-14", "end": "2026-11-14",
                                               "all_day": True}, self.now))
        self.assertTrue(build_data.has_ended({"start": "2026-11-13", "end": "2026-11-13",
                                              "all_day": True}, self.now))

    def test_timed_event_ends_at_its_end_time(self):
        morning = {"start": "2026-11-14T10:30:00-05:00", "end": "2026-11-14T11:30:00-05:00",
                   "all_day": False}
        evening = {"start": "2026-11-14T19:00:00-05:00", "end": "2026-11-14T21:00:00-05:00",
                   "all_day": False}
        self.assertTrue(build_data.has_ended(morning, self.now))
        self.assertFalse(build_data.has_ended(evening, self.now))

    def test_dedupe_keeps_first(self):
        out = build_data.dedupe([{"id": "a", "n": 1}, {"id": "a", "n": 2}, {"id": "b"}])
        self.assertEqual([e.get("n") for e in out], [1, None])


if __name__ == "__main__":
    unittest.main()
