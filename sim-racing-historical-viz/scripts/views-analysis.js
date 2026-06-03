"use strict";

// ==================== DRIVERS VIEW ====================

function renderDriversView(dataset) {
  if (state.filters.profileDriver && dataset.careerRecords.find((r) => r.driver === state.filters.profileDriver)) {
    renderDriverProfile(dataset);
    return;
  }

  const view = state.drivers.view || "list";
  refs["drivers-title"].textContent = "Drivers";

  refs["drivers-filters"].innerHTML = "";

  refs["drivers-content"].innerHTML = `
    <div class="subtab-nav" id="drivers-subtabs">
      ${[
        ["list", "Drivers"],
        ["allDrivers", "All Drivers"],
        ["weightedScores", "Weighted Scores"],
        ["cpiRankings", "CPI Rankings"],
      ].map(([key, label]) => `
        <button class="subtab-button ${view === key ? "is-active" : ""}" type="button" data-driver-view="${key}">${escapeHtml(label)}</button>
      `).join("")}
    </div>
    <div id="drivers-view-content"></div>
  `;

  const area = document.getElementById("drivers-view-content");

  switch (view) {
    case "allDrivers":
      renderAllDriversTable(dataset, area);
      break;
    case "weightedScores":
      renderWeightedScoresTable(dataset, area);
      break;
    case "cpiRankings":
      renderCpiRankingsTable(dataset, area);
      break;
    default:
      renderDriverList(dataset, area);
      break;
  }

  document.getElementById("drivers-subtabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-driver-view]");
    if (!btn) return;
    state.drivers.view = btn.dataset.driverView;
    syncHistory();
    renderDriversView(dataset);
  });
}

function renderDriverList(dataset, area) {
  refs["drivers-filters"].innerHTML = `
    <input class="search-input" type="search" id="driver-search" placeholder="Search drivers..." value="${escapeHtml(state.filters.driverSearch)}"/>
  `;

  const query = state.filters.driverSearch.trim().toLowerCase();
  const records = sortDriversByName(
    dataset.careerRecords.filter((r) => !query || r.driver.toLowerCase().includes(query)),
  );

  area.innerHTML = records.length
    ? `<div class="driver-list">${records.map((r) => `
        <button class="driver-list-item" type="button" data-driver="${escapeHtml(r.driver)}">
          <div>
            <div class="driver-list-item__name">${escapeHtml(r.driver)}</div>
            <div class="driver-list-item__stats">CPI ${formatDecimal(r.cpi)} &middot; ${formatInteger(r.wins)} wins &middot; ${formatInteger(r.races)} races</div>
          </div>
          <span class="driver-list-item__badge">${formatInteger(r.wdc)} WDC</span>
        </button>
      `).join("")}</div>`
    : renderEmptyStateMarkup("No drivers match your search.");

  document.getElementById("driver-search")?.addEventListener("input", (e) => {
    state.filters.driverSearch = e.target.value;
    renderDriversView(dataset);
  });

  area.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-driver]");
    if (!btn) return;
    state.filters.profileDriver = btn.dataset.driver;
    syncHistory();
    renderDriversView(dataset);
  });
}

function renderAllDriversTable(dataset, area) {
  const columns = [
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 10, className: "wrap-col",
      render: (r) => `<span class="driver-link" data-driver="${escapeHtml(r.driver)}">${escapeHtml(r.driver)}</span>`, rawHtml: true },
    { key: "wdc", label: "WDC", className: "num-col" },
    { key: "wcc", label: "WCC", className: "num-col" },
    { key: "wins", label: "Wins", className: "num-col" },
    { key: "podiums", label: "Podiums", className: "num-col" },
    { key: "poles", label: "Poles", className: "num-col" },
    { key: "fastestLaps", label: "FLs", className: "num-col" },
    { key: "points", label: "Points", className: "num-col" },
    { key: "races", label: "Races", className: "num-col" },
    { key: "winRate", label: "Win%", format: "percent", className: "num-col" },
    { key: "podiumRate", label: "Pod%", format: "percent", className: "num-col" },
    { key: "pointsPerRace", label: "Pts/Race", className: "num-col", render: (r) => formatDecimal(r.pointsPerRace, 1) },
    { key: "top5Rate", label: "Top 5%", format: "percent", className: "num-col" },
    { key: "cpi", label: "CPI", className: "num-col", render: (r) => formatDecimal(r.cpi) },
    { key: "bestSeasonScore", label: "Peak WS", className: "num-col", render: (r) => formatDecimal(r.bestSeasonScore) },
  ];

  area.innerHTML = `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">All Driver Career Totals</h3>
        <span class="badge">${dataset.careerRecords.length} drivers</span>
      </div>
      <div class="card__body">
        <div id="all-drivers-table"></div>
      </div>
    </div>
  `;

  renderSortableTable("all-drivers-table", columns, dataset.careerRecords);
  bindDriverLinkClicks(area, dataset);
}

function renderWeightedScoresTable(dataset, area) {
  const records = dataset.weightedRecords.filter((r) => !r.isUpcoming);

  const columns = [
    { key: "rank", label: "#", className: "num-col" },
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 10, className: "wrap-col",
      render: (r) => `<span class="driver-link" data-driver="${escapeHtml(r.driver)}">${escapeHtml(r.driver)}</span>`, rawHtml: true },
    { key: "seasonId", label: "Season", strong: true },
    { key: "weightedScore", label: "W.Score", className: "num-col", render: (r) => formatDecimal(r.weightedScore) },
    { key: "winRate", label: "Win%", format: "percent", className: "num-col" },
    { key: "podiumRate", label: "Pod%", format: "percent", className: "num-col" },
    { key: "top5Rate", label: "Top 5%", format: "percent", className: "num-col" },
    { key: "pointsPerRace", label: "Pts/Race", className: "num-col", render: (r) => formatDecimal(r.pointsPerRace, 1) },
    { key: "fastestLapRate", label: "FL%", format: "percent", className: "num-col" },
    { key: "poleRate", label: "Pole%", format: "percent", className: "num-col" },
    { key: "pointsRate", label: "Pts Rate", format: "percent", className: "num-col" },
    { key: "wdc", label: "WDC", render: (r) => r.wdc ? "Yes" : "-" },
    { key: "wcc", label: "WCC", render: (r) => r.wcc ? "Yes" : "-" },
  ];

  area.innerHTML = `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">All-Time Weighted Score Rankings</h3>
        <span class="badge">${records.length} season records</span>
      </div>
      <div class="card__body">
        <div id="ws-rankings-table"></div>
      </div>
    </div>
  `;

  renderSortableTable("ws-rankings-table", columns, records);
  bindDriverLinkClicks(area, dataset);
}

function renderCpiRankingsTable(dataset, area) {
  const records = dataset.careerRecords.filter((r) => r.cpi != null);

  const columns = [
    { key: "cpiRank", label: "#", className: "num-col", sortValue: (r) => r.cpi || 0 },
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 10, className: "wrap-col",
      render: (r) => `<span class="driver-link" data-driver="${escapeHtml(r.driver)}">${escapeHtml(r.driver)}</span>`, rawHtml: true },
    { key: "cpi", label: "CPI", className: "num-col", render: (r) => formatDecimal(r.cpi) },
    { key: "avgWs", label: "Avg WS", className: "num-col", render: (r) => formatDecimal(r.avgWs) },
    { key: "peakWs", label: "Peak WS", className: "num-col", render: (r) => formatDecimal(r.peakWs) },
    { key: "avgPtsRate", label: "Avg Pts Rate", format: "percent", className: "num-col" },
    { key: "avgTop5Rate", label: "Avg Top 5", format: "percent", className: "num-col" },
    { key: "wdc", label: "WDCs", className: "num-col" },
    { key: "wcc", label: "WCCs", className: "num-col" },
    { key: "seasonCount", label: "Seasons", className: "num-col" },
    { key: "bestSeasonId", label: "Best Season" },
  ];

  const ranked = [...records]
    .sort((a, b) => (b.cpi || 0) - (a.cpi || 0))
    .map((r, i) => ({ ...r, cpiRank: i + 1 }));

  area.innerHTML = `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Career Performance Index Rankings</h3>
        <span class="badge">${ranked.length} drivers</span>
      </div>
      <div class="card__body">
        <div id="cpi-rankings-table"></div>
      </div>
    </div>
  `;

  renderSortableTable("cpi-rankings-table", columns, ranked);
  bindDriverLinkClicks(area, dataset);
}

function bindDriverLinkClicks(container, dataset) {
  container.addEventListener("click", (e) => {
    const link = e.target.closest("[data-driver]");
    if (!link) return;
    e.preventDefault();
    state.filters.profileDriver = link.dataset.driver;
    syncHistory();
    renderDriversView(dataset);
  });
}

// ==================== DRIVER PROFILE ====================

function renderDriverProfile(dataset) {
  const driver = state.filters.profileDriver;
  const career = dataset.careerRecords.find((r) => r.driver === driver);
  if (!career) {
    state.filters.profileDriver = "";
    renderDriversView(dataset);
    return;
  }

  const ranking = buildCareerAggregates(dataset);
  const aggregate = ranking.find((e) => e.driver === driver) || null;
  const preset = getActivePreset();

  refs["drivers-title"].textContent = "";
  refs["drivers-filters"].innerHTML = "";

  refs["drivers-content"].innerHTML = `
    <div class="profile-header">
      <button class="back-button" type="button" id="driver-back">&larr; All Drivers</button>
      <h1 class="profile-header__name">${escapeHtml(driver)}</h1>
      ${career.cpi ? `<span class="badge badge--accent">CPI ${formatDecimal(career.cpi)}</span>` : ""}
    </div>

    <div class="stat-grid mb-1">
      ${buildStatItem(formatInteger(career.wdc), "WDC")}
      ${buildStatItem(formatInteger(career.wcc), "WCC")}
      ${buildStatItem(formatInteger(career.wins), "Wins")}
      ${buildStatItem(formatInteger(career.podiums), "Podiums")}
      ${buildStatItem(formatInteger(career.poles), "Poles")}
      ${buildStatItem(formatInteger(career.races), "Races")}
      ${buildStatItem(formatPercent(career.winRate), "Win Rate")}
      ${buildStatItem(formatPercent(career.podiumRate), "Podium Rate")}
      ${buildStatItem(formatPercent(career.top5Rate), "Top 5 Rate")}
      ${buildStatItem(formatPercent(career.poleRate), "Pole Rate")}
      ${buildStatItem(formatPercent(career.fastestLapRate), "FL Rate")}
      ${buildStatItem(formatDecimal(career.pointsPerRace, 1), "Pts / Race")}
      ${buildStatItem(career.bestSeasonId || "n/a", "Peak Season")}
      ${buildStatItem(formatDecimal(career.bestSeasonScore), "Peak WS")}
    </div>

    ${aggregate ? `
    <div class="card mb-1">
      <div class="card__header">
        <div>
          <h3 class="card__title">Index Breakdown</h3>
          <div class="card__subtitle">Score ${formatComposite(aggregate.composite)} &middot; ${escapeHtml(preset.description)}</div>
        </div>
        <div class="card__controls">
          ${buildPresetControl("profile-preset-select")}
        </div>
      </div>
      <div class="card__body">
        <div class="score-breakdown">
          ${aggregate.contributions.map((c) => buildBarRow(c.label, c.rawValue, c.normalized, c.key)).join("")}
        </div>
      </div>
    </div>
    ` : ""}

    <div id="profile-fingerprints" class="mb-1"></div>
    <div id="profile-what-changed" class="mb-1"></div>
    <div id="profile-tracks" class="mb-1"></div>
    <div id="profile-weighted-scores"></div>
  `;

  document.getElementById("driver-back").addEventListener("click", () => {
    state.filters.profileDriver = "";
    syncHistory({ replace: true });
    renderDriversView(dataset);
  });

  document.getElementById("profile-preset-select")?.addEventListener("change", (e) => {
    state.filters.preset = e.target.value;
    renderDriverProfile(dataset);
  });

  renderFingerprints(dataset, driver);
  renderWhatChanged(dataset, driver);
  renderTrackPerformance(dataset, driver);
  renderProfileWeightedScores(dataset, driver);
}

function renderFingerprints(dataset, driver) {
  const area = document.getElementById("profile-fingerprints");
  if (!area) return;

  const records = sortBySeason(
    dataset.weightedRecords.filter((r) => r.driver === driver && !r.isUpcoming)
  ).sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0)).slice(0, 3);

  if (!records.length) { area.innerHTML = ""; return; }

  area.innerHTML = `
    <h3 style="font-size:1rem;font-weight:600;margin:0 0 0.5rem">Top Seasons</h3>
    <div class="fingerprint-grid">
      ${records.map((r) => `
        <div class="fingerprint-card">
          <div class="fingerprint-card__header">
            <div>
              <h4 class="fingerprint-card__title">${escapeHtml(r.seasonId)}</h4>
              <div class="fingerprint-card__meta">${escapeHtml(r.type || "")} &middot; ${escapeHtml(r.car || "")}</div>
            </div>
            <div class="fingerprint-card__score">${formatDecimal(r.weightedScore)}</div>
          </div>
          <div class="pill-row">
            <span class="pill">Win ${formatPercent(r.winRate)}</span>
            <span class="pill">Pod ${formatPercent(r.podiumRate)}</span>
            <span class="pill">Top 5 ${formatPercent(r.top5Rate)}</span>
          </div>
          <div class="subtle-text mt-half">Team: ${escapeHtml(r.teamName || "n/a")} &middot; Pts/race ${formatDecimal(r.pointsPerRace, 1)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderWhatChanged(dataset, driver) {
  const area = document.getElementById("profile-what-changed");
  if (!area) return;

  const records = sortBySeason(
    dataset.weightedRecords.filter((r) => r.driver === driver && !r.isUpcoming)
  );

  if (records.length < 2) { area.innerHTML = ""; return; }

  const latest = records[records.length - 1];
  const previous = records[records.length - 2];
  const debut = records[0];
  const peak = [...records].sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0))[0];

  area.innerHTML = `
    <h3 style="font-size:1rem;font-weight:600;margin:0 0 0.5rem">Season Deltas</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:0.75rem">
      ${buildDeltaCard("Latest vs Previous", latest, previous)}
      ${buildDeltaCard("Peak vs Debut", peak, debut)}
    </div>
  `;
}

function buildDeltaCard(label, newer, older) {
  const delta = (newer.weightedScore || 0) - (older.weightedScore || 0);
  const tone = delta >= 0 ? "positive" : "negative";
  return `
    <div class="change-card ${tone}">
      <div class="change-card__header">
        <div>
          <h4 class="change-card__title">${escapeHtml(label)}</h4>
          <div class="change-card__meta">${escapeHtml(newer.seasonId)} vs ${escapeHtml(older.seasonId)}</div>
        </div>
        <span class="badge ${delta >= 0 ? "badge--success" : "badge--danger"}">${delta >= 0 ? "+" : ""}${formatDecimal(delta, 3)}</span>
      </div>
      <div class="score-breakdown">
        ${buildDeltaLine("Weighted score", newer.weightedScore, older.weightedScore, false)}
        ${buildDeltaLine("Points rate", newer.pointsRate, older.pointsRate, true)}
        ${buildDeltaLine("Top 5 rate", newer.top5Rate, older.top5Rate, true)}
        ${buildDeltaLine("Win rate", newer.winRate, older.winRate, true)}
      </div>
    </div>
  `;
}

function buildDeltaLine(label, next, prev, isPct) {
  const nextT = isPct ? formatPercent(next) : formatDecimal(next);
  const prevT = isPct ? formatPercent(prev) : formatDecimal(prev);
  const d = (next || 0) - (prev || 0);
  return `<div class="bar-row"><div class="bar-row__label"><span>${escapeHtml(label)}</span><span>${escapeHtml(prevT)} &rarr; ${escapeHtml(nextT)} (${d >= 0 ? "+" : ""}${isPct ? formatDecimal(d, 1) + "%" : formatDecimal(d, 3)})</span></div></div>`;
}

const TRACK_LIMIT_OPTIONS = [5, 10, 15, 20, "all"];

function renderTrackPerformance(dataset, driver) {
  const area = document.getElementById("profile-tracks");
  if (!area) return;

  const cache = state.trackAggregateCache;
  const allTracks = getDriverTrackProfile(dataset, driver, cache, Infinity);
  if (!allTracks.length) { area.innerHTML = ""; return; }

  const limit = state.drivers.trackLimit;
  const tracks = limit === "all" ? allTracks : allTracks.slice(0, limit);

  const maxScore = tracks.reduce((best, t) => Math.max(best, t.trackScore || 0), 0);
  const columns = [
    { key: "rank", label: "#", sticky: true, stickyWidthRem: 3 },
    { key: "track", label: "Track", sticky: true, stickyWidthRem: 10, className: "wrap-col" },
    { key: "starts", label: "Starts", className: "num-col" },
    { key: "wins", label: "Wins", className: "num-col" },
    { key: "podiums", label: "Podiums", className: "num-col" },
    { key: "top5s", label: "Top 5", className: "num-col" },
    { key: "trackScore", label: "Score" },
  ];

  const rows = tracks.map((t, i) => ({
    ...t, rank: i + 1,
    trackScore: `<div class="track-score-cell"><div class="track-score-bar-wrap"><div class="track-score-bar" style="width:${maxScore > 0 ? Math.round((t.trackScore / maxScore) * 100) : 0}%"></div></div><span class="track-score-label">${formatDecimal(t.trackScore)}</span></div>`,
  }));

  const prepared = prepareTableColumns(columns);
  const minW = getTableMinWidth(prepared);

  area.innerHTML = `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Track Performance</h3>
        <div class="card__controls">
          <label class="inline-control" for="track-limit-select">
            <span>Show</span>
            <select class="select" id="track-limit-select">
              ${TRACK_LIMIT_OPTIONS.map((opt) => {
                const value = String(opt);
                const label = opt === "all" ? "All" : `Top ${opt}`;
                const selected = state.drivers.trackLimit === opt ? " selected" : "";
                return `<option value="${value}"${selected}>${label}</option>`;
              }).join("")}
            </select>
          </label>
          <span class="badge">${allTracks.length} tracks</span>
        </div>
      </div>
      <div class="card__body">
        <div class="table-wrap">
          <table class="data-table" style="--table-min-width-rem:${minW}">
            <thead><tr>${prepared.map((c) => `<th scope="col"${cellAttrs(c, true)}>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
            <tbody>${rows.map((row) => `<tr>${prepared.map((c) => {
              const val = c.key === "trackScore" ? row.trackScore : (c.key === "rank" ? row.rank : formatTableValue(row[c.key]));
              const escaped = c.key === "trackScore" ? val : escapeHtml(val);
              return `<td${cellAttrs(c, false)}>${escaped}</td>`;
            }).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
        <div class="fine-print mt-half">Scores use empirical Bayes shrinkage (k=5) to balance raw performance against sample size.</div>
      </div>
    </div>
  `;

  document.getElementById("track-limit-select")?.addEventListener("change", (e) => {
    const raw = e.target.value;
    state.drivers.trackLimit = raw === "all" ? "all" : Number(raw);
    renderTrackPerformance(dataset, driver);
  });
}

function renderProfileWeightedScores(dataset, driver) {
  const area = document.getElementById("profile-weighted-scores");
  if (!area) return;

  const records = dataset.weightedRecords.filter(
    (r) => r.driver === driver && !r.isUpcoming
  );
  if (!records.length) { area.innerHTML = ""; return; }

  const columns = [
    { key: "seasonId", label: "Season", strong: true, sticky: true, stickyWidthRem: 6,
      sortValue: (r) => getSeasonOrder(r.seasonId) },
    { key: "car", label: "Car", className: "wrap-col", widthRem: 10 },
    { key: "weightedScore", label: "W.Score", className: "num-col", render: (r) => formatDecimal(r.weightedScore) },
    { key: "winRate", label: "Win%", format: "percent", className: "num-col" },
    { key: "podiumRate", label: "Pod%", format: "percent", className: "num-col" },
    { key: "top5Rate", label: "Top 5%", format: "percent", className: "num-col" },
    { key: "pointsPerRace", label: "Pts/Race", className: "num-col", render: (r) => formatDecimal(r.pointsPerRace, 1) },
    { key: "fastestLapRate", label: "FL%", format: "percent", className: "num-col" },
    { key: "poleRate", label: "Pole%", format: "percent", className: "num-col" },
    { key: "pointsRate", label: "Pts Rate", format: "percent", className: "num-col" },
    { key: "wdc", label: "WDC", render: (r) => r.wdc ? "Yes" : "-" },
    { key: "wcc", label: "WCC", render: (r) => r.wcc ? "Yes" : "-" },
  ];

  const sorted = sortBySeason(records);

  area.innerHTML = `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">All Weighted Scores</h3>
        <span class="badge">${records.length} seasons</span>
      </div>
      <div class="card__body">
        <div id="profile-ws-table"></div>
      </div>
    </div>
  `;

  renderSortableTable("profile-ws-table", columns, sorted);
}

// ==================== COMPARE VIEW ====================

function renderCompareView(dataset) {
  const drivers = sortDriverNames(dataset.careerRecords.map((r) => r.driver));

  refs["compare-filters"].innerHTML = "";

  const ranking = buildCareerAggregates(dataset);
  const selected = state.selectedDrivers
    .map((d) => ranking.find((e) => e.driver === d))
    .filter(Boolean);
  const carSpecBreakdown = buildDriverCarSpecBreakdown(dataset, state.selectedDrivers);

  refs["compare-content"].innerHTML = `
    <div class="card mb-1">
      <div class="card__header">
        <h3 class="card__title">Select Drivers</h3>
        <span class="badge">${state.selectedDrivers.length} / ${MAX_COMPARE_DRIVERS}</span>
      </div>
      <div class="card__body">
        <div class="chip-picker" id="compare-picker">
          ${drivers.map((d) => `
            <button class="chip ${state.selectedDrivers.includes(d) ? "is-selected" : ""}" type="button" data-driver="${escapeHtml(d)}">${escapeHtml(d)}</button>
          `).join("")}
        </div>
      </div>
    </div>

    ${selected.length ? `
    <div class="card mb-1">
      <div class="card__header">
        <div>
          <h3 class="card__title">Composite Comparison</h3>
          <div class="card__subtitle">${escapeHtml(getActivePreset().description)}</div>
        </div>
        <div class="card__controls">
          ${buildPresetControl("compare-preset-select")}
        </div>
      </div>
      <div class="card__body">
        <div class="comparison-grid">
          ${selected.map((agg) => buildComparisonCard(agg)).join("")}
        </div>
      </div>
    </div>

    <div class="card mb-1">
      <div class="card__header">
        <h3 class="card__title">Season Arc</h3>
      </div>
      <div class="card__body" id="compare-arc-chart"></div>
    </div>

    <div class="card mb-1">
      <div class="card__header">
        <h3 class="card__title">Formula vs Sports</h3>
      </div>
      <div class="card__body">
        <div class="comparison-grid">
          ${state.selectedDrivers.map((d) => buildCarSpecCard(d, carSpecBreakdown[d])).join("")}
        </div>
      </div>
    </div>

    <div class="card mb-1">
      <div class="card__header">
        <h3 class="card__title">Top Tracks</h3>
      </div>
      <div class="card__body" id="compare-top-tracks"></div>
    </div>

    <div class="card">
      <div class="card__header">
        <h3 class="card__title">All Weighted Scores</h3>
        <span class="badge" id="compare-ws-count"></span>
      </div>
      <div class="card__body">
        <div id="compare-ws-table"></div>
      </div>
    </div>
    ` : renderEmptyStateMarkup("Select drivers above to compare.")}
  `;

  if (selected.length) {
    renderCompareArcChart(dataset);
    renderCompareTopTracks(dataset);
    renderCompareWeightedScores(dataset);
  }

  document.getElementById("compare-picker")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-driver]");
    if (!btn) return;
    toggleComparisonDriver(btn.dataset.driver);
    renderCompareView(dataset);
  });

  document.getElementById("compare-preset-select")?.addEventListener("change", (e) => {
    state.filters.preset = e.target.value;
    renderCompareView(dataset);
  });
}

function buildComparisonCard(aggregate) {
  const track = aggregate.contributions
    .map((c) => `<span class="contribution-segment" style="width:${Math.max(c.value * 100, 0)}%;background:${METRIC_COLORS[c.key] || "#0b756f"}"></span>`)
    .join("");
  const list = aggregate.contributions
    .map((c) => `<span><span>${escapeHtml(c.label)}</span><span>${escapeHtml(formatMetricValue(c.key, c.rawValue))}</span></span>`)
    .join("");

  return `
    <div class="comparison-driver-card" style="border-top-color:${colorForDriver(aggregate.driver)}">
      <div class="comparison-driver-card__name">
        <span>${escapeHtml(aggregate.driver)}</span>
        <span class="comparison-driver-card__score">${formatComposite(aggregate.composite)}</span>
      </div>
      <div class="contribution-track">${track}</div>
      <div class="contribution-list">${list}</div>
    </div>
  `;
}

function buildCarSpecCard(driver, breakdown) {
  const formula = breakdown?.specs?.formula;
  const sports = breakdown?.specs?.sports;
  const maxWs = Math.max(formula?.avgWs || 0, sports?.avgWs || 0);

  return `
    <div class="comparison-driver-card" style="border-top-color:${colorForDriver(driver)}">
      <div class="comparison-driver-card__name"><span>${escapeHtml(driver)}</span></div>
      <div class="spec-split-grid">
        ${buildSpecPanel("Formula", "#3b82f6", formula, maxWs)}
        ${buildSpecPanel("Sports", "#f59e0b", sports, maxWs)}
      </div>
      <div class="fine-print mt-half">${escapeHtml(buildSpecEdgeText(breakdown))}</div>
    </div>
  `;
}

function buildSpecPanel(label, color, spec, maxWs) {
  if (!spec) return `<div class="spec-split-card is-empty">No ${label.toLowerCase()} data</div>`;
  const barW = maxWs > 0 ? Math.round(((spec.avgWs || 0) / maxWs) * 100) : 0;
  return `
    <div class="spec-split-card">
      <div class="spec-split-card__title"><strong>${escapeHtml(label)}</strong><span class="spec-split-card__score">${formatDecimal(spec.avgWs)}</span></div>
      <div class="spec-split-card__meta">Avg weighted score</div>
      <div class="spec-split-bar"><div class="spec-split-bar__fill" style="width:${barW}%;background:linear-gradient(90deg,${color},${hexToAlpha(color, 0.4)})"></div></div>
      <div class="spec-split-pills">
        <span class="spec-split-pill">${formatInteger(spec.seasonsCount)} seasons</span>
        <span class="spec-split-pill">Win ${formatPercent(spec.avgWinRate)}</span>
        <span class="spec-split-pill">${formatInteger(spec.totalWdc)} WDC</span>
      </div>
    </div>
  `;
}

function buildSpecEdgeText(breakdown) {
  if (!breakdown?.bestSpec) return "No formula or sports results.";
  if (breakdown.edge == null) return `${breakdown.bestSpec.label} is the only spec.`;
  return `${breakdown.bestSpec.label} stronger by +${formatDecimal(breakdown.edge)} avg WS.`;
}

function renderCompareArcChart(dataset) {
  const area = document.getElementById("compare-arc-chart");
  if (!area) return;

  const filtered = getFilteredSeasonRecords(dataset).filter((r) => state.selectedDrivers.includes(r.driver));
  if (!filtered.length) { area.innerHTML = renderEmptyStateMarkup("No data for selected drivers."); return; }

  const seasons = uniqueList(filtered.map((r) => r.seasonId)).sort((a, b) => getSeasonOrder(a) - getSeasonOrder(b));
  const width = 820, height = 340;
  const pad = { top: 24, right: 138, bottom: 48, left: 52 };
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;
  const xDen = Math.max(seasons.length - 1, 1);
  const yMax = Math.max(1, filtered.reduce((m, r) => Math.max(m, r.weightedScore || 0), 0));

  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const yVal = ratio * yMax;
    const y = pad.top + ih - (yVal / yMax) * ih;
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="rgba(0,0,0,0.06)" stroke-dasharray="4 6"/><text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#888">${formatDecimal(yVal, 2)}</text>`;
  });

  const xLabels = seasons.map((sid, i) => {
    const x = pad.left + (i / xDen) * iw;
    return `<text x="${x}" y="${height - 16}" text-anchor="middle" font-size="11" fill="#888">${escapeHtml(sid)}</text>`;
  }).join("");

  const endpoints = [];
  const seriesMarkup = state.selectedDrivers.map((driver) => {
    const series = filtered.filter((r) => r.driver === driver).sort((a, b) => getSeasonOrder(a.seasonId) - getSeasonOrder(b.seasonId));
    const color = colorForDriver(driver);
    const pts = series.map((r) => {
      const xi = seasons.indexOf(r.seasonId);
      return { x: pad.left + (xi / xDen) * iw, y: pad.top + ih - ((r.weightedScore || 0) / yMax) * ih, sid: r.seasonId, score: r.weightedScore };
    }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

    if (pts.length) endpoints.push({ driver, color, x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    return `<polyline fill="none" stroke="${color}" stroke-width="2" points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}"/>` +
      pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}" stroke="#fff" stroke-width="1.5"><title>${escapeHtml(driver)} | ${escapeHtml(p.sid)} | ${formatDecimal(p.score)}</title></circle>`).join("");
  }).join("");

  const labels = buildEndpointLabels(endpoints, width, height, pad);

  area.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Weighted score comparison">
      <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#fafafa"/>
      ${grid.join("")}
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="rgba(0,0,0,0.1)"/>
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="rgba(0,0,0,0.1)"/>
      ${seriesMarkup}${labels}${xLabels}
    </svg>
    <div class="chart-legend">
      ${state.selectedDrivers.map((d) => `<span class="legend-item"><span class="legend-swatch" style="background:${colorForDriver(d)}"></span>${escapeHtml(d)}</span>`).join("")}
    </div>
  `;
}

function renderCompareTopTracks(dataset) {
  const area = document.getElementById("compare-top-tracks");
  if (!area) return;

  const cache = state.trackAggregateCache;
  const topTracksByDriver = getDriversTopTracks(dataset, state.selectedDrivers, cache, 3);
  const columns = [
    { key: "track", label: "Track", sticky: true, stickyWidthRem: 10, className: "wrap-col" },
    { key: "starts", label: "Starts", className: "num-col" },
    { key: "wins", label: "Wins", className: "num-col" },
    { key: "trackScore", label: "Score", className: "num-col", render: (r) => formatDecimal(r.trackScore) },
  ];

  area.innerHTML = `
    <div class="comparison-grid">
      ${state.selectedDrivers.map((driver) => {
        const tracks = topTracksByDriver[driver] || [];
        return `
          <div class="comparison-driver-card" style="border-top-color:${colorForDriver(driver)}">
            <div class="comparison-driver-card__name"><span>${escapeHtml(driver)}</span></div>
            ${tracks.length
              ? `<div class="table-wrap">${renderDataTable(columns, tracks, { tableClassName: "data-table--compact", compact: true })}</div>`
              : `<div class="subtle-text">No venue data.</div>`}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderCompareWeightedScores(dataset) {
  const area = document.getElementById("compare-ws-table");
  const badge = document.getElementById("compare-ws-count");
  if (!area) return;

  const records = dataset.weightedRecords
    .filter((r) => !r.isUpcoming && state.selectedDrivers.includes(r.driver));

  if (badge) badge.textContent = records.length + " records";

  if (!records.length) {
    area.innerHTML = renderEmptyStateMarkup("No weighted score records for the selected drivers.");
    return;
  }

  const columns = [
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 10, className: "wrap-col" },
    { key: "seasonId", label: "Season", strong: true },
    { key: "weightedScore", label: "W.Score", className: "num-col", render: (r) => formatDecimal(r.weightedScore) },
    { key: "winRate", label: "Win%", format: "percent", className: "num-col" },
    { key: "podiumRate", label: "Pod%", format: "percent", className: "num-col" },
    { key: "top5Rate", label: "Top 5%", format: "percent", className: "num-col" },
    { key: "pointsPerRace", label: "Pts/Race", className: "num-col", render: (r) => formatDecimal(r.pointsPerRace, 1), sortValue: (r) => r.pointsPerRace },
    { key: "fastestLapRate", label: "FL%", format: "percent", className: "num-col" },
    { key: "poleRate", label: "Pole%", format: "percent", className: "num-col" },
    { key: "pointsRate", label: "Pts Rate", format: "percent", className: "num-col" },
    { key: "wdc", label: "WDC", render: (r) => r.wdc ? "Yes" : "-" },
    { key: "wcc", label: "WCC", render: (r) => r.wcc ? "Yes" : "-" },
  ];

  renderSortableTable("compare-ws-table", columns, records);
}

// ==================== SHARED HELPERS ====================

function buildStatItem(value, label) {
  return `<div class="stat-item"><div class="stat-item__value">${escapeHtml(String(value))}</div><div class="stat-item__label">${escapeHtml(label)}</div></div>`;
}

function sortDriversByName(records) {
  return [...records].sort((left, right) => compareDriverNames(left.driver, right.driver));
}

function sortDriverNames(names) {
  return [...names].sort(compareDriverNames);
}

function compareDriverNames(left, right) {
  return normalizeInlineText(left).localeCompare(normalizeInlineText(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function buildPresetControl(id) {
  return `
    <label class="inline-control" for="${escapeHtml(id)}">
      <span>Bias</span>
      <select class="select" id="${escapeHtml(id)}">
        ${Object.entries(PRESETS).map(([k, p]) => `<option value="${escapeHtml(k)}"${state.filters.preset === k ? " selected" : ""}>${escapeHtml(p.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function buildBarRow(label, rawValue, normalized, key) {
  return `
    <div class="bar-row">
      <div class="bar-row__label"><span>${escapeHtml(label)}</span><span>${escapeHtml(formatMetricValue(key, rawValue))}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, (normalized || 0) * 100))}%;background:linear-gradient(90deg,${METRIC_COLORS[key] || "#0b756f"},${hexToAlpha(METRIC_COLORS[key] || "#0b756f", 0.45)})"></div></div>
    </div>
  `;
}
