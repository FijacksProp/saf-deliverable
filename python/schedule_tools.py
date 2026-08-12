"""Validate and analyse the timetable used by the Weekline frontend.

This module uses only the Python standard library. Run it from the project root:

    python python/schedule_tools.py
    python python/schedule_tools.py --json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = PROJECT_ROOT / "data" / "timetable.json"
DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
DAY_START = 8 * 60
DAY_END = 17 * 60
REQUIRED_FIELDS = {
    "id", "code", "subject", "teacher", "day", "start", "end",
    "room", "type", "color", "link",
}
TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


@dataclass(frozen=True)
class TimeBlock:
    day: str
    start: str
    end: str

    @property
    def duration_minutes(self) -> int:
        return to_minutes(self.end) - to_minutes(self.start)

    def as_dict(self) -> dict[str, Any]:
        return {
            "day": self.day,
            "start": self.start,
            "end": self.end,
            "duration_minutes": self.duration_minutes,
        }


def load_classes(path: Path = DEFAULT_DATA) -> list[dict[str, Any]]:
    """Load timetable records from a JSON file."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"Timetable file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON at line {exc.lineno}: {exc.msg}") from exc

    if not isinstance(data, list):
        raise ValueError("The timetable must be a JSON array.")
    return data


def validate(classes: list[dict[str, Any]]) -> list[str]:
    """Return all structural and time-range problems in the dataset."""
    errors: list[str] = []
    seen_ids: set[Any] = set()

    for index, item in enumerate(classes, start=1):
        label = f"Record {index}"
        if not isinstance(item, dict):
            errors.append(f"{label} must be an object.")
            continue

        missing = REQUIRED_FIELDS - item.keys()
        if missing:
            errors.append(f"{label} is missing: {', '.join(sorted(missing))}.")
            continue

        class_id = item["id"]
        if class_id in seen_ids:
            errors.append(f"{label} has a duplicate id: {class_id}.")
        seen_ids.add(class_id)

        if item["day"] not in DAYS:
            errors.append(f"{label} uses an unsupported day: {item['day']}.")

        for field in ("start", "end"):
            if not isinstance(item[field], str) or not TIME_PATTERN.match(item[field]):
                errors.append(f"{label} has an invalid {field} time: {item[field]!r}.")

        if all(isinstance(item.get(field), str) and TIME_PATTERN.match(item[field]) for field in ("start", "end")):
            if to_minutes(item["start"]) >= to_minutes(item["end"]):
                errors.append(f"{label} must end after it starts.")
            if to_minutes(item["start"]) < DAY_START or to_minutes(item["end"]) > DAY_END:
                errors.append(f"{label} falls outside the displayed 08:00–17:00 day.")

        if item["type"] not in {"lecture", "practical", "seminar"}:
            errors.append(f"{label} has an invalid class type: {item['type']}.")

    return errors


def find_conflicts(classes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find every pair of classes whose times overlap on the same day."""
    conflicts: list[dict[str, Any]] = []
    for day in DAYS:
        daily = sorted(
            (item for item in classes if item["day"] == day),
            key=lambda item: to_minutes(item["start"]),
        )
        for index, first in enumerate(daily):
            for second in daily[index + 1:]:
                if to_minutes(second["start"]) >= to_minutes(first["end"]):
                    break
                conflicts.append({
                    "day": day,
                    "first": first["code"],
                    "second": second["code"],
                    "overlap_minutes": min(to_minutes(first["end"]), to_minutes(second["end"]))
                    - to_minutes(second["start"]),
                })
    return conflicts


def find_free_blocks(
    classes: list[dict[str, Any]], minimum_minutes: int = 60
) -> list[TimeBlock]:
    """Find gaps of at least ``minimum_minutes`` inside the displayed day."""
    blocks: list[TimeBlock] = []
    for day in DAYS:
        daily = sorted(
            (item for item in classes if item["day"] == day),
            key=lambda item: to_minutes(item["start"]),
        )
        cursor = DAY_START
        for item in daily:
            start = to_minutes(item["start"])
            if start - cursor >= minimum_minutes:
                blocks.append(TimeBlock(day, to_time(cursor), to_time(start)))
            cursor = max(cursor, to_minutes(item["end"]))
        if DAY_END - cursor >= minimum_minutes:
            blocks.append(TimeBlock(day, to_time(cursor), to_time(DAY_END)))
    return blocks


def build_report(classes: list[dict[str, Any]]) -> dict[str, Any]:
    """Create the analysis consumed by reports or other tooling."""
    conflicts = find_conflicts(classes)
    free_blocks = find_free_blocks(classes)
    daily_counts = Counter(item["day"] for item in classes)
    busiest_day = max(DAYS, key=lambda day: daily_counts[day])
    longest_block = max(free_blocks, key=lambda block: block.duration_minutes, default=None)
    return {
        "class_count": len(classes),
        "conflicts": conflicts,
        "conflict_count": len(conflicts),
        "free_blocks": [block.as_dict() for block in free_blocks],
        "free_block_count": len(free_blocks),
        "busiest_day": busiest_day,
        "busiest_day_class_count": daily_counts[busiest_day],
        "longest_free_block": longest_block.as_dict() if longest_block else None,
    }


def to_minutes(value: str) -> int:
    hours, minutes = (int(part) for part in value.split(":"))
    return hours * 60 + minutes


def to_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def print_report(report: dict[str, Any]) -> None:
    print("WEEKLINE SCHEDULE REPORT")
    print("=" * 28)
    print(f"Classes:     {report['class_count']}")
    print(f"Conflicts:   {report['conflict_count']}")
    print(f"Open blocks: {report['free_block_count']}")
    print(
        f"Busiest day: {report['busiest_day']} "
        f"({report['busiest_day_class_count']} classes)"
    )
    longest = report["longest_free_block"]
    if longest:
        hours, minutes = divmod(longest["duration_minutes"], 60)
        duration = f"{hours}h" + (f" {minutes}m" if minutes else "")
        print(
            f"Best study window: {longest['day']}, {longest['start']}–"
            f"{longest['end']} ({duration})"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate and analyse Weekline timetable data.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="Path to a timetable JSON file.")
    parser.add_argument("--json", action="store_true", help="Print the analysis as JSON.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        classes = load_classes(args.data)
        errors = validate(classes)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if errors:
        print("Timetable validation failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    report = build_report(classes)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
