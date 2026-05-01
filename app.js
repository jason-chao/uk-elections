/* UK Local Elections 2026 forecast comparator. Plain ES2017, no build step. */
(function () {
  "use strict";

  const DATA = window.UKE_DATA;
  if (!DATA) {
    document.body.innerHTML = "<p style='padding:2rem'>Could not load data. Run <code>python3 scripts/build_data_js.py</code> to regenerate <code>data/data.js</code>.</p>";
    return;
  }

  const PRED   = DATA.predictions;
  const ACC    = DATA.track_record;
  const META   = DATA.metadata;

  const PARTIES = PRED.parties;
  const REGIONS = PRED.regions;
  const METHODS = PRED.methods;

  const GLOSSARY = {
    regression:           "A statistical technique that fits a line or surface through data points to summarise how one variable changes with others.",
    monte_carlo:          "A simulation method that runs the model thousands of times with random variation to map out the range of plausible outcomes.",
    confidence_interval:  "The range within which the true value is expected to lie, given the model's uncertainty. Commonly the central 90% or 95% of simulated outcomes.",
    mrp:                  "Multilevel Regression with Post-stratification. A modelling approach that fits voter behaviour as a function of demographics and area, then weights to the small-area census to produce ward-level estimates.",
    strong_transition:    "A vote-flow model that splits each party's support into 'strong' (loyal) and 'weak' (volatile) voters, so that decline does not become impossible negative shares.",
    pns:                  "Projected National Share — BBC's estimate, by Curtice & Fisher, of the GB-wide vote share if local elections had been held everywhere.",
    nev:                  "National Equivalent Vote — Rallings & Thrasher's estimate, in the Sunday Times, of the national vote share weighted to a uniform contest pattern.",
    uns:                  "Uniform National Swing — applies the change in national vote share equally to every ward. A baseline; often inaccurate when swings vary by area or party.",
    differential_swing:   "When the change in vote share differs across regions or types of seat — the failure mode that breaks Uniform National Swing.",
    iqr:                  "Inter-quartile range — the middle 50% of values (25th to 75th percentile). A robust measure of how much the methods agree.",
    consensus:            "Median of the visible non-outlier methods' central estimates. A robust 'middle-of-pack' figure.",
  };

  // Build helpful lookups -----------------------------------------------------

  const accuracyByMethod = Object.fromEntries(ACC.ranking.map(r => [r.method_id, r]));
  const methodById = Object.fromEntries(METHODS.map(m => [m.id, m]));

  // Sort methods so dot-row legend reads best-→-worst.
  const METHODS_SORTED = METHODS.slice().sort((a, b) => {
    const ar = (accuracyByMethod[a.id] || {}).rank || 99;
    const br = (accuracyByMethod[b.id] || {}).rank || 99;
    return ar - br;
  });

  // State ---------------------------------------------------------------------

  const TOP_N_DEFAULT = 3;
  const top3MethodIds = ACC.ranking.slice().sort((a, b) => a.rank - b.rank).slice(0, TOP_N_DEFAULT).map(r => r.method_id);

  const state = {
    region: "NAT",
    party: "ALL",
    view: "dotrows",
    showOutliers: true,
    enabled: new Set(top3MethodIds),  // method ids currently visible — default to top 3 by accuracy
  };

  // Element refs --------------------------------------------------------------

  const $region    = document.getElementById("region");
  const $party     = document.getElementById("party-filter");
  const $view      = document.getElementById("view-mode");
  const $outliers  = document.getElementById("show-outliers");
  const $chart     = document.getElementById("chart");
  const $tableBody = document.querySelector("#ranking-table tbody");
  const $cards     = document.getElementById("methods-cards");
  const $glossary  = document.getElementById("glossary");
  const $sources   = document.getElementById("sources-list");
  const $meta      = document.getElementById("meta-line");
  const $tooltip   = document.getElementById("tooltip");
  const $chipList  = document.getElementById("method-chip-list");
  const $summary   = document.getElementById("summary-stats");

  // ---- Static UI ------------------------------------------------------------

  REGIONS.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name + " (" + r.total_seats.toLocaleString("en-GB") + " seats)";
    $region.appendChild(opt);
  });

  PARTIES.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    $party.appendChild(opt);
  });

  // Method cards (compact descriptions)
  METHODS.forEach(m => {
    const card = document.createElement("div");
    card.className = "method-card" + (m.outlier ? " outlier" : "");
    card.innerHTML = `
      <h4>${escape(m.name)}</h4>
      <div class="author">${escape(m.author)}</div>
      <p>${escape(m.description)}</p>
      <a href="${escape(m.source_url)}" target="_blank" rel="noopener">Source ↗</a>
    `;
    $cards.appendChild(card);
  });

  // Method chips (legend + toggle)
  METHODS_SORTED.forEach((m, idx) => {
    const acc = accuracyByMethod[m.id];
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip method-chip";
    chip.dataset.methodId = m.id;
    chip.title = `${m.name} — rank #${acc ? acc.rank : "?"}, score ${acc ? acc.score : "?"}`;
    chip.setAttribute("data-tip", `${m.name}. Track-record rank #${acc ? acc.rank : "?"} (composite ${acc ? acc.score : "?"}/100).`);
    chip.innerHTML = `<span class="swatch" style="background:${methodColour(m.id)}"></span>${escape(m.short)}<span class="mae">#${acc ? acc.rank : "?"}</span>`;
    chip.addEventListener("click", () => {
      if (state.enabled.has(m.id)) state.enabled.delete(m.id);
      else state.enabled.add(m.id);
      syncChips();
      buildChart();
    });
    $chipList.appendChild(chip);
  });

  // Preset chip handlers
  document.querySelectorAll(".chip.preset").forEach(btn => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });

  function presetSet(preset) {
    if (preset === "all")     return new Set(METHODS.map(m => m.id));
    if (preset === "none")    return new Set();
    if (preset === "top3")    return new Set(ACC.ranking.slice().sort((a, b) => a.rank - b.rank).slice(0, 3).map(r => r.method_id));
    if (preset === "bottom3") return new Set(ACC.ranking.slice().sort((a, b) => b.rank - a.rank).slice(0, 3).map(r => r.method_id));
    return null;
  }

  function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  function applyPreset(preset) {
    const s = presetSet(preset);
    if (!s) return;
    state.enabled = s;
    syncChips();
    buildChart();
  }

  function syncChips() {
    document.querySelectorAll(".chip.method-chip").forEach(el => {
      const on = state.enabled.has(el.dataset.methodId);
      el.classList.toggle("off", !on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
      el.title = on ? "Click to remove from chart" : "Click to add to chart";
    });
    document.querySelectorAll(".chip.preset").forEach(el => {
      const matches = setsEqual(state.enabled, presetSet(el.dataset.preset));
      el.classList.toggle("active", matches);
      el.setAttribute("aria-pressed", matches ? "true" : "false");
    });
  }

  // Accuracy table
  ACC.ranking.forEach(row => {
    const tr = document.createElement("tr");
    const m = methodById[row.method_id] || {};
    tr.innerHTML = `
      <td>${row.rank}</td>
      <td><strong>${escape(m.name || row.method_id)}</strong><br><span style="color:var(--muted);font-size:0.85em">${escape(m.author || "")}</span></td>
      <td class="score-cell">${row.score}</td>
      <td class="num-cell">${row.mean_abs_seat_error_per_council.toFixed(1)}</td>
      <td class="num-cell">${(row.control_hit_rate * 100).toFixed(0)}%</td>
      <td class="col-strengths">${escape(row.strengths)}</td>
      <td class="col-weaknesses">${escape(row.weaknesses)}</td>
    `;
    $tableBody.appendChild(tr);
  });

  // Glossary
  Object.entries(GLOSSARY).forEach(([k, v]) => {
    const dt = document.createElement("dt");
    dt.textContent = humanise(k);
    const dd = document.createElement("dd");
    dd.textContent = v;
    $glossary.appendChild(dt);
    $glossary.appendChild(dd);
  });

  // Sources
  META.sources.forEach(s => {
    const li = document.createElement("li");
    li.innerHTML = `<a href="${escape(s.url)}" target="_blank" rel="noopener">${escape(s.name)}</a>`;
    $sources.appendChild(li);
  });

  // Meta line + scope note
  $meta.textContent = `Updated ${formatDate(META.last_updated)} · forecasting ${PRED.election.total_seats.toLocaleString("en-GB")} seats across ${PRED.election.councils} councils · polling window ${META.polling_window}`;
  const $countdown = document.getElementById("countdown");
  if ($countdown && PRED.election?.date) {
    // Compute live from today vs the election date — that way the badge stays correct
    // between data refreshes. Both values are normalised to UTC midnight so day-count
    // doesn't drift by timezone.
    const electionDate = new Date(PRED.election.date + "T00:00:00Z");
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const d = Math.round((electionDate - today) / (1000 * 60 * 60 * 24));
    const electionLabel = electionDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    let label;
    if (d > 1)       label = `${d} days until ${electionLabel}`;
    else if (d === 1) label = `Tomorrow · ${electionLabel}`;
    else if (d === 0) label = `Polling day · ${electionLabel}`;
    else if (d === -1) label = `Polled yesterday · ${electionLabel}`;
    else              label = `${-d} days since polling · ${electionLabel}`;

    $countdown.textContent = label;
    $countdown.classList.toggle("post-election", d < 0);
    $countdown.classList.toggle("polling-day",   d === 0);
  }
  const $scopeNote = document.getElementById("scope-note");
  if ($scopeNote && PRED.election.scope) {
    $scopeNote.innerHTML =
      `<strong>Scope:</strong> ${escape(PRED.election.scope)}` +
      `<br><strong>National total:</strong> ${escape(PRED.election.national_note || "")}`;
  }

  // Tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach(b => {
        const on = b.dataset.tab === target;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      document.querySelectorAll(".tab-panel").forEach(p => {
        p.classList.toggle("active", p.dataset.panel === target);
      });
    });
  });

  // ---- Chart dispatcher -----------------------------------------------------

  function buildChart() {
    // Always tear down whatever was previously rendered — Plotly state, table DOM,
    // or both — before drawing the new view. Avoids blank-graph and stale-state bugs.
    try { Plotly.purge($chart); } catch (e) { /* element may not have been a plotly graph */ }
    $chart.innerHTML = "";

    if (state.view === "table") {
      $chart.style.height = "auto";
      renderTable();
    } else if (state.view === "strip") {
      $chart.style.height = "auto";
      buildConsensusStrip();
    } else {
      $chart.style.height = "";
      if (state.view === "dotrows") buildDotRowChart();
      else buildGroupedChart();
    }
    renderSummary();
  }

  // ---- View 1: dot rows (one row per party) ---------------------------------

  function buildDotRowChart() {
    const partiesShown = state.party === "ALL" ? PARTIES : PARTIES.filter(p => p.id === state.party);
    const methodsShown = METHODS_SORTED.filter(m => state.enabled.has(m.id) && (state.showOutliers || !m.outlier));

    const isNarrow = window.innerWidth < 720;
    const dotSize       = isNarrow ? 14 : 11;
    const dotSizeOutlier = isNarrow ? 12 : 9;
    const rangeWidth    = isNarrow ? 9 : 7;
    const consensusSize = isNarrow ? 14 : 12;

    const traces = [];
    const partyLabel = p => isNarrow ? p.id : p.name;
    const yLabels = partiesShown.map(partyLabel);

    // Compute global x-axis cap from data
    let maxX = 0;
    PARTIES.forEach(p => {
      METHODS.forEach(m => {
        const v = PRED.predictions[m.id]?.[state.region]?.[p.id];
        if (v) maxX = Math.max(maxX, v.high);
      });
    });
    maxX = Math.ceil(maxX / 100) * 100;

    // For each party row: IQR band + range bars + dots + consensus + defending
    partiesShown.forEach((party, rowIdx) => {
      const yVal = partyLabel(party);

      // 1. Cross-method IQR band (25th-75th of central estimates among non-outlier visible methods)
      const nonOutlierCentrals = methodsShown
        .filter(m => !m.outlier)
        .map(m => PRED.predictions[m.id][state.region][party.id].central)
        .sort((a, b) => a - b);
      if (nonOutlierCentrals.length >= 3) {
        const q1 = quantile(nonOutlierCentrals, 0.25);
        const q3 = quantile(nonOutlierCentrals, 0.75);
        const median = quantile(nonOutlierCentrals, 0.5);
        traces.push({
          type: "bar",
          orientation: "h",
          name: "IQR (25th–75th)",
          legendgroup: "iqr",
          showlegend: !isNarrow && rowIdx === 0,
          y: [yVal],
          x: [q3 - q1],
          base: [q1],
          marker: { color: "rgba(20, 33, 61, 0.14)" },
          width: 0.55,
          hovertemplate: `<b>${escape(party.name)}</b><br>IQR (across non-outlier methods)<br>${q1}–${q3} seats<br>Median: ${median}<extra></extra>`,
        });
        // Consensus diamond (median)
        traces.push({
          type: "scatter",
          mode: "markers",
          name: "Consensus median",
          legendgroup: "consensus",
          showlegend: !isNarrow && rowIdx === 0,
          y: [yVal],
          x: [median],
          marker: { symbol: "diamond", size: consensusSize, color: "#14213D", line: { color: "#FFFFFF", width: 1.2 } },
          hovertemplate: `<b>${escape(party.name)}</b><br>Median (non-outlier methods): ${median} seats<extra></extra>`,
        });
      }

      // 2. Per-method range bars (low–high), drawn as thin horizontal segments
      methodsShown.forEach(m => {
        const band = PRED.predictions[m.id][state.region][party.id];
        const colour = methodColour(m.id);
        traces.push({
          type: "scatter",
          mode: "lines",
          legendgroup: m.id,
          showlegend: false,
          x: [band.low, band.high],
          y: [yVal, yVal],
          line: { color: hexToRgba(colour, m.outlier ? 0.18 : 0.32), width: rangeWidth },
          hoverinfo: "skip",
        });
      });

      // 3. Per-method dots at central estimate
      methodsShown.forEach(m => {
        const band = PRED.predictions[m.id][state.region][party.id];
        const colour = methodColour(m.id);
        const acc = accuracyByMethod[m.id];
        traces.push({
          type: "scatter",
          mode: "markers",
          name: m.short + (m.outlier ? " · outlier" : ""),
          legendgroup: m.id,
          showlegend: !isNarrow && rowIdx === 0,
          x: [band.central],
          y: [yVal],
          marker: {
            color: colour,
            size: m.outlier ? dotSizeOutlier : dotSize,
            opacity: m.outlier ? 0.55 : 1,
            line: { color: "#FFFFFF", width: 1.2 },
            symbol: m.outlier ? "circle-open" : "circle",
          },
          customdata: [[band.low, band.high, acc ? acc.rank : "?", acc ? acc.score : "?"]],
          hovertemplate:
            `<b>${escape(m.name)}</b> (rank #%{customdata[2]})<br>` +
            `${escape(party.name)}: <b>%{x}</b> seats<br>` +
            `Range: %{customdata[0]}–%{customdata[1]}` +
            `<extra></extra>`,
        });
      });

      // 4. Defending baseline marker (triangle)
      const baseline = PRED.baseline_2022?.[state.region]?.[party.id];
      if (baseline != null) {
        traces.push({
          type: "scatter",
          mode: "markers",
          name: "Defending baseline",
          legendgroup: "baseline",
          showlegend: !isNarrow && rowIdx === 0,
          x: [baseline],
          y: [yVal],
          marker: { symbol: "triangle-right", size: isNarrow ? 16 : 14, color: party.colour, line: { color: "#14213D", width: 1 } },
          hovertemplate: `<b>${escape(party.name)}</b><br>Seats defended (last comparable round): ${baseline}<extra></extra>`,
        });
      }
    });

    const region = REGIONS.find(r => r.id === state.region);
    const layout = {
      barmode: "overlay",
      margin: isNarrow
        ? { l: 38, r: 8,  t: 14, b: 44 }
        : { l: 110, r: 24, t: 20, b: 50 },
      xaxis: {
        title: { text: "Predicted seats", standoff: 6 },
        gridcolor: "#E2E2DC", zerolinecolor: "#C0BCB3",
        range: [0, maxX],
        nticks: isNarrow ? 4 : undefined,
        tickfont: { size: isNarrow ? 10 : 12 },
      },
      yaxis: {
        autorange: "reversed",
        tickfont: { size: isNarrow ? 11 : 12 },
        fixedrange: isNarrow ? true : undefined,   // categorical — don't let users pan it on mobile
      },
      dragmode: isNarrow ? "pan" : undefined,
      legend: { orientation: "h", y: -0.15, font: { size: 11 } },
      paper_bgcolor: "#FFFFFF",
      plot_bgcolor: "#FFFFFF",
      hovermode: "closest",
      hoverlabel: { bgcolor: "#14213D", font: { color: "#FFFFFF" } },
      annotations: [{
        text: `${region.name} · ${region.total_seats.toLocaleString("en-GB")} seats`,
        showarrow: false, x: 0, xref: "paper", y: 1.04, yref: "paper",
        xanchor: "left", font: { size: isNarrow ? 11 : 12, color: "#5A5A5A" }
      }],
      bargap: 0.4,
      height: isNarrow
        ? Math.max(360, 60 * partiesShown.length + 110)
        : Math.max(400, 78 * partiesShown.length + 130),
    };

    Plotly.newPlot($chart, traces, layout, isNarrow ? mobilePlotConfig() : desktopPlotConfig());

    // On mobile the bottom Plotly legend is hidden (the chip strip serves as the
    // method legend). Render an inline caption explaining the IQR / consensus /
    // defending markers so the chart's semantics aren't lost.
    if (isNarrow) {
      const cap = document.createElement("p");
      cap.className = "chart-mobile-legend";
      cap.innerHTML = `<span class="m-iqr"></span>shaded band = IQR &nbsp; <span class="m-consensus">◆</span> consensus median &nbsp; <span class="m-defend">▶</span> seats defended<br><span class="gesture-hint">Pinch to zoom · drag to pan · tap a dot for details</span>`;
      $chart.appendChild(cap);
    }
  }

  // ---- View 2: grouped bars (original) --------------------------------------

  function buildGroupedChart() {
    const partiesToShow = state.party === "ALL" ? PARTIES : PARTIES.filter(p => p.id === state.party);
    const methodsShown = METHODS_SORTED.filter(m => state.enabled.has(m.id) && (state.showOutliers || !m.outlier));
    const isNarrow = window.innerWidth < 720;

    const traces = [];
    methodsShown.forEach(method => {
      const byParty = PRED.predictions[method.id][state.region];
      const x = partiesToShow.map(p => isNarrow ? p.id : p.name);
      const y = partiesToShow.map(p => byParty[p.id].central);
      const errPlus  = partiesToShow.map(p => byParty[p.id].high - byParty[p.id].central);
      const errMinus = partiesToShow.map(p => byParty[p.id].central - byParty[p.id].low);
      traces.push({
        type: "bar",
        name: method.short + (method.outlier ? " · outlier" : ""),
        x, y,
        error_y: {
          type: "data", symmetric: false,
          array: errPlus, arrayminus: errMinus,
          color: "rgba(20, 33, 61, 0.65)", thickness: 1.5, width: 4,
        },
        marker: {
          color: methodColour(method.id),
          opacity: method.outlier ? 0.55 : 0.92,
          line: { color: "#14213D", width: 0.5 },
        },
        showlegend: !isNarrow,
        hovertemplate:
          `<b>${escape(method.name)}</b><br>` +
          "%{x}: <b>%{y}</b> seats<br>" +
          "Range: %{customdata[0]}–%{customdata[1]} seats<extra></extra>",
        customdata: partiesToShow.map(p => [byParty[p.id].low, byParty[p.id].high]),
      });
    });

    const region = REGIONS.find(r => r.id === state.region);
    const layout = {
      barmode: "group",
      margin: isNarrow ? { l: 40, r: 8, t: 14, b: 44 } : { l: 56, r: 16, t: 18, b: 56 },
      xaxis: {
        title: isNarrow ? null : { text: "Party", standoff: 8 },
        tickfont: { size: isNarrow ? 11 : 12 },
        fixedrange: isNarrow ? true : undefined,    // categorical — lock on mobile
      },
      yaxis: {
        title: isNarrow ? null : { text: "Predicted seats" },
        gridcolor: "#E2E2DC", zerolinecolor: "#C0BCB3",
        tickfont: { size: isNarrow ? 10 : 12 },
      },
      dragmode: isNarrow ? "pan" : undefined,
      legend: { orientation: "h", y: -0.18, font: { size: 11 } },
      paper_bgcolor: "#FFFFFF",
      plot_bgcolor: "#FFFFFF",
      hovermode: "closest",
      hoverlabel: { bgcolor: "#14213D", font: { color: "#FFFFFF" } },
      annotations: [{
        text: `${region.name} · ${region.total_seats.toLocaleString("en-GB")} seats`,
        showarrow: false, x: 0, xref: "paper", y: 1.05, yref: "paper",
        xanchor: "left", font: { size: isNarrow ? 11 : 12, color: "#5A5A5A" }
      }],
      height: isNarrow ? 420 : 540,
    };
    Plotly.newPlot($chart, traces, layout, isNarrow ? mobilePlotConfig() : desktopPlotConfig());
  }

  // Shared Plotly config — desktop keeps the original modebar trim; mobile gets a
  // persistent, slimmed modebar (zoom in / out / reset) and pan as the default
  // drag gesture so a one-finger swipe pans rather than drawing a zoom box.
  function desktopPlotConfig() {
    return {
      displaylogo: false,
      responsive: true,
      modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
    };
  }
  function mobilePlotConfig() {
    return {
      displaylogo: false,
      responsive: true,
      displayModeBar: true,
      modeBarButtons: [["zoomIn2d", "zoomOut2d", "resetScale2d"]],
      scrollZoom: false,
      doubleClick: "reset",
    };
  }

  // ---- View: consensus strip (single horizontal stacked bar) ----------------

  function buildConsensusStrip() {
    const partiesShown = state.party === "ALL" ? PARTIES : PARTIES.filter(p => p.id === state.party);
    const methodsShown = METHODS_SORTED.filter(m => state.enabled.has(m.id) && (state.showOutliers || !m.outlier));
    const nonOutlierMethods = methodsShown.filter(m => !m.outlier);
    const region = REGIONS.find(r => r.id === state.region);
    const isNarrow = window.innerWidth < 720;

    if (methodsShown.length === 0) {
      $chart.innerHTML = `<p class="muted-small" style="padding:1rem">No methods selected. Use the chips above to pick at least one.</p>`;
      return;
    }

    // Per-party consensus median (across non-outlier visible methods if we have any,
    // otherwise across all visible methods so the chart still shows something).
    const stats = partiesShown.map(party => {
      const pool = (nonOutlierMethods.length ? nonOutlierMethods : methodsShown);
      const centrals = pool
        .map(m => PRED.predictions[m.id][state.region][party.id].central)
        .sort((a, b) => a - b);
      const allCentrals = methodsShown
        .map(m => PRED.predictions[m.id][state.region][party.id].central)
        .sort((a, b) => a - b);
      const consensus = quantile(centrals, 0.5);
      const baseline = PRED.baseline_2022?.[state.region]?.[party.id] ?? null;
      return {
        party,
        consensus,
        baseline,
        delta: baseline != null ? consensus - baseline : null,
        rangeLow:  allCentrals[0],
        rangeHigh: allCentrals[allCentrals.length - 1],
      };
    });

    // Order segments by consensus descending — biggest party first, like the screenshot.
    const ordered = stats.slice().sort((a, b) => b.consensus - a.consensus);

    // Build the stacked bar (one trace per party so legend hover/click would work,
    // though we hide the Plotly legend since the per-party rows below act as legend).
    const traces = ordered.map(s => ({
      type: "bar",
      orientation: "h",
      name: s.party.name,
      y: ["consensus"],
      x: [s.consensus],
      marker: { color: s.party.colour, line: { color: "#FFFFFF", width: 1 } },
      text: [String(s.consensus)],
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: "#FFFFFF", size: 13, family: "inherit" },
      hovertemplate:
        `<b>${escape(s.party.name)}</b><br>` +
        `Consensus: <b>%{x}</b> seats<br>` +
        (s.baseline != null ? `From 2022: ${s.baseline} (${s.delta >= 0 ? "+" : ""}${s.delta})<br>` : "") +
        `Range across ${methodsShown.length} method${methodsShown.length === 1 ? "" : "s"}: ${s.rangeLow}–${s.rangeHigh}` +
        `<extra></extra>`,
      showlegend: false,
    }));

    // Header line above the bar (plain HTML — keeps it clear of the chart geometry).
    const head = document.createElement("p");
    head.className = "strip-header muted-small";
    const consensusN = nonOutlierMethods.length || methodsShown.length;
    head.textContent = `${region.name} · ${region.total_seats.toLocaleString("en-GB")} seats · consensus across ${consensusN} method${consensusN === 1 ? "" : "s"}`;
    $chart.appendChild(head);

    const stripHost = document.createElement("div");
    stripHost.className = "strip-host";
    $chart.appendChild(stripHost);

    const layout = {
      barmode: "stack",
      margin: { l: 8, r: 8, t: 6, b: 6 },
      xaxis: {
        range: [0, region.total_seats],
        showticklabels: false,
        showgrid: false,
        zeroline: false,
        fixedrange: true,
      },
      yaxis: {
        showticklabels: false,
        showgrid: false,
        zeroline: false,
        fixedrange: true,
      },
      paper_bgcolor: "#FFFFFF",
      plot_bgcolor: "#FFFFFF",
      hovermode: "closest",
      hoverlabel: { bgcolor: "#14213D", font: { color: "#FFFFFF" } },
      bargap: 0,
      height: 72,
      showlegend: false,
    };

    Plotly.newPlot(stripHost, traces, layout, {
      displaylogo: false,
      responsive: true,
      displayModeBar: false,
    });

    // Per-party rows under the strip — one line each, mirroring the screenshot:
    // colour swatch · name · consensus · "from <baseline>" · ±delta · range
    const wrap = document.createElement("div");
    wrap.className = "strip-rows";
    ordered.forEach(s => {
      const row = document.createElement("div");
      row.className = "strip-row";
      const deltaHtml = (s.delta != null)
        ? `<span class="strip-delta ${s.delta >= 0 ? "up" : "down"}">${s.delta >= 0 ? "+" : ""}${formatNum(s.delta)}</span>`
        : "";
      const baselineHtml = (s.baseline != null) ? `<span class="strip-base">from ${formatNum(s.baseline)}</span>` : "";
      const spread = s.rangeHigh - s.rangeLow;
      const rangeHtml = spread > 0
        ? `<span class="strip-range">range ${formatNum(s.rangeLow)}–${formatNum(s.rangeHigh)} across ${methodsShown.length} method${methodsShown.length === 1 ? "" : "s"}</span>`
        : `<span class="strip-range">all visible methods agree</span>`;
      row.innerHTML = `
        <span class="strip-swatch" style="background:${s.party.colour}"></span>
        <span class="strip-name">${escape(s.party.name)}</span>
        <span class="strip-central">${formatNum(s.consensus)}</span>
        ${baselineHtml}
        ${deltaHtml}
        ${rangeHtml}
      `;
      wrap.appendChild(row);
    });
    $chart.appendChild(wrap);

    // Caption explaining the framing — matches the codebase's honesty about uncertainty.
    const cap = document.createElement("p");
    cap.className = "caption muted-small";
    cap.innerHTML = `<strong>Headline view.</strong> The bar shows the median across visible non-outlier methods. The range under each party shows how much the visible methods disagree. Toggle methods using the chips above; switch to <em>Compare methods</em> to see every method's prediction with confidence bands.`;
    $chart.appendChild(cap);
  }

  // ---- View 3: table -------------------------------------------------------

  function renderTable() {
    const partiesShown = state.party === "ALL" ? PARTIES : PARTIES.filter(p => p.id === state.party);
    const methodsShown = METHODS_SORTED.filter(m => state.enabled.has(m.id) && (state.showOutliers || !m.outlier));

    const tbl = document.createElement("table");
    tbl.className = "predictions";

    // Header
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    trh.appendChild(th(""));
    partiesShown.forEach(p => {
      const cell = th(p.name);
      cell.style.color = p.colour;
      trh.appendChild(cell);
    });
    thead.appendChild(trh);
    tbl.appendChild(thead);

    const tbody = document.createElement("tbody");

    // Defending row
    const trDef = document.createElement("tr");
    trDef.className = "defending-row";
    trDef.appendChild(td("Defending", "row-label", "<small>baseline seats</small>"));
    partiesShown.forEach(p => {
      const v = PRED.baseline_2022?.[state.region]?.[p.id];
      trDef.appendChild(td(v != null ? formatNum(v) : "—", "num"));
    });
    tbody.appendChild(trDef);

    // Per-method rows + per-party highest/lowest tracking
    const centralByParty = {};                      // pid -> [{methodId, value}]
    partiesShown.forEach(p => centralByParty[p.id] = []);

    methodsShown.forEach((m, i) => {
      const acc = accuracyByMethod[m.id];
      const tr = document.createElement("tr");
      const labelHtml = `${i + 1}. ${escape(m.name)}` +
                       (m.outlier ? ` <span class="muted-small">· outlier</span>` : "") +
                       `<small>${escape(m.author)} · rank #${acc ? acc.rank : "?"}</small>`;
      const labelCell = td("", "row-label", labelHtml);
      tr.appendChild(labelCell);

      partiesShown.forEach(p => {
        const band = PRED.predictions[m.id][state.region][p.id];
        const cellHtml =
          `<span class="central">${formatNum(band.central)}</span>` +
          `<span class="range">${formatNum(band.low)}–${formatNum(band.high)}</span>`;
        const cell = td("", "num", cellHtml);
        cell.dataset.party = p.id;
        cell.dataset.value = band.central;
        tr.appendChild(cell);
        if (!m.outlier) centralByParty[p.id].push({ methodId: m.id, value: band.central, cell });
      });
      tbody.appendChild(tr);
    });

    // Apply hi/lo shading per party (across non-outlier visible methods)
    partiesShown.forEach(p => {
      const list = centralByParty[p.id];
      if (list.length < 2) return;
      const max = Math.max(...list.map(x => x.value));
      const min = Math.min(...list.map(x => x.value));
      list.forEach(x => {
        if (x.value === max) x.cell.classList.add("cell-hi");
        if (x.value === min) x.cell.classList.add("cell-lo");
      });
    });

    // Summary rows
    const stats = computeStatsByParty(partiesShown, methodsShown);

    pushSummaryRow(tbody, "Minimum",       partiesShown, p => formatNum(stats[p.id].min));
    pushSummaryRow(tbody, "Maximum",       partiesShown, p => formatNum(stats[p.id].max));
    pushSummaryRow(tbody, "Range (max−min)",partiesShown, p => formatNum(stats[p.id].max - stats[p.id].min));
    pushSummaryRow(tbody, "Range as % of consensus", partiesShown, p => {
      const c = stats[p.id].consensus;
      return c > 0 ? Math.round(100 * (stats[p.id].max - stats[p.id].min) / c) + "%" : "—";
    });

    const trCons = document.createElement("tr");
    trCons.className = "consensus-row";
    trCons.appendChild(td("Consensus estimate", "row-label",
      "<small>median across non-outlier methods</small>"));
    partiesShown.forEach(p => {
      const cell = td(formatNum(stats[p.id].consensus), "num");
      cell.style.color = p.colour;
      cell.style.fontWeight = "700";
      trCons.appendChild(cell);
    });
    tbody.appendChild(trCons);

    pushSummaryRow(tbody, "80% interval", partiesShown, p =>
      `${formatNum(stats[p.id].q10)}–${formatNum(stats[p.id].q90)}`,
      "<small>10th–90th percentile</small>");

    tbl.appendChild(tbody);

    $chart.innerHTML = "";
    $chart.appendChild(tbl);

    // Reading-the-table caption
    const cap = document.createElement("p");
    cap.className = "caption";
    cap.innerHTML = `<strong>Reading:</strong> the central figure is each method's headline; the small range below is its low–high. Green-edged cells are the highest prediction for that party across non-outlier methods; red-edged are the lowest.`;
    $chart.appendChild(cap);
  }

  function th(text) {
    const el = document.createElement("th");
    el.textContent = text;
    return el;
  }
  function td(text, className, html) {
    const el = document.createElement("td");
    if (className) el.className = className;
    if (html != null) el.innerHTML = (text ? escape(text) : "") + html;
    else el.textContent = text;
    return el;
  }
  function pushSummaryRow(tbody, label, parties, valueFn, sublabel) {
    const tr = document.createElement("tr");
    tr.className = "summary-row";
    tr.appendChild(td(label, "row-label", sublabel || ""));
    parties.forEach(p => tr.appendChild(td(valueFn(p), "num")));
    tbody.appendChild(tr);
  }

  function computeStatsByParty(partiesShown, methodsShown) {
    const out = {};
    partiesShown.forEach(p => {
      const allCentrals = methodsShown.map(m => PRED.predictions[m.id][state.region][p.id].central);
      const nonOutCentrals = methodsShown
        .filter(m => !m.outlier)
        .map(m => PRED.predictions[m.id][state.region][p.id].central)
        .sort((a, b) => a - b);
      const sorted = allCentrals.slice().sort((a, b) => a - b);
      out[p.id] = {
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
        consensus: nonOutCentrals.length ? quantile(nonOutCentrals, 0.5) : 0,
        q10: sorted.length ? quantile(sorted, 0.10) : 0,
        q90: sorted.length ? quantile(sorted, 0.90) : 0,
      };
    });
    return out;
  }

  // ---- Summary stats block --------------------------------------------------

  function renderSummary() {
    const methodsShown = METHODS_SORTED.filter(m => state.enabled.has(m.id) && (state.showOutliers || !m.outlier));
    if (methodsShown.length === 0) {
      $summary.innerHTML = "<em>No methods selected.</em>";
      return;
    }
    const partiesShown = state.party === "ALL" ? PARTIES : PARTIES.filter(p => p.id === state.party);
    const partyLines = partiesShown.map(party => {
      const centrals = methodsShown
        .map(m => PRED.predictions[m.id][state.region][party.id].central)
        .sort((a, b) => a - b);
      const lo = centrals[0], hi = centrals[centrals.length - 1];
      const q1 = quantile(centrals, 0.25);
      const q3 = quantile(centrals, 0.75);
      return `<span class="summary-row"><span class="party-name" style="color:${party.colour}">${escape(party.name)}</span>: ${formatNum(lo)}–${formatNum(hi)} (spread ${formatNum(hi - lo)}) · IQR ${formatNum(q1)}–${formatNum(q3)}</span>`;
    }).join("");
    const region = REGIONS.find(r => r.id === state.region);
    $summary.innerHTML = `
      <div class="summary-head">${methodsShown.length} method${methodsShown.length === 1 ? "" : "s"} visible · ${escape(region.name)}</div>
      ${partyLines}
    `;
  }

  // ---- Tooltip system -------------------------------------------------------

  document.addEventListener("mouseover", e => {
    const t = e.target.closest("[data-tip]");
    if (!t) return;
    showTooltip(t.getAttribute("data-tip"), e.clientX, e.clientY);
  });
  document.addEventListener("mousemove", e => {
    if ($tooltip.classList.contains("visible")) positionTooltip(e.clientX, e.clientY);
  });
  document.addEventListener("mouseout", e => {
    if (e.target.closest("[data-tip]")) hideTooltip();
  });

  function showTooltip(text, x, y) {
    $tooltip.textContent = text;
    $tooltip.classList.add("visible");
    $tooltip.setAttribute("aria-hidden", "false");
    positionTooltip(x, y);
  }
  function hideTooltip() {
    $tooltip.classList.remove("visible");
    $tooltip.setAttribute("aria-hidden", "true");
  }
  function positionTooltip(x, y) {
    const pad = 12;
    const w = $tooltip.offsetWidth, h = $tooltip.offsetHeight;
    let left = x + pad, top = y + pad;
    if (left + w > window.innerWidth - 8)  left = x - w - pad;
    if (top + h > window.innerHeight - 8)  top  = y - h - pad;
    $tooltip.style.left = left + "px";
    $tooltip.style.top  = top + "px";
  }

  // ---- Wire-up --------------------------------------------------------------

  $region.addEventListener("change",   e => { state.region = e.target.value; buildChart(); });
  $party.addEventListener("change",    e => { state.party = e.target.value;  buildChart(); });
  $view.addEventListener("change",     e => { state.view  = e.target.value;  buildChart(); });
  $outliers.addEventListener("change", e => { state.showOutliers = e.target.checked; buildChart(); });

  $region.value = state.region;
  $view.value   = state.view;
  syncChips();
  buildChart();

  // Re-build the chart on viewport-width transitions so the mobile/desktop
  // layout branch picks the right values. Debounced; only fires if the
  // narrow-vs-wide threshold actually crossed since the last build.
  let lastNarrow = window.innerWidth < 720;
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const nowNarrow = window.innerWidth < 720;
      if (nowNarrow !== lastNarrow) {
        lastNarrow = nowNarrow;
        if (state.view !== "table") buildChart();
      }
    }, 200);
  });

  // ---- Utils ---------------------------------------------------------------

  function methodColour(idOrIdx) {
    const palette = {
      POLLCHECK_MC:  "#0B4F9C",
      YOUGOV_MRP:    "#02A95B",
      RT_NEV:        "#7E3FBF",
      BBC_PNS:       "#117A8B",
      EC_STRONG:     "#A8123E",
      ELECTIONS_ETC: "#C97800",
      BY_ELECTION:   "#7C4D2A",
      UNS:           "#586673",
    };
    return palette[idOrIdx] || "#586673";
  }

  function hexToRgba(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function quantile(sortedArr, q) {
    if (sortedArr.length === 0) return null;
    if (sortedArr.length === 1) return sortedArr[0];
    const pos = (sortedArr.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = sortedArr[base + 1];
    return next !== undefined ? Math.round(sortedArr[base] + rest * (next - sortedArr[base]))
                              : sortedArr[base];
  }

  function formatNum(n) { return n.toLocaleString("en-GB"); }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }
  function humanise(s) { return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }
})();
