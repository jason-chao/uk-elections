---
name: refresh-uk-elections-data
description: Refresh forecast data for the UK Local Elections 2026 comparator. Pulls the latest published projections from the established forecasters (Elections Etc, PollCheck, YouGov MRP, Electoral Calculus, Mark Pack by-election scorecard), recomputes the derived methods (BBC PNS, R&T NEV, Uniform National Swing) from the current voting-intention polling average, and rewrites the data files. Use when the user asks to "refresh", "update the data", "pull the latest forecasts", or before publishing.
---

# Refresh UK Elections forecast data

Bring the data files up to date with the latest published forecasts and polls.

## Files this skill writes

- `data/predictions.json` — methods, regions, baseline_2022, polling_2026, predictions
- `data/track_record.json` — track-record ranking
- `data/metadata.json` — version + last-updated + sources
- `data/data.js`, `data/predictions.csv` — regenerated from the JSONs

Do not edit `index.html`, `app.js`, or `styles.css`. Do not rename any existing top-level keys.

## Step 0 — Archive the current data first

**Always snapshot the existing data files before overwriting them.** Run from the project root:

```bash
python3 scripts/archive_data.py
```

This copies the current `predictions.json`, `track_record.json` and `metadata.json` into `data/archive/<data_version>/` along with a small `ARCHIVE_INFO.json` describing when the snapshot was taken. Refuses to overwrite an existing snapshot unless you pass `--force`. If the resulting refresh ends up with the same `data_version` (e.g. you re-ran on the same day), bump the version in the new `metadata.json` so the next archive lands in a different folder. **Never delete files from `data/archive/`** — they are the only record of what each previous build said.

## Step 1 — Pull the latest sources

Use WebFetch on each source. Quote exact figures and publication dates so the user can audit.

| Method id        | Source                                                                                              |
|------------------|-----------------------------------------------------------------------------------------------------|
| `ELECTIONS_ETC`  | https://electionsetc.com/ — most recent "local election seat projections" post                      |
| `POLLCHECK_MC`   | https://www.pollcheck.co.uk/locals-2026 and …/locals-2026-methodology                               |
| `YOUGOV_MRP`     | https://yougov.com/ — search "local elections MRP" (usually London-only)                            |
| `EC_STRONG`      | https://www.electoralcalculus.co.uk/ — most recent MRP / VI poll page                               |
| `BBC_PNS`        | Derived (Step 2)                                                                                    |
| `RT_NEV`         | Derived (Step 2); cross-check https://www.electionscentre.co.uk/                                    |
| `UNS`            | Derived (Step 2)                                                                                    |
| `BY_ELECTION`    | https://www.markpack.org.uk/ — search "council by-election scorecard"                               |

Then pull a national voting-intention polling average from any two of:

- https://yougov.com/topics/politics/trackers/voting-intention
- https://www.markpack.org.uk/voting-intention-opinion-poll-scorecard/
- https://www.pollcheck.co.uk/gb-polls
- https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_United_Kingdom_general_election

Use the trailing 4-week average. Store per-party shares — they drive the derived methods.

## Step 2 — Compute derived methods

For methods without a published forecast, recompute from the polling average against the existing 2022 baseline.

- **UNS** — scale defending seats by `(2026_share / 2022_share)` per party, applied per region. CIs ±35% for large swings, ±20% otherwise.
- **BBC_PNS** — use the polling average as the PNS estimate; translate to seats via the share-to-seats ratio from the most recent comparable round. CIs ±15%.
- **RT_NEV** — like PNS, but weight 70% on the current poll and 30% on a uniform shift from 2022. CIs ±10%.

Keep central estimates within ±15% of the previous version unless the polling average has moved by more than 3 points for that party — flag any larger move in the final summary.

## Step 3 — Update the track-record ranking

If a method publishes a new backtest or a new local-election cycle has been added, update `score`, `mean_abs_seat_error_per_council` and `control_hit_rate`. Otherwise leave ranks unchanged. Never invent figures.

## Step 4 — Write the files

(You should already have run `scripts/archive_data.py` in Step 0. If not, do it now before any of the writes below.)

1. Overwrite `data/predictions.json` (same key order; change values only).
2. Overwrite `data/track_record.json`.
3. Overwrite `data/metadata.json`: set `last_updated` to the current ISO time, bump `data_version` to `YYYY.MM.DD`, recompute `days_to_election` from `2026-05-07`, refresh `polling_window`.
4. Regenerate the bundles:

   ```bash
   python3 scripts/build_data_js.py
   python3 scripts/export_csv.py
   ```

5. Validate:

   ```bash
   python3 -c "import json; [json.load(open(f'data/{f}.json')) for f in ['predictions','track_record','metadata']]; print('JSON OK')"
   node --check app.js
   ```

## Step 5 — Report

- Sources checked, with publication dates.
- Headline movements vs the previous version (e.g. "Reform NAT central: 2,310 → 2,180").
- Any sources that could not be reached, and which figures are therefore stale.
- Any methodology change spotted in the source.

Never silently drop a method whose source is unreachable — keep the previous values and call out the staleness.

## Style

- British English.
- Brief and numeric.
- Never fabricate figures. If a source publishes nothing, fall back to the derived calculation in Step 2.
