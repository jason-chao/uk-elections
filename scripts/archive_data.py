#!/usr/bin/env python3
"""Archive the current data files before they are overwritten by a refresh.

Reads data/metadata.json to get the current data_version, then snapshots the three
JSONs (predictions, accuracy, metadata) into data/archive/<data_version>/.

Idempotent: if the destination directory already exists, the snapshot is skipped
unless --force is passed. Run this from the project root before the refresh skill
or any manual edit overwrites the source-of-truth JSONs."""

from __future__ import annotations
import argparse
import datetime
import json
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ARCHIVE = DATA / "archive"

FILES_TO_ARCHIVE = ("predictions.json", "track_record.json", "metadata.json")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true",
                        help="overwrite the destination snapshot if it already exists")
    parser.add_argument("--label", default=None,
                        help="custom snapshot folder name (default: data_version from metadata.json)")
    args = parser.parse_args()

    meta_path = DATA / "metadata.json"
    if not meta_path.exists():
        print("No data/metadata.json — nothing to archive.", file=sys.stderr)
        return 1

    meta = json.loads(meta_path.read_text())
    label = args.label or meta.get("data_version") or datetime.date.today().isoformat()
    label = str(label).strip().replace("/", "-").replace(" ", "_")
    if not label:
        print("Could not determine a snapshot label.", file=sys.stderr)
        return 1

    dest = ARCHIVE / label
    if dest.exists() and not args.force:
        print(f"Snapshot {dest.relative_to(ROOT)} already exists — skipping (use --force to overwrite).")
        return 0
    dest.mkdir(parents=True, exist_ok=True)

    archived = []
    for name in FILES_TO_ARCHIVE:
        src = DATA / name
        if not src.exists():
            continue
        shutil.copy2(src, dest / name)
        archived.append(name)

    # Tiny manifest so a future browser of the archive folder can see when it was made
    # without having to open metadata.json.
    (dest / "ARCHIVE_INFO.json").write_text(json.dumps({
        "archived_at_utc": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "data_version": meta.get("data_version"),
        "last_updated": meta.get("last_updated"),
        "polling_window": meta.get("polling_window"),
        "files": archived,
    }, indent=2) + "\n")

    print(f"Archived {len(archived)} file(s) to {dest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
