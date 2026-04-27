---
name: refresh-uk-elections-data
description: Refresh forecast data for the UK Local Elections 2026 comparator. Pulls the latest published projections from established forecasters (Elections Etc, PollCheck, YouGov MRP, Electoral Calculus, Mark Pack by-election scorecard, Wikipedia summary), recomputes derived methods (BBC PNS, R&T NEV, Uniform National Swing) from current voting-intention polls, and rewrites data/predictions.json, data/accuracy.json, data/metadata.json, the bundled data/data.js and data/predictions.csv. Use when the user asks to "refresh", "update the data", "pull the latest forecasts", or before publishing.
---

# Refresh UK Elections forecast data

You are operating inside the `uk-elections` project. Your job is to bring `data/predictions.json`, `data/accuracy.json` and `data/metadata.json` up to date with the latest published forecasts and polls, then regenerate the bundled `data/data.js` and the flat `data/predictions.csv`.

## Before you start

1. Confirm you are in the project root by checking that `index.html`, `data/`, `scripts/` and `.claude/` all exist.
2. Read `data/predictions.json` and `data/metadata.json` to see the existing structure, parties, regions and method ids. **Do not change the schema.** Only update values.

## Step 1 — Pull the latest sources

For each source, fetch the page (use WebFetch) and extract the most recent figures. Quote the exact numbers and the publication date in your working notes so the user can audit.

| Method id        | Primary source URL                                                                                   |
|------------------|------------------------------------------------------------------------------------------------------|
| `ELECTIONS_ETC`  | https://electionsetc.com/ (find the most recent "local election seat projections" post)              |
| `POLLCHECK_MC`   | https://www.pollcheck.co.uk/locals-2026 and …/locals-2026-methodology                                |
| `YOUGOV_MRP`     | https://yougov.com/ (search "local elections MRP" — note YouGov's MRP is usually London-only)        |
| `EC_STRONG`      | https://www.electoralcalculus.co.uk/ (most recent MRP / VI poll page)                                |
| `BBC_PNS`        | Derived — see Step 2                                                                                 |
| `RT_NEV`         | Derived — see Step 2 (cross-check with https://www.electionscentre.co.uk/ if a forecast is published)|
| `UNS`            | Derived — see Step 2                                                                                 |
| `BY_ELECTION`    | https://www.markpack.org.uk/ (search "council by-election scorecard")                                |

Also pull a national voting-intention polling average from any two of:
- https://yougov.com/topics/politics/trackers/voting-intention
- https://www.markpack.org.uk/voting-intention-opinion-poll-scorecard/
- https://www.pollcheck.co.uk/gb-polls
- https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_United_Kingdom_general_election

Use the trailing 4-week average. Store the per-party shares — they drive the derived methods.

## Step 2 — Compute derived methods

For methods without a published forecast, recompute from the polling average and the existing 2022 baseline (`predictions.json → baseline_2022`).

- **Uniform National Swing (`UNS`)** — naive baseline. For each party, scale defending seats by `(2026_share / 2022_share)`. Apply per region. CIs ±35% for parties with large swing, ±20% otherwise.
- **BBC PNS (`BBC_PNS`)** — use the polling average as the PNS estimate. Translate to seats using the share-to-seats ratio observed in the most recent comparable round (2022 for these wards). CIs ±15% central.
- **Rallings & Thrasher NEV (`RT_NEV`)** — same approach as PNS but apply a small "change-on-change" smoothing: weight 70% on the current poll and 30% on a uniform shift from 2022. CIs ±10%.

Keep central estimates within ±15% of the previous version unless the polling average has moved by more than 3 points for that party — flag any larger move in your final summary.

## Step 3 — Update accuracy ranking

Read `data/accuracy.json`. If a method publishes a new backtest or a new local-election cycle has been added (e.g. May 2025 results vs predictions), update `score`, `mean_abs_seat_error_per_council` and `control_hit_rate`. Otherwise leave ranks unchanged. Do not invent figures.

## Step 4 — Write the files

1. Overwrite `data/predictions.json` keeping the same key order and only changing numeric values, the `polling_2026` block and any source URLs that have moved.
2. Overwrite `data/accuracy.json` with any updated scores.
3. Overwrite `data/metadata.json`. Set `last_updated` to the current ISO date-time, bump `data_version` to `YYYY.MM.DD`, recompute `days_to_election` from `2026-05-07`, refresh `polling_window`.
4. Run from the project root:
   ```bash
   python3 scripts/build_data_js.py
   python3 scripts/export_csv.py
   ```
5. Validate with:
   ```bash
   python3 -c "import json; [json.load(open(f'data/{f}.json')) for f in ['predictions','accuracy','metadata']]; print('JSON OK')"
   node --check app.js
   ```

## Step 5 — Report

Tell the user:
- Which sources were checked and their publication dates.
- Headline party movements vs the previous version (e.g. "Reform central NAT estimate moved from 2,310 → 2,180").
- Any sources that could not be reached, and which method's figures are therefore stale.
- Any methodology change you noticed in the source (e.g. a forecaster published a revised model).

Do **not** silently drop a method if its source is unreachable — keep the previous values and note the staleness.

## Constraints

- British English in all written output.
- Brief and concise. Numbers, not adjectives.
- Never fabricate figures. If a source does not publish a number, say so and use the derived calculation.
- Do not edit `index.html`, `app.js`, or `styles.css` from this skill — data only.
