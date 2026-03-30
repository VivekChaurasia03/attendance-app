"""
Attendance backfill and admin utility.

Usage:
  uv run main.py [--dry-run]          Run the backfill defined in BACKFILL dict
  uv run main.py --cascade-user       Interactively delete a user and all their attendance

Flags:
  --dry-run        Preview backfill inserts without writing to MongoDB
  --cascade-user   Prompt for a UID, confirm, then delete from students + attendance
"""

import os
import sys
from pathlib import Path

from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DRY_RUN = "--dry-run" in sys.argv


def get_db():
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("ERROR: MONGODB_URI not set in .env")
        sys.exit(1)
    db_name = os.environ.get("MONGODB_DB", "inst346_attendance")
    client = MongoClient(uri)
    return client, client[db_name]


def cascade_delete_user():
    """Interactively delete a student and all their attendance records."""
    uid = input("Enter UID to delete: ").strip()
    if not uid:
        print("No UID entered. Aborting.")
        sys.exit(0)

    client, db = get_db()

    # Show what will be deleted before asking for confirmation
    student = db["students"].find_one({"uid": uid}, {"_id": 0})
    attendance_count = db["attendance"].count_documents({"uid": uid})

    if not student:
        print(f"\nUID '{uid}' not found in students collection.")
        client.close()
        sys.exit(1)

    print(f"\nStudent : {student.get('name')} (UID: {uid}, Section: {student.get('section')})")
    print(f"Attendance records : {attendance_count}")
    print("\nThis will permanently delete the student and ALL their attendance records.")

    confirm = input("Type the UID again to confirm: ").strip()
    if confirm != uid:
        print("UID does not match. Aborting.")
        client.close()
        sys.exit(0)

    att_result = db["attendance"].delete_many({"uid": uid})
    stu_result = db["students"].delete_one({"uid": uid})

    print(f"\nDeleted {att_result.deleted_count} attendance record(s)")
    print(f"Deleted {stu_result.deleted_count} student record(s)")
    print("Done.")
    client.close()


def backfill_attendance(date: str, uids: list[str]) -> list[str]:
    """
    Insert attendance records for the given UIDs on the given date.

    Returns:
        List of UIDs that failed (not found in the students collection).
    """
    client, db = get_db()

    # Ensure index exists (idempotent)
    if not DRY_RUN:
        db["attendance"].create_index([("uid", 1), ("date", 1)], unique=True)

    # Bulk-fetch all matching students in one query
    uid_strs = [str(u) for u in uids]
    student_docs = db["students"].find({"uid": {"$in": uid_strs}}, {"uid": 1, "section": 1, "_id": 0})
    uid_to_section = {doc["uid"]: doc["section"] for doc in student_docs}

    failed_uids = []
    inserted = 0
    skipped = 0

    for uid in uid_strs:
        section = uid_to_section.get(uid)
        if section is None:
            print(f"  [FAIL] UID '{uid}' not found in students collection")
            failed_uids.append(uid)
            continue

        record = {
            "uid": uid,
            "date": date,
            "section": section,
            "timestamp": f"{date}T12:30:00",
        }

        if DRY_RUN:
            print(f"  [DRY-RUN] Would insert: {record}")
            inserted += 1
            continue

        try:
            db["attendance"].insert_one(record)
            inserted += 1
        except Exception as e:
            if "E11000" in str(e):
                print(f"  [SKIP] UID '{uid}' already has attendance for {date}")
                skipped += 1
            else:
                print(f"  [ERROR] UID '{uid}': {e}")
                failed_uids.append(uid)

    client.close()

    print(f"\nDate: {date}")
    print(f"  Inserted : {inserted}")
    print(f"  Skipped  : {skipped} (duplicate)")
    print(f"  Failed   : {len(failed_uids)}")
    if failed_uids:
        print(f"  Failed UIDs: {failed_uids}")

    return failed_uids


# ---------------------------------------------------------------------------
# Edit this dict to run a backfill. Only one date at a time; UIDs can be any
# students from any section — the script resolves section automatically.
# ---------------------------------------------------------------------------
BACKFILL = {
    "date": "2026-03-27",
    "uids": [
        "119617977",
        "121948847",
        "118055046",
        "119464427",
        "118798677",
    ],
}

if __name__ == "__main__":
    if "--cascade-user" in sys.argv:
        cascade_delete_user()
        sys.exit(0)

    if not BACKFILL["uids"]:
        print("No UIDs specified in BACKFILL. Edit the BACKFILL dict at the bottom of this file.")
        sys.exit(0)

    if DRY_RUN:
        print("=== DRY RUN — no writes will occur ===\n")

    failed = backfill_attendance(BACKFILL["date"], BACKFILL["uids"])

    if failed:
        print(f"\nReturned failed UIDs: {failed}")
        sys.exit(1)
    else:
        print("\nAll UIDs processed successfully.")
