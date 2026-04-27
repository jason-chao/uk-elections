#!/usr/bin/env python3
"""Export predictions.json as a flat CSV for spreadsheet users."""

import csv
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

preds = json.loads((DATA / "predictions.json").read_text())

with (DATA / "predictions.csv").open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["method_id", "method_name", "region_id", "region_name",
                "party_id", "party_name", "seats_low", "seats_central", "seats_high"])
    methods  = {m["id"]: m for m in preds["methods"]}
    regions  = {r["id"]: r for r in preds["regions"]}
    parties  = {p["id"]: p for p in preds["parties"]}
    for method_id, by_region in preds["predictions"].items():
        for region_id, by_party in by_region.items():
            for party_id, band in by_party.items():
                w.writerow([
                    method_id, methods[method_id]["name"],
                    region_id, regions[region_id]["name"],
                    party_id, parties[party_id]["name"],
                    band["low"], band["central"], band["high"],
                ])
print(f"Wrote {DATA / 'predictions.csv'}")
