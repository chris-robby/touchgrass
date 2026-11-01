"""Tests for the UQAM and Université de Montréal adapters.

Fixtures are real: two UQAM API records and a trimmed UdeM activity page.
"""
import json
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sources import common, udem, uqam  # noqa: E402

FIX = ROOT / "tests" / "fixtures"
UQAM = json.loads((FIX / "uqam_events.json").read_text(encoding="utf-8"))
UDEM_PAGE = (FIX / "udem_activity.html").read_text(encoding="utf-8")


class UqamTests(unittest.TestCase):
    def test_price_types(self):
        self.assertEqual(uqam.parse_price(UQAM["free"]), (0.0, 0.0))
        self.assertIsNone(uqam.parse_price(UQAM["unknown"]))

    def test_general_public_rate_wins(self):
        event = {"price_type": "FIXED", "prices": [
            {"value": "10.00", "description": "Adulte"},
            {"value": "5.00", "description": "Étudiant.e UQAM / Employé.e"}]}
        self.assertEqual(uqam.parse_price(event), (10.0, 10.0))
        only_student = {"price_type": "FIXED", "prices": [{"value": "5.00", "description": "Étudiant"}]}
        self.assertEqual(uqam.parse_price(only_student), (5.0, 5.0))

    def test_free_in_notes(self):
        self.assertEqual(uqam.parse_price({"price_type": None, "price_notes": "Entrée libre"}), (0.0, 0.0))

    def test_events_from_dates(self):
        first = datetime.strptime(UQAM["free"]["dates"][0]["start_date"], "%Y-%m-%d %H:%M:%S").date()
        events = uqam.to_events(UQAM["free"], first)
        self.assertTrue(events)
        e = events[0]
        self.assertTrue(e["is_free"])
        self.assertEqual(e["source"], "uqam")
        self.assertIsNotNone(e["lat"])
        self.assertEqual(len({ev["id"] for ev in events}), len(events))

    def test_horizon(self):
        first = datetime.strptime(UQAM["free"]["dates"][0]["start_date"], "%Y-%m-%d %H:%M:%S").date()
        self.assertEqual(uqam.to_events(UQAM["free"], first + timedelta(days=400)), [])

    def test_unknown_price_skipped(self):
        self.assertEqual(uqam.to_events(UQAM["unknown"], date(2026, 10, 31)), [])


class UdemTests(unittest.TestCase):
    def test_parse_page(self):
        d = udem.parse_page(UDEM_PAGE)
        self.assertIn("algorithmes", d["title"].lower())
        self.assertEqual(d["price"], "Gratuit")
        self.assertEqual(d["mode"], "En personne")
        self.assertEqual(d["venue"], "Pub La Cale")
        self.assertIn("6839 rue Saint-Hubert", d["address"])
        self.assertNotIn("<", d["address"])
        self.assertTrue(d["ticket"])

    def test_when(self):
        self.assertEqual(udem.parse_when("mercredi 4 novembre 2026, 18:00 à 21:00"),
                         ("2026-11-04T18:00:00-05:00", "2026-11-04T21:00:00-05:00", False))
        self.assertEqual(udem.parse_when("dimanche 1 er novembre 2026, 13:30 à 17:00")[0], "2026-11-01T13:30:00-05:00")
        self.assertEqual(udem.parse_when("Du lundi 2 novembre 2026, 09:00 au mercredi 2 décembre 2026, 17:00"),
                         ("2026-11-02T09:00:00-05:00", "2026-12-02T17:00:00-05:00", False))
        self.assertEqual(udem.parse_when("samedi 31 octobre 2026, 10:00 à 12:30")[0], "2026-10-31T10:00:00-04:00")
        self.assertIsNone(udem.parse_when("À venir"))

    def test_price(self):
        self.assertEqual(udem.parse_price("Gratuit"), (0.0, 0.0))
        self.assertEqual(udem.parse_price("6,25 $ à 8,75 $"), (6.25, 8.75))
        self.assertEqual(udem.parse_price("0 $ à 33 $"), (33.0, 33.0))  # $0 is a members' rate
        self.assertIsNone(udem.parse_price(""))

    def test_full_or_cancelled_skipped(self):
        d = udem.parse_page(UDEM_PAGE)
        for status in ("complet", "annule"):
            self.assertIsNone(udem.to_event("https://x/activite/a", {**d, "status": status}, []))

    def test_series_key_and_feed(self):
        self.assertEqual(udem.series_key("https://calendrier.umontreal.ca/activite/curiosa-12"),
                         "https://calendrier.umontreal.ca/activite/curiosa")
        xml = ("<rss><channel><item><title>Concert</title><link>https://calendrier.umontreal.ca/activite/concert-1</link>"
               "<pubDate>Tue, 03 Nov 2026 19:30:00 -0500</pubDate><category>musique</category></item></channel></rss>")
        items = udem.parse_feed(xml)
        self.assertEqual(items[0]["tags"], ["musique"])
        self.assertEqual(items[0]["start"], datetime(2026, 11, 3, 19, 30, tzinfo=timezone(timedelta(hours=-5))))

    def test_exhibition_series_merged(self):
        d = {**udem.parse_page(UDEM_PAGE), "when": "samedi 31 octobre 2026, 10:00 à 17:00"}
        e = udem.to_event("https://x/activite/expo-3", d, ["exposition"],
                          series_end=datetime(2026, 12, 17, 10, tzinfo=timezone.utc))
        self.assertEqual(e["start"][:10], "2026-10-31")
        self.assertEqual(e["end"], "2026-12-17T17:00:00-05:00")
        self.assertEqual(e["url"], "https://x/activite/expo")


class CategoryTests(unittest.TestCase):
    def test_guess_category(self):
        self.assertEqual(common.guess_category("Exposition L'UdeM sur deux roues"), "exhibition")
        self.assertEqual(common.guess_category("Discover Your Path in Mathematics", "Faculty of Arts and Science"),
                         "science-tech")
        self.assertEqual(common.guess_category("Citadins Volleyball féminin"), "sport-outdoors")
        self.assertEqual(common.guess_category("Ciné-campus : Primetime"), "film")
        self.assertEqual(common.guess_category("Séance d'information"), "other")


if __name__ == "__main__":
    unittest.main()
