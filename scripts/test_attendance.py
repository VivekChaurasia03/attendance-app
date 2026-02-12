"""
Test script for attendance data.

Usage:
  python test_attendance.py              Insert random attendance for multiple dates
  python test_attendance.py --delete     Remove ALL attendance records
"""

import sys
import os
import random
from pathlib import Path
from datetime import datetime

from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

uri = os.environ.get("MONGODB_URI")
db_name = os.environ.get("MONGODB_DB", "inst346_attendance")

client = MongoClient(uri)
db = client[db_name]

if "--delete" in sys.argv:
    result = db["attendance"].delete_many({})
    print(f"Deleted {result.deleted_count} total attendance records")
else:
    # Multiple test dates with different random counts per section
    TEST_DATES = [
        ("2026-01-23", {"0201": random.randint(28, 38), "0202": random.randint(30, 40), "0203": random.randint(25, 36)}),
        ("2026-01-30", {"0201": random.randint(28, 38), "0202": random.randint(30, 40), "0203": random.randint(25, 36)}),
        ("2026-02-06", {"0201": 33, "0202": 38, "0203": 30}),
    ]

    # Fetch students grouped by section
    students = list(db["students"].find({}, {"uid": 1, "section": 1, "_id": 0}))
    by_section = {}
    for s in students:
        by_section.setdefault(s["section"], []).append(s)

    # Ensure indexes
    db["attendance"].create_index([("uid", 1), ("date", 1)], unique=True)
    db["attendance"].create_index([("date", 1), ("section", 1)])

    for test_date, section_counts in TEST_DATES:
        inserted = 0
        for sec, count in section_counts.items():
            pool = by_section.get(sec, [])
            chosen = random.sample(pool, min(count, len(pool)))
            for s in chosen:
                try:
                    db["attendance"].insert_one({
                        "uid": s["uid"],
                        "date": test_date,
                        "section": sec,
                        "timestamp": f"{test_date}T12:30:00",
                    })
                    inserted += 1
                except Exception as e:
                    if "E11000" not in str(e):
                        print(f"  Error for {s['uid']}: {e}")

        print(f"\n{test_date}: Inserted {inserted} records")
        for sec, count in section_counts.items():
            total = len(by_section.get(sec, []))
            print(f"  Section {sec}: {count}/{total} present, {total - count} absent")

client.close()
