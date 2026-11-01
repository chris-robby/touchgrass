"""Tests for the Carleton and uOttawa adapters (Ottawa).

Fixtures are real: three Carleton API records (cost "Free", cost "$150", no cost)
and two uOttawa event pages (a students-only weekly group, and a free public talk).
"""
import json
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sources import carleton, common, uottawa  # noqa: E402

FIX = ROOT / "tests" / "fixtures"
CU = json.loads((FIX / "carleton_events.json").read_text(encoding="utf-8"))
UO_WEEKLY = (FIX / "uottawa_weekly.html").read_text(encoding="utf-8")
UO_FREE = (FIX / "uottawa_public_free.html").read_text(encoding="utf-8")
TODAY = date(2026, 11, 1)


class StatedPriceTests(unittest.TestCase):
    def test_cost_field(self):
        self.assertEqual(common.stated_price("Free", ""), (0.0, 0.0))
        self.assertEqual(common.stated_price("0", ""), (0.0, 0.0))
        self.assertEqual(common.stated_price("$150-$200", ""), (150.0, 200.0))

    def test_text(self):
        self.assertEqual(common.stated_price("", "This is a free event, but registration is required."), (0.0, 0.0))
        self.assertEqual(common.stated_price("", "Entrée libre."), (0.0, 0.0))
        self.assertIsNone(common.stated_price("", "Join us for a talk."))
        self.assertIsNone(common.stated_price("", "Free for students, $10 for the public."))  # ambiguous

    def test_category_title_first(self):
        self.assertEqual(common.category_for("Guardrails: Regulating AI", "a conversation with two authors"), "science-tech")
        self.assertEqual(common.category_for("Portuguese Conversation Group", ""), "languages")


class CarletonTests(unittest.TestCase):
    def test_free_event(self):
        e = carleton.to_event(CU["free"], TODAY)
        self.assertIsNotNone(e)
        self.assertTrue(e["is_free"])
        self.assertEqual((e["city"], e["source"]), ("ottawa", "carleton"))
        self.assertEqual(e["start"], "2026-11-23T09:00:00-05:00")
        self.assertTrue(e["venue"].startswith("Carleton University"))
        self.assertEqual((e["lat"], e["lng"]), (carleton.CAMPUS["lat"], carleton.CAMPUS["lng"]))

    def test_paid_event_kept_with_its_price(self):
        # The pipeline's $10 limit removes it; the adapter reports the price it read.
        e = carleton.to_event(CU["paid"], TODAY)
        self.assertEqual((e["price_min"], e["is_free"]), (150.0, False))

    def test_unknown_price_skipped(self):
        self.assertIsNone(carleton.to_event(CU["unknown"], TODAY))

    def test_horizon(self):
        self.assertIsNone(carleton.to_event(CU["free"], date(2027, 3, 1)))
        self.assertIsNone(carleton.to_event(CU["free"], date(2026, 6, 1)))  # more than 60 days ahead

    def test_midnight_means_all_day(self):
        post = json.loads(json.dumps(CU["free"]))
        post["acf"]["cu_event_start_date"] = "2026-11-06 00:00:00"
        post["acf"]["cu_event_end_date"] = "2026-11-06 00:00:00"
        e = carleton.to_event(post, TODAY)
        self.assertEqual((e["start"], e["all_day"]), ("2026-11-06", True))


class UottawaTests(unittest.TestCase):
    def test_sidebar(self):
        f = uottawa.parse_page(UO_WEEKLY)
        self.assertEqual(f["title"], "Portuguese Conversation Group")
        self.assertEqual(f["when"], ["Sep 22, 2026 to Dec 23, 2026", "1:30 p.m. to 2:30 p.m.", "Every Tuesday"])
        self.assertEqual(f["where"][:2], ["In person", "Hamelin Hall (MHN)"])
        self.assertEqual(f["audience"], "Students")

    def test_students_only_skipped(self):
        f = uottawa.parse_page(UO_WEEKLY)
        self.assertEqual(uottawa.to_events("https://x/weekly", f, TODAY), [])

    def test_public_free_talk(self):
        f = uottawa.parse_page(UO_FREE)
        self.assertIn("General public", f["audience"])
        events = uottawa.to_events("https://x/guardrails", f, TODAY)
        self.assertEqual(len(events), 1)
        e = events[0]
        self.assertEqual(e["start"], "2026-11-02T11:30:00-05:00")
        self.assertEqual(e["end"], "2026-11-02T12:50:00-05:00")
        self.assertEqual((e["city"], e["is_free"], e["category"]), ("ottawa", True, "science-tech"))

    def test_sessions(self):
        weekly, _ = uottawa.sessions(["Sep 22, 2026 to Dec 23, 2026", "1:30 p.m. to 2:30 p.m.", "Every Tuesday"])
        self.assertEqual(len(weekly), 14)
        self.assertTrue(all(d.weekday() == 1 for d, _, _ in weekly))
        run, _ = uottawa.sessions(["Nov 5, 2026 to Nov 7, 2026", "8 p.m. to 9:45 p.m."])
        self.assertEqual([(d.day, s, e) for d, s, e in run], [(5, "20:00", "21:45"), (6, "20:00", "21:45"), (7, "20:00", "21:45")])
        expo, last = uottawa.sessions(["Oct 24, 2026 to Feb 7, 2027", "All day"])
        self.assertEqual((expo, last), ([(date(2026, 10, 24), None, None)], date(2027, 2, 7)))
        self.assertEqual(uottawa.sessions(["Nov 8, 2026", "12 p.m. to 1 p.m."])[0], [(date(2026, 11, 8), "12:00", "13:00")])


if __name__ == "__main__":
    unittest.main()
