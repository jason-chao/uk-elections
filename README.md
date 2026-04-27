# UK Local Elections 2026 — Forecast Comparator

A static, interactive website that compares the headline forecasts for the **United Kingdom local elections on 7 May 2026**. It puts eight established forecasting methods side-by-side, shows their confidence ranges, flags outliers, and ranks them by historical accuracy. National (England-wide) and five regional views are available.

The site is fully static. Open `index.html` directly from the file system (`file://`) — no build step, no server, no installation needed.

![Local election forecast comparator](docs/screenshot.png) <!-- optional: capture a screenshot and drop it here -->

---

## Contents

- [What it shows](#what-it-shows)
- [Methods compared](#methods-compared)
- [Quick start](#quick-start)
- [Refreshing the data](#refreshing-the-data)
- [Project structure](#project-structure)
- [Data schema](#data-schema)
- [Accessibility & internationalisation](#accessibility--internationalisation)
- [Sources](#sources)
- [Licence](#licence)

---

## What it shows

- **Interactive grouped bar chart** of seats predicted by each method, per party.
- **Confidence ranges** drawn as whiskers (low–high) on every bar.
- **Outlier methods** (e.g. Uniform National Swing in this fragmented multi-party cycle) are kept visible but rendered with reduced opacity, and toggleable.
- **Region selector** — National (England), London, South, Midlands, North, East.
- **Highlight a single party** to drop the others out of the chart.
- **Accuracy ranking table** — composite score blending mean absolute seat error per council, council-control hit rate, and consistency across the last three local-election cycles.
- **Method cards** — one-paragraph description of each method, the author, and a link to the published methodology.
- **Glossary & tooltips** — every statistical term (`MRP`, `Monte Carlo`, `confidence interval`, `differential swing`, etc.) has a hover tooltip and a glossary entry.

## Methods compared

| Rank | Method | Type | Author | Source |
|-----:|--------|------|--------|--------|
| 1 | **PollCheck Ward Monte Carlo** | Ward-level simulation, 1,000 runs | PollCheck | [link](https://www.pollcheck.co.uk/locals-2026-methodology) |
| 2 | **YouGov MRP** | Multilevel Regression with Post-stratification | YouGov | [link](https://yougov.com/en-gb/articles/54598-yougovs-mrp-of-the-2026-london-local-elections-shows-close-races-in-many-boroughs) |
| 3 | **Rallings & Thrasher NEV** | National Equivalent Vote, change-on-change | Plymouth Elections Centre | [link](https://www.electionscentre.co.uk/) |
| 4 | **BBC Projected National Share** | Aggregate regression on ward characteristics | Curtice & Fisher | [link](https://en.wikipedia.org/wiki/Projected_National_Share) |
| 5 | **Electoral Calculus Strong Transition** | Multiplicative strong/weak voter-flow model | Martin Baxter | [link](https://www.electoralcalculus.co.uk/) |
| 6 | **Elections Etc Bespoke Regression** | Per-party regression, with party-specific tweaks | Stephen Fisher | [link](https://electionsetc.com/2026/03/25/local-election-seat-projections-for-2026/) |
| 7 | **Council By-Election Extrapolation** | Real-vote signal from rolling by-elections | Mark Pack scorecard | [link](https://www.markpack.org.uk/174682/council-by-election-results-scorecard-2025-2026/) |
| 8 | **Uniform National Swing** *(outlier)* | Classical baseline, applies vote-share change uniformly | — | [link](https://en.wikipedia.org/wiki/Swing_(United_Kingdom)) |

## Quick start

```bash
# 1. Clone
git clone https://github.com/<your-username>/uk-elections-2026.git
cd uk-elections-2026

# 2. Open the site (no build needed)
open index.html             # macOS
xdg-open index.html         # Linux
start index.html            # Windows
```

The site loads predictions from `data/data.js`, which is a bundled copy of the JSON files in `data/`. Plotly is loaded from a CDN; the rest works offline.

If your browser blocks the CDN, the chart will not render. Either connect to the internet, or replace the `<script src="https://cdn.plot.ly/...">` line in `index.html` with a local copy of Plotly.

## Refreshing the data

The dataset shipped here was built on **27 April 2026**. Two ways to update it.

### Option A — Claude skill (recommended)

The repo ships a Claude skill at [`.claude/skills/refresh-uk-elections-data/SKILL.md`](.claude/skills/refresh-uk-elections-data/SKILL.md). With Claude Code installed:

```bash
cd uk-elections-2026
claude
```

Then in the session:

```
/refresh-uk-elections-data
```

Claude will fetch the latest published forecasts from each source, recompute the derived methods (BBC PNS, R&T NEV, UNS) from the current voting-intention polling average, regenerate `data/predictions.json` / `accuracy.json` / `metadata.json`, and rebuild `data/data.js` and `data/predictions.csv`. It will then summarise what moved.

### Option B — Manual

1. Edit `data/predictions.json`, `data/accuracy.json` and `data/metadata.json`.
2. Regenerate the bundled JS and CSV:

   ```bash
   python3 scripts/build_data_js.py
   python3 scripts/export_csv.py
   ```

## Project structure

```
uk-elections-2026/
├── index.html                          # Site entry point
├── styles.css                          # All styling
├── app.js                              # Chart, controls, tooltips
├── data/
│   ├── predictions.json                # Source of truth: per-method, per-region forecasts
│   ├── accuracy.json                   # Historical accuracy ranking
│   ├── metadata.json                   # Version, last-updated, sources
│   ├── predictions.csv                 # Flat CSV export of predictions.json
│   └── data.js                         # Auto-generated bundle for file:// loading
├── scripts/
│   ├── build_data_js.py                # JSON → data.js bundler
│   └── export_csv.py                   # JSON → CSV exporter
├── .claude/
│   └── skills/
│       └── refresh-uk-elections-data/
│           └── SKILL.md                # Claude skill for the refresh workflow
├── README.md
├── LICENSE
└── .gitignore
```

## Data schema

`data/predictions.json` has four top-level keys.

- **`election`** — fixed metadata (date, total seats, councils, wards).
- **`parties`** — id / display name / official colour.
- **`regions`** — id / display name / total seats up.
- **`baseline_2022`** — seats won at the previous comparable round, by region and party. Used by the derived UNS / PNS / NEV calculations.
- **`polling_2026`** — current voting-intention polling average (per party).
- **`methods`** — list of method records: `id`, `name`, `short`, `author`, `description`, `source_url`, `outlier`.
- **`predictions`** — keyed by `method_id → region_id → party_id → { low, central, high }`. The `central` is the headline figure; `low` and `high` define the confidence range drawn as error whiskers.

`data/accuracy.json` ranks the methods 1..N with: composite `score`, `mean_abs_seat_error_per_council`, `control_hit_rate`, plus a one-line `strengths` and `weaknesses`.

`data/metadata.json` carries the build version (`YYYY.MM.DD`), the ISO `last_updated` timestamp, and the polling window the dataset is anchored to.

## Accessibility & internationalisation

- British English throughout (`colour`, `centre`, `analyse`, `behaviour`).
- All controls are real `<select>` and `<input>` elements; the chart has `role="img"` and an `aria-label`.
- Tooltips use `title="…"`-style behaviour but expose the same text in a hidden `#tooltip` element with `role="tooltip"` and `aria-hidden` toggling.
- The page is one column, mobile-first; the chart re-flows under 640 px.

## Sources

The numbers shipped on 27 April 2026 are anchored to:

- [Elections Etc — Local election seat projections for 2026 (25 March 2026)](https://electionsetc.com/2026/03/25/local-election-seat-projections-for-2026/)
- [PollCheck — Locals 2026 methodology](https://www.pollcheck.co.uk/locals-2026-methodology)
- [PollCheck — Locals 2026 dashboard](https://www.pollcheck.co.uk/locals-2026)
- [YouGov — MRP of the 2026 London local elections](https://yougov.com/en-gb/articles/54598-yougovs-mrp-of-the-2026-london-local-elections-shows-close-races-in-many-boroughs)
- [Electoral Calculus — MRP poll April 2026](https://www.electoralcalculus.co.uk/blogs/ec_vipoll_20260423.html)
- [Mark Pack — Council by-election scorecard 2025–2026](https://www.markpack.org.uk/174682/council-by-election-results-scorecard-2025-2026/)
- [Mark Pack — BBC PNS and R&T NEV explained](https://www.markpack.org.uk/169208/bbc-pns-and-thrasher-and-rallings-nev-explained/)
- [Wikipedia — 2026 United Kingdom local elections](https://en.wikipedia.org/wiki/2026_United_Kingdom_local_elections)

The figures for **BBC PNS**, **R&T NEV** and **Uniform National Swing** are recomputed from the current voting-intention polling average against the 2022 baseline. The other five reflect the published forecasts on the date the dataset was built.

## Licence

[MIT](LICENSE). Forecast figures are derived from the cited sources, all of whom retain their own rights to the underlying methodology and headline numbers — please credit them when re-publishing.
