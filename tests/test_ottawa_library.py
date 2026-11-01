"""Tests for the Ottawa Public Library adapter.

Fixtures are real: three items of the open-data RSS feed and one program page
(a weekly drop-in storytime with its full schedule).
"""
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sources import ottawa_library as opl  # noqa: E402

FIX = ROOT / "tests" / "fixtures"
FEED = (FIX / "opl_feed.xml").read_text(encoding="utf-8")
PAGE = (FIX / "opl_storytime.html").read_text(encoding="utf-8", errors="replace")
URL = "https://booking.biblioottawalibrary.ca/en/event/family-storytime-751"


class FeedTests(unittest.TestCase):
    def test_program_urls(self):
        urls = opl.parse_feed(FEED)
        self.assertEqual(len(urls), 3)
        self.assertTrue(all(u.startswith("https://booking.biblioottawalibrary.ca/en/event/") for u in urls))
        self.assertIn(URL, urls)


class PageTests(unittest.TestCase):
    def setUp(self):
        self.fields = opl.parse_page(PAGE)

    def test_fields(self):
        f = self.fields
        self.assertEqual(f["title"], "Family Storytime")
        self.assertEqual(f["branch"], "Rockcliffe Park")
        self.assertEqual(f["street"], "380 Springfield")
        self.assertEqual(f["age_group"], "Family")
        self.assertEqual(f["category"], "Storytime")
        self.assertIn("Drop-in", f["registration"])

    def test_full_schedule(self):
        sessions = self.fields["sessions"]
        self.assertEqual(len(sessions), 9)  # "9 sessions remaining"
        self.assertEqual(sessions[0], {"day": "2026-11-02", "time": "09:30", "minutes": 30})
        self.assertEqual(sessions[-1]["day"], "2026-12-28")

    def test_session_parsing(self):
        self.assertEqual(opl._session("Saturday, November 7, 2026 - 2:00pm Program Room 90 mins."),
                         {"day": "2026-11-07", "time": "14:00", "minutes": 90})
        self.assertEqual(opl._session("Monday, November 2, 2026 - 12:15am")["time"], "00:15")
        self.assertIsNone(opl._session("Sometime soon"))

    def test_single_session_card(self):
        card = "<span></span>  Sunday, Nov 08, 2026<br/>2:00pm<br/>60&nbsp;minutes"
        self.assertEqual(opl._single_session(card), {"day": "2026-11-08", "time": "14:00", "minutes": 60})


class EventTests(unittest.TestCase):
    def setUp(self):
        self.fields = opl.parse_page(PAGE)
        branches = {"rockcliffe park": {"lat": 45.447, "lng": -75.681}}
        self.events = opl.to_events(URL, self.fields, branches, date(2026, 11, 1))

    def test_one_event_per_session(self):
        self.assertEqual(len(self.events), 9)
        self.assertEqual(len({e["id"] for e in self.events}), 9)

    def test_record(self):
        e = self.events[0]
        self.assertEqual(e["start"], "2026-11-02T09:30:00-05:00")  # after the DST change
        self.assertEqual(e["end"], "2026-11-02T10:00:00-05:00")
        self.assertEqual((e["city"], e["source"]), ("ottawa", "ottawa-library"))
        self.assertTrue(e["is_free"])
        self.assertEqual((e["category"], e["audience"], e["registration"]), ("storytime", "family", "drop-in"))
        self.assertEqual((e["venue"], e["borough"]), ("Ottawa Public Library", "Rockcliffe Park"))
        self.assertEqual((e["lat"], e["lng"]), (45.447, -75.681))

    def test_horizon(self):
        self.assertEqual(opl.to_events(URL, self.fields, {}, date(2027, 6, 1)), [])
        later = opl.to_events(URL, self.fields, {}, date(2026, 12, 20))
        self.assertEqual([e["start"][:10] for e in later], ["2026-12-21", "2026-12-28"])

    def test_paid_program_skipped(self):
        paid = {**self.fields, "description": "Workshop fee: $25, materials included."}
        self.assertEqual(opl.to_events(URL, paid, {}, date(2026, 11, 1)), [])

    def test_audiences(self):
        self.assertEqual(opl.audience_for("Babies (0-18 months)"), "preschool")
        self.assertEqual(opl.audience_for("Teens"), "teens")
        self.assertEqual(opl.audience_for("Adult"), "adults")
        self.assertEqual(opl.audience_for(""), "all")

    def test_branch_key(self):
        self.assertEqual(opl._branch_key("Rockcliffe Park Branch"), opl._branch_key("Rockcliffe Park"))
        self.assertEqual(opl._branch_key("Orléans"), "orleans")
        self.assertEqual(opl._branch_key("St-Laurent"), "saint laurent")


if __name__ == "__main__":
    unittest.main()
