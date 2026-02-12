"""
Load student roster from CSV into MongoDB.

CRITICAL: The CSV headers are misaligned with actual data.
  Header:  Student Name | LoginID      | SIS ID  | Section      | Role
  Actual:  Name         | Display Name | LoginID | SIS ID (uid) | Section (INST346-XXXX)

We use positional indices, NOT header names.

Email data is merged from a separate email-roster CSV (no header, format: name,email).

Usage:
  python load_roster.py --json      Output to roster_output.json for verification
  python load_roster.py --upload    Upsert into MongoDB
"""

import csv
import json
import sys
import os
from pathlib import Path
from collections import Counter


VALID_SECTIONS = {"0201", "0202", "0203"}


def parse_email_roster(csv_path):
    """Parse the email roster CSV (no header, format: name,email). Returns name->email dict."""
    email_map = {}

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for line_num, row in enumerate(reader, start=1):
            if len(row) < 2:
                continue
            name = row[0].strip()
            email = row[1].strip()
            # Normalize name for matching (lowercase, collapse whitespace)
            key = " ".join(name.lower().split())
            email_map[key] = email

    return email_map


def parse_roster(csv_path, email_map):
    """Parse the CSV roster, returning (students, errors)."""
    students = []
    errors = []
    missing_emails = []

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)  # skip header row

        for line_num, row in enumerate(reader, start=2):
            if len(row) < 5:
                errors.append(f"Line {line_num}: Expected 5 columns, got {len(row)}: {row}")
                continue

            name = row[0].strip()
            uid = row[3].strip()           # SIS ID is in column index 3
            raw_section = row[4].strip()   # Section is in column index 4

            # Validate UID is numeric and non-empty
            if not uid or not uid.isdigit():
                errors.append(f"Line {line_num}: Invalid UID '{uid}' for '{name}'")
                continue

            # Extract section number from "INST346-0201" -> "0201"
            if "-" not in raw_section:
                errors.append(f"Line {line_num}: Unexpected section format '{raw_section}' for '{name}'")
                continue

            section = raw_section.split("-", 1)[1]

            if section not in VALID_SECTIONS:
                errors.append(f"Line {line_num}: Invalid section '{section}' for '{name}'")
                continue

            # Look up email by normalized name
            name_key = " ".join(name.lower().split())
            email = email_map.get(name_key)
            if not email:
                missing_emails.append(f"Line {line_num}: No email found for '{name}'")

            students.append({
                "uid": uid,
                "name": name,
                "section": section,
                "email": email or "",
            })

    return students, errors, missing_emails


def write_json(students, output_path):
    """Write parsed students to JSON for manual verification."""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(students, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(students)} students to {output_path}")


def upload_to_mongodb(students):
    """Upsert students into MongoDB Atlas."""
    from pymongo import MongoClient, UpdateOne
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent.parent / ".env")

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("ERROR: MONGODB_URI not set. Create a .env file in the project root.")
        sys.exit(1)

    db_name = os.environ.get("MONGODB_DB", "attendance")

    client = MongoClient(uri)
    db = client[db_name]
    col = db["students"]

    # Ensure unique index on uid
    col.create_index("uid", unique=True)

    # Bulk upsert — re-runnable without duplicates
    ops = [
        UpdateOne(
            {"uid": s["uid"]},
            {"$set": {"name": s["name"], "section": s["section"], "email": s["email"]}},
            upsert=True,
        )
        for s in students
    ]

    result = col.bulk_write(ops)
    print(f"Matched: {result.matched_count}, Upserted: {result.upserted_count}, Modified: {result.modified_count}")
    client.close()


def main():
    project_root = Path(__file__).parent.parent
    csv_path = project_root / "Spring Student Roster - Sheet1.csv"
    email_path = project_root / "email-roster-1403867.csv"

    if not csv_path.exists():
        print(f"ERROR: CSV file not found at {csv_path}")
        sys.exit(1)

    # Parse email roster
    email_map = {}
    if email_path.exists():
        email_map = parse_email_roster(email_path)
        print(f"Loaded {len(email_map)} emails from email roster")
    else:
        print(f"WARNING: Email roster not found at {email_path}, proceeding without emails")

    students, errors, missing_emails = parse_roster(csv_path, email_map)

    if errors:
        print("ERRORS found — aborting:")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)

    print(f"Parsed {len(students)} students successfully")

    # Show section distribution
    dist = Counter(s["section"] for s in students)
    for sec in sorted(dist):
        print(f"  Section {sec}: {dist[sec]} students")

    # Check for duplicate UIDs
    uids = [s["uid"] for s in students]
    dupes = [uid for uid, count in Counter(uids).items() if count > 1]
    if dupes:
        print(f"ERROR: Duplicate UIDs found: {dupes}")
        sys.exit(1)

    print("  No duplicate UIDs found")

    # Report email coverage
    with_email = sum(1 for s in students if s["email"])
    print(f"  Emails matched: {with_email}/{len(students)}")
    if missing_emails:
        print("  Missing emails:")
        for m in missing_emails:
            print(f"    {m}")

    if "--json" in sys.argv:
        out = Path(__file__).parent / "roster_output.json"
        write_json(students, out)
    elif "--upload" in sys.argv:
        upload_to_mongodb(students)
    else:
        print("\nUsage:")
        print("  python load_roster.py --json     Write to roster_output.json for verification")
        print("  python load_roster.py --upload    Upsert into MongoDB")


if __name__ == "__main__":
    main()
