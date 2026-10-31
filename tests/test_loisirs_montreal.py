"""Tests for the Loisirs Montréal adapter and the shared helpers.

Fixtures (tests/fixtures/loisirs.json) are real records from the dataset.
"""
import json
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sources import common  # noqa: E402
from sources import loisirs_montreal as lm  # noqa: E402

FIX = json.loads((ROOT / "tests" / "fixtures" / "loisirs.json").read_text(encoding="utf-8"))
TODAY = date(2026, 10, 31)  # a Saturday


class PriceTests(unittest.TestCase):
    def test_free_wording(self):
        self.assertEqual(lm.parse_price(["Activité : gratuite pour tous."]), (0.0, 0.0))
        self.assertEqual(lm.parse_price(["Bain libre gratuit."]), (0.0, 0.0))
        self.assertEqual(lm.parse_price(["La pratique est libre et gratuite."]), (0.0, 0.0))

    def test_gratuit_about_something_else_is_ignored(self):
        self.assertIsNone(lm.parse_price(["La carte est remise gratuitement à tous les résidents."]))
        self.assertIsNone(lm.parse_price(["Vignette de stationnement gratuit lors de l'inscription."]))

    def test_amounts(self):
        texts = ["Coût : 6,5 $ par personne. (Résident)", "Coût : 3,25 $ par personne. (65 ans +)",
                 "Coût : 8 $ par personne. (Non-résident)"]
        self.assertEqual(lm.parse_price(texts), (3.25, 8.0))

    def test_fees_rentals_and_discounts_are_not_prices(self):
        self.assertIsNone(lm.parse_price(["Des frais administratifs de 20 $ peuvent s'appliquer."]))
        self.assertIsNone(lm.parse_price(["Le tarif est de 19 $/heure, non remboursable."]))
        self.assertIsNone(lm.parse_price(["Obtenez 5 $ de rabais."]))

    def test_unknown(self):
        self.assertIsNone(lm.parse_price(["Détenir une carte biblio-loisirs."]))

    def test_labels(self):
        self.assertEqual(lm.price_label(0, 0), "Gratuit")
        self.assertEqual(lm.price_label(6.5, 6.5), "6,50 $")
        self.assertEqual(lm.price_label(3.25, 8), "3,25 $ – 8 $")
        self.assertEqual(lm.price_label(0, 5), "Gratuit – 5 $")


class RecordTests(unittest.TestCase):
    def test_free_drop_in_becomes_weekly_events(self):
        events = lm.to_events(FIX["free_skating"], TODAY)
        self.assertTrue(events)
        e = events[0]
        self.assertTrue(e["is_free"])
        self.assertEqual(e["registration"], "drop-in")
        self.assertEqual(e["borough"], "Le Sud-Ouest")
        self.assertTrue(e["url"].startswith("https://loisirs.montreal.ca/"))
        self.assertTrue(all(ev["start"][:10] >= "2026-10-31" for ev in events))
        self.assertLessEqual(max(ev["start"][:10] for ev in events), "2026-12-12")  # 42-day window
        self.assertEqual(len({ev["id"] for ev in events}), len(events))

    def test_priced_drop_in(self):
        e = lm.to_events(FIX["priced_hockey"], TODAY)[0]
        self.assertFalse(e["is_free"])
        self.assertEqual((e["price_min"], e["price_max"]), (3.25, 8.0))

    def test_excluded_records(self):
        for key in ("hourly_rental", "no_price", "registration_required", "cancelled"):
            with self.subTest(key):
                self.assertEqual(lm.to_events(FIX[key], TODAY), [])

    def test_sessions_written_as_text_are_parsed(self):
        sessions = lm.as_list(FIX["string_sessions"]["seances"])
        self.assertTrue(sessions)
        self.assertIsInstance(sessions[0], dict)

    def test_session_dates(self):
        record = {"date_debut": "2026-10-01", "date_fin": "2026-11-30"}
        days = lm.session_dates(record, {"jour_semaine": "Mardi"}, TODAY)
        self.assertEqual(days[0], date(2026, 11, 3))
        self.assertTrue(all(d.weekday() == 1 for d in days))
        self.assertEqual(lm.session_dates(record, {"jour_semaine": ""}, TODAY), [])

    def test_address_cleanup(self):
        self.assertEqual(lm.clean_address("330 80e Avenue , LaSalle, H8R2T3"), "330 80e Avenue, LaSalle, H8R 2T3")


class CommonTests(unittest.TestCase):
    def test_daylight_saving(self):
        self.assertEqual(common.montreal_offset(date(2026, 10, 31)), "-04:00")
        self.assertEqual(common.montreal_offset(date(2026, 11, 1), hour=1), "-04:00")
        self.assertEqual(common.montreal_offset(date(2026, 11, 1), hour=3), "-05:00")
        self.assertEqual(common.montreal_offset(date(2027, 1, 15)), "-05:00")
        self.assertEqual(common.montreal_offset(date(2027, 3, 14), hour=3), "-04:00")
        self.assertEqual(common.local_iso(date(2026, 11, 7), "19:30:00"), "2026-11-07T19:30:00-05:00")

    def test_find_borough(self):
        self.assertEqual(common.find_borough("Arrondissement de Verdun"), "Verdun")
        self.assertEqual(common.find_borough("Côte-des-Neiges - Notre-Dame-de-Grâce"),
                         "Côte-des-Neiges–Notre-Dame-de-Grâce")
        self.assertEqual(common.find_borough("Plateau-Mont-Royal"), "Le Plateau-Mont-Royal")
        self.assertEqual(common.find_borough("Association du Centre", "7800 boul. X, Anjou, H1K 1A1"), "Anjou")
        self.assertIsNone(common.find_borough("Association quelconque"))

    def test_extract_links(self):
        links = common.extract_links(
            "Infos : www.e-cirqueverdun.com/ et www.facebook.com/ecoledecirquedeverdun. "
            "Écrire à www.activités@ppev.ca ou www:asccs.qc.ca")
        self.assertEqual(links, [
            {"type": "website", "url": "https://www.e-cirqueverdun.com/"},
            {"type": "facebook", "url": "https://www.facebook.com/ecoledecirquedeverdun"},
            {"type": "website", "url": "https://www.asccs.qc.ca"},
        ])


if __name__ == "__main__":
    unittest.main()
