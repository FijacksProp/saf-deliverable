"""Unit tests for the Weekline schedule analysis."""

import unittest

from schedule_tools import build_report, find_conflicts, find_free_blocks, validate


def make_class(class_id, code, day, start, end):
    return {
        "id": class_id,
        "code": code,
        "subject": code,
        "teacher": "Test Lecturer",
        "day": day,
        "start": start,
        "end": end,
        "room": "Test Room",
        "type": "lecture",
        "color": "blue",
        "link": "#",
    }


class ScheduleToolsTests(unittest.TestCase):
    def test_valid_record_has_no_errors(self):
        classes = [make_class(1, "CSC 101", "Monday", "09:00", "10:00")]
        self.assertEqual(validate(classes), [])

    def test_overlap_is_detected(self):
        classes = [
            make_class(1, "CSC 101", "Monday", "09:00", "10:30"),
            make_class(2, "MTH 101", "Monday", "10:00", "11:00"),
        ]
        conflicts = find_conflicts(classes)
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0]["overlap_minutes"], 30)

    def test_touching_classes_do_not_conflict(self):
        classes = [
            make_class(1, "CSC 101", "Tuesday", "09:00", "10:00"),
            make_class(2, "MTH 101", "Tuesday", "10:00", "11:00"),
        ]
        self.assertEqual(find_conflicts(classes), [])

    def test_short_gaps_are_excluded(self):
        classes = [
            make_class(1, "CSC 101", "Wednesday", "08:00", "09:30"),
            make_class(2, "MTH 101", "Wednesday", "10:00", "17:00"),
        ]
        wednesday_blocks = [block for block in find_free_blocks(classes, 60) if block.day == "Wednesday"]
        self.assertEqual(wednesday_blocks, [])

    def test_report_identifies_busiest_day(self):
        classes = [
            make_class(1, "CSC 101", "Thursday", "08:00", "09:00"),
            make_class(2, "MTH 101", "Thursday", "10:00", "11:00"),
            make_class(3, "GST 101", "Friday", "08:00", "09:00"),
        ]
        report = build_report(classes)
        self.assertEqual(report["busiest_day"], "Thursday")
        self.assertEqual(report["busiest_day_class_count"], 2)


if __name__ == "__main__":
    unittest.main()
