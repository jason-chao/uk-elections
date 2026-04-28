# UK Local Elections 2026 — Forecast Comparator

A static, interactive site that compares the headline forecasts for the **United Kingdom local elections on 7 May 2026**. Eight established forecasting methods, side-by-side, with confidence ranges, outlier flags, and a historical track record.

---

## Contents

- [Scope](#scope)
- [What it shows](#what-it-shows)
- [Methods](#methods)
- [Quick start](#quick-start)
- [Refreshing the data](#refreshing-the-data)
- [Project structure](#project-structure)
- [Data schema](#data-schema)
- [Sources](#sources)
- [Licence](#licence)

---

## Scope

**5,066 principal-authority council seats** contested across 136 English local authorities on 7 May 2026.

Out of scope: the 6 directly-elected English mayoralties, the 2 Welsh council by-elections held the same day, and any parish/town council contests.

**National vs regional reconciliation.** Six views: National (England) plus five regions (London, South, Midlands, North, East). The National column is the **sum of the five regional projections**, so views reconcile. As a result a method's National central may sit a few percent above or below its published aggregate headline. The published headline is linked from each method card.

## What it shows

- **Three chart views** — *Dot rows* (one row per party, methods plotted as dots with low–high range bars), *Grouped bars*, and *Table* (numbers with cell-level highest/lowest shading). Dot rows is the default and opens with the **3 methods with the best historical track record**; click a method chip to add or remove it, or use the **Show methods: All / Best 3 / Worst 3** preset group.
- **Confidence ranges** drawn as whiskers or low–high text on every figure.
- **Outlier methods** (e.g. Uniform National Swing in this fragmented multi-party cycle) are kept visible but rendered with reduced opacity and toggleable.
- **Region selector** — National + 5 English regions.
- **Track record** tab — composite score (mean absolute seat error per council, council-control hit rate, consistency across recent cycles), with a caveat: this is *past* performance, not a guarantee for May 2026.
- **Method cards** — each forecaster's methodology summary and source link.
- **Glossary & tooltips** — hover any stats term (`MRP`, `Monte Carlo`, `confidence interval`, `differential swing`) for a definition.

### A note on "track record"

The site previously called this an "accuracy ranking". That word implies a single objective measure of correctness — but a forecast can't be evaluated against a not-yet-known result, and even post-hoc the comparison is multi-dimensional (seat error, vote-share error, control prediction, party by party). The **Track record** tab summarises how each method has performed across the 2022–2025 cycles. Treat it as a guide to reliability, not a verdict on which forecast for May 2026 is "right".

## Methods

Ranked by historical track record across recent local-election cycles.

| Rank | Method | Type | Author |
|-----:|--------|------|--------|
| 1 | [PollCheck Ward Monte Carlo](https://www.pollcheck.co.uk/locals-2026-methodology) | Ward-level simulation, 1,000 runs | PollCheck |
| 2 | [YouGov MRP](https://yougov.com/en-gb/articles/54598-yougovs-mrp-of-the-2026-london-local-elections-shows-close-races-in-many-boroughs) | Multilevel Regression with Post-stratification | YouGov |
| 3 | [Rallings & Thrasher NEV](https://www.electionscentre.co.uk/) | National Equivalent Vote, change-on-change | Plymouth Elections Centre |
| 4 | [BBC Projected National Share](https://en.wikipedia.org/wiki/Projected_National_Share) | Aggregate regression on ward characteristics | Curtice & Fisher |
| 5 | [Electoral Calculus Strong Transition](https://www.electoralcalculus.co.uk/) | Multiplicative voter-flow model | Martin Baxter |
| 6 | [Elections Etc Bespoke Regression](https://electionsetc.com/2026/03/25/local-election-seat-projections-for-2026/) | Per-party regression, party-specific tweaks | Stephen Fisher |
| 7 | [Council By-Election Extrapolation](https://www.markpack.org.uk/174682/council-by-election-results-scorecard-2025-2026/) | Real-vote signal from rolling by-elections | Mark Pack scorecard |
| 8 | [Uniform National Swing](https://en.wikipedia.org/wiki/Swing_(United_Kingdom)) *(outlier)* | Naive vote-share scaling | Classical baseline |

## Quick start

The site is fully static — no build step, no server, no install. Just open `index.html` from the file system (`file://`):

```bash
git clone https://github.com/jason-chao/uk-local-elections.git
cd uk-local-elections

open index.html       # macOS
xdg-open index.html   # Linux
start index.html      # Windows
```

Plotly loads from a CDN; the rest works offline. If your browser blocks the CDN the chart will not render — connect to the internet, or replace the `<script src="https://cdn.plot.ly/...">` line in `index.html` with a local copy of Plotly.

## Refreshing the data

### Option A — Claude skill (recommended)

```bash
cd uk-elections-2026
claude
```

Then in the session:

```
/refresh-uk-elections-data
```

Claude pulls the latest forecasts, recomputes the derived methods (BBC PNS, R&T NEV, UNS) from the current polling average, regenerates the data files, and reports what moved. Skill definition: [`.claude/skills/refresh-uk-elections-data/SKILL.md`](.claude/skills/refresh-uk-elections-data/SKILL.md).

### Option B — Manual

1. Edit `data/predictions.json`, `data/accuracy.json`, `data/metadata.json`.
2. Regenerate the bundles:

   ```bash
   python3 scripts/build_data_js.py
   python3 scripts/export_csv.py
   ```

## Project structure

```
uk-elections-2026/
├── index.html                 # Site entry
├── styles.css                 # All styling
├── app.js                     # Chart, controls, tooltips
├── data/
│   ├── predictions.json       # Source of truth: methods, regions, baseline_2022, predictions
│   ├── accuracy.json          # Track-record ranking
│   ├── metadata.json          # Version, last-updated, sources
│   ├── predictions.csv        # Flat CSV export
│   └── data.js                # Auto-generated JSON bundle (for file:// loading)
├── scripts/
│   ├── build_data_js.py       # JSON → data.js bundler
│   └── export_csv.py          # JSON → CSV exporter
├── .claude/
│   └── skills/
│       └── refresh-uk-elections-data/
│           └── SKILL.md       # Refresh workflow
├── README.md
├── LICENSE
└── .gitignore
```

## Data schema

`data/predictions.json` has these top-level keys:

- **`election`** — name, date, total seats, councils, wards, scope, national_note.
- **`parties`** — id / display name / official colour.
- **`regions`** — id / display name / total seats up.
- **`baseline_2022`** — seats won at the previous comparable round, by region and party. Drives the derived methods.
- **`polling_2026`** — current voting-intention polling average per party.
- **`methods`** — `id`, `name`, `short`, `author`, `description`, `source_url`, `outlier`.
- **`predictions`** — `method_id → region_id → party_id → { low, central, high }`.

`data/accuracy.json` ranks methods (track-record table) with composite `score`, `mean_abs_seat_error_per_council`, `control_hit_rate`, and one-line `strengths` / `weaknesses`. The file name is historical; the on-screen label is **Track record**.

`data/metadata.json` carries `data_version` (`YYYY.MM.DD`), `last_updated` (ISO), `polling_window`, and the sources list.

## Sources

Numbers shipped here are anchored to:

- [Elections Etc — Local election seat projections for 2026 (25 March 2026)](https://electionsetc.com/2026/03/25/local-election-seat-projections-for-2026/)
- [PollCheck — Locals 2026 methodology](https://www.pollcheck.co.uk/locals-2026-methodology)
- [PollCheck — Locals 2026 dashboard](https://www.pollcheck.co.uk/locals-2026)
- [YouGov — MRP of the 2026 London local elections](https://yougov.com/en-gb/articles/54598-yougovs-mrp-of-the-2026-london-local-elections-shows-close-races-in-many-boroughs)
- [Electoral Calculus — MRP poll April 2026](https://www.electoralcalculus.co.uk/blogs/ec_vipoll_20260423.html)
- [Mark Pack — Council by-election scorecard 2025–2026](https://www.markpack.org.uk/174682/council-by-election-results-scorecard-2025-2026/)
- [Mark Pack — BBC PNS and R&T NEV explained](https://www.markpack.org.uk/169208/bbc-pns-and-thrasher-and-rallings-nev-explained/)
- [Wikipedia — 2026 United Kingdom local elections](https://en.wikipedia.org/wiki/2026_United_Kingdom_local_elections)

**BBC PNS**, **R&T NEV** and **Uniform National Swing** are recomputed from the current polling average against the 2022 baseline. The other five reflect each forecaster's published numbers on the build date.

## Licence

[MIT](LICENSE). Forecast figures are derived from the cited sources, who retain rights to the underlying methodology — please credit them when re-publishing.
