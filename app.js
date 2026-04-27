/* UK Local Elections 2026 forecast comparator. Plain ES2017, no build step. */
(function () {
  "use strict";

  const DATA = window.UKE_DATA;
  if (!DATA) {
    document.body.innerHTML = "<p style='padding:2rem'>Could not load data. Run <code>python3 scripts/build_data_js.py</code> to regenerate <code>data/data.js</code>.</p>";
    return;
  }

  const PRED   = DATA.predictions;
  const ACC    = DATA.accuracy;
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
  };

  // Element refs
  const $region   = document.getElementById("region");
  const $party    = document.getElementById("party-filter");
  const $outliers = document.getElementById("show-outliers");
  const $chart    = document.getElementById("chart");
  const $tableBody = document.querySelector("#ranking-table tbody");
  const $cards    = document.getElementById("methods-cards");
  const $glossary = document.getElementById("glossary");
  const $sources  = document.getElementById("sources-list");
  const $meta     = document.getElementById("meta-line");
  const $version  = document.getElementById("data-version");
  const $tooltip  = document.getElementById("tooltip");

  // ---- Populate static UI ----

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

  // Methods cards
  METHODS.forEach(m => {
    const card = document.createElement("div");
    card.className = "method-card" + (m.outlier ? " outlier" : "");
    card.innerHTML = `
      <h3>${escape(m.name)}</h3>
      <div class="author">${escape(m.author)}</div>
      <p>${escape(m.description)}</p>
      <a href="${escape(m.source_url)}" target="_blank" rel="noopener">Source ↗</a>
    `;
    $cards.appendChild(card);
  });

  // Accuracy table
  const methodById = Object.fromEntries(METHODS.map(m => [m.id, m]));
  ACC.ranking.forEach(row => {
    const tr = document.createElement("tr");
    const m = methodById[row.method_id] || {};
    tr.innerHTML = `
      <td>${row.rank}</td>
      <td><strong>${escape(m.name || row.method_id)}</strong><br><span style="color:var(--muted);font-size:0.85em">${escape(m.author || "")}</span></td>
      <td class="score-cell">${row.score}</td>
      <td>${row.mean_abs_seat_error_per_council.toFixed(1)}</td>
      <td>${(row.control_hit_rate * 100).toFixed(0)}%</td>
      <td>${escape(row.strengths)}</td>
      <td>${escape(row.weaknesses)}</td>
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

  $meta.textContent = `Last updated: ${formatDate(META.last_updated)} · Polling window: ${META.polling_window} · ${PRED.election.total_seats.toLocaleString("en-GB")} seats up across ${PRED.election.councils} councils`;
  $version.textContent = META.data_version;

  // ---- Chart ----

  function buildChart() {
    const regionId = $region.value;
    const partyHighlight = $party.value;
    const showOutliers = $outliers.checked;

    const partiesToShow = partyHighlight === "ALL" ? PARTIES : PARTIES.filter(p => p.id === partyHighlight);

    const traces = [];
    METHODS.forEach((method, idx) => {
      if (method.outlier && !showOutliers) return;
      const byParty = PRED.predictions[method.id][regionId];
      if (!byParty) return;

      const x = partiesToShow.map(p => p.name);
      const y = partiesToShow.map(p => byParty[p.id].central);
      const errPlus  = partiesToShow.map(p => byParty[p.id].high - byParty[p.id].central);
      const errMinus = partiesToShow.map(p => byParty[p.id].central - byParty[p.id].low);

      const colour = methodColour(idx);
      traces.push({
        type: "bar",
        name: method.short + (method.outlier ? " · outlier" : ""),
        x: x,
        y: y,
        error_y: {
          type: "data",
          symmetric: false,
          array: errPlus,
          arrayminus: errMinus,
          color: "rgba(20, 33, 61, 0.65)",
          thickness: 1.5,
          width: 4,
        },
        marker: {
          color: colour,
          opacity: method.outlier ? 0.55 : 0.92,
          line: { color: "#14213D", width: 0.5 },
        },
        hovertemplate:
          `<b>${escape(method.name)}</b><br>` +
          "%{x}: <b>%{y}</b> seats<br>" +
          "Range: %{customdata[0]}–%{customdata[1]} seats" +
          "<extra></extra>",
        customdata: partiesToShow.map(p => [byParty[p.id].low, byParty[p.id].high]),
      });
    });

    const region = REGIONS.find(r => r.id === regionId);
    const layout = {
      barmode: "group",
      margin: { l: 56, r: 16, t: 18, b: 56 },
      xaxis: { title: { text: "Party", standoff: 8 }, tickfont: { size: 12 } },
      yaxis: { title: { text: "Predicted seats" }, gridcolor: "#E2E2DC", zerolinecolor: "#C0BCB3" },
      legend: { orientation: "h", y: -0.18, font: { size: 11 } },
      paper_bgcolor: "#FFFFFF",
      plot_bgcolor: "#FFFFFF",
      hoverlabel: { bgcolor: "#14213D", font: { color: "#FFFFFF" } },
      annotations: [{
        text: `${region.name} · ${region.total_seats.toLocaleString("en-GB")} seats`,
        showarrow: false, x: 0, xref: "paper", y: 1.05, yref: "paper",
        xanchor: "left", font: { size: 12, color: "#5A5A5A" }
      }],
    };

    Plotly.react($chart, traces, layout, {
      displaylogo: false,
      responsive: true,
      modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
    });
  }

  function methodColour(idx) {
    const palette = [
      "#0B4F9C", "#02A95B", "#7E3FBF", "#C97800",
      "#A8123E", "#117A8B", "#586673", "#7C4D2A",
    ];
    return palette[idx % palette.length];
  }

  // ---- Tooltip system ----

  document.addEventListener("mouseover", e => {
    const t = e.target.closest("[data-tip]");
    if (!t) return;
    showTooltip(t.getAttribute("data-tip"), e.clientX, e.clientY);
  });
  document.addEventListener("mousemove", e => {
    if ($tooltip.classList.contains("visible")) {
      positionTooltip(e.clientX, e.clientY);
    }
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

  // ---- Wire-up ----

  [$region, $party, $outliers].forEach(el => el.addEventListener("change", buildChart));
  $region.value = "NAT";
  buildChart();

  // ---- Utils ----

  function escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }
  function humanise(s) { return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }
})();
