"""Tests for the Concordia events adapter.

Date, cost and place strings below are copied from real concordia.ca event pages;
tests/fixtures/concordia_event.html is a trimmed real page.
"""
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sources import concordia as cu  # noqa: E402

PAGE = (ROOT / "tests" / "fixtures" / "concordia_event.html").read_text(encoding="utf-8")


class WhenTests(unittest.TestCase):
    def test_single_slot(self):
        self.assertEqual(cu.parse_when("Monday, November 2, 2026 12 p.m. – 1 p.m."),
                         ("2026-11-02T12:00:00-05:00", "2026-11-02T13:00:00-05:00", False))

    def test_minutes_and_register_link(self):
        self.assertEqual(cu.parse_when("Thursday, November 5, 2026 11:30 a.m. – 1 p.m. Register now"),
                         ("2026-11-05T11:30:00-05:00", "2026-11-05T13:00:00-05:00", False))

    def test_exhibition_all_day(self):
        self.assertEqual(cu.parse_when("Tuesday, September 8, 2026 – Friday, November 20, 2026 (all day)"),
                         ("2026-09-08", "2026-11-20", True))

    def test_several_days_with_hours(self):
        start, end, all_day = cu.parse_when(
            "Wednesday, November 4, 2026 – Friday, November 6, 2026 11 a.m. – 7 p.m. Register now")
        self.assertEqual((start, end, all_day),
                         ("2026-11-04T11:00:00-05:00", "2026-11-06T19:00:00-05:00", False))

    def test_daylight_time_and_noon_midnight(self):
        self.assertEqual(cu.parse_when("Friday, October 30, 2026 12 a.m. – 12 p.m.")[:2],
                         ("2026-10-30T00:00:00-04:00", "2026-10-30T12:00:00-04:00"))

    def test_no_date(self):
        self.assertIsNone(cu.parse_when("To be announced"))


class CostTests(unittest.TestCase):
    def test_free(self):
        for text in ("This event is free.", "This event is free", "Free", "0"):
            self.assertEqual(cu.parse_cost(text), (0.0, 0.0), text)

    def test_amounts(self):
        self.assertEqual(cu.parse_cost("Donate to enter: $2-cash $3-card Bring your own bag"), (2.0, 3.0))
        self.assertEqual(cu.parse_cost("$20, includes refreshments"), (20.0, 20.0))

    def test_unknown(self):
        self.assertIsNone(cu.parse_cost(""))


class WhereTests(unittest.TestCase):
    def test_building_address_room(self):
        self.assertEqual(
            cu.parse_where("J.W. McConnell Building 1400 De Maisonneuve Blvd. W. Room 921-4"),
            ("J.W. McConnell Building, Room 921-4", "1400 De Maisonneuve Blvd. W., Montréal"))

    def test_two_entrances(self):
        venue, address = cu.parse_where(
            "Faubourg Building 1250 Guy St. (main entrance) | 1600 Ste-Catherine St. W. Room 620.21")
        self.assertEqual(venue, "Faubourg Building, Room 620.21")
        self.assertEqual(address, "1250 Guy St. (main entrance), Montréal")

    def test_online(self):
        self.assertEqual(cu.parse_where("Online"), (None, None))

    def test_campus(self):
        self.assertIs(cu.campus_for("Henry F. Hall Building 1455 De Maisonneuve Blvd. W."), cu.SGW)
        self.assertIs(cu.campus_for("Loyola Jesuit Hall 7141 Sherbrooke St. W."), cu.LOYOLA)
        self.assertIsNone(cu.campus_for("Online"))


class PageTests(unittest.TestCase):
    def test_real_page(self):
        fields = cu.parse_fields(PAGE)
        self.assertEqual(fields["_title"], "Discover Your Path in Mathematics and Statistics")
        self.assertIn("free", fields["Cost"].lower())
        e = cu.to_event("/cuevents/artsci/2026/11/02/discover-your-path.html", fields)
        self.assertTrue(e["is_free"])
        self.assertEqual(e["start"], "2026-11-02T12:00:00-05:00")
        self.assertEqual(e["borough"], "Ville-Marie")
        self.assertTrue(e["url"].startswith("https://www.concordia.ca/cuevents/"))
        self.assertEqual(e["category"], "science-tech")

    def test_unknown_cost_is_skipped(self):
        fields = {"_title": "Talk", "Date & time": "Monday, November 2, 2026 12 p.m. – 1 p.m.", "Cost": ""}
        self.assertIsNone(cu.to_event("/cuevents/x/2026/11/02/talk.html", fields))

    def test_old_years_are_not_followed(self):
        listing = ('<a href="/cuevents/artsci/2026/11/02/a.html"></a>'
                   '<a href="/cuevents/artsci/2019/11/02/old.html"></a>')
        self.assertEqual(cu.event_paths(listing, date(2026, 10, 31)), ["/cuevents/artsci/2026/11/02/a.html"])


if __name__ == "__main__":
    unittest.main()
